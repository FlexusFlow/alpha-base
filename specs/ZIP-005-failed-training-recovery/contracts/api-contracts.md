# API Contracts: ZIP-005 Failed Training Data Generation Recovery

## Backend (Python FastAPI) Endpoints

### POST /v1/api/deep-memory/proceed

Resume a failed training run from the point of failure.

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
  "message": "Resuming generation from chunk 450/1200"
}
```

**Errors**:
- 400: Training run is not in a failed status (`generating_failed` or `training_failed`)
- 404: Training run not found or does not belong to user

**Notes**:
- Determines action based on current status:
  - `generating_failed` → resets to `generating`, launches generation background task (resumes from existing pairs)
  - `training_failed` → resets to `training`, launches training background task (re-submits existing pairs to DeepLake)
- Clears `error_message` before resuming
- Job progress available via existing SSE endpoint `/v1/api/events/stream/{job_id}`

---

### DELETE /v1/api/deep-memory/runs/{run_id}

Remove a failed training run and all associated data.

**Query Parameters**:
- `user_id` (required): UUID of the authenticated user

**Response** (200 OK):
```json
{
  "message": "Training run and 450 associated pairs deleted"
}
```

**Errors**:
- 400: Training run is not in a failed status (`generating_failed` or `training_failed`)
- 404: Training run not found or does not belong to user

**Notes**:
- CASCADE delete removes all associated training pairs automatically
- Only runs in `generating_failed` or `training_failed` status can be deleted through this endpoint

---

### POST /v1/api/deep-memory/generate (modified)

Existing endpoint — added validation to block new generation when any non-completed run exists.

**New Error**:
- 409: A non-completed training run exists. Must be completed or removed before starting new generation. Response includes:
```json
{
  "detail": "Cannot start new generation: an unfinished training run exists",
  "blocking_run_id": "uuid",
  "blocking_run_status": "generating"
}
```

**Notes**:
- Blocks on ALL non-completed statuses: `generating`, `generated`, `training`, `generating_failed`, `training_failed`
- Only `completed` runs allow new generation

---

### GET /v1/api/deep-memory/settings (modified)

Existing endpoint — response extended with blocking run info.

**Response** (existing fields plus):
```json
{
  "enabled": false,
  "last_trained_at": null,
  "last_training_run_id": null,
  "can_enable": false,
  "total_chunks": 1200,
  "trained_chunk_count": 0,
  "has_blocking_run": true,
  "blocking_run_id": "uuid",
  "blocking_run_status": "generating",
  "is_cloud": true
}
```

**Notes**:
- `has_blocking_run`: boolean indicating whether any non-completed run exists
- `blocking_run_id`: UUID of the blocking run (null if none)
- `blocking_run_status`: The status string of the blocking run (null if none)
- `is_cloud`: boolean indicating whether the vector store uses DeepLake Cloud (`hub://` path). When `false`, the frontend hides all Deep Memory page content and shows a warning
- Used by frontend to disable "Generate Training Data" button and show status-appropriate message

---

## Next.js API Route Endpoints (Proxy Layer)

### POST /api/deep-memory/proceed

Frontend proxy for proceeding with a failed run. Handles auth.

**Request**:
```json
{
  "training_run_id": "uuid"
}
```

**Response** (202 Accepted):
```json
{
  "job_id": "uuid",
  "training_run_id": "uuid",
  "message": "Resuming generation from chunk 450/1200"
}
```

---

### DELETE /api/deep-memory/runs/[runId]

Frontend proxy for removing a failed run. Handles auth.

**Response** (200 OK):
```json
{
  "message": "Training run and 450 associated pairs deleted"
}
```
