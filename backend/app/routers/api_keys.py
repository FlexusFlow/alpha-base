from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.dependencies import get_supabase
from app.models.api_keys import (
    APIKeyCreateRequest,
    APIKeyCreateResponse,
    APIKeyItem,
    APIKeyListResponse,
)
from app.services.api_key_service import APIKeyService

router = APIRouter(prefix="/v1/api/keys", tags=["api-keys"])


@router.post("", response_model=APIKeyCreateResponse, status_code=201)
async def create_api_key(
    request: APIKeyCreateRequest,
    supabase: Client = Depends(get_supabase),
):
    """Create a new API key. The full key is returned ONCE — store it securely."""
    service = APIKeyService(supabase)
    full_key, key_prefix, key_id = service.create(
        user_id=request.user_id,
        name=request.name,
    )

    return APIKeyCreateResponse(
        id=key_id,
        key=full_key,
        key_prefix=key_prefix,
        name=request.name,
    )


@router.get("", response_model=APIKeyListResponse)
async def list_api_keys(
    user_id: str = Query(...),
    supabase: Client = Depends(get_supabase),
):
    """List all API keys for a user."""
    service = APIKeyService(supabase)
    keys = service.list_keys(user_id)

    return APIKeyListResponse(
        keys=[
            APIKeyItem(
                id=k["id"],
                key_prefix=k["key_prefix"],
                name=k["name"],
                created_at=k["created_at"],
                last_used_at=k.get("last_used_at"),
                is_active=k["is_active"],
            )
            for k in keys
        ]
    )


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: str,
    user_id: str = Query(...),
    supabase: Client = Depends(get_supabase),
):
    """Revoke (deactivate) an API key."""
    service = APIKeyService(supabase)
    service.revoke(user_id, key_id)
