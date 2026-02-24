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
