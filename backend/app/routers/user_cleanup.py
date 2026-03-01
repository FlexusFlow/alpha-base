import logging

from fastapi import APIRouter, Depends

from supabase import Client

from app.config import Settings
from app.dependencies import get_current_user, get_settings, get_supabase
from app.services.chunk_count import reset_cached_chunk_count
from app.services.vectorstore import cleanup_user_vectorstore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/api/internal", tags=["internal"])


@router.delete("/user-cleanup")
async def cleanup_user_data(
    user_id: str = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    """Clear a user's vector store dataset (for account deletion).

    Internal endpoint — not publicly exposed. Intended to be called by
    Supabase webhooks or Edge Functions on auth.users DELETE.
    """
    await cleanup_user_vectorstore(user_id, settings)
    reset_cached_chunk_count(supabase, user_id)
    logger.info("Cleaned up vector store for user %s", user_id)
    return {"status": "ok", "user_id": user_id}
