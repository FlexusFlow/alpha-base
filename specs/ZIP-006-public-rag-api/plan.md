# ZIP-006: Public RAG API + ClawHub Skill

## Goal

Expose the AlphaBase RAG chat as a public API with API key authentication. This will allow external consumers (ClaudeBot via a ClawHub skill, third-party integrations) to query the knowledge base without access to the dashboard.

## Architecture

```
                    ┌────────────────────────┐
                    │  Existing flow          │
                    │  Browser → Next.js →    │
                    │  POST /v1/api/chat      │
                    │  (SSE, user_id in body) │
                    └────────────────────────┘

                    ┌────────────────────────┐
                    │  New public flow        │
                    │  ClaudeBot / cURL →     │
                    │  POST /v1/api/public/   │
                    │    query                │
                    │  (JSON, API key in      │
                    │   Authorization header) │
                    └────────────────────────┘
```

Both flows coexist. The existing SSE chat remains unchanged.

---

## Phase 1: Backend — API Key System

### 1.1 Supabase Migration: `api_keys` table

```sql
CREATE TABLE public.api_keys (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,           -- SHA-256 of the full key
  key_prefix  TEXT NOT NULL,                  -- first 12 characters for UI
  name        TEXT NOT NULL,                  -- user-defined label
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT TRUE,

  CONSTRAINT api_keys_name_length CHECK (char_length(name) <= 100)
);

-- RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_keys_select" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_keys_insert" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_keys_update" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_keys_delete" ON public.api_keys FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_user_active ON public.api_keys(user_id, is_active);
```

### 1.2 Supabase Migration: `api_usage_logs` table

```sql
CREATE TABLE public.api_usage_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id  UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint    TEXT NOT NULL,
  status_code INT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_logs_select" ON public.api_usage_logs FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_usage_logs_key_ts ON public.api_usage_logs(api_key_id, created_at);
CREATE INDEX idx_usage_logs_user_ts ON public.api_usage_logs(user_id, created_at);
```

> Minimal fields for MVP. No token counting, no IP — will add later if needed.

### 1.3 Models: `backend/app/models/api_keys.py` (new file)

```python
from pydantic import BaseModel, Field
from datetime import datetime


class ChatMessage(BaseModel):
    role: str
    content: str


class APIKeyCreateRequest(BaseModel):
    name: str = Field(..., max_length=100)


class APIKeyCreateResponse(BaseModel):
    """Full key is returned ONCE at creation time."""
    id: str
    key: str               # "zt_<random>" — show once and never again
    key_prefix: str         # "zt_abc1..."
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


class PublicQueryRequest(BaseModel):
    """Synchronous request (not SSE) for external consumers."""
    question: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = []
    include_sources: bool = True


class PublicQueryResponse(BaseModel):
    answer: str
    sources: list[str] = []
```

### 1.4 Service: `backend/app/services/api_key_service.py` (new file)

Responsibilities:
- `create(user_id, name) → (full_key, key_prefix, key_id)` — generate `zt_` + 32 bytes via secrets.token_urlsafe, store SHA-256 hash
- `verify(api_key) → {key_id, user_id, name} | None` — lookup by hash, check is_active
- `update_last_used(key_id)` — update last_used_at
- `list(user_id) → list[dict]`
- `revoke(user_id, key_id)` — set is_active=False
- `log_usage(key_id, user_id, endpoint, status_code)` — write to api_usage_logs

Key format: `zt_{secrets.token_urlsafe(32)}` — 44+ characters, `zt_` prefix for identification.

### 1.5 Dependency: update `backend/app/dependencies.py`

Add `verify_api_key(request: Request) → dict`:
- Read `Authorization: Bearer <key>` from header
- Call `APIKeyService.verify(key)`
- On invalid key → `HTTPException(401)`
- On success → return `{key_id, user_id, name}`

### 1.6 Router: `backend/app/routers/api_keys.py` (new file)

Prefix: `/v1/api/keys`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create key | user_id (from body, as all current routers) |
| GET | `/` | List keys | user_id (query param) |
| DELETE | `/{key_id}` | Revoke key | user_id (query param) |

> Note: authentication currently uses user_id in body/params — same as all existing routers. JWT middleware will be added in a separate ticket (backlog).

### 1.7 Router: `backend/app/routers/public_query.py` (new file)

Prefix: `/v1/api/public`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/query` | RAG query, full JSON response | API key (Bearer) |

Logic:
1. `verify_api_key` → get user_id
2. Create `ChatService(settings, supabase)`
3. `_retrieve_context(question, user_id=user_id)` — search vector store with Deep Memory
4. `_build_messages(context, history, question)` — assemble prompt
5. Collect full response via `llm.astream()` (NOT SSE — just accumulate)
6. Log usage
7. Return `PublicQueryResponse(answer=..., sources=...)`

Not saved to `chat_messages` — public queries have no project_id.

### 1.8 Update `backend/app/main.py`

```python
from app.routers import api_keys, public_query
# ...
app.include_router(api_keys.router)
app.include_router(public_query.router)
```

### 1.9 Rate limiting (simple, in-memory)

In `dependencies.py` — decorator/dependency `check_rate_limit`:
- `defaultdict(list)` with timestamps per key_id
- 60 requests/minute for MVP
- `HTTPException(429)` when exceeded

> For production, replace with Redis. For MVP — sufficient.

---

## Phase 2: Frontend — API Key Management

### 2.1 Page: `next-frontend/app/dashboard/api-keys/page.tsx`

Components:
- **Key table** (TanStack Table) — key_prefix, name, created_at, last_used_at, status, "Revoke" button
- **"Create Key" button** → dialog with name field
- **Secret dialog** — after creation, show full key + "Copy" button. Warning: "This key will not be shown again."

Pattern: same as `/dashboard/deep-memory/page.tsx` — async server component + client island for interactivity.

### 2.2 API helper: `next-frontend/lib/api/api-keys.ts`

```typescript
export async function createAPIKey(userId: string, name: string): Promise<APIKeyCreateResponse>
export async function listAPIKeys(userId: string): Promise<APIKeyListResponse>
export async function revokeAPIKey(userId: string, keyId: string): Promise<void>
```

### 2.3 Next.js API proxy: `next-frontend/app/api/keys/route.ts`

Following existing pattern: Supabase auth → inject user_id → forward to FastAPI.

### 2.4 Sidebar: update `components/app-sidebar.tsx`

Add item:
```typescript
{ title: "API Keys", url: "/dashboard/api-keys", icon: Key }
```

Icon: `Key` from lucide-react.

---

## Phase 3: Skill File for ClawHub

### 3.1 File: `skill/alphabase-rag.md`

~30-40 lines containing:
- **Description**: "Query the AlphaBase knowledge base on investing and trading based on transcribed YouTube videos"
- **When to use**: questions about trading, strategies, stocks, when the user explicitly asks for AlphaBase
- **API endpoint**: `POST https://<domain>/v1/api/public/query`
- **Authorization**: `Authorization: Bearer <api_key>`
- **Request/response format**: JSON examples
- **Error handling**: 401, 429, 500
- **Instructions for AI**: cite sources, if no key present — ask the user to obtain one

---

## Phase 4: Testing

### 4.1 Backend tests: `backend/tests/test_api_keys.py`

- Key generation: format `zt_*`, hash is not equal to key
- Verification: valid key → user_id, invalid → None
- Revocation: revoked key fails verify
- Rate limit: 61st request per minute → 429

### 4.2 Backend tests: `backend/tests/test_public_query.py`

- Request without key → 401
- Request with invalid key → 401
- Request with valid key → 200 + answer + sources
- Entry in api_usage_logs after request

### 4.3 Manual testing

- cURL with real key → verify response
- Test in ClaudeBot (if available)

---

## Implementation Order

| # | Task | Files | Dependencies |
|---|------|-------|--------------|
| 1 | SQL migrations (api_keys, api_usage_logs) | Supabase SQL | — |
| 2 | Models (api_keys.py) | backend/app/models/api_keys.py | — |
| 3 | API key service | backend/app/services/api_key_service.py | #2 |
| 4 | Dependency verify_api_key + rate limiter | backend/app/dependencies.py | #3 |
| 5 | Key management router | backend/app/routers/api_keys.py | #3, #4 |
| 6 | Public query router | backend/app/routers/public_query.py | #3, #4 |
| 7 | Register in main.py | backend/app/main.py | #5, #6 |
| 8 | Backend tests | backend/tests/ | #5, #6 |
| 9 | Frontend API proxy | next-frontend/app/api/keys/ | #5 |
| 10 | Frontend API Keys page | next-frontend/app/dashboard/api-keys/ | #9 |
| 11 | Update sidebar | next-frontend/components/app-sidebar.tsx | #10 |
| 12 | Skill file | skill/alphabase-rag.md | #6 |

---

## Out of Scope for MVP

- JWT middleware for internal endpoints (separate ticket)
- Stripe integration and paid tiers
- Landing page
- Token-based limits / billing
- Redis rate limiting
- Token counting in usage logs
- Key expiration
- IP whitelisting
- Publishing to ClawHub (requires platform access)

---

## Backlog Connections

- **FastAPI Auth Middleware** — this ticket does NOT address the broader JWT validation problem for internal endpoints. It adds a *parallel* authorization mechanism (API keys) only for the new public endpoint. JWT middleware remains in the backlog.
- **User-Scoped Vector Store** — the public API uses user_id from the verified key for Deep Memory settings. When user_id is added to vector metadata, the public API will automatically get user-scoped results.
