import logging

from langchain_core.tools import tool
from langchain_community.utilities import GoogleSerperAPIWrapper

from app.services.vectorstore import VectorStoreService

logger = logging.getLogger(__name__)


def make_kb_search_tool(vectorstore: VectorStoreService, deep_memory: bool = False):
    """Create a knowledge base search tool bound to a user's vectorstore."""

    @tool
    async def search_knowledge_base(query: str) -> str:
        """Search the user's personal knowledge base of YouTube transcripts, articles,
        and documentation. Always use this tool first before web search."""
        results = await vectorstore.similarity_search(
            query=query, k=5, score_threshold=0.3, deep_memory=deep_memory,
        )
        if not results:
            return "No relevant content found in the knowledge base."

        parts = []
        for i, (doc, score) in enumerate(results):
            meta = doc.metadata or {}
            title = meta.get("title", meta.get("page_title", "Unknown"))
            source_url = meta.get("source", "")
            parts.append(
                f"[Source {i + 1}: {title} (relevance: {score:.2f})]"
                f"\nURL: {source_url}"
                f"\n{doc.page_content}"
            )
        return "\n\n".join(parts)

    return search_knowledge_base


def make_web_search_tool(serper_api_key: str):
    """Create a Serper web search tool."""
    serper = GoogleSerperAPIWrapper(serper_api_key=serper_api_key, k=3)

    @tool
    async def web_search(query: str) -> str:
        """Search the web for current information. Use this only when the knowledge
        base does not contain relevant results for the user's question."""
        results = await serper.aresults(query)
        parts = []

        # Parse organic results from Serper response
        organic = results.get("organic", [])
        for r in organic[:3]:
            title = r.get("title", "")
            url = r.get("link", "")
            snippet = r.get("snippet", "")
            parts.append(f"[{title}]\nURL: {url}\n{snippet}")

        # Include answer box if present
        answer_box = results.get("answerBox", {})
        if answer_box:
            answer = answer_box.get("answer") or answer_box.get("snippet", "")
            if answer:
                parts.insert(0, f"[Direct Answer]\n{answer}")

        return "\n\n".join(parts) if parts else "No web results found."

    return web_search
