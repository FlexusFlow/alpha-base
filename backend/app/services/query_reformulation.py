import asyncio
import logging

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import Settings

logger = logging.getLogger(__name__)

REFORMULATION_PROMPT = """You are a query correction assistant. Your job is to fix typos, correct misspelled names, \
and expand common abbreviations in the user's search query. Return ONLY the corrected query, nothing else.

Rules:
- Fix obvious typos and misspellings (e.g., "nenci pilossi" → "Nancy Pelosi")
- Expand common abbreviations (e.g., "fed" → "Federal Reserve" when used in financial context)
- Preserve the original intent and meaning — do not add, remove, or change the topic
- If the query is already correct, return it exactly as-is
- Do not add quotes, explanations, or formatting — just the corrected query text"""


async def reformulate_query(query: str, settings: Settings) -> str:
    """Reformulate a user query to correct typos and expand abbreviations.

    Returns the corrected query, or the original query on any failure.
    """
    try:
        llm = ChatOpenAI(
            model=settings.query_reformulation_model,
            max_tokens=256,
            openai_api_key=settings.openai_api_key,
            temperature=0,
        )
        messages = [
            SystemMessage(content=REFORMULATION_PROMPT),
            HumanMessage(content=query),
        ]
        result = await asyncio.wait_for(llm.ainvoke(messages), timeout=5.0)
        corrected = result.content.strip()

        if not corrected:
            return query

        if corrected != query:
            logger.info("Query reformulated: '%s' → '%s'", query, corrected)

        return corrected
    except asyncio.TimeoutError:
        logger.warning("Query reformulation timed out for: '%s'", query)
        return query
    except Exception as e:
        logger.warning("Query reformulation failed for '%s': %s", query, e)
        return query
