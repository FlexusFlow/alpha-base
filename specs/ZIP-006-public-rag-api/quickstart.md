# Quickstart: ZIP-006 Public RAG API

## New Dependencies

None — this feature uses only existing packages and patterns.

## Database Migration

Apply `009-public-rag-api.sql` via Supabase Dashboard (SQL Editor):
- Creates `api_keys` table with RLS policies
- Creates `api_usage_logs` table with RLS policies
- Creates indexes for performance
- See `data-model.md` for schema details

## Environment Variables

No new environment variables required. Uses existing:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENAI_API_KEY`
- `DEEPLAKE_PATH`

## Dev Workflow

```bash
# Terminal 1: Backend
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd next-frontend && yarn dev
```

## Files to Create

### Backend (New Files)
- `backend/app/models/api_keys.py` — Pydantic models for API key management and public query
- `backend/app/routers/api_keys.py` — Endpoints for creating, listing, and revoking keys
- `backend/app/routers/public_query.py` — Public RAG query endpoint
- `backend/app/services/api_key_service.py` — API key generation, verification, and usage logging
- `backend/app/services/rate_limiter.py` — In-memory rate limiting

### Frontend (New Files)
- `next-frontend/app/dashboard/api-keys/page.tsx` — API Keys management page
- `next-frontend/app/api/keys/route.ts` — Next.js API proxy for key management
- `next-frontend/lib/api/api-keys.ts` — API client functions for key operations

### Other
- `skill/ziptrader-rag.md` — ClawHub skill file for AI assistant integration

## Files to Modify

### Backend
- `backend/app/main.py` — Register new routers (api_keys, public_query)
- `backend/app/dependencies.py` — Add `verify_api_key` dependency and rate limit decorator

### Frontend
- `next-frontend/components/app-sidebar.tsx` — Add "API Keys" menu item with Key icon

### Database
- `next-frontend/supabase/migrations/009-public-rag-api.sql` — Already exists, just needs to be applied

## Testing

```bash
# Backend tests
cd backend && uv run pytest tests/test_api_keys.py -v
cd backend && uv run pytest tests/test_public_query.py -v

# Frontend build check
cd next-frontend && yarn build

# Manual API test with cURL
curl -X POST http://localhost:8000/v1/api/public/query \
  -H "Authorization: Bearer zt_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the best trading strategies?", "include_sources": true}'
```

## Implementation Order

1. Apply database migration (009-public-rag-api.sql)
2. Create backend models (api_keys.py)
3. Create API key service (api_key_service.py)
4. Create rate limiter (rate_limiter.py)
5. Add verify_api_key dependency (dependencies.py)
6. Create API keys router (api_keys.py)
7. Create public query router (public_query.py)
8. Register routers (main.py)
9. Create frontend API proxy (app/api/keys/route.ts)
10. Create API client functions (lib/api/api-keys.ts)
11. Create API Keys page (app/dashboard/api-keys/page.tsx)
12. Update sidebar (app-sidebar.tsx)
13. Create ClawHub skill file (skill/ziptrader-rag.md)
14. Write backend tests
15. Manual testing with cURL and ClawHub (if available)

## Quick Verification

After implementation, verify:
1. ✓ Create API key via dashboard → see full key once → see prefix in table
2. ✓ Copy key → make cURL request → get valid JSON response with answer + sources
3. ✓ Revoke key → retry request → get 401 Unauthorized
4. ✓ Make 61 requests in 1 minute → 61st returns 429 Too Many Requests
5. ✓ Check api_usage_logs table → see all requests logged
6. ✓ Dashboard chat still works unchanged (existing SSE flow)
