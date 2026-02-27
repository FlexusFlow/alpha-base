import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse
from supabase import Client

from app.config import Settings
from app.dependencies import get_current_user, get_settings, get_supabase
from app.models.chat import ChatRequest
from app.services.chat import ChatService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/api/chat", tags=["chat"])


@router.post("")
async def chat(
    request: ChatRequest,
    _user_id: str = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    # Resolve user_id from project ownership — never trust the client
    project_result = supabase.table("projects").select("user_id").eq(
        "id", request.project_id
    ).single().execute()
    if not project_result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    user_id = project_result.data["user_id"]

    chat_service = ChatService(settings, supabase=supabase)

    async def event_generator():
        full_response = ""
        sources = []

        async for chunk in chat_service.stream(request.message, request.history, user_id=user_id):
            if "token" in chunk:
                full_response += chunk["token"]
                yield {"data": json.dumps({"token": chunk["token"]})}
            elif chunk.get("done"):
                sources = chunk.get("sources", [])
                full_response = chunk.get("full_response", full_response)
                yield {"data": json.dumps({"done": True, "sources": sources})}

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
