from functools import lru_cache

from supabase import create_client, Client

from app.config import Settings
from app.services.job_manager import JobManager

_job_manager = JobManager()
_supabase_client: Client | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_job_manager() -> JobManager:
    return _job_manager


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_key,
        )
    return _supabase_client
