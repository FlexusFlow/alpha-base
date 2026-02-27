# Tasks: FastAPI Auth Middleware (ALP-010)

**Feature**: ALP-010 FastAPI Auth Middleware
**Branch**: `feature/ALP-010-fastapi-auth-middleware`
**Generated**: 2026-02-27
**Total Tasks**: 25

## User Story Mapping

| Story | Description | Scenarios | Priority |
|-------|-------------|-----------|----------|
| US1 | Backend auth dependency (token validation + user extraction) | S2, S3, S4 | P1 |
| US2 | Router migration (all protected endpoints use JWT identity) | S1, S4 | P1 |
| US3 | Frontend token forwarding (backward compatibility) | S1 | P1 |
| US4 | Auth test suite | S2, S3, S4 | P1 |

---

## Phase 1: Setup

- [X] T001 Add `PyJWT>=2.8.0` to dependencies in `backend/pyproject.toml`
- [X] T002 Add `supabase_jwt_secret: str` field to Settings class in `backend/app/config.py`
- [X] T003 Add `SUPABASE_JWT_SECRET` to `backend/.env` (obtain from Supabase Dashboard > Project Settings > API > JWT Settings)

---

## Phase 2: Foundation

- [X] T004 [US1] Create `get_current_user` dependency in `backend/app/dependencies.py` — extract `Authorization: Bearer <token>` header, decode JWT with PyJWT using `settings.supabase_jwt_secret` and HS256 algorithm, verify `aud` claim equals `authenticated`, return `sub` claim as user_id string, raise `HTTPException(401)` with descriptive detail for missing header / invalid token / expired token

---

## Phase 3: Router Migration (US2)

Each router task: add `user_id: str = Depends(get_current_user)` to route handlers, remove `user_id` from request models/query params, update service calls to use the injected user_id.

### Knowledge Router

- [X] T005 [P] [US2] Remove `user_id` field from `KnowledgeAddRequest` and `BulkDeleteRequest` in `backend/app/models/knowledge.py`
- [X] T006 [US2] Migrate knowledge router in `backend/app/routers/knowledge.py` — add `get_current_user` dependency to `POST /youtube/add`, `DELETE /channels/{channel_id}` (remove query param), `POST /channels/delete-bulk`, `GET /jobs/{job_id}`; use dependency-injected user_id in all service calls

### Deep Memory Router

- [X] T007 [P] [US2] Remove `user_id` field from `GenerateRequest`, `TrainRequest`, `ProceedRequest`, and `UpdateSettingsRequest` in `backend/app/models/deep_memory.py`
- [X] T008 [US2] Migrate deep_memory router in `backend/app/routers/deep_memory.py` — add `get_current_user` dependency to all 8 endpoints (`POST /generate`, `POST /train`, `POST /proceed`, `GET /runs`, `GET /runs/{run_id}`, `DELETE /runs/{run_id}`, `GET /settings`, `PUT /settings`); remove query param user_id from GET/DELETE endpoints; use dependency-injected user_id

### API Keys Router

- [X] T009 [P] [US2] Remove `user_id` field from `APIKeyCreateRequest` in `backend/app/models/api_keys.py`
- [X] T010 [US2] Migrate api_keys router in `backend/app/routers/api_keys.py` — add `get_current_user` dependency to `POST /`, `GET /` (remove query param), `DELETE /{key_id}` (remove query param); use dependency-injected user_id

### Articles Router

- [X] T011 [P] [US2] Remove `user_id` field from `ArticleScrapeRequest` in `backend/app/models/articles.py`
- [X] T012 [US2] Migrate articles router in `backend/app/routers/articles.py` — add `get_current_user` dependency to `POST /scrape`; use dependency-injected user_id

### Chat Router

- [X] T013 [US2] Migrate chat router in `backend/app/routers/chat.py` — add `get_current_user` dependency to `POST /`; keep existing project ownership lookup as additional validation layer; the JWT-derived user_id provides defense-in-depth alongside the project_id → user_id DB check

### User Cleanup Router

- [X] T014 [US2] Migrate user_cleanup router in `backend/app/routers/user_cleanup.py` — change route from `DELETE /user-cleanup/{user_id}` to `DELETE /user-cleanup`; add `get_current_user` dependency; use token-derived user_id instead of path parameter

---

## Phase 4: Frontend Token Forwarding (US3)

### Auth Header Utility

- [X] T015 [US3] Create auth header helper in `next-frontend/lib/api/auth-header.ts` — export async function `getAuthHeaders()` that gets the current session token from browser Supabase client via `supabase.auth.getSession()`, returns `{ Authorization: "Bearer <token>" }` object, handles missing session (returns empty headers or throws)

### Browser Direct Calls

- [X] T016 [P] [US3] Update `next-frontend/lib/api/chat.ts` — import auth header helper, add Authorization header to the fetch call to `${API_BASE_URL}/v1/api/chat`, remove `user_id` from request body if present
- [X] T017 [P] [US3] Update `next-frontend/lib/api/knowledge.ts` — import auth header helper, add Authorization header to the fetch call to `${API_BASE_URL}/v1/api/knowledge/youtube/add`, remove `user_id` from request body

### Next.js API Routes (Server-Side)

- [X] T018 [US3] Create server-side auth token helper in `next-frontend/lib/supabase/auth-token.ts` — export async function that gets access token from server-side Supabase client session (using `supabase.auth.getSession()`), returns the token string for forwarding to FastAPI
- [X] T019 [US3] Update all Next.js API routes that call FastAPI to forward the access token — add `Authorization: Bearer <token>` header to fetch calls in `next-frontend/app/api/deep-memory/*/route.ts`, `next-frontend/app/api/keys/route.ts`, `next-frontend/app/api/articles/route.ts`, and any other routes calling FastAPI; remove `user_id` from request bodies sent to FastAPI

---

## Phase 5: Auth Test Suite (US4)

- [X] T020 [US4] Create test fixtures in `backend/tests/conftest.py` — test JWT secret, valid token generator (PyJWT with test secret, `sub` claim, `aud: authenticated`, future `exp`), expired token generator, invalid token generator, FastAPI TestClient fixture
- [X] T021 [US4] Create auth dependency unit tests in `backend/tests/test_auth.py` — test `get_current_user` returns correct user_id from valid token, returns 401 for missing Authorization header, returns 401 for invalid token, returns 401 for expired token, returns 401 for malformed header (no "Bearer" prefix), returns 401 for wrong audience claim
- [X] T022 [US4] Create integration test for at least one protected endpoint in `backend/tests/test_auth_integration.py` — verify request succeeds with valid token, request fails without token (401), token user_id is used regardless of any user_id in request body (identity override)

---

## Phase 6: Polish & Verification

- [X] T023 Run `cd backend && uv run ruff check .` and fix any lint issues
- [X] T024 Run `cd backend && uv run pytest` to verify all tests pass; run `cd next-frontend && yarn build` to verify no TypeScript errors
- [X] T025 Add `SUPABASE_JWT_SECRET=your-jwt-secret-here` to `backend/.env.example` (if file exists) for developer onboarding — N/A, no .env.example file exists

---

## Dependencies

```
T001 ──┐
T002 ──┼──→ T004 ──→ T005..T014 (router migration, parallelizable across routers)
T003 ──┘                  │
                          ├──→ T015 ──→ T016, T017 (parallel browser calls)
                          │         ├──→ T018 ──→ T019
                          │
                          └──→ T020 ──→ T021, T022 (tests, after routers migrated)
                                              │
                                              └──→ T023 ──→ T024 ──→ T025
```

**Key dependency rules**:
- T004 (get_current_user) blocks all router migration tasks (T005-T014)
- Model tasks (T005, T007, T009, T011) are parallel with each other, each blocks its router task
- Router tasks (T006, T008, T010, T012, T013, T014) are parallel with each other
- Frontend tasks (T015-T019) can start after T004 but ideally after routers are migrated
- Tests (T020-T022) should be written after T004 exists but can be developed in parallel with router migration

## Parallel Execution Opportunities

| Group | Tasks | Condition |
|-------|-------|-----------|
| Model removal | T005, T007, T009, T011 | After T004; different files |
| Router migration | T006, T008, T010, T012, T013, T014 | After respective model task; different files |
| Browser call updates | T016, T017 | After T015; different files |
| Test writing | T021, T022 | After T020; different files |

## Implementation Strategy

**MVP (minimum viable)**: T001-T004 (backend auth dependency works) → pick one router (e.g., T009+T010 api_keys) → verify end-to-end with manual curl test

**Incremental delivery**:
1. Foundation: T001-T004
2. One router proof: T009+T010 (api_keys — smallest router, 3 endpoints)
3. Remaining routers: T005-T008, T011-T014 (parallel)
4. Frontend: T015-T019
5. Tests: T020-T022
6. Polish: T023-T025
