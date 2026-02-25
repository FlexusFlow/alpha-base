import logging

from fastapi import APIRouter, Depends
from supabase import Client

from app.config import Settings
from app.dependencies import get_settings, get_supabase, verify_api_key
from app.models.api_keys import PublicQueryRequest, PublicQueryResponse
from app.services.api_key_service import APIKeyService
from app.services.chat import ChatService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/api/public", tags=["public-query"])


@router.post("/query", response_model=PublicQueryResponse)
async def public_query(
    request: PublicQueryRequest,
    api_key_info: dict = Depends(verify_api_key),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    """Public RAG query endpoint for external consumers (ClaudeBot skills, etc.).

    Authenticate with: Authorization: Bearer <api_key>
    Returns a complete JSON response (not SSE).
    """
    user_id = api_key_info["user_id"]
    key_id = api_key_info["key_id"]
    key_service = APIKeyService(supabase)

    try:
        chat_service = ChatService(settings, supabase=supabase)

        # Retrieve context from vector store (respects Deep Memory if enabled)
        context, sources = await chat_service._retrieve_context(
            request.question, user_id=user_id
        )

        # Build LLM messages
        messages = chat_service._build_messages(
            context, request.history, request.question
        )

        # Collect full response (non-streaming)
        full_response = ""
        async for chunk in chat_service.llm.astream(messages):
            token = chunk.content
            if token:
                full_response += token

        # Log successful usage
        key_service.log_usage(
            api_key_id=key_id,
            user_id=user_id,
            endpoint="/v1/api/public/query",
            status_code=200,
        )

        return PublicQueryResponse(
            answer=full_response,
            sources=sources if request.include_sources else [],
        )

    except Exception as e:
        logger.exception("Public query failed for key %s", key_id)

        key_service.log_usage(
            api_key_id=key_id,
            user_id=user_id,
            endpoint="/v1/api/public/query",
            status_code=500,
        )
        raise
