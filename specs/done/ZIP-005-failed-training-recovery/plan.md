# Implementation Plan: ZIP-005 Failed Training Data Generation Recovery

**Feature ID**: ZIP-005
**Branch**: `feature/ZIP-005-failed-training-recovery`
**Created**: 2026-02-24

## Technical Context

### Existing Stack (from Constitution)
- **Backend**: Python 3.11+, FastAPI, uv
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, shadcn/ui, Tailwind CSS v3
- **Database**: Supabase (PostgreSQL + RLS)
- **Async jobs**: FastAPI BackgroundTasks + JobManager + SSE (Constitution Principle IV)

### Existing Implementation (ZIP-004)
- **Training generator**: `backend/app/services/training_generator.py` — generates question-chunk pairs, already has resumability logic (skips processed chunks)
- **Deep memory service**: `backend/app/services/deep_memory_service.py` — calls DeepLake training API, polls status with backoff
- **Router**: `backend/app/routers/deep_memory.py` — REST endpoints for generate, train, runs, settings
- **Models**: `backend/app/models/deep_memory.py` — Pydantic request/response models
- **Frontend dashboard**: `next-frontend/app/dashboard/deep-memory/page.tsx` — workflow-driven UI
- **DB schema**: `007_deep_memory_training.sql` — three tables with RLS

### Unknowns
None — all technical decisions resolved in research.md.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | ✅ | Frontend changes in TypeScript, backend in Python |
| II. API-Boundary Separation | ✅ | New endpoints follow existing proxy pattern |
| III. Supabase as Source of Truth | ✅ | Status transitions in Supabase, migration for schema change |
| IV. Background Jobs with Real-Time Feedback | ✅ | Proceed reuses existing BackgroundTasks + SSE pattern |
| V. Simplicity and Pragmatism | ✅ | Minimal changes, reuses existing resumability logic |

## Implementation Phases

### Phase 1: Database Migration

**Goal**: Update the status CHECK constraint and migrate existing data.

**Changes**:
- Create `next-frontend/supabase/migrations/008_failed_training_statuses.sql`
- Migrate existing `failed` → `generating_failed` / `training_failed` based on `deeplake_job_id` presence
- Drop old CHECK constraint, add new one with 6 statuses

**Validation**: Run migration against Supabase. Verify no records have `status = 'failed'` afterward.

### Phase 2: Backend — Status Transitions

**Goal**: Update error handlers to use phase-specific failure statuses.

**Changes**:
- `training_generator.py`: Change `"failed"` to `"generating_failed"` in the except block (line ~194)
- `deep_memory_service.py`: Change `"failed"` to `"training_failed"` in the except block (line ~209)
- Both SSE `extra` updates: change `"status": "failed"` to the phase-specific status

**Validation**: Unit test — trigger generation error → verify status is `generating_failed`. Trigger training error → verify status is `training_failed`.

### Phase 3: Backend — New Endpoints

**Goal**: Add proceed and delete endpoints, add blocking validation.

**Changes**:
1. **`POST /v1/api/deep-memory/proceed`** (new):
   - Validate run exists and is in `generating_failed` or `training_failed`
   - Clear `error_message`, reset status to `generating` or `training`
   - Launch appropriate background task (generation or training)
   - Return 202 with job_id

2. **`DELETE /v1/api/deep-memory/runs/{run_id}`** (new):
   - Validate run exists and is in a failed status
   - Delete the run (CASCADE removes pairs)
   - Return 200 with deleted pair count

3. **`POST /v1/api/deep-memory/generate`** (modified):
   - Before creating new run, query for any `generating_failed` or `training_failed` runs
   - If found, return 409 with failed run details

4. **`GET /v1/api/deep-memory/settings`** (modified):
   - Query for blocking runs and include `has_blocking_run`, `blocking_run_id`, `blocking_run_status`, `is_cloud` in response

5. **Models** (`deep_memory.py`):
   - Add `ProceedRequest(training_run_id: str, user_id: str)`
   - Add `ProceedResponse(job_id: str, training_run_id: str, message: str)`
   - Extend `DeepMemorySettingsResponse` with `has_blocking_run`, `blocking_run_id`, `blocking_run_status`, `is_cloud`
   - DELETE endpoint returns a plain dict (no dedicated model — YAGNI)

**Validation**: Backend tests for each endpoint — happy path and error cases.

### Phase 4: Frontend — API Client & Types

**Goal**: Add client functions and types for new endpoints.

**Changes**:
1. **Types** (`lib/types/deep-memory.ts`):
   - Extend `DeepMemorySettings` with `has_blocking_run: boolean`, `blocking_run_id: string | null`, `blocking_run_status: string | null`, `is_cloud: boolean`

2. **API client** (`lib/api/deep-memory.ts`):
   - Add `proceedFailedRun(runId: string): Promise<ProceedResponse>`
   - Add `deleteFailedRun(runId: string): Promise<void>`

3. **Next.js API routes**:
   - Create `app/api/deep-memory/proceed/route.ts` — POST proxy
   - Extend `app/api/deep-memory/runs/[runId]/route.ts` — add DELETE handler

**Validation**: TypeScript compilation passes (`yarn build`).

### Phase 5: Frontend — Status Display Updates

**Goal**: Handle new status strings throughout the UI.

**Changes**:
1. **`TrainingRunHistory.tsx`**: Add `generating_failed` and `training_failed` to `statusVariant` map with `"destructive"` variant
2. **`TrainingProgress.tsx`**: Change `status === "failed"` to check for both `generating_failed` and `training_failed`
3. **`events.ts`**: Add new failed statuses to SSE auto-close terminal state check

**Validation**: Failed runs show red badges with correct status text.

### Phase 6: Frontend — Dashboard Controls

**Goal**: Add proceed/remove buttons and generation blocking.

**Changes to `page.tsx`**:
1. **Failed run detection**: Use `settings.has_blocking_run` to detect blocked state
2. **Disable generate button**: When `has_blocking_run` is true, disable button and show message indicating current blocking status
3. **Failed run actions**:
   - "Proceed" button: calls `proceedFailedRun()`, sets appropriate `jobId` and `step`
   - "Remove" button: shows confirmation dialog, calls `deleteFailedRun()`, refreshes state
4. **Error callbacks**: Update SSE error handlers to set workflow step to failed-aware state (not just "idle")

**Validation**: Full workflow test — trigger failure → see controls → proceed or remove → verify recovery.

### Phase 7: UX Fixes from Clarification (Post-Implementation)

**Goal**: Fix progress label bug on resume and improve UX for proceed flow and training history.

**Changes**:
1. **Fix `total_chunks` on resume** (`training_generator.py`):
   - Change `total_chunks = len(unprocessed)` to `total_chunks = len(unprocessed) + already_processed` so progress labels read `processed/total` correctly (e.g., `51/80` not `51/30`)

2. **Proceed hides alert, shows progress only** (`page.tsx`):
   - In `handleProceed`, set `currentRun` to `null` before changing `step` — this hides the failed-run alert section and shows only the `TrainingProgress` component

3. **Progress column in Training History** (multi-file):
   - Add `processed_chunks` and `total_chunks` to `TrainingRunSummary` (backend model, router serialization, TS type)
   - Add Progress column to `TrainingRunHistory.tsx`: shows `processed_chunks/total_chunks` for `generating` status, "In progress" for `training`, "—" otherwise

**Validation**: Navigate to dashboard during active generation → verify correct `processed/total` in history table. Click Proceed on failed run → verify alert disappears and progress indicator appears.

### Phase 8: Training History — Refresh Icon for Active Runs

**Goal**: Allow administrators to refresh progress data for individual active runs without reloading the page.

**Spec ref**: FR-7 item 8

**Changes**:
1. **`TrainingRunHistory.tsx`** — Add refresh icon button:
   - For rows where `run.status` is `generating` or `training`, render a clickable refresh icon (lucide-react `RefreshCw`) next to the progress text in the Progress column
   - Accept a new `onRefreshRun` callback prop: `(runId: string) => Promise<void>`
   - On click: call `onRefreshRun(run.id)`, show a brief loading state (spin the icon), then update completes via parent state update
   - Prevent event propagation so clicking refresh doesn't trigger `onSelectRun`

2. **`page.tsx`** — Add `handleRefreshRun` callback:
   - Calls existing `getTrainingRun(runId)` to fetch updated data from `GET /runs/{run_id}`
   - Updates the `runs` state array by merging the refreshed `processed_chunks`, `total_chunks`, `pair_count`, and `status` into the matching run entry
   - No full page reload — only the target row's data changes
   - Pass `handleRefreshRun` as `onRefreshRun` prop to `TrainingRunHistory`

**No backend changes required** — reuses existing `GET /runs/{run_id}` endpoint which already returns `processed_chunks` and `total_chunks`.

**Validation**: Start a generation run → navigate to dashboard → see refresh icon on active row → click it → verify `processed/total` updates without page reload.

### Phase 9: Expandable Training History Rows with Inline Actions

**Goal**: Move failed-run actions from the Training Workflow card to expandable areas below Training History rows. Show progress data for failed statuses. Accordion behavior (one row expanded at a time).

**Spec ref**: FR-7 items 7, 9, 10, 11

**Changes**:

1. **`TrainingRunHistory.tsx`** — Major refactor for expandable rows:
   - Add `expandedRunId` state (string | null) for accordion behavior
   - Add new callback props: `onProceedRun?: (runId: string) => Promise<void>`, `onRemoveRun?: (runId: string) => Promise<void>` (in addition to existing `onRefreshRun`)
   - On row click: if status is expandable (`generating`, `training`, `generating_failed`, `training_failed`), toggle expansion. Otherwise, call `onSelectRun` as before (for `generated`, `completed` rows)
   - Render expanded area as an additional `<TableRow>` below the clicked row with `colSpan` spanning all columns
   - Expanded area content:
     - For active statuses (`generating`, `training`): Refresh button only
     - For failed statuses (`generating_failed`, `training_failed`): error message text + Proceed button + Delete button (destructive variant)
   - Update Progress column: show `processed_chunks/total_chunks` for `generating`, `generating_failed`, and `training_failed` statuses (not just `generating`)

2. **`page.tsx`** — Remove failed-run alert from Training Workflow card:
   - Remove the `{currentRun && (currentRun.status === "generating_failed" || ...)}` Alert block from the Training Workflow card
   - Keep the `settings?.has_blocking_run` check that disables the Generate button (that stays in the Workflow card)
   - Lift `handleProceed` and `handleRemove` to work without `currentRun` dependency — they receive `runId` directly from the history row callback
   - Pass `handleProceed` as `onProceedRun`, `handleRemove` as `onRemoveRun`, and `handleRefreshRun` as `onRefreshRun` to `<TrainingRunHistory>`
   - Remove `handleSelectRun` click handler for failed status rows (expansion replaces it)
   - Keep `handleSelectRun` for `generated` and `completed` rows (to show review/results in Workflow card)

**No backend changes required** — all data already available via existing endpoints.

**Validation**:
- Navigate to dashboard with a `generating_failed` run → click the row → verify expandable area appears below with error message + Proceed + Delete buttons → click Proceed → verify expansion collapses and progress indicator shows in Workflow card.
- Navigate to dashboard with an active `generating` run → click the row → verify expandable area appears with Refresh button only.
- Click a `completed` row → verify no expansion, but `currentRun` updates as before.
- Verify Progress column shows `processed_chunks/total_chunks` for `generating_failed` and `training_failed` rows.

### Phase 10: Broaden Generation Blocking to All Non-Completed Runs

**Goal**: Disable "Generate Training Data" when any run exists in a non-completed status, not just failed runs. This prevents starting new generation while a run is actively generating, awaiting review (`generated`), or training.

**Spec ref**: FR-2 (broadened), Scenario 6 (broadened), Clarification session

**Changes**:

1. **Backend — `POST /v1/api/deep-memory/generate`** (`backend/app/routers/deep_memory.py`):
   - Change blocking query from `.in_("status", ["generating_failed", "training_failed"])` to `.neq("status", "completed")`
   - Update 409 response message: "Cannot start new generation: an unfinished training run exists"
   - Response fields remain: `blocking_run_id`, `blocking_run_status` (renamed from `failed_run_id`/`failed_status` for accuracy)

2. **Backend — `GET /v1/api/deep-memory/settings`** (`backend/app/routers/deep_memory.py`):
   - Change blocking query from `.in_("status", ["generating_failed", "training_failed"])` to `.neq("status", "completed")`
   - Rename response fields: `has_failed_run` → `has_blocking_run`, `failed_run_id` → `blocking_run_id`, `failed_run_status` → `blocking_run_status`

3. **Backend — Models** (`backend/app/models/deep_memory.py`):
   - Rename `DeepMemorySettingsResponse` fields: `has_failed_run: bool` → `has_blocking_run: bool`, `failed_run_id` → `blocking_run_id`, `failed_run_status` → `blocking_run_status`

4. **Frontend — Types** (`next-frontend/lib/types/deep-memory.ts`):
   - Rename `DeepMemorySettings` fields: `has_failed_run` → `has_blocking_run`, `failed_run_id` → `blocking_run_id`, `failed_run_status` → `blocking_run_status`

5. **Frontend — Dashboard** (`next-frontend/app/dashboard/deep-memory/page.tsx`):
   - Update all references from `settings?.has_failed_run` to `settings?.has_blocking_run`
   - Update blocking message to be status-aware: show different text based on `blocking_run_status` (e.g., "A training run is currently generating data" for `generating`, "A training run is awaiting review" for `generated`, "A failed run must be resolved" for failed statuses)

**No data model or migration changes** — this is purely a query and naming change.

**Validation**: With a `generated` run in DB → verify Generate button is disabled → complete or remove the run → verify button becomes enabled. Same for `generating` and `training` statuses.

### Phase 11: Cloud-Only Gate for Deep Memory Page

**Goal**: Hide all Deep Memory Training page content when the vector store is not cloud-based (`_is_cloud` is false), showing a warning that Deep Memory requires DeepLake Cloud.

**Spec ref**: FR-6, Clarification session

**Changes**:

1. **Backend — Models** (`backend/app/models/deep_memory.py`):
   - Add `is_cloud: bool` field to `DeepMemorySettingsResponse`

2. **Backend — Settings endpoint** (`backend/app/routers/deep_memory.py`):
   - In `get_settings_endpoint`, pass `vectorstore._is_cloud` (already instantiated as `VectorStoreService(settings)`) to both return statements as `is_cloud`

3. **Frontend — Types** (`next-frontend/lib/types/deep-memory.ts`):
   - Add `is_cloud: boolean` to `DeepMemorySettings` interface

4. **Frontend — Dashboard** (`next-frontend/app/dashboard/deep-memory/page.tsx`):
   - After loading settings, check `settings.is_cloud`
   - When `false`: render page header (Brain icon + title) followed by a warning Alert explaining Deep Memory is only available with DeepLake Cloud. Hide all cards (Settings, Training Workflow, Training History)
   - When `true`: render existing page content unchanged

**No migration or data model changes** — `_is_cloud` is derived from the runtime `deeplake_path` config.

**Validation**: Set `DEEPLAKE_PATH` to a local path (e.g., `./knowledge_base/deeplake`) → load Deep Memory page → verify only header and warning Alert shown. Set to `hub://...` → verify full page renders.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DeepLake rejects re-submitted training data | Low | Medium | Research confirms `train()` is idempotent for same data |
| Migration breaks existing "failed" records | Low | Low | Migration is conditional on `deeplake_job_id` presence |
| SSE events with new status strings not handled by old frontend | Low | Low | Frontend and backend deploy together |
| Expandable row refactor breaks existing row click behavior | Low | Medium | Expandable rows only for active/failed statuses; `generated`/`completed` rows keep existing `onSelectRun` behavior |

## Artifacts Generated

- `research.md` — 4 research decisions
- `data-model.md` — Schema changes and migration SQL
- `contracts/api-contracts.md` — 2 new endpoints, 2 modified endpoints
- `quickstart.md` — Dev setup and file inventory
- `plan.md` — This file
