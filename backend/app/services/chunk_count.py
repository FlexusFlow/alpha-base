"""Cached chunk count helpers.

Keeps `deep_memory_settings.total_chunks` in sync whenever chunks are
added to or removed from the DeepLake vector store.
"""

from datetime import datetime, timezone

from supabase import Client


def update_cached_chunk_count(supabase: Client, user_id: str, delta: int) -> None:
    """Increment (or decrement) the cached chunk count for a user.

    Uses an RPC call to atomically add *delta* to the current value,
    upserting the settings row if it doesn't exist yet.
    """
    if delta == 0:
        return

    # Try to update existing row first
    existing = (
        supabase.table("deep_memory_settings")
        .select("total_chunks")
        .eq("user_id", user_id)
        .execute()
    )

    now = datetime.now(timezone.utc).isoformat()

    if existing.data:
        current = existing.data[0]["total_chunks"] or 0
        new_value = max(current + delta, 0)
        supabase.table("deep_memory_settings").update({
            "total_chunks": new_value,
            "updated_at": now,
        }).eq("user_id", user_id).execute()
    else:
        supabase.table("deep_memory_settings").insert({
            "user_id": user_id,
            "total_chunks": max(delta, 0),
            "enabled": False,
            "updated_at": now,
        }).execute()


def reset_cached_chunk_count(supabase: Client, user_id: str) -> None:
    """Set the cached chunk count to 0 (used during user cleanup)."""
    existing = (
        supabase.table("deep_memory_settings")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        supabase.table("deep_memory_settings").update({
            "total_chunks": 0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()
