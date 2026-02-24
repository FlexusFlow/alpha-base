# Tasks: ZIP-004 Deep Memory Training

**Feature**: Deep Memory Training for RAG Accuracy
**Branch**: `feature/ZIP-004-deep-memory-training`
**Total Tasks**: 25
**Generated**: 2026-02-23

## User Story Mapping

| Story | Spec Scenario | Summary |
|-------|---------------|---------|
| US1 | Scenario 1 | User triggers training data generation from existing transcript chunks |
| US2 | Scenario 2 + 3 | User reviews training data and initiates Deep Memory training |
| US3 | Scenario 4 + 5 | User searches with improved retrieval and toggles Deep Memory on/off |
| US4 | Scenario 6 | User retrains after new content is added (incremental) |

---

## Phase 1: Setup — Database & Configuration

- [ ] T001 [P] Create database migration `backend/supabase/migrations/007_deep_memory_training.sql`
  - Create `deep_memory_training_runs` table per `data-model.md`: id (UUID PK), user_id (FK → auth.users ON DELETE CASCADE), status (CHECK: generating/generated/training/completed/failed), total_chunks (INT DEFAULT 0), processed_chunks (INT DEFAULT 0), pair_count (INT DEFAULT 0), deeplake_job_id (TEXT NULLABLE), metrics (JSONB DEFAULT '{}'), error_message (TEXT NULLABLE), started_at (TIMESTAMPTZ DEFAULT NOW()), completed_at (TIMESTAMPTZ NULLABLE), created_at (TIMESTAMPTZ DEFAULT NOW())
  - Create `deep_memory_training_pairs` table per `data-model.md`: id (UUID PK), training_run_id (FK → deep_memory_training_runs ON DELETE CASCADE), question_text (TEXT NOT NULL), chunk_id (TEXT NOT NULL), chunk_preview (TEXT NULLABLE), relevance_score (FLOAT DEFAULT 1.0), created_at (TIMESTAMPTZ DEFAULT NOW())
  - Create `deep_memory_settings` table per `data-model.md`: id (UUID PK), user_id (FK → auth.users ON DELETE CASCADE, UNIQUE), enabled (BOOLEAN DEFAULT FALSE), last_trained_at (TIMESTAMPTZ NULLABLE), last_training_run_id (FK → deep_memory_training_runs NULLABLE), updated_at (TIMESTAMPTZ DEFAULT NOW())
  - Enable RLS on all three tables
  - RLS policies: `deep_memory_training_runs` uses `auth.uid() = user_id`; `deep_memory_training_pairs` uses subquery on training_run_id ownership; `deep_memory_settings` uses `auth.uid() = user_id`
  - Create indexes: `idx_training_pairs_run_id` on `deep_memory_training_pairs(training_run_id)`, `idx_training_runs_user_status` on `deep_memory_training_runs(user_id, status)`
  - Follow patterns from `006_articles.sql` and `004_user_cookies_table.sql`

- [ ] T002 [P] Add Deep Memory config settings in `backend/app/config.py`
  - Add `activeloop_token: str` — Activeloop Cloud API token
  - Add `deep_memory_generation_model: str = "gpt-4o"` — LLM for question generation
  - Add `deep_memory_target_questions_per_chunk: int = 4` — target questions per chunk (prompt asks for 3-5, LLM output varies)
  - Add `deep_memory_max_pairs: int = 5000` — cap on total training pairs per run
  - Add `deep_memory_generation_delay: float = 1.0` — seconds between OpenAI calls for rate limiting
  - All new fields go in the existing `Settings` class

- [ ] T003 [P] Create Pydantic models in `backend/app/models/deep_memory.py` (NEW file)
  - `GenerateRequest`: user_id (str)
  - `GenerateResponse`: job_id (str), training_run_id (str), total_chunks (int), message (str)
  - `TrainRequest`: training_run_id (str), user_id (str)
  - `TrainResponse`: job_id (str), training_run_id (str), message (str)
  - `TrainingRunSummary`: id (str), status (str), pair_count (int), metrics (dict), started_at (datetime), completed_at (datetime | None)
  - `TrainingRunDetail`: extends TrainingRunSummary with total_chunks (int), processed_chunks (int), deeplake_job_id (str | None), error_message (str | None), sample_pairs (list[SamplePair]), statistics (dict)
  - `SamplePair`: question_text (str), chunk_preview (str), relevance_score (float)
  - `DeepMemorySettingsResponse`: enabled (bool), last_trained_at (datetime | None), last_training_run_id (str | None), can_enable (bool), total_chunks (int), trained_chunk_count (int)
  - `UpdateSettingsRequest`: enabled (bool), user_id (str)
  - `TrainingRunListResponse`: runs (list[TrainingRunSummary])

---

## Phase 2: Foundational — Vector Store Cloud Update

These tasks update the existing vector store service to support Cloud DeepLake and Deep Memory search parameter. All user stories depend on this.

- [ ] T004 Update `DeeplakeVectorStore` initialization in `backend/app/services/vectorstore.py`
  - Update `__init__` to accept `activeloop_token` from settings
  - Change `DeeplakeVectorStore` instantiation to use cloud path from `settings.deeplake_path` (now `hub://org/dataset`) with `runtime={"tensor_db": True}` and `token=settings.activeloop_token`
  - Keep backward compatibility: if `deeplake_path` does not start with `hub://`, use local mode (no runtime, no token) — this allows development before cloud migration
  - Apply this pattern consistently across `add_documents()`, `similarity_search()`, and `delete_by_video_ids()`

- [ ] T005 Add `deep_memory` parameter to `similarity_search()` in `backend/app/services/vectorstore.py`
  - Add optional `deep_memory: bool = False` parameter to `similarity_search()`
  - Pass `deep_memory=deep_memory` through to `db.asimilarity_search_with_relevance_scores()`
  - Existing callers are unaffected (default is False)

- [ ] T006 Add `get_all_chunk_ids_and_texts()` method in `backend/app/services/vectorstore.py`
  - New method that enumerates all documents in the DeepLake dataset
  - Returns list of dicts: `[{ "id": chunk_id, "text": page_content, "metadata": {...} }]`
  - Use `db.dataset` to iterate tensors directly: read `id`, `text`, and `metadata` tensors
  - This is needed for training data generation (iterating all chunks to generate questions)

- [ ] T007 Add `get_deep_memory_api()` method in `backend/app/services/vectorstore.py`
  - New method that returns the `db.vectorstore.deep_memory` object
  - Initializes a `DeeplakeVectorStore` connection and returns the deep_memory sub-API
  - Used by `deep_memory_service.py` for `.train()`, `.status()`, `.evaluate()` calls

---

## Phase 3: US1 — Training Data Generation

**Goal**: User clicks "Generate Training Data", the system iterates all transcript chunks, calls OpenAI to generate questions for each, stores pairs in Supabase with real-time progress.

**Independently testable**: Call `POST /v1/api/deep-memory/generate`, subscribe to SSE, verify pairs appear in `deep_memory_training_pairs` table, run status transitions from `generating` → `generated`.

- [ ] T008 Create training data generation service in `backend/app/services/training_generator.py` (NEW file)
  - `async def generate_training_data(training_run_id, job_id, job_manager, settings, supabase)` — async background task function
  - Fetch all chunks via `VectorStoreService.get_all_chunk_ids_and_texts()`
  - Query Supabase for existing pairs by `training_run_id` to find already-processed chunk_ids (resumability)
  - Skip chunks that already have pairs (resume from where interrupted)
  - For each unprocessed chunk:
    - Build prompt: system message as financial/trading training data generator, user message with chunk text asking for 3-5 diverse questions (factual, conceptual, terminology-based), instruct to include tickers and strategy names, return JSON array of strings
    - Call OpenAI GPT-4o with `response_format={"type": "json_object"}` for reliable parsing
    - Parse response, extract question list
    - Insert each question as a row in `deep_memory_training_pairs` with training_run_id, question_text, chunk_id, chunk_preview (first 200 chars of chunk), relevance_score=1.0
    - Increment `processed_chunks` and `pair_count` on the training run record
    - Report progress via `job_manager.update_job(job_id, processed_chunks=N, total_chunks=total, pair_count=M)`
    - `await asyncio.sleep(settings.deep_memory_generation_delay)` for rate limiting
  - Stop early if `pair_count >= settings.deep_memory_max_pairs` (5000 cap)
  - On completion: update run status to `generated`, set `completed_at`
  - On error: update run status to `failed`, set `error_message` with traceback summary
  - Use `try/except` per chunk so one bad chunk doesn't kill the entire run (log and skip)

- [ ] T009 [P] Create `POST /v1/api/deep-memory/generate` endpoint in `backend/app/routers/deep_memory.py` (NEW file)
  - Accept `GenerateRequest` body (user_id)
  - Count total chunks via `VectorStoreService.get_all_chunk_ids_and_texts()` (just len)
  - Create `deep_memory_training_runs` record in Supabase: status=`generating`, total_chunks, user_id
  - Create a job in `job_manager` for SSE tracking
  - Launch `BackgroundTasks.add_task(generate_training_data, ...)` with training_run_id, job_id, job_manager, settings, supabase
  - Return 202 with `GenerateResponse(job_id, training_run_id, total_chunks, message)`
  - Dependencies: `get_job_manager`, `get_supabase`, `get_settings`

- [ ] T010 [P] Create `GET /v1/api/deep-memory/runs` endpoint in `backend/app/routers/deep_memory.py`
  - Accept `user_id` query param
  - Query `deep_memory_training_runs` for user, ordered by `created_at DESC`
  - Return `TrainingRunListResponse` with list of `TrainingRunSummary`

- [ ] T011 [P] Create `GET /v1/api/deep-memory/runs/{run_id}` endpoint in `backend/app/routers/deep_memory.py`
  - Accept `run_id` path param and `user_id` query param
  - Fetch training run from Supabase, verify user ownership
  - Fetch 10 sample pairs from `deep_memory_training_pairs` for this run (LIMIT 10)
  - Compute statistics: avg questions per chunk = pair_count / processed_chunks, chunk_coverage_pct = processed_chunks / total_chunks * 100
  - Return `TrainingRunDetail` with sample_pairs and statistics

- [ ] T012 Register deep_memory router in `backend/app/main.py`
  - Import `from app.routers import deep_memory`
  - Add `app.include_router(deep_memory.router)`

---

## Phase 4: US2 — Review & Train Deep Memory

**Goal**: User reviews generated pairs (sample + statistics), approves, and triggers Deep Memory training. Training runs in background with progress via SSE, reports recall metrics on completion.

**Independently testable**: After generation completes (US1), call `GET /v1/api/deep-memory/runs/{id}` to see samples, then `POST /v1/api/deep-memory/train`, subscribe to SSE, verify run transitions to `completed` with metrics.

- [ ] T013 Create Deep Memory training service in `backend/app/services/deep_memory_service.py` (NEW file)
  - `async def train_deep_memory(training_run_id, job_id, job_manager, settings, supabase)` — async background task function
  - Update training run status to `training` in Supabase
  - Load all pairs for the run from `deep_memory_training_pairs`
  - Format into Deep Memory API format:
    - `queries: List[str]` — list of question_text values
    - `relevance: List[List[Tuple[str, float]]]` — for each query, list of `[(chunk_id, relevance_score)]` tuples
  - Get Deep Memory API via `VectorStoreService.get_deep_memory_api()`
  - Call `deep_memory.train(queries=queries, relevance=relevance)` — returns `deeplake_job_id`
  - Store `deeplake_job_id` in training run record
  - Poll `deep_memory.status(deeplake_job_id)` with exponential backoff (5s → 10s → 30s, max 60s)
  - Report progress via JobManager on each poll
  - On training completion:
    - Hold out 10% of pairs as test set
    - Call `deep_memory.evaluate(test_queries, test_relevance, top_k=[1, 3, 5, 10])` to get recall metrics
    - Store metrics JSONB in training run record
    - Update run status to `completed`, set `completed_at`
    - Upsert `deep_memory_settings`: set `last_trained_at`, `last_training_run_id`
  - On error: update run status to `failed`, set `error_message`

- [ ] T014 Create `POST /v1/api/deep-memory/train` endpoint in `backend/app/routers/deep_memory.py`
  - Accept `TrainRequest` body (training_run_id, user_id)
  - Fetch training run from Supabase, verify user ownership
  - Validate run status is `generated` — return 400 if not
  - Create a job in `job_manager` for SSE tracking
  - Launch `BackgroundTasks.add_task(train_deep_memory, ...)` with training_run_id, job_id, job_manager, settings, supabase
  - Return 202 with `TrainResponse(job_id, training_run_id, message)`

---

## Phase 5: US3 — Search Integration & Toggle

**Goal**: Deep Memory toggle in settings endpoint, RAG chat transparently uses `deep_memory=True` when enabled. Frontend page with toggle and training workflow UI.

**Independently testable**: After training completes (US2), call `PUT /v1/api/deep-memory/settings` to enable, then `POST /v1/api/chat` and verify search uses deep_memory. Toggle off and verify fallback.

- [ ] T015 Create settings endpoints in `backend/app/routers/deep_memory.py`
  - `GET /v1/api/deep-memory/settings`: query `deep_memory_settings` for user. If no row exists, return defaults (enabled=false, can_enable=false). Compute `can_enable` by checking if any `deep_memory_training_runs` with status `completed` exists for user. Also include `total_chunks` (current count from DeepLake via `len(get_all_chunk_ids_and_texts())`) and `trained_chunk_count` (unique chunk_ids from pairs in last completed run) so the frontend can compute "X new chunks since last training" without a separate endpoint.
  - `PUT /v1/api/deep-memory/settings`: accept `UpdateSettingsRequest`. If `enabled=true`, validate at least one completed training run exists — return 400 otherwise. Upsert row in `deep_memory_settings`.

- [ ] T016 Integrate Deep Memory toggle into RAG chat in `backend/app/services/chat.py`
  - In `_retrieve_context()`, before calling `self.vectorstore.similarity_search()`:
    - Accept `supabase` client (add to `__init__` or pass as parameter)
    - Query `deep_memory_settings` for the current user_id to get `enabled` flag
    - If no settings row exists, default to `enabled=False`
  - Pass `deep_memory=enabled` to `self.vectorstore.similarity_search(query, k=..., score_threshold=..., deep_memory=enabled)`
  - Update `chat.py` router to pass `user_id` through to `ChatService.stream()` so it can query settings
  - Existing chat behavior is unchanged when deep_memory is disabled (False is the default)

- [ ] T017 [P] Create Next.js BFF API routes in `next-frontend/app/api/deep-memory/` (NEW directory)
  - `generate/route.ts` — POST: auth check, extract user_id from Supabase session, proxy to `${API_BASE_URL}/v1/api/deep-memory/generate` with `{ user_id }`
  - `train/route.ts` — POST: auth check, proxy to backend `/v1/api/deep-memory/train` with `{ training_run_id, user_id }`
  - `runs/route.ts` — GET: auth check, proxy to backend `/v1/api/deep-memory/runs?user_id=...`
  - `runs/[runId]/route.ts` — GET: auth check, proxy to backend `/v1/api/deep-memory/runs/{runId}?user_id=...`
  - `settings/route.ts` — GET: proxy to backend settings endpoint. PUT: proxy with `{ enabled, user_id }`
  - All routes follow existing BFF patterns from `next-frontend/app/api/articles/` and `next-frontend/app/api/cookies/`

- [ ] T018 [P] Create API client functions in `next-frontend/lib/api/deep-memory.ts` (NEW file)
  - `generateTrainingData(): Promise<{ job_id, training_run_id, total_chunks }>` — POST to `/api/deep-memory/generate`
  - `startTraining(runId: string): Promise<{ job_id, training_run_id }>` — POST to `/api/deep-memory/train`
  - `getTrainingRuns(): Promise<TrainingRun[]>` — GET `/api/deep-memory/runs`
  - `getTrainingRun(runId: string): Promise<TrainingRunDetail>` — GET `/api/deep-memory/runs/{runId}`
  - `getSettings(): Promise<DeepMemorySettings>` — GET `/api/deep-memory/settings`
  - `updateSettings(enabled: boolean): Promise<void>` — PUT `/api/deep-memory/settings`
  - TypeScript interfaces: `TrainingRun`, `TrainingRunDetail`, `SamplePair`, `DeepMemorySettings`
  - Follow patterns from `next-frontend/lib/api/events.ts` and existing API clients

- [ ] T019 [P] Create Deep Memory UI components in `next-frontend/components/deep-memory/` (NEW directory)
  - `DeepMemoryToggle.tsx` — shadcn Switch component with label "Enable Deep Memory", disabled when `can_enable=false`, shows last trained date and pair count. Uses `updateSettings()` API on toggle.
  - `TrainingProgress.tsx` — Progress bar component that subscribes to SSE via `subscribeToJob()` from `lib/api/events.ts`. Shows "Generating training data... X/Y chunks (Z pairs)" or "Training Deep Memory...". Auto-closes on completion/failure.
  - `TrainingMetrics.tsx` — Card displaying recall@1, recall@3, recall@5, recall@10 metrics as labeled values. Shows improvement if before/after data available.
  - `SamplePairsTable.tsx` — Simple table (or shadcn Table) showing sample question-chunk pairs: columns Question, Chunk Preview, Score. Max 10 rows from API.
  - `TrainingRunHistory.tsx` — shadcn Table listing past training runs: Status (badge), Pairs, Recall@10, Date. Each row clickable to see detail.

- [ ] T020 Create Deep Memory dashboard page in `next-frontend/app/dashboard/deep-memory/page.tsx` (NEW file)
  - Page layout with three sections:
    - **Header**: "Deep Memory Training" title with status badge (Enabled/Disabled)
    - **Settings card**: `DeepMemoryToggle` component, last trained info
    - **Training workflow card**:
      - "Generate Training Data" button — onClick calls `generateTrainingData()`, shows `TrainingProgress` with SSE
      - When generation completes, shows `SamplePairsTable` with data from `getTrainingRun(runId)` and statistics (total pairs, avg per chunk, coverage %)
      - "Start Training" button (visible only when run status is `generated`) — onClick calls `startTraining(runId)`, shows `TrainingProgress`
      - When training completes, shows `TrainingMetrics` card
    - **Training history section**: `TrainingRunHistory` component
  - Use `'use client'` directive (requires hooks for state, SSE, API calls)
  - Fetch initial data with `useEffect`: `getSettings()` and `getTrainingRuns()`

- [ ] T021 Add "Deep Memory" navigation link to dashboard sidebar in `next-frontend/components/sidebar.tsx` (or equivalent layout navigation file)
  - Add nav item: icon (Brain or Zap from lucide-react), label "Deep Memory", href `/dashboard/deep-memory`
  - Place after existing Knowledge Base nav item

---

## Phase 6: US4 — Incremental Retraining

**Goal**: When new transcripts are added, the system generates training pairs only for new chunks and merges with existing pairs for retraining.

**Independently testable**: After initial training (US2), add new transcripts via existing YouTube flow, call generate again, verify only new chunks are processed, verify pair count includes both old and new, verify training uses merged dataset.

- [ ] T022 Add incremental generation logic to `backend/app/services/training_generator.py`
  - Before generating, query ALL `deep_memory_training_pairs` from completed runs for this user to get set of already-trained chunk_ids
  - When iterating chunks from DeepLake, skip any chunk whose id is in the already-trained set
  - This means: new generation run only processes chunks not covered by any previous completed run
  - Update SSE progress to reflect only new chunks (total_chunks = new chunk count, not total)

- [ ] T023 Add pair merging logic to `backend/app/services/deep_memory_service.py`
  - In `train_deep_memory()`, before formatting training data:
    - Load pairs from the CURRENT run (new pairs)
    - Also load pairs from ALL previous completed runs for this user
    - Merge into a single queries + relevance dataset
    - This ensures Deep Memory is trained on the full corpus, not just new chunks
  - Update pair_count on the training run to reflect total pairs used (current + historical)

- [ ] T024 Add "new chunks" indicator to dashboard in `next-frontend/app/dashboard/deep-memory/page.tsx`
  - After loading settings (which now includes `total_chunks` and `trained_chunk_count` from T015), compute difference
  - Display "X new chunks since last training" banner when `total_chunks - trained_chunk_count > 0`
  - This helps users know when retraining is worthwhile

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T025 Update constitution Technology Stack table in `.specify/memory/constitution.md`
  - Change Vector store row from "DeepLake | Via langchain" to "DeepLake Cloud | Via langchain-deeplake, Managed Tensor DB"
  - Bump version to 1.3.0
  - Add amendment log entry: "1.3.0 (2026-XX-XX): Updated DeepLake to Cloud Managed Tensor Database for Deep Memory support (ZIP-004)"

---

## Dependencies

```
T001 (migration) ──────┐
T002 (config) ─────────┤
T003 (models) ─────────┼──► T004-T007 (vectorstore) ──► T008-T012 (US1: generation)
                       │                                       │
                       │                                       ▼
                       │                               T013-T014 (US2: training)
                       │                                       │
                       │                                       ▼
                       │                               T015-T021 (US3: toggle + UI)
                       │                                       │
                       │                                       ▼
                       │                               T022-T024 (US4: incremental)
                       │                                       │
                       │                                       ▼
                       └───────────────────────────────► T025 (polish)
```

## Parallel Execution Opportunities

- **Phase 1**: T001, T002, T003 are fully independent — run in parallel
- **Phase 2**: T004 must go first; T005, T006, T007 can parallel after T004
- **Phase 3**: T009, T010, T011 can parallel (different endpoints); T008 is the core service
- **Phase 5**: T017, T018, T019 can parallel (BFF routes, API client, components); T020 depends on T019

## Implementation Strategy

**MVP (US1 + US2 + US3 toggle)**: Tasks T001–T016 deliver the core value — generate training data, train Deep Memory, and toggle it on for improved RAG search. This is the minimum viable feature.

**Full feature**: Add T017–T021 for the frontend management UI, then T022–T024 for incremental retraining.

**Suggested MVP scope**: Complete through Phase 5 (US3) for end-to-end functionality. Phase 6 (incremental) is a nice-to-have that can ship later.
