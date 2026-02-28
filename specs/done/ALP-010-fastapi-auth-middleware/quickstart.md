# ALP-010 Quickstart

## Prerequisites

1. Supabase JWT secret — obtain from Supabase Dashboard > Project Settings > API > JWT Settings
2. Add `SUPABASE_JWT_SECRET=<value>` to `backend/.env`

## Implementation Order

1. **Backend foundation** — Add PyJWT dependency, JWT secret to config, `get_current_user` dependency
2. **Router migration** — Update all protected routers to use `get_current_user` dependency, remove `user_id` from request models
3. **Frontend token forwarding** — Update Next.js API routes and direct browser calls to include `Authorization: Bearer <token>` header
4. **Tests** — Add auth test fixtures and endpoint protection tests
5. **Verify** — Run full backend test suite, manual smoke test with frontend

## Key Files to Modify

### Backend
- `backend/pyproject.toml` — Add `PyJWT>=2.8.0`
- `backend/app/config.py` — Add `supabase_jwt_secret` field
- `backend/app/dependencies.py` — Add `get_current_user()` dependency
- `backend/app/routers/*.py` — All 6 protected routers
- `backend/app/models/*.py` — Remove `user_id` from 8 request models

### Frontend
- `next-frontend/lib/api/chat.ts` — Add auth header (direct call)
- `next-frontend/lib/api/knowledge.ts` — Add auth header (direct call)
- `next-frontend/app/api/*/route.ts` — Forward token to backend (~8 routes)

### Tests
- `backend/tests/conftest.py` — Auth fixtures
- `backend/tests/test_auth.py` — Auth middleware tests
