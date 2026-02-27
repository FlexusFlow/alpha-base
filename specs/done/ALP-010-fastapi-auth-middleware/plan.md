# Implementation Plan: FastAPI Auth Middleware (ALP-010)

**Feature ID**: ALP-010
**Branch**: `feature/ALP-010-fastapi-auth-middleware`
**Status**: Ready for task generation
**Created**: 2026-02-27

## Technical Context

| Aspect | Detail |
|--------|--------|
| Backend framework | FastAPI (Python 3.12+) with `uv` package manager |
| Auth provider | Supabase Auth (issues HS256 JWTs) |
| JWT library | PyJWT >=2.8.0 (to be added) |
| Frontend | Next.js 15 (App Router) + TypeScript |
| Supabase client | Service-role key (bypasses RLS) |
| Existing auth | `verify_api_key` dependency for public query endpoint only |
| Test framework | pytest + pytest-asyncio (installed, no tests yet) |

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend + Python Backend | PASS | Backend-only auth layer + frontend token forwarding |
| II. API-Boundary Separation | PASS | Auth enforced at FastAPI boundary; Next.js proxy pattern preserved |
| III. Supabase as Source of Truth | PASS | Uses Supabase-issued JWTs; no new auth system |
| IV. Background Jobs with Real-Time Feedback | PASS | SSE events endpoint exempt from JWT (job-ID scoped) |
| V. Simplicity and Pragmatism | PASS | Dependency-based auth (not middleware); minimal abstraction |

## Architecture Decision: Dependency vs Middleware

**Chosen**: FastAPI dependency (`get_current_user`)

The auth layer is implemented as a FastAPI dependency rather than ASGI middleware because:
1. **Idiomatic**: Matches existing `verify_api_key` pattern in the codebase
2. **Per-route control**: Public endpoints simply don't use the dependency
3. **Type-safe**: Returns `str` (user_id) directly to route handlers
4. **Testable**: Easily overridden with `app.dependency_overrides` in tests

## Endpoint Inventory

### Protected (18 endpoints — require `get_current_user`)

| Router | Endpoints | Current user_id source |
|--------|-----------|----------------------|
| knowledge | 4 | Body + query param |
| deep_memory | 8 | Body + query param |
| api_keys | 3 | Body + query param |
| articles | 1 | Body |
| chat | 1 | DB lookup (project_id → user_id) |
| user_cleanup | 1 | Path param |

### Exempt (3 endpoints — no JWT required)

| Router | Endpoint | Auth mechanism |
|--------|----------|---------------|
| public_query | `POST /query` | API key (`verify_api_key`) |
| youtube | `GET /preview` | None (public) |
| events | `GET /stream/{job_id}` | None (job-ID scoped) |
| health | `GET /health` | None (public) |

## Frontend Call Patterns

Two patterns exist in the frontend, both need token forwarding:

### Pattern 1: Browser → Next.js API route → FastAPI
Routes: deep-memory, api-keys, articles, youtube preview
- Next.js API routes already verify auth via `supabase.auth.getUser()`
- **Change needed**: Forward the access token to FastAPI via `Authorization: Bearer <token>`
- Token source: Server-side Supabase client session

### Pattern 2: Browser → FastAPI (direct)
Routes: chat, knowledge/youtube/add, events/stream
- Browser calls FastAPI directly using `NEXT_PUBLIC_API_BASE_URL`
- **Change needed**: Include `Authorization: Bearer <token>` header from browser
- Token source: `supabase.auth.getSession()` on the browser client
- Note: `events/stream` is SSE (exempt from JWT per spec)

## Implementation Phases

### Phase 1: Backend Auth Foundation

**Files**: `pyproject.toml`, `config.py`, `dependencies.py`

1. Add `PyJWT>=2.8.0` to `pyproject.toml` dependencies
2. Add `supabase_jwt_secret: str` to `Settings` in `config.py`
3. Add `SUPABASE_JWT_SECRET` to `.env`
4. Create `get_current_user` dependency in `dependencies.py`:
   - Extract `Authorization: Bearer <token>` from request headers
   - Decode JWT using `PyJWT` with `SUPABASE_JWT_SECRET` and `HS256`
   - Verify `aud` claim equals `authenticated`
   - Extract and return `sub` claim as user_id
   - Raise `HTTPException(401)` for all failure cases

### Phase 2: Router Migration (Backend)

**Files**: All 6 protected routers + their models

For each protected router:
1. Add `user_id: str = Depends(get_current_user)` parameter to route handlers
2. Remove `user_id` from request body / query params / path params
3. Update Pydantic models to remove `user_id` field
4. Update service calls to use dependency-injected `user_id`

**Special cases**:
- `chat.py`: Already derives user_id from project ownership — add JWT auth as an additional validation layer; keep the project ownership check
- `user_cleanup.py`: Change route from `/user-cleanup/{user_id}` to `/user-cleanup` (user_id from token)
- `knowledge.py` `GET /jobs/{job_id}`: Add JWT auth but keep job-ID based access pattern

### Phase 3: Frontend Token Forwarding

**Files**: Next.js API routes, browser API helpers

#### 3a: Next.js API Routes (server-side)
For each API route that calls FastAPI:
1. Get access token from Supabase server client session
2. Add `Authorization: Bearer <token>` header to the fetch call to FastAPI
3. Continue passing other request body fields (minus user_id)

#### 3b: Browser Direct Calls
For `chat.ts` and `knowledge.ts`:
1. Get access token from browser Supabase client (`supabase.auth.getSession()`)
2. Add `Authorization: Bearer <token>` header to fetch calls
3. Remove `user_id` from request body where applicable

#### 3c: Create shared auth header utility
Create a helper function in `next-frontend/lib/api/` that:
- Gets the current session token
- Returns the Authorization header object
- Handles missing session gracefully (redirect to login)

### Phase 4: Tests

**Files**: `tests/conftest.py`, `tests/test_auth.py`

1. Create `conftest.py` with:
   - Test JWT secret fixture
   - Valid token generator fixture
   - Expired token generator fixture
   - FastAPI test client fixture with `get_current_user` override
2. Create `test_auth.py` testing:
   - `get_current_user` returns correct user_id from valid token
   - Missing Authorization header → 401
   - Invalid token → 401
   - Expired token → 401
   - Malformed header (no "Bearer" prefix) → 401
3. Create integration tests for at least one protected endpoint verifying:
   - Request succeeds with valid token
   - Request fails without token
   - Token user_id is used (not body user_id)

### Phase 5: Verification & Cleanup

1. Run `uv run ruff check .` — fix any lint issues
2. Run `uv run pytest` — all tests pass
3. Run `yarn build` in next-frontend — no TypeScript errors
4. Manual smoke test: login → use features → verify auth works end-to-end
5. Update `backend/.env.example` with `SUPABASE_JWT_SECRET` placeholder

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Token forwarding breaks frontend | Phase 3 is separate; can be tested independently |
| Tests don't exist yet | Phase 4 creates foundational test infrastructure |
| Chat endpoint dual-auth complexity | Keep existing project ownership check; JWT adds layer, doesn't replace |
| Missing JWT secret in dev setup | Add to `.env.example`; fail-fast on startup if missing |

## Generated Artifacts

- [research.md](./research.md) — Technology decisions and rationale
- [data-model.md](./data-model.md) — Model changes and field removals
- [contracts/auth-endpoints.yaml](./contracts/auth-endpoints.yaml) — Endpoint classification and contract changes
- [quickstart.md](./quickstart.md) — Getting started guide
