import logging
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request
from supabase import create_client, Client

from app.config import Settings
from app.services.api_key_service import APIKeyService
from app.services.job_manager import JobManager
from app.services.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

_job_manager = JobManager()
_supabase_client: Client | None = None
_rate_limiter = RateLimiter(max_requests=60, window_seconds=60)


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


def get_rate_limiter() -> RateLimiter:
    return _rate_limiter


async def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> str:
    """FastAPI dependency: validate Supabase JWT and return user_id.

    Extracts the Bearer token from the Authorization header, validates it
    using the Supabase JWT secret, and returns the user's UUID from the
    ``sub`` claim.

    Raises:
        HTTPException 401 for missing, invalid, or expired tokens.
    """
    auth_header = request.headers.get("Authorization")

    if not auth_header:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    token = auth_header.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Authentication token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    return user_id


async def verify_api_key(
    request: Request,
    supabase: Client = Depends(get_supabase),
    limiter: RateLimiter = Depends(get_rate_limiter),
) -> dict:
    """FastAPI dependency: authenticate via API key in Authorization header.

    Returns:
        {"key_id": ..., "user_id": ..., "name": ...}

    Raises:
        HTTPException 401 if key is missing/invalid.
        HTTPException 429 if rate limit exceeded.
    """
    auth_header = request.headers.get("Authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Expected: Bearer <api_key>",
        )

    api_key = auth_header.removeprefix("Bearer ").strip()

    service = APIKeyService(supabase)
    verified = service.verify(api_key)

    if not verified:
        raise HTTPException(status_code=401, detail="Invalid or expired API key")

    # Rate limiting
    if not limiter.is_allowed(verified["key_id"]):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Max 60 requests per minute.",
        )

    return verified
