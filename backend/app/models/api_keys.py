from datetime import datetime

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str


# --- API Key management models ---


class APIKeyCreateRequest(BaseModel):
    name: str = Field(..., max_length=100)


class APIKeyCreateResponse(BaseModel):
    """Full key is returned ONCE on creation — never retrievable again."""

    id: str
    key: str
    key_prefix: str
    name: str


class APIKeyItem(BaseModel):
    id: str
    key_prefix: str
    name: str
    created_at: datetime
    last_used_at: datetime | None
    is_active: bool


class APIKeyListResponse(BaseModel):
    keys: list[APIKeyItem]


# --- Public query models ---


class PublicQueryRequest(BaseModel):
    """Synchronous RAG query for external consumers (ClaudeBot, etc.)."""

    question: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = []
    include_sources: bool = True


class PublicQueryResponse(BaseModel):
    answer: str
    sources: list[str] = []
