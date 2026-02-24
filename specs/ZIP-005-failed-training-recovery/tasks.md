# Tasks: ZIP-005 Failed Training Data Generation Recovery

**Feature**: Failed Training Data Generation Recovery
**Branch**: `feature/ZIP-005-failed-training-recovery`
**Total Tasks**: 36
**Generated**: 2026-02-24

## User Story Mapping

| Story | Spec Scenario | Summary |
| --- | --- | --- |
| US1 | Scenario 1 + 2 | Phase-specific failure statuses — errors set `generating_failed` or `training_failed` |
| US2 | Scenario 3 + 4 | Proceed from failed runs — resume generation or training from point of failure |
| US3 | Scenario 5 | Remove failed runs — delete run and all associated training pairs |
| US4 | Scenario 6 | Block new generation while any failed run exists |
| US5 | Clarification session | UX fixes: progress labels, proceed flow, history progress column |
| US6 | FR-7 item 8 | Refresh icon for active runs in Training History — per-row progress update without page reload |
| US7 | FR-7 items 7, 9-11 | Expandable Training History rows with inline actions — move failed-run controls from Workflow card to accordion rows |
| US8 | FR-2 (broadened) | Broaden generation blocking — disable Generate button when any non-completed run exists, not just failed |
| US9 | FR-6 (Cloud-Only Gate) | Hide Deep Memory page content when vector store is not cloud-based, show warning |

---

## Phase 1: Setup — Database Migration

- [x] T001 Create database migration `next-frontend/supabase/migrations/008_failed_training_statuses.sql`
  - Migrate existing `failed` records: set `status = 'training_failed'` WHERE `deeplake_job_id IS NOT NULL`, set `status = 'generating_failed'` WHERE `deeplake_job_id IS NULL`
  - Drop existing CHECK constraint: `ALTER TABLE public.deep_memory_training_runs DROP CONSTRAINT IF EXISTS deep_memory_training_runs_status_check`
  - Add new CHECK constraint with 6 statuses: `generating`, `generated`, `training`, `completed`, `generating_failed`, `training_failed`
  - Copy exact SQL from `data-model.md` Migration File section
  - Apply migration via Supabase Dashboard SQL Editor

---

## Phase 2: Foundational — Backend Status Transitions [US1]

These tasks update error handlers so failures are correctly tagged by phase. All subsequent stories depend on this.

- [x] T002 [P] [US1] Update generation error handler in `backend/app/services/training_generator.py`
  - In the top-level `except Exception as e:` block (~line 189-201), change all `"failed"` strings to `"generating_failed"`
  - Update Supabase `.update({"status": "failed", ...})` → `"generating_failed"`
  - Update `job_manager.update_job()` extra dict: `"status": "failed"` → `"generating_failed"`
  - Update `job_manager.update_job()` message: `"Generation failed: {e}"` stays descriptive (no change needed)

- [x] T003 [P] [US1] Update training error handler in `backend/app/services/deep_memory_service.py`
  - In the top-level `except Exception as e:` block (~line 206-218), change all `"failed"` strings to `"training_failed"`
  - Update Supabase `.update({"status": "failed", ...})` → `"training_failed"`
  - Update `job_manager.update_job()` extra dict: `"status": "failed"` → `"training_failed"`

- [x] T004 [P] [US1] Update frontend status display in `next-frontend/components/deep-memory/TrainingRunHistory.tsx`
  - Add `generating_failed: "destructive"` and `training_failed: "destructive"` to the `statusVariant` map (~line 19-25)
  - Remove the old `failed: "destructive"` entry

- [x] T005 [P] [US1] Update SSE terminal state detection in `next-frontend/lib/api/events.ts`
  - In the `subscribeToJob` function, update the auto-close condition (~line 15) from `status === "failed"` to `status === "generating_failed" || status === "training_failed"`

- [x] T006 [P] [US1] Update progress component in `next-frontend/components/deep-memory/TrainingProgress.tsx`
  - Change `status === "failed"` check (~line 40) to `status === "generating_failed" || status === "training_failed"`
  - Update the error display condition (~line 59) similarly
  - Update error message text to indicate which phase failed: "Generation failed" vs "Training failed"

---

## Phase 3: Proceed from Failed Runs [US2]

**Goal**: Allow administrators to resume failed generation or training from the point of failure.

**Independent test**: Manually set a training run to `generating_failed` status → click Proceed → verify generation resumes and skips processed chunks. Same for `training_failed`.

- [x] T007 [US2] Add Pydantic models for proceed endpoint in `backend/app/models/deep_memory.py`
  - Add `ProceedRequest(training_run_id: str, user_id: str)`
  - Add `ProceedResponse(job_id: str, training_run_id: str, message: str)`

- [x] T008 [US2] Add `POST /v1/api/deep-memory/proceed` endpoint in `backend/app/routers/deep_memory.py`
  - Accept `ProceedRequest`, validate run exists and belongs to user (404 if not)
  - Validate run status is `generating_failed` or `training_failed` (400 if not)
  - Clear `error_message` and reset status: `generating_failed` → `generating`, `training_failed` → `training`
  - Create SSE job via `job_manager.create_job()`
  - If was `generating_failed`: launch `generate_training_data` background task (existing function — it already skips processed chunks via resumability logic). NOTE: this function does NOT create a new run record — it receives `training_run_id` as a param and operates on the existing record
  - If was `training_failed`: launch `train_deep_memory` background task (existing function — it loads pairs and re-submits to DeepLake). NOTE: this function sets `status='training'` at start (~line 27), which is harmless since T008 already reset it, but be aware of the redundant write
  - Return 202 with `ProceedResponse` including job_id and descriptive message
  - Follow patterns from existing `POST /v1/api/deep-memory/generate` and `POST /v1/api/deep-memory/train` endpoints

- [x] T009 [P] [US2] Add TypeScript types for proceed in `next-frontend/lib/types/deep-memory.ts`
  - Add `ProceedResponse` interface: `{ job_id: string, training_run_id: string, message: string }`

- [x] T010 [P] [US2] Create Next.js API proxy route `next-frontend/app/api/deep-memory/proceed/route.ts`
  - POST handler: authenticate user via Supabase, forward `{ training_run_id, user_id }` to `${API_BASE_URL}/v1/api/deep-memory/proceed`
  - Follow pattern from existing `next-frontend/app/api/deep-memory/train/route.ts`

- [x] T011 [P] [US2] Add `proceedFailedRun` API client function in `next-frontend/lib/api/deep-memory.ts`
  - `async function proceedFailedRun(runId: string): Promise<ProceedResponse>` — POST to `/api/deep-memory/proceed` with `{ training_run_id: runId }`
  - Follow pattern from existing `startTraining()` function

- [x] T012 [US2] Add Proceed button and handler to dashboard in `next-frontend/app/dashboard/deep-memory/page.tsx`
  - Add `handleProceed(runId: string)` callback: calls `proceedFailedRun(runId)`, sets `jobId` from response, sets `step` to `"generating"` or `"training"` based on `currentRun.status` (`generating_failed` → `"generating"`, `training_failed` → `"training"`)
  - Show "Proceed" button when `currentRun?.status` is `generating_failed` or `training_failed`
  - Reuse existing `TrainingProgress` component for SSE tracking after proceed
  - Wire `onComplete` and `onError` callbacks same as existing generation/training flows

---

## Phase 4: Remove Failed Runs [US3]

**Goal**: Allow administrators to completely delete a failed run and its orphaned training pairs.

**Independent test**: Set a training run to `generating_failed` → click Remove → confirm → verify run and all pairs deleted from database.

- [x] T013 [US3] Add `DELETE /v1/api/deep-memory/runs/{run_id}` endpoint in `backend/app/routers/deep_memory.py`
  - Accept `run_id` path param and `user_id` query param
  - Validate run exists and belongs to user (404 if not)
  - Validate run status is `generating_failed` or `training_failed` (400 with message: "Only failed runs can be deleted")
  - Count associated pairs: `supabase.table("deep_memory_training_pairs").select("id", count="exact").eq("training_run_id", run_id).execute()`
  - Delete the run: `supabase.table("deep_memory_training_runs").delete().eq("id", run_id).eq("user_id", user_id).execute()` (CASCADE removes pairs)
  - Return 200 with message including deleted pair count

- [x] T014 [P] [US3] Add DELETE handler to Next.js API route `next-frontend/app/api/deep-memory/runs/[runId]/route.ts`
  - Add `export async function DELETE(request, { params })` handler
  - Authenticate user via Supabase, forward to `${API_BASE_URL}/v1/api/deep-memory/runs/${runId}?user_id=${userId}`
  - Follow pattern from existing GET handler in same file

- [x] T015 [P] [US3] Add `deleteFailedRun` API client function in `next-frontend/lib/api/deep-memory.ts`
  - `async function deleteFailedRun(runId: string): Promise<void>` — DELETE to `/api/deep-memory/runs/${runId}`

- [x] T016 [US3] Add Remove button with confirmation to dashboard in `next-frontend/app/dashboard/deep-memory/page.tsx`
  - Add `handleRemove(runId: string)` callback: shows browser `confirm()` dialog ("Remove this failed training run and all associated data? This cannot be undone."), if confirmed calls `deleteFailedRun(runId)`, then refreshes runs list and settings, resets `currentRun` to null and `step` to `"idle"`
  - Show "Remove" button (destructive variant) next to "Proceed" button when `currentRun?.status` is `generating_failed` or `training_failed`

---

## Phase 5: Block New Generation [US4]

**Goal**: Prevent new generation while a failed run exists, with clear messaging.

**Independent test**: With a `generating_failed` run in DB → "Generate Training Data" button is disabled with explanatory message → remove the run → button becomes enabled.

- [x] T017 [US4] Add failed-run blocking to `POST /v1/api/deep-memory/generate` in `backend/app/routers/deep_memory.py` and extend settings response
  - **Generate endpoint**: Before creating new run, query `supabase.table("deep_memory_training_runs").select("id, status").eq("user_id", request.user_id).in_("status", ["generating_failed", "training_failed"]).limit(1).execute()`
  - If result has data: return `JSONResponse(status_code=409, content={"detail": "Cannot start new generation: a failed training run exists", "failed_run_id": str(run["id"]), "failed_status": run["status"]})` (use `JSONResponse` instead of `HTTPException` to include structured fields)
  - **Settings endpoint** (`GET /v1/api/deep-memory/settings`): Query for failed runs and add `has_failed_run: bool`, `failed_run_id: str | None`, `failed_run_status: str | None` to response
  - **Models**: Extend `DeepMemorySettingsResponse` with `has_failed_run: bool = False`, `failed_run_id: str | None = None`, `failed_run_status: str | None = None`
  - **Types**: Extend `DeepMemorySettings` interface in `next-frontend/lib/types/deep-memory.ts` with `has_failed_run: boolean`, `failed_run_id: string | null`, `failed_run_status: string | null`

- [x] T018 [US4] Add generation blocking UI to dashboard in `next-frontend/app/dashboard/deep-memory/page.tsx`
  - When `settings?.has_failed_run` is true: disable "Generate Training Data" button, show Alert component below it explaining "A failed training run must be resolved before starting new generation. Use Proceed to resume or Remove to clean up."
  - Include the failed status in the message: "Generation failed" or "Training failed" based on `settings.failed_run_status`
  - When `settings?.has_failed_run` is false: normal button behavior (existing)

---

## Phase 6: UX Fixes from Clarification [US5]

**Goal**: Fix progress label bug on resume, improve proceed UX, add progress column to history table.

**Added**: Post-implementation clarification session (2026-02-24).

- [x] T019 [US5] Fix `total_chunks` computation on resume in `backend/app/services/training_generator.py`
  - Changed `total_chunks = len(unprocessed)` to `total_chunks = len(unprocessed) + already_processed`
  - Ensures progress labels show `processed/total` correctly on resume (e.g., `51/80` not `51/30`)

- [x] T020 [US5] Hide failed-run alert on Proceed click in `next-frontend/app/dashboard/deep-memory/page.tsx`
  - In `handleProceed`, capture `wasGenerating` flag before clearing state, then set `currentRun` to `null` before changing `step`
  - This hides the failed-run alert section (Proceed/Remove buttons) and shows only the `TrainingProgress` component

- [x] T021 [US5] Add Progress column to Training History table
  - Added `processed_chunks` and `total_chunks` to `TrainingRunSummary` Pydantic model in `backend/app/models/deep_memory.py`
  - Added fields to backend router serialization in `backend/app/routers/deep_memory.py`
  - Added fields to `TrainingRunSummary` TypeScript interface in `next-frontend/lib/types/deep-memory.ts`
  - Added Progress column to `next-frontend/components/deep-memory/TrainingRunHistory.tsx`: shows `processed_chunks/total_chunks` for `generating`, "In progress" for `training`, "—" otherwise
  - Also extended `JobStatus` type in `next-frontend/lib/types/knowledge.ts` with `generating_failed` and `training_failed`

---

## Phase 7: Refresh Icon for Active Runs in Training History [US6]

**Goal**: Allow administrators to refresh progress data for a single active run without reloading the page.

**Independent test**: Start a generation run → navigate to dashboard → see refresh icon in the expandable area for the active row → click the icon → verify `processed_chunks/total_chunks` updates in place without page reload.

**Depends on**: T021 (Progress column must exist)

- [x] T022 [US6] Add `onRefreshRun` callback prop to `next-frontend/components/deep-memory/TrainingRunHistory.tsx`
  - Add `onRefreshRun?: (runId: string) => Promise<void>` to `TrainingRunHistoryProps`
  - Add local `refreshingId` state (`string | null`) to track which row is refreshing
  - NOTE: The actual Refresh button rendering is deferred to T024 (expandable row) — this task only adds the prop and state. The button will be rendered inside the expandable area, not inline in the Progress column
  - Export the `refreshingId` state setter for use by the expandable area rendering in T024

- [x] T023 [US6] Add `handleRefreshRun` callback to `next-frontend/app/dashboard/deep-memory/page.tsx`
  - Add `handleRefreshRun` async function: calls existing `getTrainingRun(runId)` to fetch updated data via `GET /runs/{run_id}`
  - On success: update the `runs` state array by merging `processed_chunks`, `total_chunks`, `pair_count`, and `status` from the response into the matching run entry (use `setRuns(prev => prev.map(...))`)
  - Pass `handleRefreshRun` as `onRefreshRun` prop to `<TrainingRunHistory>`

---

## Phase 8: Expandable Training History Rows with Inline Actions [US7]

**Goal**: Move failed-run actions from the Training Workflow card to expandable areas below Training History rows. Show progress data for failed statuses. Accordion behavior (one row expanded at a time).

**Independent test**: With a `generating_failed` run in history → click the row → verify expandable area appears below with error message + Proceed + Delete buttons → click Proceed → verify expansion collapses and progress shows in Workflow card. With an active `generating` run → click the row → verify expandable area with Refresh button only. Click a `completed` row → verify no expansion.

**Depends on**: T022, T023 (refresh callback must exist), T012 (proceed handler), T016 (remove handler)

- [x] T024 [US7] Update Progress column and add expandable rows to `next-frontend/components/deep-memory/TrainingRunHistory.tsx`
  - **Progress column update**: Show `processed_chunks/total_chunks` for `generating_failed` and `training_failed` statuses (currently only shows for `generating`). Update the ternary in the Progress `<TableCell>` to include failed statuses with chunk data
  - **New props**: Add `onProceedRun?: (runId: string) => Promise<void>` and `onRemoveRun?: (runId: string) => Promise<void>` to `TrainingRunHistoryProps`
  - **Expandable state**: Add `expandedRunId` state (`string | null`) for accordion behavior
  - **Row click logic**: On row click, if `run.status` is in `['generating', 'training', 'generating_failed', 'training_failed']`, toggle `expandedRunId` (set to `run.id` if different, set to `null` if same). Otherwise, call `onSelectRun?.(run.id)` as before (for `generated`, `completed` rows)
  - **Expanded area rendering**: After each `<TableRow>`, if `expandedRunId === run.id`, render an additional `<TableRow>` with a single `<TableCell colSpan={5}>` containing:
    - For active statuses (`generating`, `training`): `RefreshCw` icon button (import from `lucide-react`). On click: set `refreshingId` to `run.id`, call `onRefreshRun?.(run.id)`, clear `refreshingId`. Apply `animate-spin` while refreshing. Use `e.stopPropagation()` to prevent row toggle
    - For failed statuses (`generating_failed`, `training_failed`): Error message text (`run.error_message` if available, prefixed with "Generation failed: " or "Training failed: "), then a `div` with Proceed button (`onClick={() => onProceedRun?.(run.id)`) and Delete button (destructive variant, `onClick={() => onRemoveRun?.(run.id)`). Use `e.stopPropagation()` on buttons
  - **Visual styling**: Expandable row should have a subtle background (`bg-muted/30`) and left border accent. Use `flex items-center gap-2` for button layout

- [x] T025 [US7] Update `next-frontend/app/dashboard/deep-memory/page.tsx` to remove failed-run alert and pass expandable row callbacks
  - **Remove failed-run alert**: Delete the entire `{currentRun && (currentRun.status === "generating_failed" || currentRun.status === "training_failed") && (...)}` Alert block from the Training Workflow card (lines ~237-254)
  - **Keep generate blocking**: The `settings?.has_failed_run` disable logic and message on the Generate button stays unchanged
  - **Update handleProceed**: Remove the `if (!currentRun) return` guard — the function now receives `runId` directly. Fetch run status from `runs` state array instead of `currentRun`: `const run = runs.find(r => r.id === runId)`. Determine `wasGenerating` from `run?.status === "generating_failed"`. Rest of logic stays the same (call `proceedFailedRun`, set `jobId`, set `step`)
  - **Update handleRemove**: Remove the dependency on `currentRun` — it already receives `runId` as param and doesn't use `currentRun`. No other changes needed
  - **Pass callbacks to TrainingRunHistory**: Add `onProceedRun={handleProceed}`, `onRemoveRun={handleRemove}`, and `onRefreshRun={handleRefreshRun}` props to `<TrainingRunHistory>`
  - **Update handleSelectRun**: Remove the `generating_failed` / `training_failed` status handling (lines ~134) — those statuses are now handled by expandable rows, not `onSelectRun`. Keep `generated` and `completed` handling

- [x] T026 [P] [US7] Add `error_message` field to `TrainingRunSummary` in `next-frontend/lib/types/deep-memory.ts`
  - Add `error_message: string | null` to `TrainingRunSummary` interface (currently only exists on `TrainingRunDetail`)
  - This field is needed for the expandable row to display error text without fetching the full run detail

- [x] T027 [US7] Add `error_message` to training runs list serialization in `backend/app/routers/deep_memory.py`
  - In the runs list endpoint response, include `error_message` field from the database record in each run summary
  - Also add `error_message: str | None = None` to `TrainingRunSummary` Pydantic model in `backend/app/models/deep_memory.py`

---

## Phase 9: Broaden Generation Blocking to All Non-Completed Runs [US8]

**Goal**: Disable "Generate Training Data" when any run exists in a non-completed status — not just failed runs. Prevents starting new generation while a run is actively generating, awaiting review, or training.

**Independent test**: With a `generated` run in DB → verify Generate button is disabled with appropriate message → complete or remove the run → verify button becomes enabled. Same for `generating` and `training` statuses.

**Depends on**: T017 (original blocking implementation), T025 (dashboard already references `has_failed_run`)

- [x] T028 [P] [US8] Rename settings response fields in `backend/app/models/deep_memory.py`
  - In `DeepMemorySettingsResponse`, rename: `has_failed_run: bool = False` → `has_blocking_run: bool = False`, `failed_run_id: str | None = None` → `blocking_run_id: str | None = None`, `failed_run_status: str | None = None` → `blocking_run_status: str | None = None`

- [x] T029 [US8] Update generate endpoint blocking query in `backend/app/routers/deep_memory.py`
  - In `start_generation`, change the blocking query from `.in_("status", ["generating_failed", "training_failed"])` to `.neq("status", "completed")`
  - Update 409 response: `"detail": "Cannot start new generation: an unfinished training run exists"`, rename fields `"failed_run_id"` → `"blocking_run_id"`, `"failed_status"` → `"blocking_run_status"`

- [x] T030 [US8] Update settings endpoint blocking query in `backend/app/routers/deep_memory.py`
  - In `get_settings_endpoint`, change the blocking query from `.in_("status", ["generating_failed", "training_failed"])` to `.neq("status", "completed")`
  - Rename all local variables: `has_failed_run` → `has_blocking_run`, `failed_run_id` → `blocking_run_id`, `failed_run_status` → `blocking_run_status`
  - Update both return statements to use new field names

- [x] T031 [P] [US8] Rename fields in `next-frontend/lib/types/deep-memory.ts`
  - In `DeepMemorySettings` interface, rename: `has_failed_run: boolean` → `has_blocking_run: boolean`, `failed_run_id: string | null` → `blocking_run_id: string | null`, `failed_run_status: string | null` → `blocking_run_status: string | null`

- [x] T032 [US8] Update dashboard blocking references in `next-frontend/app/dashboard/deep-memory/page.tsx`
  - Replace all `settings?.has_failed_run` → `settings?.has_blocking_run`
  - Replace `settings.failed_run_status` → `settings.blocking_run_status`
  - Update the blocking message text to be status-aware:
    - For `generating`: "A training run is currently generating data."
    - For `generated`: "A training run is awaiting review. Complete or remove it before starting a new generation."
    - For `training`: "A training run is currently training Deep Memory."
    - For `generating_failed` / `training_failed`: "A failed training run must be resolved before starting new generation. Use Proceed to resume or Delete to clean up."
  - The message should be derived from `settings.blocking_run_status`

---

## Phase 10: Cloud-Only Gate for Deep Memory Page [US9]

**Goal**: Hide all Deep Memory Training page content when the vector store is not cloud-based, showing a warning instead.

**Independent test**: Set `DEEPLAKE_PATH` to a local path → load Deep Memory page → verify only header and warning shown. Set to `hub://...` → verify full page renders.

**Depends on**: None (independent of other phases, but modifies same files)

- [x] T033 [P] [US9] Add `is_cloud` field to `DeepMemorySettingsResponse` in `backend/app/models/deep_memory.py`
  - Add `is_cloud: bool = True` to `DeepMemorySettingsResponse`

- [x] T034 [US9] Pass `is_cloud` from vectorstore to settings response in `backend/app/routers/deep_memory.py`
  - In `get_settings_endpoint`, after `vectorstore = VectorStoreService(settings)` (already exists), use `vectorstore._is_cloud`
  - Add `is_cloud=vectorstore._is_cloud` to both `DeepMemorySettingsResponse(...)` return statements

- [x] T035 [P] [US9] Add `is_cloud` field to `DeepMemorySettings` in `next-frontend/lib/types/deep-memory.ts`
  - Add `is_cloud: boolean` to the `DeepMemorySettings` interface

- [x] T036 [US9] Add cloud-only gate to Deep Memory page in `next-frontend/app/dashboard/deep-memory/page.tsx`
  - After the page header section and error alert, add a conditional check: `if (settings && !settings.is_cloud)`
  - When `is_cloud` is `false`: render only the page header (Brain icon + title), then a warning `Alert` with text like "Deep Memory is only available with DeepLake Cloud. Configure your vector store with a `hub://` path to enable this feature."
  - All cards below (Settings, Training Workflow, Training History) and the new-chunks alert are hidden
  - When `is_cloud` is `true` or settings not loaded yet: render existing page content unchanged

---

## Dependencies

```
T001 (migration) ─► T002, T003 (backend status changes depend on new CHECK constraint)
T002, T003 ─► T008 (proceed endpoint needs correct statuses)
T002, T003 ─► T013 (delete endpoint needs correct statuses)
T007 ─► T008 (models before endpoint)
T008 ─► T010, T011 (proxy and client after backend)
T009, T010, T011 ─► T012 (dashboard after client)
T013 ─► T014, T015 (proxy and client after backend)
T014, T015 ─► T016 (dashboard after client)
T004, T005, T006 can run in parallel with T002, T003 (frontend status display is independent)
T017, T018 can run after T002, T003 (blocking depends on new statuses existing)
T021 ─► T022 (refresh callback depends on Progress column existing)
T022 ─► T023 (dashboard callback depends on component accepting prop)
T026, T027 can run in parallel (TS type and backend model — different files)
T022, T023, T026, T027 ─► T024 (expandable row needs refresh callback, error_message in summary)
T024 ─► T025 (dashboard changes depend on component accepting new props)
T028, T031 can run in parallel (backend model + TS type — different files)
T028 ─► T029, T030 (model rename before endpoint updates)
T031 ─► T032 (TS type rename before dashboard update)
T029, T030 can run in parallel (different sections of same file, independent queries)
T025 ─► T032 (dashboard must have new callback wiring before blocking rename)
T033 ─► T034 (model before endpoint)
T035 ─► T036 (TS type before dashboard)
T033, T035 can run in parallel (backend model + TS type — different files)
```

## Parallel Execution Opportunities

**After T001 (migration)**:
- Batch A: T002 + T003 (backend status changes — different files)
- Batch B: T004 + T005 + T006 (frontend status display — different files)
- These two batches can run simultaneously

**After T002 + T003**:
- T007 + T009 + T010 + T011 (models + types + proxy + client — all independent files)
- T014 + T015 (delete proxy + client — independent of proceed)

**Phase 7 + 8 prep** (after T021):
- T022 + T023 (refresh callback — component then dashboard)
- T026 + T027 in parallel (TS type + backend model for error_message)
- Then T024 → T025 (expandable row → dashboard wiring)

**Phase 9** (after T025):
- Batch A: T028 + T031 (backend model rename + TS type rename — different files)
- After T028: T029 + T030 in parallel (both in router but independent functions)
- After T031: T032 (dashboard update)

**Phase 10** (independent):
- Batch A: T033 + T035 (backend model + TS type — different files)
- After T033: T034 (endpoint update)
- After T035: T036 (dashboard gate)

**Sequential chains**:
- T007 → T008 → T012 (proceed: models → endpoint → dashboard)
- T013 → T016 (delete: endpoint → dashboard)
- T017 → T018 (blocking: backend → frontend)
- T022 → T023 → T024 → T025 (refresh → expandable row → dashboard)
- T028 → T029/T030, T031 → T032 (blocking rename)
- T033 → T034, T035 → T036 (cloud-only gate)

## Implementation Strategy

**MVP (Phase 1 + 2)**: Status transitions alone provide visibility into which phase failed — immediately useful even without proceed/remove UI.

**Incremental delivery**:
1. Phase 1 + 2: Users can see `generating_failed` / `training_failed` in history
2. Phase 3: Users can resume failed runs (highest value add)
3. Phase 4: Users can clean up failed runs
4. Phase 5: Prevents confusing state from starting new runs with unresolved failures
5. Phase 6: UX fixes (progress labels, proceed flow, history progress column)
6. Phase 7: Refresh icon callback setup
7. Phase 8: Expandable rows with inline actions (Refresh, Proceed, Delete) — replaces Workflow card alert
8. Phase 9: Broaden generation blocking to all non-completed runs
9. Phase 10: Cloud-only gate — hide page when DeepLake is local
