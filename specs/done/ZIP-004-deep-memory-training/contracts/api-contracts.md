# API Contracts: ZIP-004 Deep Memory Training

## Python Backend Endpoints (`/v1/api/deep-memory/`)

### POST `/v1/api/deep-memory/generate`

Start training data generation from existing transcript chunks.

**Request**:
```json
{
  "user_id": "uuid"
}
```

**Response** (202 Accepted):
```json
{
  "job_id": "uuid",
  "training_run_id": "uuid",
  "total_chunks": 1200,
  "message": "Training data generation started"
}
```

**Background behavior**:
- Creates `deep_memory_training_runs` record (status=`generating`)
- Iterates all chunks in DeepLake vector store
- For each chunk, calls OpenAI to generate 3-5 questions
- Stores pairs in `deep_memory_training_pairs`
- Updates progress via JobManager SSE
- Sets status to `generated` on completion, `failed` on error

**SSE Events** (via existing `/v1/api/events/stream/{job_id}`):
```json
{
  "status": "generating",
  "processed_chunks": 45,
  "total_chunks": 1200,
  "pair_count": 180,
  "progress": 4
}
```

---

### POST `/v1/api/deep-memory/train`

Start Deep Memory training with approved training data.

**Request**:
```json
{
  "training_run_id": "uuid",
  "user_id": "uuid"
}
```

**Response** (202 Accepted):
```json
{
  "job_id": "uuid",
  "training_run_id": "uuid",
  "message": "Deep Memory training started"
}
```

**Preconditions**: Training run must be in `generated` status.

**Background behavior**:
- Loads training pairs for the run from Supabase
- Formats into `queries` and `relevance` lists
- Calls `db.vectorstore.deep_memory.train(queries, relevance)`
- Polls `deep_memory.status()` and reports via SSE
- On completion, runs `deep_memory.evaluate()` and stores metrics
- Sets status to `completed` with metrics, or `failed` with error

**SSE Events**:
```json
{
  "status": "training",
  "message": "Deep Memory training in progress",
  "progress": 60
}
```

Completion event:
```json
{
  "status": "completed",
  "metrics": {
    "recall@1": 0.45,
    "recall@3": 0.68,
    "recall@5": 0.76,
    "recall@10": 0.85
  }
}
```

---

### GET `/v1/api/deep-memory/runs`

List training runs for the current user.

**Query params**: None (returns all runs for user, ordered by created_at DESC)

**Response** (200):
```json
{
  "runs": [
    {
      "id": "uuid",
      "status": "completed",
      "pair_count": 3500,
      "metrics": {"recall@1": 0.45, "recall@10": 0.85},
      "started_at": "2026-02-23T10:00:00Z",
      "completed_at": "2026-02-23T10:12:00Z"
    }
  ]
}
```

---

### GET `/v1/api/deep-memory/runs/{run_id}`

Get details for a specific training run including sample pairs.

**Response** (200):
```json
{
  "id": "uuid",
  "status": "generated",
  "total_chunks": 1200,
  "processed_chunks": 1200,
  "pair_count": 4200,
  "metrics": {},
  "error_message": null,
  "started_at": "2026-02-23T10:00:00Z",
  "completed_at": null,
  "sample_pairs": [
    {
      "question_text": "What is an iron condor options strategy?",
      "chunk_preview": "An iron condor is a four-legged options strategy that...",
      "relevance_score": 1.0
    }
  ],
  "statistics": {
    "avg_questions_per_chunk": 3.5,
    "chunk_coverage_pct": 100
  }
}
```

---

### GET `/v1/api/deep-memory/settings`

Get Deep Memory settings.

**Response** (200):
```json
{
  "enabled": true,
  "last_trained_at": "2026-02-23T10:12:00Z",
  "last_training_run_id": "uuid",
  "can_enable": true,
  "total_chunks": 1200,
  "trained_chunk_count": 1100
}
```

- `can_enable` is `true` if at least one training run has status `completed`.
- `total_chunks`: current count of chunks in DeepLake vector store.
- `trained_chunk_count`: unique chunk_ids covered by pairs in the last completed training run. Frontend computes `total_chunks - trained_chunk_count` for "new chunks" indicator.

---

### PUT `/v1/api/deep-memory/settings`

Update Deep Memory settings (toggle on/off).

**Request**:
```json
{
  "enabled": true,
  "user_id": "uuid"
}
```

**Response** (200):
```json
{
  "enabled": true,
  "message": "Deep Memory search enabled"
}
```

**Preconditions**: Cannot set `enabled=true` if no completed training run exists.

---

## Next.js API Routes (BFF Layer)

### POST `/api/deep-memory/generate`

Proxy to backend. Passes authenticated `user_id` from Supabase session.

### POST `/api/deep-memory/train`

Proxy to backend. Validates training_run_id belongs to user.

### GET `/api/deep-memory/runs`

Proxy to backend. Passes user_id.

### GET `/api/deep-memory/runs/[runId]`

Proxy to backend. Passes user_id.

### GET `/api/deep-memory/settings`

Proxy to backend. Passes user_id.

### PUT `/api/deep-memory/settings`

Proxy to backend. Passes user_id and enabled flag.

---

## Modified Existing Endpoints

### POST `/v1/api/chat` (existing)

**Change**: Read `deep_memory_settings.enabled` for the user before search. If enabled, pass `deep_memory=True` to `VectorStoreService.similarity_search()`.

No request/response changes — the improvement is transparent to the chat client.
