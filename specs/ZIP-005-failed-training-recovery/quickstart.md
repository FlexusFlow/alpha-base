# Quickstart: ZIP-005 Failed Training Data Generation Recovery

## New Dependencies

None — this feature uses only existing packages and patterns.

## Database Migration

Apply `008_failed_training_statuses.sql` via Supabase Dashboard (SQL Editor):
- Migrates existing `failed` records to phase-specific statuses
- Updates CHECK constraint on `deep_memory_training_runs.status`
- See `data-model.md` for full migration SQL

## Environment Variables

No new environment variables required.

## Dev Workflow

```bash
# Terminal 1: Backend
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd next-frontend && yarn dev
```

## Files to Modify

### Backend
- `backend/app/routers/deep_memory.py` — Add proceed and delete endpoints, add failed-run blocking to generate
- `backend/app/services/training_generator.py` — Change `"failed"` → `"generating_failed"` in error handler
- `backend/app/services/deep_memory_service.py` — Change `"failed"` → `"training_failed"` in error handler
- `backend/app/models/deep_memory.py` — Add ProceedRequest/ProceedResponse models

### Frontend
- `next-frontend/app/api/deep-memory/proceed/route.ts` — New proxy route
- `next-frontend/app/api/deep-memory/runs/[runId]/route.ts` — Add DELETE handler
- `next-frontend/lib/api/deep-memory.ts` — Add proceedFailedRun() and deleteFailedRun() functions
- `next-frontend/lib/types/deep-memory.ts` — Extend DeepMemorySettings with failed run fields
- `next-frontend/app/dashboard/deep-memory/page.tsx` — Add failed run UI controls and blocking logic
- `next-frontend/components/deep-memory/TrainingProgress.tsx` — Handle new failed status strings
- `next-frontend/components/deep-memory/TrainingRunHistory.tsx` — Add badge variants for new statuses
- `next-frontend/lib/api/events.ts` — Add new failed statuses to SSE terminal detection

### Database
- `next-frontend/supabase/migrations/008_failed_training_statuses.sql` — New migration

## Testing

```bash
# Backend tests
cd backend && uv run pytest tests/ -v

# Frontend build check
cd next-frontend && yarn build
```
