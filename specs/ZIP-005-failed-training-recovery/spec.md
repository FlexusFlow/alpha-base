# Feature Specification: Failed Training Data Generation Recovery

**Feature ID**: ZIP-005
**Branch**: `feature/ZIP-005-failed-training-recovery`
**Status**: Implemented
**Created**: 2026-02-24

## Overview

When training data generation or Deep Memory training fails mid-process (due to LLM API errors, network issues, DeepLake API failures, or unexpected data), the system currently leaves the run in a generic "failed" state with no way to recover partial progress, clean up orphaned data, or resume work. Additionally, new generation runs can be started even when a failed run exists, leading to confusion and potential data conflicts.

This feature adds proper failure handling to the Deep Memory training workflow by introducing phase-specific failure statuses (`generating_failed` and `training_failed`), allowing administrators to resume from the point of failure in either phase, remove failed runs entirely, and preventing new runs while a failed run exists.

## Problem Statement

The current Deep Memory training workflow (ZIP-004) has a gap in error recovery:

- **No phase distinction**: A single "failed" status doesn't indicate whether failure occurred during data generation or Deep Memory training, making recovery ambiguous
- **No recovery path**: When generation or training fails, the administrator's only option is to start a completely new run, losing all partially-generated training pairs
- **Orphaned data accumulation**: Failed runs leave behind training pairs in the database that serve no purpose and consume storage
- **Confusing state**: Administrators can start new generation runs while failed runs still exist, leading to ambiguity about which dataset is authoritative
- **No error visibility**: Failed runs show a truncated error message but provide no actionable guidance on whether to retry or clean up

## User Scenarios & Testing

### Scenario 1: Generation Fails Mid-Process

**Given** a training data generation run is in progress ("generating" status)
**When** an error occurs (LLM API failure, network timeout, unexpected data)
**Then** the run status transitions from "generating" to "generating_failed" with error details preserved

**Acceptance Criteria**:
- The run status is set to "generating_failed" when an unrecoverable error occurs during data generation
- The error message is stored and displayed to the administrator
- The number of successfully processed chunks and generated pairs is preserved
- The administrator is notified of the failure via the progress indicator (SSE)

### Scenario 2: Training Fails Mid-Process

**Given** a Deep Memory training run is in progress ("training" status)
**When** an error occurs (DeepLake API failure, timeout, invalid data)
**Then** the run status transitions from "training" to "training_failed" with error details preserved

**Acceptance Criteria**:
- The run status is set to "training_failed" when an error occurs during Deep Memory training
- The error message is stored and displayed to the administrator
- The DeepLake job ID and any partial metrics are preserved for diagnostics
- The administrator is notified of the failure via the progress indicator (SSE)

### Scenario 3: Administrator Retries a Failed Generation

**Given** a training run is in "generating_failed" status with partial progress
**When** the administrator chooses to proceed with generation
**Then** the system resumes generation from where it left off, skipping already-processed chunks

**Acceptance Criteria**:
- A "Proceed" action is available for runs in "generating_failed" status
- Proceeding resets the run status from "generating_failed" back to "generating"
- The system identifies which chunks were already processed (have training pairs) and skips them
- Progress resumes from the point of failure, not from the beginning
- The progress indicator shows correct totals: `total_chunks` reflects the full run (remaining + already processed), not just the remaining count
- If the retry also fails, the run returns to "generating_failed" status with an updated error message

### Scenario 4: Administrator Retries a Failed Training

**Given** a training run is in "training_failed" status
**When** the administrator chooses to proceed with training
**Then** the system re-initiates the Deep Memory training from the point it stopped

**Acceptance Criteria**:
- A "Proceed" action is available for runs in "training_failed" status
- Proceeding resets the run status from "training_failed" back to "training"
- The training process resumes using the existing approved training pairs
- Progress is reported via SSE as with a normal training run
- If the retry also fails, the run returns to "training_failed" status with an updated error message

### Scenario 5: Administrator Removes a Failed Run

**Given** a training run is in "generating_failed" or "training_failed" status
**When** the administrator chooses to remove the failed run
**Then** the run and all associated training pairs are permanently deleted

**Acceptance Criteria**:
- A "Remove" action is available for runs in either failed status
- The administrator is asked to confirm before deletion proceeds
- Removing a failed run deletes the run record and all associated training pairs (CASCADE behavior already exists in the schema)
- After removal, the system returns to a clean state ready for a new generation
- The removal action is reflected in the training history

### Scenario 6: New Generation Blocked While Non-Completed Run Exists

**Given** a training run in any status other than "completed" exists
**When** the administrator attempts to start a new generation
**Then** the system prevents the new run and directs the administrator to resolve the existing run first

**Acceptance Criteria**:
- The "Generate Training Data" button is disabled when any non-completed run exists (including "generating", "generated", "training", "generating_failed", "training_failed")
- A clear message explains why: the existing run must be completed or removed first
- Once all existing runs are completed or removed, the button becomes enabled again

## Functional Requirements

### FR-1: Phase-Specific Failure Statuses

The system must distinguish between generation-phase and training-phase failures:

1. Replace the single "failed" status with two phase-specific statuses: "generating_failed" and "training_failed"
2. When an error occurs during data generation ("generating" status), transition to "generating_failed"
3. When an error occurs during Deep Memory training ("training" status), transition to "training_failed"
4. Both failed statuses must preserve the error message, processed chunk count, and pair count
5. Update the database CHECK constraint to include the new statuses: `generating`, `generated`, `training`, `completed`, `generating_failed`, `training_failed`

### FR-2: Generation Blocking on Non-Completed Runs

The system must prevent new training data generation when any non-completed run exists:

1. Before starting a new generation, check for any runs with status other than "completed" — this includes "generating", "generated", "training", "generating_failed", and "training_failed"
2. If any non-completed run exists, reject the new generation request with a clear message
3. The check must happen both on the frontend (disable button) and backend (API validation)
4. Only "completed" runs allow new generation — all other statuses block it

### FR-3: Proceed from Generation Failure

The system must allow resuming a failed training data generation run:

1. Accept a proceed request for a run in "generating_failed" status
2. Reset the run status from "generating_failed" to "generating"
3. Clear the previous error message
4. Resume the generation pipeline, querying existing training pairs for this run to determine which chunks were already processed
5. Continue generating pairs for unprocessed chunks only
6. Set `total_chunks` to the full run total (remaining unprocessed + already processed), not just the remaining count, so progress labels display correctly as `processed/total`
7. Report progress via SSE as with a normal generation
8. If the retry fails, update the run back to "generating_failed" with the new error details

### FR-4: Proceed from Training Failure

The system must allow resuming a failed Deep Memory training run:

1. Accept a proceed request for a run in "training_failed" status
2. Reset the run status from "training_failed" to "training"
3. Clear the previous error message
4. Re-initiate the Deep Memory training API call using the existing training pairs for this run
5. Report progress via SSE as with a normal training run
6. If the retry fails, update the run back to "training_failed" with the new error details

### FR-5: Remove Failed Run

The system must allow complete cleanup of a failed training run:

1. Accept a removal request for a run in "generating_failed" or "training_failed" status
2. Delete the run record from the database (CASCADE will remove associated training pairs)
3. Return confirmation of successful removal
4. Only runs in failed statuses can be removed through this action

### FR-6: Cloud-Only Gate

The system must prevent access to Deep Memory features when the vector store is not cloud-based:

1. Add an `is_cloud` boolean field to the `DeepMemorySettingsResponse`, derived from `VectorStoreService._is_cloud`
2. The frontend Deep Memory Training page must check `is_cloud` from the settings response on load
3. When `is_cloud` is `false`, hide all page cards (Settings, Training Workflow, Training History) and display a warning Alert below the page header explaining that Deep Memory is only available with DeepLake Cloud
4. The page header (Brain icon + title) remains visible even when `is_cloud` is `false`

### FR-7: Frontend Failed Run Controls

The system must provide clear UI controls for managing failed runs:

1. Display failed runs prominently with error details and the phase where failure occurred
2. Show "Proceed" and "Remove" action buttons for runs in either failed status — displayed in an expandable area below the Training History row, not in the Training Workflow card
3. When the administrator clicks "Proceed", collapse the expanded row and show the progress indicator in the Training Workflow card — identical UX to starting a fresh generation or training
4. Disable the "Generate Training Data" button when any non-completed run exists, with an explanatory message indicating the current status of the blocking run
5. Show a confirmation dialog before removing a failed run
6. After proceeding or removal, refresh the dashboard state automatically
7. In the Training History table, show a Progress column next to Status: `processed_chunks/total_chunks` for `generating` and `generating_failed` statuses, "In progress" for `training`, last known `processed_chunks/total_chunks` for `training_failed`. Column shows "—" for terminal statuses (`completed`, `generated`)
8. For runs in `generating` or `training` status, show a refresh icon next to the progress text in the Progress column. Clicking it calls the existing `GET /runs/{run_id}` endpoint and updates only that row's progress data in place — no full page reload required
9. Training History rows with active (`generating`, `training`) or failed (`generating_failed`, `training_failed`) statuses are expandable. Clicking a row expands an area below it with action buttons and error message (if any). Accordion behavior — only one row expanded at a time. Clicking the same row collapses it.
10. The expandable area shows: Refresh button (for active statuses), Proceed button (for failed statuses), Delete button (for failed statuses), and error message text (for failed statuses). Keep it minimal — no additional run details.
11. The Training Workflow card retains: Generate button, active progress indicator, review/train steps. The failed-run alert section is removed from the Workflow card — those controls now live in the Training History expandable rows.

## Key Entities

### Training Run (extended)
- Existing entity from ZIP-004 with status field updated to: `generating`, `generated`, `training`, `completed`, `generating_failed`, `training_failed`
- **Schema change required**: The CHECK constraint on `status` must be updated to include the two new statuses
- Runs in "generating_failed" status support: proceed (resume generation) and remove (delete entirely)
- Runs in "training_failed" status support: proceed (resume training) and remove (delete entirely)
- Existing fields (`error_message`, `processed_chunks`, `pair_count`, `deeplake_job_id`) already support both recovery workflows

## Success Criteria

- **SC-1**: Administrators can identify which phase failed (generation vs training) by looking at the run status
- **SC-2**: Proceeding from a generation failure resumes from the point of failure within 30 seconds of initiating, without re-processing already-completed chunks
- **SC-3**: Proceeding from a training failure re-initiates the training process using existing training pairs without regenerating data
- **SC-4**: Removing a failed run completely cleans up all associated data (training pairs) with no orphaned records
- **SC-5**: New generation attempts are blocked while any non-completed run exists, with a clear user-facing explanation
- **SC-6**: The full recovery flow (discover failure → decide action → proceed or remove → resume normal workflow) completes in under 2 minutes
- **SC-7**: When the vector store uses a local path (not `hub://`), the Deep Memory page shows only a warning — no training controls are accessible

## Assumptions

1. The existing CASCADE delete on `deep_memory_training_pairs.training_run_id` correctly removes all associated pairs when a run is deleted
2. The existing resumability logic in the generation pipeline (checking existing pairs to skip processed chunks) works correctly and can be reused for proceed
3. Only one training run can be in an active status ("generating" or "training") at a time (existing constraint)
4. The Deep Memory training API (DeepLake) supports re-submitting the same training data after a failure — no special cleanup is needed on the DeepLake side before retrying
5. Existing "failed" status records will be migrated to the new statuses automatically via the database migration (based on `deeplake_job_id` presence to determine which phase failed)

## Dependencies

- **ZIP-004 Deep Memory Training**: This feature extends the training workflow implemented in ZIP-004. All ZIP-004 tables, services, and UI components must be in place.

## Out of Scope

- Automatic retry with exponential backoff (manual proceed only for v1)
- Chunk-level error tracking and per-chunk retry
- Error categorization or classification beyond phase distinction
- Batch cleanup of multiple failed runs (only one failed run expected at a time due to blocking rule)
- Notification via email or external channels when generation or training fails

## Clarifications

### Session 2026-02-24

- Q: Should the system distinguish between generation-phase and training-phase failures? → A: Yes. Use two distinct statuses: "generating_failed" and "training_failed" instead of a single "failed" status.
- Q: Should training-phase failures be recoverable (was previously out of scope)? → A: Yes. Both phases support "proceed" — resume from the point where the training run stopped.
- Q: What does "proceed" mean for each phase? → A: For generating_failed: resume chunk processing from where it stopped (skip already-processed chunks). For training_failed: re-initiate the Deep Memory training API call with existing training pairs.
- Q: Do both failed statuses block new generation equally? → A: Yes. Any failed run (generating_failed or training_failed) must be resolved before starting a new generation.
- Q: How should `total_chunks` and `processed_chunks` be computed on resume after `generating_failed`? → A: `total_chunks` must always represent the full chunk count for the run (remaining + already processed), so `processed/total` reads correctly (e.g., `51/80` not `51/30`).
- Q: When clicking Proceed, what should happen to the failed-run alert section? → A: The entire failed-run alert (with Proceed/Remove buttons) must be hidden immediately, replaced by the progress indicator only — same UX as starting a fresh generation/training.
- Q: Should the Training History table show inline progress for active runs? → A: Yes. Show progress for both `generating` (as `processed_chunks/total_chunks`) and `training` (as percentage) in a Progress column next to Status. Only visible for active statuses.
- Q: Should active runs in the Training History have a refresh button for progress? → A: Yes. Show a refresh icon in the Progress column for `generating` and `training` runs. Clicking it fetches updated data via the existing `GET /runs/{run_id}` endpoint and updates only that row — no full page reload.
- Q: Should the Progress column show data for failed statuses (`generating_failed`, `training_failed`) too? → A: Yes. Show the last known `processed_chunks/total_chunks` for failed statuses as well, so the administrator can see how far the run got before failure.
- Q: Where should failed-run action buttons (Proceed, Delete) live — in the Training Workflow card or in the Training History? → A: Move them to an expandable area below the clicked Training History row. The Training Workflow card keeps only the Generate button, active progress indicator, and review/train steps. The failed-run alert is removed from the Workflow card.
- Q: What should the expandable row area contain? → A: Action buttons (Refresh, Proceed, Delete as applicable) and the error message. No additional run details — keep it minimal.
- Q: Should the expandable area be available for all statuses or only specific ones? → A: Only for failed statuses (`generating_failed`, `training_failed`) and active statuses (`generating`, `training`). Terminal statuses like `completed` and `generated` do not expand.
- Q: How should row expansion work — toggle each independently, or accordion (one at a time)? → A: Accordion — clicking a row expands it and collapses any previously expanded row. Clicking the same row again collapses it.
- Q: Should only failed runs block new generation, or any non-completed run? → A: Any non-completed run blocks generation. The "Generate Training Data" button is disabled when any run exists with status `generating`, `generated`, `training`, `generating_failed`, or `training_failed`. Only `completed` runs allow new generation.
- Q: Should Deep Memory Training page be hidden when the vector store is not cloud-based? → A: Yes. When `VectorStoreService._is_cloud` is false, hide all page cards and show a warning that Deep Memory is only available with DeepLake Cloud.
- Q: Where should the `is_cloud` flag be exposed — existing settings endpoint or a new one? → A: Add it to the existing `/v1/api/deep-memory/settings` endpoint as a new `is_cloud` boolean field in `DeepMemorySettingsResponse`.
- Q: What should the warning look like when Deep Memory is unavailable? → A: Keep the page header (Brain icon + title) visible, replace all cards below with a single warning Alert explaining the requirement.
