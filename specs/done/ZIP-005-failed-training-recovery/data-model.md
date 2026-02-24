# Data Model: ZIP-005 Failed Training Data Generation Recovery

## Entity Relationship Diagram

```
auth.users (existing)
    │
    └── 1:N ──► deep_memory_training_runs (modified)
                    │
                    └── 1:N ──► deep_memory_training_pairs (unchanged)
```

## Tables

### deep_memory_training_runs (modified)

Only the `status` CHECK constraint changes. All columns remain the same.

| Column           | Type         | Constraints                                  | Change     |
|------------------|--------------|----------------------------------------------|------------|
| id               | UUID         | PK, DEFAULT gen_random_uuid()                | unchanged  |
| user_id          | UUID         | FK → auth.users(id) ON DELETE CASCADE, NOT NULL | unchanged  |
| status           | TEXT         | NOT NULL, DEFAULT 'generating', CHECK (status IN ('generating', 'generated', 'training', 'completed', 'generating_failed', 'training_failed')) | **modified** |
| total_chunks     | INT          | NOT NULL, DEFAULT 0                          | unchanged  |
| processed_chunks | INT          | NOT NULL, DEFAULT 0                          | unchanged  |
| pair_count       | INT          | NOT NULL, DEFAULT 0                          | unchanged  |
| deeplake_job_id  | TEXT         |                                              | unchanged  |
| metrics          | JSONB        | DEFAULT '{}'                                 | unchanged  |
| error_message    | TEXT         |                                              | unchanged  |
| started_at       | TIMESTAMPTZ  | DEFAULT NOW()                                | unchanged  |
| completed_at     | TIMESTAMPTZ  |                                              | unchanged  |
| created_at       | TIMESTAMPTZ  | DEFAULT NOW()                                | unchanged  |

**State Transitions** (updated):
```
generating → generated → training → completed
     ↓                       ↓
generating_failed       training_failed
     ↓                       ↓
generating (proceed)    training (proceed)
     ↓                       ↓
  [deleted]              [deleted]
```

**Index**: `idx_training_runs_user_status ON (user_id, status)` — already exists, no change needed. Benefits from the new failed status queries.

**RLS Policies**: Unchanged — existing SELECT/INSERT/UPDATE/DELETE policies for `auth.uid() = user_id` cover all new operations.

### deep_memory_training_pairs (unchanged)

No changes required. CASCADE delete on `training_run_id` already handles cleanup when a failed run is removed.

### deep_memory_settings (unchanged)

No changes required.

## Migration File

`008_failed_training_statuses.sql` — follows existing numbering convention (after `007_deep_memory_training.sql`).

```sql
-- ZIP-005: Add phase-specific failure statuses
-- Replace 'failed' with 'generating_failed' and 'training_failed'

-- Step 1: Migrate existing 'failed' records to phase-specific statuses
UPDATE public.deep_memory_training_runs
SET status = 'training_failed'
WHERE status = 'failed' AND deeplake_job_id IS NOT NULL;

UPDATE public.deep_memory_training_runs
SET status = 'generating_failed'
WHERE status = 'failed' AND deeplake_job_id IS NULL;

-- Step 2: Drop old constraint and add new one
ALTER TABLE public.deep_memory_training_runs
DROP CONSTRAINT IF EXISTS deep_memory_training_runs_status_check;

ALTER TABLE public.deep_memory_training_runs
ADD CONSTRAINT deep_memory_training_runs_status_check
CHECK (status IN ('generating', 'generated', 'training', 'completed', 'generating_failed', 'training_failed'));
```
