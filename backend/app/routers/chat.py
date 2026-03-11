import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse
from supabase import Client

from app.config import Settings
from app.dependencies import get_current_user, get_settings, get_supabase, get_web_search_limiter
from app.models.chat import ChatRequest
from app.services.chat import AgentChatService
from app.services.web_search_limiter import WebSearchLimiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/api/chat", tags=["chat"])


@router.get("/config")
async def chat_config(
    _user_id: str = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return {"web_search_available": settings.serper_api_key is not None}


@router.post("")
async def chat(
    request: ChatRequest,
    _user_id: str = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
    web_search_limiter: WebSearchLimiter = Depends(get_web_search_limiter),
):
    # Resolve user_id from project ownership — never trust the client
    project_result = supabase.table("projects").select("user_id").eq(
        "id", request.project_id
    ).single().execute()
    if not project_result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    user_id = project_result.data["user_id"]

    chat_service = AgentChatService(
        settings, supabase=supabase, web_search_limiter=web_search_limiter,
    )

    async def event_generator():
        full_response = ""
        sources = []
        source_types = []

        async for chunk in chat_service.stream(
            request.message,
            request.history,
            user_id=user_id,
            extended_search=request.extended_search,
        ):
            if "token" in chunk:
                full_response += chunk["token"]
                yield {"data": json.dumps({"token": chunk["token"]})}
            elif chunk.get("done"):
                sources = chunk.get("sources", [])
                source_types = chunk.get("source_types", [])
                full_response = chunk.get("full_response", full_response)
                done_event = {
                    "done": True,
                    "sources": sources,
                    "source_types": source_types,
                }
                # Include kb_relevant only for KB-only mode
                if not request.extended_search:
                    done_event["kb_relevant"] = chunk.get("kb_relevant")
                yield {"data": json.dumps(done_event)}

        # Store messages in Supabase
        try:
            supabase.table("chat_messages").insert({
                "project_id": request.project_id,
                "role": "user",
                "content": request.message,
            }).execute()

            supabase.table("chat_messages").insert({
                "project_id": request.project_id,
                "role": "assistant",
                "content": full_response,
                "sources": json.dumps(sources),
            }).execute()
        except Exception as e:
            logger.error("Failed to store chat messages: %s", e)

    return EventSourceResponse(event_generator())
