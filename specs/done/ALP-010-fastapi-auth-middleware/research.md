# ALP-010 Research: FastAPI Auth Middleware

## R1: JWT Validation Library

**Decision**: Use `PyJWT` (>=2.8.0)

**Rationale**: PyJWT is the standard Python JWT library, lightweight, well-maintained, and used by Supabase's own Python client internally. It supports HS256 (Supabase's default signing algorithm) out of the box.

**Alternatives considered**:
- `python-jose`: More features (JWE support) but heavier dependency; JOSE features unnecessary for this use case.
- `supabase.auth.get_user()` server-side call: Would validate by calling Supabase API per request — adds network latency (~100-300ms) and creates external dependency for every request. Not suitable for defense-in-depth where local validation is preferred.

## R2: Supabase JWT Token Structure

**Decision**: Validate using `SUPABASE_JWT_SECRET` with HS256 algorithm

**Rationale**: Supabase Auth issues standard JWTs signed with the project's JWT secret using HS256. The `sub` claim contains the user's UUID. The `exp` claim contains expiration timestamp. PyJWT handles signature verification and expiration checking natively.

**Token claims used**:
- `sub`: User UUID (maps to Supabase Auth user ID)
- `exp`: Expiration timestamp (validated automatically by PyJWT)
- `aud`: Audience claim (should be `authenticated`)

## R3: Authentication Pattern — Middleware vs Dependency

**Decision**: Use a FastAPI dependency (`get_current_user`) rather than ASGI middleware

**Rationale**: A FastAPI dependency is more idiomatic, allows per-route opt-in/opt-out, integrates with FastAPI's dependency injection, and provides typed return values. ASGI middleware would require path-matching logic to exempt public routes and cannot easily inject values into route handlers. The dependency pattern also matches the existing `verify_api_key` pattern in the codebase.

**Alternatives considered**:
- ASGI middleware: Global interception, but harder to exempt routes, no type safety, requires `request.state` for passing user_id (less explicit).
- Starlette middleware: Same drawbacks as ASGI.

## R4: Frontend Token Forwarding

**Decision**: Frontend changes required for direct-to-backend calls

**Findings**: The Next.js frontend has two call patterns:
1. **Via Next.js API routes** (`/api/...`): deep-memory, api-keys, youtube preview, articles — these extract `user_id` server-side and pass it in the request body. These routes will need to forward the Supabase access token in the `Authorization: Bearer <token>` header.
2. **Direct to FastAPI** (`${API_BASE_URL}/v1/api/...`): chat, knowledge/youtube/add, events/stream — these call FastAPI from the browser. The browser Supabase client has the access token available via `supabase.auth.getSession()`.

**Required changes**:
- Next.js API routes: Add `Authorization: Bearer <token>` header when calling FastAPI (token available from server-side Supabase client session)
- Direct browser calls (chat, knowledge): Add `Authorization: Bearer <token>` header (token from browser Supabase client)
- SSE events: No change needed (exempt per spec)

## R5: user_id Field Removal Strategy

**Decision**: Remove `user_id` from request models; use dependency-injected authenticated user

**Rationale**: Keeping `user_id` in request models alongside token-based auth creates confusion and a potential bypass vector if any endpoint accidentally reads from the request body instead of the dependency. Clean removal eliminates the risk entirely.

**Migration path**:
1. Add `get_current_user` dependency that returns `str` (user_id from JWT)
2. Update each router to use the dependency parameter instead of `request.user_id` / query `user_id`
3. Remove `user_id` field from Pydantic request models
4. For endpoints receiving user_id in query params or path params, replace with dependency

## R6: Internal Endpoints (user_cleanup)

**Decision**: Protect with JWT auth; user can only clean up their own data

**Rationale**: The `user_cleanup` endpoint currently accepts `user_id` in the path. With JWT auth, the endpoint will use the token-derived identity. If admin-level cleanup is needed in the future, that falls under RBAC (explicitly a non-goal for ALP-010).

## R7: Test Strategy

**Decision**: Create test fixtures with mock JWT tokens; use PyJWT to generate test tokens

**Rationale**: Backend tests are currently empty (only `__init__.py`). New tests will:
- Generate valid/invalid/expired test JWTs using a test secret
- Override the `get_current_user` dependency in tests for easy mocking
- Test auth rejection scenarios (missing token, expired, malformed)
- Test identity override (token user_id takes precedence)
