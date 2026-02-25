# Quickstart: ZIP-004 Deep Memory Training

## Prerequisites

- Cloud DeepLake migration completed (dataset at `hub://org_id/alphabase-kb`)
- Activeloop API token configured
- Existing transcript chunks in the vector store
- Backend and frontend running

## Key Files to Modify

### Backend (Python)
- `backend/app/config.py` — Add `activeloop_token`, `deep_memory_enabled` settings
- `backend/app/services/vectorstore.py` — Add `deep_memory` param to similarity_search, cloud connection
- `backend/app/services/chat.py` — Read deep_memory setting before search
- `backend/app/services/training_generator.py` — **NEW**: LLM-based question generation from chunks
- `backend/app/services/deep_memory_service.py` — **NEW**: Deep Memory train/evaluate/status wrapper
- `backend/app/routers/deep_memory.py` — **NEW**: All `/v1/api/deep-memory/` endpoints
- `backend/app/models/deep_memory.py` — **NEW**: Pydantic models for requests/responses

### Database
- `backend/supabase/migrations/007_deep_memory_training.sql` — **NEW**: 3 tables + RLS + indexes

### Frontend (Next.js)
- `next-frontend/app/api/deep-memory/` — **NEW**: BFF proxy routes
- `next-frontend/app/dashboard/deep-memory/page.tsx` — **NEW**: Training management page
- `next-frontend/components/deep-memory/` — **NEW**: UI components
- `next-frontend/lib/api/deep-memory.ts` — **NEW**: API client functions

## Development Flow

```bash
# 1. Apply migration
# Run 007_deep_memory_training.sql in Supabase SQL editor

# 2. Backend
cd backend && uv run uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd next-frontend && yarn dev

# 4. Test training flow
# Navigate to /dashboard/deep-memory
# Click "Generate Training Data" → wait for completion
# Review sample pairs → Click "Start Training"
# Toggle Deep Memory on → test RAG chat
```

## Architecture Flow

```
User clicks "Generate"
  → Next.js POST /api/deep-memory/generate
    → Backend POST /v1/api/deep-memory/generate
      → Creates training_run (status=generating)
      → BackgroundTask: iterate chunks → OpenAI → store pairs
      → SSE progress via /v1/api/events/stream/{job_id}
  → Frontend subscribes to SSE, shows progress bar

User clicks "Train"
  → Next.js POST /api/deep-memory/train
    → Backend POST /v1/api/deep-memory/train
      → Load pairs from Supabase → format for API
      → db.vectorstore.deep_memory.train(queries, relevance)
      → Poll status → SSE progress
      → On complete: evaluate() → store metrics
  → Frontend shows training progress, then metrics

User toggles "Enable"
  → Next.js PUT /api/deep-memory/settings
    → Backend updates deep_memory_settings.enabled
  → All subsequent RAG chat searches use deep_memory=True
```
