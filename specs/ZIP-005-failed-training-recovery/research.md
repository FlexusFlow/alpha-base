# Research: ZIP-005 Failed Training Data Generation Recovery

## R-1: Phase-Specific Status Naming Convention

**Decision**: Use `generating_failed` and `training_failed` (underscore-separated)

**Rationale**:
- Matches user's explicit requirement from clarification session
- Underscore format is consistent with the existing status naming pattern (`generating`, `generated`, `training`, `completed`)
- The phase prefix makes it immediately clear which phase failed without needing to inspect other fields
- PostgreSQL CHECK constraint supports any string values

**Alternatives Considered**:
1. *`failed_generating` / `failed_training`* — Puts the failure aspect first. Rejected because it groups by outcome rather than phase, making `ORDER BY status` less intuitive.
2. *`failed` with a separate `failed_phase` column* — Adds schema complexity. Rejected per YAGNI — the status field alone is sufficient.
3. *Keep single `failed` with `error_phase` metadata* — Harder to query and filter. Rejected because phase-specific statuses make blocking queries simpler (`WHERE status IN ('generating_failed', 'training_failed')`).

## R-2: Training Phase Resumability — DeepLake Behavior

**Decision**: Re-submit training data to DeepLake API on retry (fresh training call)

**Rationale**:
- DeepLake's Deep Memory `train()` API is a full retrain — it doesn't support resuming a partially-completed training job
- The `deeplake_job_id` stored in the database is useful for diagnostics but not for resuming
- Re-submitting the same training data with a new `train()` call is the correct approach
- The training pairs are already generated and stored in Supabase, so no data is lost
- DeepLake Cloud handles its own cleanup of failed jobs

**Alternatives Considered**:
1. *Check DeepLake job status and resume if possible* — DeepLake's `status()` API returns terminal states only (completed/failed). No resume mechanism exists.
2. *Reuse deeplake_job_id for recovery* — Job IDs are immutable references. A failed job cannot be restarted.

## R-3: Migration Strategy for Existing "failed" Records

**Decision**: Migration script converts existing `failed` records to `generating_failed` as a safe default

**Rationale**:
- The current codebase only sets `failed` from two places: `training_generator.py` and `deep_memory_service.py`
- Without inspecting each record's `deeplake_job_id` field, we can't determine which phase failed
- Records with `deeplake_job_id IS NOT NULL` failed during training; those without failed during generation
- A simple conditional migration handles both cases correctly:
  - `deeplake_job_id IS NOT NULL` → `training_failed`
  - `deeplake_job_id IS NULL` → `generating_failed`

**Alternatives Considered**:
1. *Don't migrate — let users clean up manually* — Original assumption in spec. Rejected because the migration is trivial and prevents confusion.
2. *Delete all failed records* — Destructive and loses error history.

## R-4: Frontend Status String Handling

**Decision**: Keep status as plain `string` type (no TypeScript union) but update all hardcoded comparisons

**Rationale**:
- The existing codebase uses `string` for status in `TrainingRunSummary` and `DeepMemoryJobUpdate`
- Introducing a union type would be a beneficial refactor but is out of scope for this feature
- All status-dependent logic (badge variants, SSE terminal detection, workflow step mapping) uses direct string comparisons
- We need to update these comparisons to handle the two new statuses

**Files requiring status string updates**:
- `TrainingRunHistory.tsx`: statusVariant map — add `generating_failed` and `training_failed` with `"destructive"` variant
- `TrainingProgress.tsx`: `status === "failed"` check — change to check both new statuses
- `events.ts`: SSE auto-close on terminal status — add both new statuses
- `page.tsx`: Error handling and workflow step mapping — handle new statuses
