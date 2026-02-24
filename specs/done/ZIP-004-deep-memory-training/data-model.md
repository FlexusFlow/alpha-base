# Data Model: ZIP-004 Deep Memory Training

## New Tables

### `deep_memory_training_runs`

Tracks each Deep Memory training execution lifecycle.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` | Training run identifier |
| `user_id` | UUID | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL | User who initiated |
| `status` | TEXT | NOT NULL, CHECK IN ('generating', 'generated', 'training', 'completed', 'failed') | Current lifecycle state |
| `total_chunks` | INT | NOT NULL, DEFAULT 0 | Total chunks to process for generation |
| `processed_chunks` | INT | NOT NULL, DEFAULT 0 | Chunks processed so far |
| `pair_count` | INT | NOT NULL, DEFAULT 0 | Total training pairs generated |
| `deeplake_job_id` | TEXT | NULLABLE | Activeloop training job ID (set when training starts) |
| `metrics` | JSONB | DEFAULT '{}' | Training metrics (recall@k before/after) |
| `error_message` | TEXT | NULLABLE | Error details if failed |
| `started_at` | TIMESTAMPTZ | DEFAULT NOW() | When the run started |
| `completed_at` | TIMESTAMPTZ | NULLABLE | When the run completed |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |

**State transitions**:
```
generating → generated → training → completed
     ↓           ↓           ↓
   failed      failed      failed
```

- `generating`: LLM is producing question-chunk pairs
- `generated`: All pairs created, awaiting user approval to train
- `training`: Deep Memory train API called, awaiting completion
- `completed`: Training finished successfully
- `failed`: Any stage failed (check `error_message`)

### `deep_memory_training_pairs`

Stores generated question-chunk associations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` | Pair identifier |
| `training_run_id` | UUID | FK → `deep_memory_training_runs(id)` ON DELETE CASCADE, NOT NULL | Parent training run |
| `question_text` | TEXT | NOT NULL | Generated question |
| `chunk_id` | TEXT | NOT NULL | DeepLake document ID for the relevant chunk |
| `chunk_preview` | TEXT | NULLABLE | First 200 chars of the chunk for review display |
| `relevance_score` | FLOAT | NOT NULL, DEFAULT 1.0 | Relevance score (0-1) for training |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |

### `deep_memory_settings`

Global settings for Deep Memory feature (single row per user, effectively global until roles are added).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` | Setting identifier |
| `user_id` | UUID | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL, UNIQUE | One row per user |
| `enabled` | BOOLEAN | NOT NULL, DEFAULT FALSE | Whether Deep Memory search is active |
| `last_trained_at` | TIMESTAMPTZ | NULLABLE | Timestamp of last successful training |
| `last_training_run_id` | UUID | FK → `deep_memory_training_runs(id)`, NULLABLE | Most recent completed run |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last settings change |

## RLS Policies

All three tables follow the existing pattern:

```sql
-- All authenticated users can read/write (per clarification: no role restrictions for v1)
ALTER TABLE deep_memory_training_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own training runs"
  ON deep_memory_training_runs FOR ALL
  USING (auth.uid() = user_id);

ALTER TABLE deep_memory_training_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage training pairs via run ownership"
  ON deep_memory_training_pairs FOR ALL
  USING (training_run_id IN (
    SELECT id FROM deep_memory_training_runs WHERE user_id = auth.uid()
  ));

ALTER TABLE deep_memory_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own settings"
  ON deep_memory_settings FOR ALL
  USING (auth.uid() = user_id);
```

## Indexes

```sql
CREATE INDEX idx_training_pairs_run_id ON deep_memory_training_pairs(training_run_id);
CREATE INDEX idx_training_runs_user_status ON deep_memory_training_runs(user_id, status);
```

## Entity Relationships

```
auth.users
  │
  ├── deep_memory_settings (1:1)
  │     └── last_training_run_id → deep_memory_training_runs
  │
  └── deep_memory_training_runs (1:N)
        └── deep_memory_training_pairs (1:N)
```

## Migration File

**File**: `backend/supabase/migrations/007_deep_memory_training.sql`

(Follows existing naming pattern: 001, 002, 004, 006 already exist)
