# Implementation Plan: ZIP-004 Deep Memory Training

**Feature ID**: ZIP-004
**Branch**: `feature/ZIP-004-deep-memory-training`
**Created**: 2026-02-23

## Technical Context

| Aspect | Detail |
|--------|--------|
| Frontend | Next.js 15, React 19, TypeScript, shadcn/ui, Tailwind CSS v3 |
| Backend | Python 3.12+, FastAPI, uv |
| Database | Supabase (PostgreSQL + RLS) |
| Vector Store | DeepLake (Cloud, Managed Tensor Database) |
| AI (question gen) | OpenAI GPT-4o (existing in stack) |
| AI (RAG chat) | OpenAI GPT-4o (existing) |
| Embeddings | OpenAI text-embedding-3-small (existing) |
| Real-time | SSE via sse-starlette + JobManager singleton |
| Deep Memory API | `db.vectorstore.deep_memory.train()` / `.evaluate()` / `.status()` |
| Package managers | yarn (frontend), uv (backend) |

## Constitution Check

| Principle | Compliance | Notes |
|-----------|------------|-------|
| I. TypeScript Frontend, Python Backend | ✅ | Training logic in Python backend, management UI in TypeScript Next.js |
| II. API-Boundary Separation | ✅ | Next.js API routes proxy to backend for all training operations; direct Supabase reads for settings display |
| III. Supabase Source of Truth | ✅ | Training runs, pairs, and settings in Supabase with RLS |
| IV. Background Jobs with Real-Time Feedback | ✅ | Generation and training use FastAPI BackgroundTasks + JobManager + SSE |
| V. Simplicity and Pragmatism | ✅ | Reuses existing JobManager/SSE patterns; no versioned rollback (simple toggle fallback); rate limiting on OpenAI calls |

**Constitution amendment needed**: Add DeepLake Cloud (Managed Tensor Database) to the Technology Stack table. Update Vector store row from "DeepLake | Via langchain" to "DeepLake Cloud | Via langchain-deeplake, Managed Tensor DB".

## Architecture Overview

```
Browser                     Next.js API Routes            Python Backend
  │                               │                            │
  │─ POST /api/deep-memory/ ─────►│                            │
  │   generate                    │─ POST /v1/api/deep-memory/─►│
  │                               │   generate                  │
  │◄── 202 {job_id, run_id} ─────│◄── 202 ─────────────────────│
  │                               │                             │
  │─ EventSource /v1/api/ ───────────────────────────────────► │
  │   events/stream/{job_id}      │         BackgroundTask:     │
  │                               │         - iterate chunks    │
  │◄── SSE: generating ──────────────────── - call OpenAI      │
  │◄── SSE: generated ───────────────────── - store pairs      │
  │                               │                             │
  │─ GET /api/deep-memory/ ──────►│─ GET /v1/api/deep-memory/ ─►│
  │   runs/{id}                   │   runs/{id}                 │
  │◄── run details + samples ─────│◄── run data ────────────────│
  │                               │                             │
  │─ POST /api/deep-memory/ ─────►│─ POST /v1/api/deep-memory/ ─►│
  │   train                       │   train                      │
  │◄── 202 {job_id} ─────────────│◄── 202 ──────────────────────│
  │                               │                              │
  │─ EventSource /v1/api/ ───────────────────────────────────► │
  │   events/stream/{job_id}      │         BackgroundTask:      │
  │                               │         - format pairs       │
  │◄── SSE: training ────────────────────── - deep_memory.train()│
  │◄── SSE: completed + metrics──────────── - evaluate()         │
  │                               │                              │
  │─ PUT /api/deep-memory/ ──────►│─ PUT /v1/api/deep-memory/ ──►│
  │   settings {enabled: true}    │   settings                   │
  │◄── 200 ──────────────────────│◄── 200 ──────────────────────│
  │                               │                              │
  │─ POST /v1/api/chat ──────────────────────────────────────► │
  │   (existing RAG chat)         │         reads settings.enabled│
  │◄── streaming + deep_memory ──────────── similarity_search(   │
  │                               │           deep_memory=True)  │
```

## Implementation Phases

### Phase 1: Database & Backend Foundation

**Goal**: New tables, Pydantic models, vector store cloud connection update.

1. **Migration `007_deep_memory_training.sql`**: Create `deep_memory_training_runs`, `deep_memory_training_pairs`, `deep_memory_settings` tables with RLS policies and indexes (see `data-model.md`)

2. **Config update** (`backend/app/config.py`):
   - Add `activeloop_token: str` setting
   - Add `deep_memory_generation_model: str = "gpt-4o"` for question generation
   - Add `deep_memory_target_questions_per_chunk: int = 4` (target; prompt asks for 3-5, LLM output varies)
   - Add `deep_memory_max_pairs: int = 5000` cap
   - Add `deep_memory_generation_delay: float = 1.0` rate limit between OpenAI calls

3. **Vector store update** (`backend/app/services/vectorstore.py`):
   - Update `DeeplakeVectorStore` initialization to use cloud path (`hub://org/dataset`) with `runtime={"tensor_db": True}` and `token`
   - Add `deep_memory: bool = False` parameter to `similarity_search()`
   - Pass through to `asimilarity_search_with_relevance_scores(deep_memory=deep_memory)`
   - Add method `get_all_chunk_ids_and_texts()` — enumerate all chunks for training data generation
   - Add method `get_deep_memory_api()` — return the `db.vectorstore.deep_memory` object for train/evaluate/status

4. **Pydantic models** (`backend/app/models/deep_memory.py` — **NEW**):
   - `GenerateRequest(user_id: str)`
   - `GenerateResponse(job_id: str, training_run_id: str, total_chunks: int, message: str)`
   - `TrainRequest(training_run_id: str, user_id: str)`
   - `TrainResponse(job_id: str, training_run_id: str, message: str)`
   - `TrainingRunSummary(id, status, pair_count, metrics, started_at, completed_at)`
   - `TrainingRunDetail(... + sample_pairs, statistics)`
   - `DeepMemorySettings(enabled: bool, last_trained_at, last_training_run_id, can_enable: bool)`
   - `UpdateSettingsRequest(enabled: bool, user_id: str)`

### Phase 2: Training Data Generation Service

**Goal**: LLM-based question generation pipeline.

1. **Training generator service** (`backend/app/services/training_generator.py` — **NEW**):
   - `generate_training_data(training_run_id, job_id, job_manager, settings, supabase)` — async background task
   - Fetch all chunk IDs and text from DeepLake via `get_all_chunk_ids_and_texts()`
   - For each chunk:
     - Send to OpenAI GPT-4o with prompt to generate questions
     - Parse JSON response for question list
     - Insert pairs into `deep_memory_training_pairs`
     - Update run `processed_chunks` count
     - Report progress via JobManager
     - `asyncio.sleep(settings.deep_memory_generation_delay)` for rate limiting
   - Track last processed chunk for resumability (query Supabase for existing pairs by run_id)
   - Cap at `deep_memory_max_pairs` total
   - On completion: update run status to `generated`
   - On error: update run status to `failed` with error message

2. **Question generation prompt**:
   - System: "You are a training data generator for a financial/trading knowledge base search system."
   - User: Include chunk text, ask for 3-5 diverse questions (factual, conceptual, terminology)
   - Instruct: Include ticker symbols, strategy names, financial terms when present in the chunk
   - Format: Return JSON array of question strings

### Phase 3: Deep Memory Training Service

**Goal**: Training execution, status polling, evaluation.

1. **Deep Memory service** (`backend/app/services/deep_memory_service.py` — **NEW**):
   - `train_deep_memory(training_run_id, job_id, job_manager, settings, supabase)` — async background task
   - Load all pairs for the run from Supabase
   - Format into `queries: List[str]` and `relevance: List[List[Tuple[str, float]]]`
   - Call `db.vectorstore.deep_memory.train(queries, relevance)`
   - Poll `deep_memory.status(deeplake_job_id)` with backoff (5s → 10s → 30s)
   - Report progress via JobManager
   - On completion: run `deep_memory.evaluate()` with a held-out test set (10% of pairs)
   - Store metrics in training run record
   - Update run status to `completed`
   - Update `deep_memory_settings.last_trained_at` and `last_training_run_id`

### Phase 4: Backend Router & Search Integration

**Goal**: API endpoints and RAG chat integration.

1. **Deep Memory router** (`backend/app/routers/deep_memory.py` — **NEW**):
   - `POST /v1/api/deep-memory/generate` — validates user, creates run, launches background task
   - `POST /v1/api/deep-memory/train` — validates run status is `generated`, launches training task
   - `GET /v1/api/deep-memory/runs` — list runs for user
   - `GET /v1/api/deep-memory/runs/{run_id}` — run detail with sample pairs
   - `GET /v1/api/deep-memory/settings` — current settings
   - `PUT /v1/api/deep-memory/settings` — toggle enabled (validates completed run exists)

2. **Register router** (`backend/app/main.py`):
   - `app.include_router(deep_memory.router)`

3. **Chat integration** (`backend/app/services/chat.py`):
   - In `_retrieve_context()`, read `deep_memory_settings.enabled` for user from Supabase
   - Pass `deep_memory=enabled` to `self.vectorstore.similarity_search()`

### Phase 5: Next.js BFF & Frontend UI

**Goal**: Admin page with full training workflow.

1. **API routes** (`next-frontend/app/api/deep-memory/` — **NEW**):
   - `generate/route.ts` — POST proxy to backend
   - `train/route.ts` — POST proxy to backend
   - `runs/route.ts` — GET proxy to backend
   - `runs/[runId]/route.ts` — GET proxy to backend
   - `settings/route.ts` — GET/PUT proxy to backend
   - All routes extract `user_id` from Supabase session

2. **API client** (`next-frontend/lib/api/deep-memory.ts` — **NEW**):
   - `generateTrainingData()` — POST, returns job_id + run_id
   - `startTraining(runId)` — POST, returns job_id
   - `getTrainingRuns()` — GET list
   - `getTrainingRun(runId)` — GET detail
   - `getSettings()` — GET
   - `updateSettings(enabled)` — PUT

3. **Dashboard page** (`next-frontend/app/dashboard/deep-memory/page.tsx` — **NEW**):
   - **Header**: "Deep Memory Training" title, current status badge (enabled/disabled)
   - **Settings card**: Toggle switch for Deep Memory on/off, last trained date, training pair count
   - **Training workflow card**:
     - "Generate Training Data" button → shows progress bar via SSE → shows pair count when done
     - "Review Data" section → sample questions table, statistics summary
     - "Start Training" button → shows progress → shows recall metrics when done
   - **Training history**: Table of past runs (status, pair count, metrics, date)

4. **Components** (`next-frontend/components/deep-memory/` — **NEW**):
   - `DeepMemoryToggle` — Switch with status display
   - `TrainingProgress` — Progress bar with SSE subscription
   - `TrainingMetrics` — Recall@k metrics display card
   - `TrainingRunHistory` — Table of past runs
   - `SamplePairsTable` — Question-chunk preview table for review

5. **Navigation**: Add "Deep Memory" link to dashboard sidebar

### Phase 6: Incremental Retraining

**Goal**: Support generating pairs only for new chunks.

1. **Track processed chunks**: When generating, query existing pairs for the user to find already-processed chunk IDs
2. **Incremental generation**: In `generate_training_data()`, skip chunks that already have pairs from previous completed runs
3. **Merge for training**: When training, load pairs from the current run AND all previous completed runs' pairs
4. **UI indicator**: Show "X new chunks since last training" on the dashboard

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Cloud DeepLake migration not ready | ZIP-004 is blocked until migration completes. Config supports both local (existing) and cloud paths. |
| OpenAI rate limits during generation | Configurable delay between calls (`deep_memory_generation_delay`). Resumable generation on interruption. |
| Deep Memory training API changes | Isolate all DeepLake Deep Memory calls in `deep_memory_service.py`. Easy to update. |
| Training degrades results | Simple toggle to disable. No versioned rollback complexity. |
| Large dataset (>5000 pairs) | Hard cap at `deep_memory_max_pairs`. Can be raised later if needed. |
| Activeloop service outage during training | Training job is idempotent — can be retried. Failed status with error message preserved. |

## Artifacts

| File | Description |
|------|-------------|
| `research.md` | Technology decisions and alternatives |
| `data-model.md` | Supabase table schemas, RLS, indexes |
| `contracts/api-contracts.md` | Backend and BFF API endpoint specs |
| `quickstart.md` | Development setup and testing guide |
