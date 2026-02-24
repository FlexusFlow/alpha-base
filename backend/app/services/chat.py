from collections.abc import AsyncGenerator

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from supabase import Client

from app.config import Settings
from app.models.chat import ChatMessage
from app.services.vectorstore import VectorStoreService

SYSTEM_PROMPT = """You are a helpful AI assistant for ZipTrader knowledge base about stock market investing and trading.
Use the provided context from transcribed YouTube videos to answer questions accurately.
If context doesn't contain relevant info, say so and provide general knowledge.
Cite specific sources when using context information.

Context:
{context}"""


class ChatService:
    def __init__(self, settings: Settings, supabase: Client | None = None):
        self.settings = settings
        self.supabase = supabase
        self.vectorstore = VectorStoreService(settings)
        self.llm = ChatOpenAI(
            model=settings.chat_model,
            max_tokens=settings.chat_max_tokens,
            openai_api_key=settings.openai_api_key,
            streaming=True,
        )

    async def _retrieve_context(self, query: str, user_id: str | None = None) -> tuple[str, list[str]]:
        """Retrieve relevant context from the vector store with score filtering."""
        # Check if Deep Memory is enabled for this user
        deep_memory = False
        if user_id and self.supabase:
            try:
                settings_result = self.supabase.table("deep_memory_settings").select(
                    "enabled"
                ).eq("user_id", user_id).execute()
                if settings_result.data:
                    deep_memory = settings_result.data[0]["enabled"]
            except Exception:
                pass  # Fallback to standard search

        results = await self.vectorstore.similarity_search(
            query=query,
            k=self.settings.rag_retrieval_k,
            score_threshold=self.settings.rag_score_threshold,
            deep_memory=deep_memory,
        )

        if not results:
            return "No relevant context found.", []

        context_parts = []
        sources = []
        for i, (doc, score) in enumerate(results):
            meta = doc.metadata or {}
            title = meta.get("title", "Unknown")
            source_url = meta.get("source", "")
            context_parts.append(
                f"[Source {i + 1}: {title} (relevance: {score:.2f})]\n{doc.page_content}"
            )
            if source_url and source_url not in sources:
                sources.append(source_url)

        return "\n\n".join(context_parts), sources

    def _build_messages(
        self,
        context: str,
        history: list[ChatMessage],
        message: str,
    ) -> list:
        """Build the message list for the LLM."""
        messages = [SystemMessage(content=SYSTEM_PROMPT.format(context=context))]

        for msg in history:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                messages.append(AIMessage(content=msg.content))

        messages.append(HumanMessage(content=message))
        return messages

    async def stream(
        self, message: str, history: list[ChatMessage], user_id: str | None = None
    ) -> AsyncGenerator[dict, None]:
        """Stream the RAG response. Yields dicts with 'token' or 'done' keys."""
        context, sources = await self._retrieve_context(message, user_id=user_id)
        messages = self._build_messages(context, history, message)

        full_response = ""
        async for chunk in self.llm.astream(messages):
            token = chunk.content
            if token:
                full_response += token
                yield {"token": token}

        yield {"done": True, "sources": sources, "full_response": full_response}
