import hashlib
import secrets
from datetime import datetime, timezone

from supabase import Client


class APIKeyService:
    """Manage API keys for public RAG access."""

    KEY_PREFIX = "zt_"

    def __init__(self, supabase: Client):
        self.supabase = supabase

    # ------------------------------------------------------------------
    # Key lifecycle
    # ------------------------------------------------------------------

    def create(self, user_id: str, name: str) -> tuple[str, str, str]:
        """Create a new API key.

        Returns:
            (full_key, key_prefix, key_id)
            full_key is shown to the user once and never stored in plain text.
        """
        secret = secrets.token_urlsafe(32)
        full_key = f"{self.KEY_PREFIX}{secret}"
        key_hash = self._hash(full_key)
        key_prefix = full_key[:12] + "..."

        result = (
            self.supabase.table("api_keys")
            .insert(
                {
                    "user_id": user_id,
                    "key_hash": key_hash,
                    "key_prefix": key_prefix,
                    "name": name,
                }
            )
            .execute()
        )

        key_id = result.data[0]["id"]
        return full_key, key_prefix, key_id

    def verify(self, api_key: str) -> dict | None:
        """Verify an API key.

        Returns:
            {"key_id": ..., "user_id": ..., "name": ...} on success, None otherwise.
        """
        key_hash = self._hash(api_key)

        result = (
            self.supabase.table("api_keys")
            .select("id, user_id, name")
            .eq("key_hash", key_hash)
            .eq("is_active", True)
            .execute()
        )

        if not result.data:
            return None

        record = result.data[0]

        # Touch last_used_at (fire-and-forget, don't block the request)
        try:
            self.supabase.table("api_keys").update(
                {"last_used_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", record["id"]).execute()
        except Exception:
            pass  # Non-critical

        return {
            "key_id": record["id"],
            "user_id": record["user_id"],
            "name": record["name"],
        }

    def list_keys(self, user_id: str) -> list[dict]:
        """List all API keys for a user."""
        result = (
            self.supabase.table("api_keys")
            .select("id, key_prefix, name, created_at, last_used_at, is_active")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []

    def revoke(self, user_id: str, key_id: str) -> None:
        """Deactivate an API key."""
        self.supabase.table("api_keys").update({"is_active": False}).eq(
            "id", key_id
        ).eq("user_id", user_id).execute()

    # ------------------------------------------------------------------
    # Usage logging
    # ------------------------------------------------------------------

    def log_usage(
        self,
        api_key_id: str,
        user_id: str,
        endpoint: str,
        status_code: int,
    ) -> None:
        """Record an API call in usage logs."""
        try:
            self.supabase.table("api_usage_logs").insert(
                {
                    "api_key_id": api_key_id,
                    "user_id": user_id,
                    "endpoint": endpoint,
                    "status_code": status_code,
                }
            ).execute()
        except Exception:
            pass  # Logging failure should never block the request

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _hash(key: str) -> str:
        return hashlib.sha256(key.encode()).hexdigest()
