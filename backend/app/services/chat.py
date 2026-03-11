import logging
import re
import warnings
from collections.abc import AsyncGenerator

# Suppress langgraph deprecation warning for create_react_agent.
# Migration tracked in specs/backlog.md — waiting for langchain>=1.0 stable.
warnings.filterwarnings(
    "ignore",
    message="create_react_agent has been moved",
    category=DeprecationWarning,
)

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.prebuilt import create_react_agent
from supabase import Client

from app.config import Settings
from app.models.chat import ChatMessage
from app.services.agent_tools import make_kb_search_tool, make_web_search_tool
from app.services.vectorstore import get_user_vectorstore
from app.services.web_search_limiter import WebSearchLimiter

logger = logging.getLogger(__name__)

KB_ONLY_RELEVANT_PROMPT = """You are a helpful assistant. Answer ONLY using the provided knowledge base context. \
Cite specific sources when available. \
Do NOT use your training data or general knowledge."""

KB_ONLY_LOW_RELEVANCE_PROMPT = """You are a helpful assistant. You have been given knowledge base context that may only be \
tangentially related to the user's question. If the context is at least somewhat related, do your best to answer using it. \
If the context is completely unrelated, acknowledge that the knowledge base does not contain a direct answer to the question. \
Do NOT use the phrase "I don't have information about this in my knowledge base." \
Do NOT use your training data or general knowledge. Always mention what the available context does cover."""

KB_ONLY_NO_RESULTS_PROMPT = """You are a helpful assistant. The knowledge base returned no results for the user's question. \
Let the user know that no matching content was found in the knowledge base. \
Suggest they try rephrasing their question or using Extended search for broader results. \
Do NOT use your training data or general knowledge."""

EXTENDED_SYSTEM_PROMPT = """You are a helpful AI assistant for AlphaBase knowledge base.

SEARCH STRATEGY:
1. ALWAYS search the knowledge base first using the search_knowledge_base tool.
2. If the knowledge base has relevant results, use them to answer. Do NOT add any source label prefix.
3. If the knowledge base has no relevant results AND web search is available, use the web_search tool.
   When answering from web search, start your response with "From web search: ".
4. If neither tool returns useful results, answer from your general knowledge.
   When answering from general knowledge, start your response with "From general knowledge: ".

IMPORTANT RULES:
- Always cite specific sources when available.
- Do NOT add a source label when answering from the knowledge base — KB is the default source.
- Only prefix with "From web search: " or "From general knowledge: " when NOT using KB content.
- When combining KB and non-KB sources, only label the non-KB portions."""

# URL extraction pattern
URL_PATTERN = re.compile(r'https?://[^\s\])\'">,]+')


class AgentChatService:
    def __init__(
        self,
        settings: Settings,
        supabase: Client | None = None,
        web_search_limiter: WebSearchLimiter | None = None,
    ):
        self.settings = settings
        self.supabase = supabase
        self.web_search_limiter = web_search_limiter
        self.llm = ChatOpenAI(
            model=settings.chat_model,
            max_tokens=settings.chat_max_tokens,
            openai_api_key=settings.openai_api_key,
            streaming=True,
        )

    def _check_deep_memory(self, user_id: str) -> bool:
        """Check if Deep Memory is enabled for this user."""
        if not self.supabase:
            return False
        try:
            result = self.supabase.table("deep_memory_settings").select(
                "enabled"
            ).eq("user_id", user_id).execute()
            if result.data:
                return result.data[0]["enabled"]
        except Exception:
            pass
        return False

    async def _fast_path_check(
        self, query: str, user_id: str, deep_memory: bool
    ) -> tuple[bool, str, list[str]]:
        """Check if KB has a high-confidence result to skip the agent loop.

        Returns (should_fast_path, context, sources).
        """
        threshold = self.settings.rag_confidence_threshold
        if threshold >= 1.0:
            return False, "", []

        vectorstore = get_user_vectorstore(user_id, self.settings)
        results = await vectorstore.similarity_search(
            query=query, k=1, score_threshold=threshold, deep_memory=deep_memory,
        )
        if not results:
            return False, "", []

        # Top result is above threshold — use fast path with full retrieval
        results = await vectorstore.similarity_search(
            query=query,
            k=self.settings.rag_retrieval_k,
            score_threshold=self.settings.rag_score_threshold,
            deep_memory=deep_memory,
        )
        context_parts = []
        sources = []
        for i, (doc, score) in enumerate(results):
            meta = doc.metadata or {}
            title = meta.get("title", meta.get("page_title", "Unknown"))
            source_url = meta.get("source", "")
            context_parts.append(
                f"[Source {i + 1}: {title} (relevance: {score:.2f})]\n{doc.page_content}"
            )
            if source_url and source_url not in sources:
                sources.append(source_url)

        context = "\n\n".join(context_parts)
        return True, context, sources

    async def _stream_fast_path(
        self, message: str, history: list[ChatMessage], context: str, sources: list[str]
    ) -> AsyncGenerator[dict, None]:
        """Stream response using direct LLM call (no agent loop)."""
        fast_path_prompt = (
            "You are a helpful AI assistant for AlphaBase knowledge base.\n"
            "Use the provided context to answer questions accurately. "
            "Cite specific sources when available.\n\n"
            f"Context:\n{context}"
        )
        messages = [SystemMessage(content=fast_path_prompt)]
        for msg in history:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                messages.append(AIMessage(content=msg.content))
        messages.append(HumanMessage(content=message))

        full_response = ""
        async for chunk in self.llm.astream(messages):
            token = chunk.content
            if token:
                full_response += token
                yield {"token": token}

        yield {
            "done": True,
            "sources": sources,
            "source_types": ["kb"] * len(sources),
            "full_response": full_response,
        }

    async def _stream_kb_only(
        self, message: str, history: list[ChatMessage], user_id: str, deep_memory: bool
    ) -> AsyncGenerator[dict, None]:
        """KB-only mode: search KB, pass as context, LLM answers strictly from context."""
        vectorstore = get_user_vectorstore(user_id, self.settings)
        results = await vectorstore.similarity_search(
            query=message,
            k=self.settings.rag_retrieval_k,
            score_threshold=self.settings.rag_score_threshold,
            deep_memory=deep_memory,
        )

        context_parts = []
        sources = []
        top_score = 0.0
        for i, (doc, score) in enumerate(results):
            if i == 0:
                top_score = score
            meta = doc.metadata or {}
            title = meta.get("title", meta.get("page_title", "Unknown"))
            source_url = meta.get("source", "")
            context_parts.append(
                f"[Source {i + 1}: {title} (relevance: {score:.2f})]\n{doc.page_content}"
            )
            if source_url and source_url not in sources:
                sources.append(source_url)

        # Determine relevance from vectorstore scores
        if not results:
            kb_relevant = False
            system_content = KB_ONLY_NO_RESULTS_PROMPT
        elif top_score >= self.settings.kb_relevance_threshold:
            kb_relevant = True
            system_content = KB_ONLY_RELEVANT_PROMPT
        else:
            kb_relevant = False
            system_content = KB_ONLY_LOW_RELEVANCE_PROMPT

        context = "\n\n".join(context_parts) if context_parts else ""
        if context:
            system_content += f"\n\nContext:\n{context}"

        messages = [SystemMessage(content=system_content)]
        for msg in history:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                messages.append(AIMessage(content=msg.content))
        messages.append(HumanMessage(content=message))

        full_response = ""
        async for chunk in self.llm.astream(messages):
            token = chunk.content
            if token:
                full_response += token
                yield {"token": token}

        yield {
            "done": True,
            "sources": sources,
            "source_types": ["kb"] * len(sources),
            "kb_relevant": kb_relevant,
            "full_response": full_response,
        }

    async def stream(
        self,
        message: str,
        history: list[ChatMessage],
        user_id: str,
        extended_search: bool = False,
    ) -> AsyncGenerator[dict, None]:
        """Stream the agentic RAG response."""
        deep_memory = self._check_deep_memory(user_id)

        # KB-only mode: no agent loop, strict KB context
        if not extended_search:
            logger.info("KB-only mode for user %s", user_id)
            async for chunk in self._stream_kb_only(message, history, user_id, deep_memory):
                yield chunk
            return

        # Fast path: skip agent loop for high-confidence KB hits
        should_fast_path, context, sources = await self._fast_path_check(
            message, user_id, deep_memory
        )
        if should_fast_path:
            logger.info("Fast path: high-confidence KB hit for user %s", user_id)
            async for chunk in self._stream_fast_path(message, history, context, sources):
                yield chunk
            return

        # Build agent tools
        vectorstore = get_user_vectorstore(user_id, self.settings)
        tools = [make_kb_search_tool(vectorstore, deep_memory=deep_memory)]

        web_search_available = self.settings.serper_api_key is not None
        if web_search_available and self.web_search_limiter:
            if not self.web_search_limiter.is_allowed(user_id):
                logger.info("Web search rate limit hit for user %s", user_id)
                web_search_available = False

        if web_search_available:
            tools.append(make_web_search_tool(self.settings.serper_api_key))

        # Create agent
        agent = create_react_agent(
            model=self.llm,
            tools=tools,
            prompt=EXTENDED_SYSTEM_PROMPT,
        )

        # Build input messages
        input_messages = []
        for msg in history:
            if msg.role == "user":
                input_messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                input_messages.append(AIMessage(content=msg.content))
        input_messages.append(HumanMessage(content=message))

        # Stream agent response
        full_response = ""
        kb_sources: list[str] = []
        web_sources: list[str] = []

        async for chunk, metadata in agent.astream(
            {"messages": input_messages}, stream_mode="messages"
        ):
            # Skip tool call messages and tool outputs
            if metadata.get("langgraph_node") == "tools":
                # Extract sources from tool results
                if hasattr(chunk, "content") and chunk.content:
                    content = chunk.content
                    urls = URL_PATTERN.findall(content)
                    # Determine if this is from KB or web tool
                    tool_name = getattr(chunk, "name", "") or ""
                    if tool_name == "search_knowledge_base":
                        for url in urls:
                            if url not in kb_sources:
                                kb_sources.append(url)
                    elif tool_name == "web_search":
                        for url in urls:
                            if url not in web_sources:
                                web_sources.append(url)
                continue

            if hasattr(chunk, "tool_calls") and chunk.tool_calls:
                continue

            if hasattr(chunk, "content") and chunk.content:
                full_response += chunk.content
                yield {"token": chunk.content}

        # Combine sources with types
        all_sources = []
        all_source_types = []
        for s in kb_sources:
            all_sources.append(s)
            all_source_types.append("kb")
        for s in web_sources:
            if s not in all_sources:
                all_sources.append(s)
                all_source_types.append("web")

        yield {
            "done": True,
            "sources": all_sources,
            "source_types": all_source_types,
            "full_response": full_response,
        }
