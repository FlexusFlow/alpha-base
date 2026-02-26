# Tasks: ZIP-006 Public RAG API + ClawHub Skill

**Feature**: Public RAG API + ClawHub Skill
**Branch**: `feature/ZIP-006-public-rag-api`
**Total Tasks**: 28
**Generated**: 2026-02-25

## User Story Mapping

| Story | Spec Scenario | Summary |
| --- | --- | --- |
| US1 | Scenario 3 | API key creation — generate secure keys, show once, store as hash |
| US2 | Scenario 4 | API key management — list, view metadata, revoke keys |
| US3 | Scenario 1, 2 | Public query endpoint — authenticate with API key, query RAG system, return JSON |
| US4 | Scenario 5 | Rate limiting — enforce 60 requests/minute per API key |
| US5 | Scenario 4 | Dashboard UI — API Keys page with table, create dialog, revoke action |
| US6 | Scenario 1 | ClawHub skill file — enable AI assistant integration |

---

## Phase 1: Setup — Database Migration

- [x] T001 Apply Supabase migration `009-public-rag-api.sql`
  - Run via Supabase Dashboard SQL Editor
  - Creates `api_keys` table with columns: id, user_id, key_hash, key_prefix, name, created_at, last_used_at, is_active
  - Creates `api_usage_logs` table with columns: id, api_key_id, user_id, endpoint, status_code, created_at
  - Enables RLS on both tables with policies for SELECT/INSERT/UPDATE/DELETE based on `auth.uid() = user_id`
  - Creates indexes: `idx_api_keys_hash`, `idx_api_keys_user_active`, `idx_usage_logs_key_ts`, `idx_usage_logs_user_ts`
  - See `data-model.md` for full schema details

---

## Phase 2: Backend — Models and Service Layer [US1, US2, US3]

**Goal**: Implement core API key generation, verification, and storage logic.

- [x] T002 [P] [US1, US2, US3] Create Pydantic models in `backend/app/models/api_keys.py`
  - `ChatMessage(role: str, content: str)` — for conversation history in public query
  - `APIKeyCreateRequest(name: str)` with `Field(..., max_length=100)`
  - `APIKeyCreateResponse(id: str, key: str, key_prefix: str, name: str)` — full key returned ONCE
  - `APIKeyItem(id: str, key_prefix: str, name: str, created_at: datetime, last_used_at: datetime | None, is_active: bool)`
  - `APIKeyListResponse(keys: list[APIKeyItem])`
  - `PublicQueryRequest(question: str, history: list[ChatMessage] = [], include_sources: bool = True)` with `Field(..., min_length=1, max_length=2000)` on question
  - `PublicQueryResponse(answer: str, sources: list[str] = [])`

- [x] T003 [US1, US2] Create API key service in `backend/app/services/api_key_service.py`
  - `create(user_id: str, name: str) -> tuple[str, str, str]` — Generate key `zt_{secrets.token_urlsafe(32)}`, compute SHA-256 hash, store hash and prefix (first 12 chars) in Supabase, return `(full_key, key_prefix, key_id)`
  - `verify(api_key: str) -> dict | None` — Compute SHA-256 hash of incoming key, lookup in Supabase by `key_hash`, check `is_active = true`, return `{key_id, user_id, name}` or `None`
  - `update_last_used(key_id: str)` — Update `last_used_at = NOW()` in Supabase
  - `list(user_id: str) -> list[dict]` — Query all keys for user, return list with all `APIKeyItem` fields
  - `revoke(user_id: str, key_id: str)` — Set `is_active = false` for key, validate ownership
  - `log_usage(key_id: str, user_id: str, endpoint: str, status_code: int)` — Insert record into `api_usage_logs`
  - Import: `hashlib.sha256`, `secrets.token_urlsafe`, Supabase client

- [x] T004 [US4] Create rate limiter in `backend/app/services/rate_limiter.py`
  - Class `RateLimiter` with in-memory `defaultdict(list)` tracking timestamps per key_id
  - `check_rate_limit(key_id: str, limit: int = 60, window: int = 60) -> bool` — Prune old timestamps (outside window), count remaining, return `True` if under limit else `False`
  - Add current timestamp to list if under limit
  - Stateless — resets on server restart (acceptable for MVP)

---

## Phase 3: Backend — Dependencies and Middleware [US1, US2, US3, US4]

**Goal**: Add authentication dependency and rate limiting decorator.

- [x] T005 [P] [US3] Add `verify_api_key` dependency in `backend/app/dependencies.py`
  - Import `APIKeyService` from `app.services.api_key_service`
  - Function `verify_api_key(request: Request) -> dict`:
    - Read `Authorization` header, expect `Bearer <key>` format
    - If missing or malformed: `raise HTTPException(401, "Missing or invalid Authorization header")`
    - Extract key (strip "Bearer " prefix)
    - Call `APIKeyService.verify(key)`
    - If None: `raise HTTPException(401, "Invalid API key")`
    - Call `APIKeyService.update_last_used(key_id)` (non-blocking, best effort)
    - Return dict with `{key_id, user_id, name}`

- [x] T006 [US4] Add rate limit dependency in `backend/app/dependencies.py`
  - Import `RateLimiter` from `app.services.rate_limiter`
  - Create global instance: `rate_limiter = RateLimiter()`
  - Function `check_rate_limit(auth: dict = Depends(verify_api_key))`:
    - Extract `key_id` from `auth`
    - Call `rate_limiter.check_rate_limit(key_id, limit=60, window=60)`
    - If False: `raise HTTPException(429, "Rate limit exceeded. Try again later.")`
    - Return `auth` unchanged (allows chaining with verify_api_key)

---

## Phase 4: Backend — API Routes [US1, US2, US3]

**Goal**: Expose API key management and public query endpoints.

- [x] T007 [US1, US2] Create API keys router in `backend/app/routers/api_keys.py`
  - Prefix: `/v1/api/keys`
  - `POST /` (Create key):
    - Request: `APIKeyCreateRequest` with `name`
    - Accept `user_id` in body (current pattern — JWT middleware deferred)
    - Call `APIKeyService.create(user_id, name)`
    - Return `APIKeyCreateResponse` with full key (200 OK)
    - No dependency — auth handled by frontend proxy
  - `GET /` (List keys):
    - Accept `user_id` as query param
    - Call `APIKeyService.list(user_id)`
    - Return `APIKeyListResponse` (200 OK)
  - `DELETE /{key_id}` (Revoke key):
    - Accept `key_id` path param, `user_id` query param
    - Call `APIKeyService.revoke(user_id, key_id)`
    - Return `{"message": "API key revoked successfully"}` (200 OK)
    - If key not found or wrong user: 404

- [x] T008 [US3] Create public query router in `backend/app/routers/public_query.py`
  - Prefix: `/v1/api/public`
  - `POST /query` (Public RAG query):
    - Request: `PublicQueryRequest` with `question`, `history`, `include_sources`
    - Dependencies: `Depends(verify_api_key)`, `Depends(check_rate_limit)` (chained)
    - Extract `user_id` from auth dict
    - Create `ChatService(settings, supabase)` instance
    - Call `_retrieve_context(question, user_id=user_id)` — uses Deep Memory with user's settings
    - Call `_build_messages(context, history, question)` — assembles prompt
    - Accumulate full response: `full_answer = ""` then iterate `async for chunk in llm.astream(messages): full_answer += chunk.content`
    - Extract sources from context (if `include_sources = true`)
    - Call `APIKeyService.log_usage(key_id, user_id, "/v1/api/public/query", 200)`
    - Return `PublicQueryResponse(answer=full_answer, sources=sources)` (200 OK)
    - Do NOT call `_save_message` — public queries have no `project_id`
    - Error handling: catch LLM errors, return 500 with generic message, log with status_code=500

- [x] T009 [P] Register routers in `backend/app/main.py`
  - Import: `from app.routers import api_keys, public_query`
  - Add: `app.include_router(api_keys.router)`
  - Add: `app.include_router(public_query.router)`
  - No tags needed — routers define their own prefixes

---

## Phase 5: Frontend — API Proxy Layer [US1, US2]

**Goal**: Create Next.js API routes to proxy requests to FastAPI with Supabase auth.

- [x] T010 [P] [US1, US2] Create Next.js API route `next-frontend/app/api/keys/route.ts`
  - `POST` handler (Create key):
    - Authenticate via Supabase: `const { data: { session } } = await supabase.auth.getSession()`
    - If no session: return `NextResponse.json({ error: "Unauthorized" }, { status: 401 })`
    - Extract `user_id = session.user.id`
    - Parse request body: `const { name } = await request.json()`
    - Forward to FastAPI: `POST ${API_BASE_URL}/v1/api/keys` with `{ name, user_id }`
    - Return FastAPI response unchanged
  - `GET` handler (List keys):
    - Authenticate, extract `user_id`
    - Forward to FastAPI: `GET ${API_BASE_URL}/v1/api/keys?user_id=${user_id}`
    - Return FastAPI response unchanged
  - Follow pattern from existing `/api/deep-memory/settings/route.ts`

- [x] T011 [P] [US2] Create Next.js API route `next-frontend/app/api/keys/[keyId]/route.ts`
  - `DELETE` handler (Revoke key):
    - Extract `keyId` from `params`
    - Authenticate via Supabase, extract `user_id`
    - Forward to FastAPI: `DELETE ${API_BASE_URL}/v1/api/keys/${keyId}?user_id=${user_id}`
    - Return FastAPI response unchanged

- [x] T012 [P] [US1, US2] Create API client helpers in `next-frontend/lib/api/api-keys.ts`
  - `export async function createAPIKey(name: string): Promise<APIKeyCreateResponse>` — POST to `/api/keys` with `{ name }`
  - `export async function listAPIKeys(): Promise<APIKeyListResponse>` — GET `/api/keys`
  - `export async function revokeAPIKey(keyId: string): Promise<void>` — DELETE `/api/keys/${keyId}`
  - Follow pattern from `next-frontend/lib/api/deep-memory.ts`

- [x] T013 [P] [US1, US2] Add TypeScript types in `next-frontend/lib/types/api-keys.ts` (new file)
  - `export interface ChatMessage { role: string; content: string }`
  - `export interface APIKeyCreateResponse { id: string; key: string; key_prefix: string; name: string }`
  - `export interface APIKeyItem { id: string; key_prefix: string; name: string; created_at: string; last_used_at: string | null; is_active: boolean }`
  - `export interface APIKeyListResponse { keys: APIKeyItem[] }`

---

## Phase 6: Frontend — Dashboard UI [US5]

**Goal**: Create API Keys management page with table, create dialog, and revoke action.

- [x] T014 [US5] Create API Keys page `next-frontend/app/dashboard/api-keys/page.tsx`
  - Async server component pattern (like `/dashboard/deep-memory/page.tsx`)
  - On mount: call `listAPIKeys()` to fetch initial data
  - State: `keys` (list), `isCreateDialogOpen` (boolean), `newKeyData` (APIKeyCreateResponse | null), `newKeyName` (string)
  - **Table**: Use TanStack Table with columns:
    - Key Prefix (monospace font)
    - Name
    - Created At (formatted date)
    - Last Used (formatted date or "Never")
    - Status (Badge: "Active" green, "Revoked" gray)
    - Actions (Revoke button — only for active keys)
  - **Create button**: "Create API Key" — opens dialog
  - **Create dialog**:
    - Input field for `name` (max 100 chars, required)
    - Submit button → call `createAPIKey(name)` → on success, set `newKeyData` and open **Key Display Modal**
    - On error: show error message
  - **Key Display Modal** (shows after creation):
    - Display full `key` in monospace with copy button
    - Warning text: "⚠️ Copy this key now. It will not be shown again."
    - Close button → clears `newKeyData`, refreshes key list
  - **Revoke action**:
    - Confirmation dialog: "Revoke this API key? It will stop working immediately and cannot be re-activated."
    - On confirm: call `revokeAPIKey(keyId)` → refresh key list
  - Refresh key list: `setKeys(await listAPIKeys())`
  - Use shadcn/ui components: Table, Dialog, Button, Badge, Alert, Input

- [x] T015 [US5] Update sidebar in `next-frontend/components/app-sidebar.tsx`
  - Import `Key` icon from `lucide-react`
  - Add menu item to `navMain` or `navSecondary` array:
    ```typescript
    {
      title: "API Keys",
      url: "/dashboard/api-keys",
      icon: Key
    }
    ```
  - Position: After "Deep Memory" item, before bottom items

---

## Phase 7: Skill File [US6]

**Goal**: Create ClawHub skill file for AI assistant integration.

- [x] T016 [US6] Create skill file `skill/alphabase-rag.md`
  - ~30-40 lines markdown
  - **Sections**:
    1. **Description**: "Query AlphaBase's knowledge base on trading and investing, sourced from transcribed YouTube videos"
    2. **When to Use**: "When user asks about trading strategies, stock analysis, investing advice, or explicitly requests AlphaBase. When you need domain expertise on trading topics."
    3. **API Endpoint**: `POST https://<domain>/v1/api/public/query`
    4. **Authentication**: `Authorization: Bearer <api_key>` header. If user doesn't have a key, guide them to create one in AlphaBase dashboard.
    5. **Request Format**:
       ```json
       {
         "question": "What are the best trading strategies?",
         "history": [{"role": "user", "content": "..."}, ...],
         "include_sources": true
       }
       ```
    6. **Response Format**:
       ```json
       {
         "answer": "Based on AlphaBase videos...",
         "sources": ["Video: ... (Chunk 5)", ...]
       }
       ```
    7. **Error Handling**:
       - 401: Invalid key → prompt user to check API key
       - 429: Rate limit → ask user to wait, explain 60 req/min limit
       - 500: Internal error → retry or report issue
    8. **AI Instructions**:
       - Always cite sources in your response
       - Maintain conversation context by passing `history`
       - If answer is not found in knowledge base, say so explicitly
       - Format sources as bullet points at the end of response

---

## Phase 8: Testing [US1, US2, US3, US4]

**Goal**: Validate backend functionality with automated tests.

- [x] T017 [US1] Write backend tests in `backend/tests/test_api_keys.py`
  - Test: Key generation → verify format `zt_*`, length 44+, hash != plaintext
  - Test: Hash verification → create key, verify with correct key → returns user_id, verify with wrong key → returns None
  - Test: Revoke key → create, revoke, verify → returns None
  - Test: List keys → create 2 keys, list → verify count and metadata
  - Test: Key prefix → verify first 12 chars match
  - Use pytest fixtures for setup/teardown (create/delete test user, clean up keys)

- [x] T018 [US3, US4] Write backend tests in `backend/tests/test_public_query.py`
  - Test: Query without key → 401 Unauthorized
  - Test: Query with invalid key → 401
  - Test: Query with valid key → 200 + answer + sources
  - Test: Rate limit → make 61 requests in <1 minute → 61st returns 429
  - Test: Usage logging → query → verify record in `api_usage_logs` with correct endpoint and status_code
  - Test: Revoked key → create, revoke, query → 401
  - Mock LangChain LLM responses to avoid API costs

- [x] T019 Manual testing with cURL
  - Create key via dashboard → copy full key
  - Test valid request:
    ```bash
    curl -X POST http://localhost:8000/v1/api/public/query \
      -H "Authorization: Bearer zt_<key>" \
      -H "Content-Type: application/json" \
      -d '{"question": "What are the best trading strategies?", "include_sources": true}'
    ```
  - Verify: 200 response with `answer` and `sources` fields
  - Test invalid key: replace key → verify 401
  - Test rate limit: script to send 61 requests → verify 429 on 61st
  - Test revoked key: revoke via dashboard → retry request → verify 401

---

## Dependencies

```
T001 (migration) ─► T002 (models depend on schema)
T002 ─► T003, T007, T008 (service and routers depend on models)
T003 ─► T005 (verify_api_key depends on APIKeyService)
T004 ─► T006 (check_rate_limit depends on RateLimiter)
T005, T006 ─► T008 (public query router depends on both dependencies)
T007, T008 ─► T009 (main.py registers routers)
T002 ─► T013 (TypeScript types mirror Pydantic models)
T013 ─► T012 (API client uses types)
T010, T011 ─► T012 (API client calls proxy routes)
T012 ─► T014 (page uses API client)
T014 ─► T015 (sidebar links to page)
T009 (routers registered) ─► T017, T018 (tests require running backend)
All backend tasks ─► T019 (manual testing requires full backend)
T016 is independent (skill file)
```

## Parallel Execution Opportunities

**After T001 (migration)**:
- Batch A: T002 (models) can start immediately
- T004 (rate limiter) is independent — can run in parallel with T002

**After T002 (models)**:
- Batch B: T003 (service) + T007 (router) can run in parallel (service is used by router, so T003 must finish before T007's implementation detail but both can start from models)
- T013 (TS types) is independent — can run in parallel with backend work

**After T003 (service)**:
- Batch C: T005 (verify dependency) can start

**After T004 + T005**:
- T006 (rate limit dependency) can start

**After T007 + T008 (routers)**:
- T009 (register routers) requires both

**Frontend proxy layer** (after T002 for model contracts):
- Batch D: T010 + T011 (two route files) can run in parallel
- After T010 + T011: T012 (API client)
- After T012: T014 (page)
- After T014: T015 (sidebar)

**Testing** (after T009):
- Batch E: T017 + T018 can run in parallel (different test files)
- T019 (manual) requires T009 and ideally T014 for creating keys via UI

**Sequential Chains**:
1. T001 → T002 → T003 → T005 → T008 → T009 → T017 (backend critical path)
2. T001 → T002 → T013 → T012 → T014 → T015 (frontend critical path)
3. T004 → T006 → T008 (rate limiting chain)

## Implementation Strategy

**Recommended Order**:
1. **Phase 1** (T001): Apply migration first — all work depends on schema
2. **Phase 2** (T002-T004): Backend foundation — models, service, rate limiter (can parallelize T004)
3. **Phase 3** (T005-T006): Dependencies — sequential (T005 before T006)
4. **Phase 4** (T007-T009): Routers — T007 and T008 can partially overlap, then T009
5. **Phase 5** (T010-T013): Frontend proxies and types — parallelize T010, T011, T013, then T012
6. **Phase 6** (T014-T015): Dashboard UI — T014 then T015
7. **Phase 7** (T016): Skill file — independent, can be done anytime
8. **Phase 8** (T017-T019): Testing — T017 and T018 in parallel, then T019 manual

**Critical Path**: T001 → T002 → T003 → T005 → T008 → T009 → T014 → T015 (18 tasks)

**Estimated Duration**: 2-3 days for experienced developer (backend: 1 day, frontend: 1 day, testing + skill: 0.5 day)

## Testing Checklist

- [ ] Backend unit tests pass (`pytest tests/test_api_keys.py tests/test_public_query.py`)
- [ ] Frontend builds without errors (`yarn build`)
- [ ] Create API key flow: dashboard → create → see full key → copy → close → see prefix in table
- [ ] Revoke API key: table → revoke → confirm → key becomes inactive → request fails with 401
- [ ] Public query: cURL with valid key → 200 + answer + sources
- [ ] Rate limit: 61 requests in 1 minute → 61st returns 429
- [ ] Invalid key: cURL with wrong key → 401
- [ ] Usage logs: query → check `api_usage_logs` table → record exists
- [ ] Existing chat: dashboard chat still works unchanged (SSE flow)
