# ALP-007: Per-User Knowledge Base Isolation

## Goal

Replace the single shared DeepLake vector store with per-user datasets so each user's knowledge base is fully isolated. Queries, ingestion, deletion, and Deep Memory training all operate within the user's own dataset.

## Technical Context

| Area | Current State | Target State |
|------|--------------|--------------|
| Vector store | Single shared dataset at `hub://<org>/<dataset>` | Per-user datasets: local `./knowledge_base/user-<user_id>`, cloud `hub://<org>/user-<user_id>` |
| VectorStoreService | Instantiated with global `settings.deeplake_path` | Instantiated per-user via `get_user_vectorstore(user_id, settings)` factory |
| Chunk metadata | `video_id`, `title`, `channel`, `source` (no user_id) | Same fields — isolation via dataset path, not metadata |
| Search scoping | Searches all content globally | Searches only the user's dataset |
| Deep Memory | Single global model | Per-user model (one per dataset) |
| user_id in ChatService | Optional — only used for Deep Memory toggle | Required — determines which dataset to query |
| Config `deeplake_path` | Full dataset path | Base path: `./knowledge_base` (local) or `hub://<org>` (cloud) |

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | Pass | Backend-only changes (Python). No frontend changes. |
| II. API-Boundary Separation | Pass | No new API boundaries. Existing endpoints unchanged. |
| III. Supabase as Source of Truth | Pass | Supabase metadata tables unchanged. Vector store isolation is additive. |
| IV. Background Jobs with Real-Time Feedback | Pass | Ingestion/training background jobs unchanged in structure — only the vectorstore target changes. |
| V. Simplicity and Pragmatism | Pass | Per-user datasets is the simplest strategy that provides true isolation. No over-engineering — no caching layer, no connection pooling, no lazy migration. |

---

## Architecture

```
                    ┌──────────────────────────────────┐
                    │  Current: Single Shared Store     │
                    │                                   │
                    │  hub://<org>/alphabase-kb         │
                    │  ├── User A's chunks              │
                    │  ├── User B's chunks              │
                    │  └── (all mixed together)         │
                    └──────────────────────────────────┘

                              ↓ becomes ↓

        ┌──────────────────┐       ┌──────────────────┐
        │  User A's Store  │       │  User B's Store  │
        │                  │       │                  │
        │  hub://<org>/    │       │  hub://<org>/    │
        │  user-<uuid-a>  │       │  user-<uuid-b>  │
        │  ├── chunks      │       │  ├── chunks      │
        │  └── deep_memory │       │  └── deep_memory │
        └──────────────────┘       └──────────────────┘
```

### Factory Pattern

```
                    ┌─────────────────────────────┐
                    │ get_user_vectorstore(        │
                    │   user_id, settings          │
                    │ ) → VectorStoreService       │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
    knowledge.py          chat.py       deep_memory_service.py
    (ingest/delete)       (RAG query)   (training)
```

All callers use the same factory. The factory builds the per-user dataset path and returns a standard `VectorStoreService` instance.

---

## Phase 1: Core — VectorStoreService Refactoring

### 1.1 Update `backend/app/config.py`

Change `deeplake_path` semantics:

```python
# BEFORE
deeplake_path: str = "./knowledge_base/deeplake_store"

# AFTER
deeplake_path: str = "./knowledge_base"  # base path (org prefix for cloud)
```

For cloud deployments: `hub://<org>` (no dataset name — appended per user).

### 1.2 Add factory function to `backend/app/services/vectorstore.py`

```python
def get_user_vectorstore(user_id: str, settings: Settings) -> VectorStoreService:
    """Create a VectorStoreService scoped to a specific user's dataset."""
    user_path = f"{settings.deeplake_path}/user-{user_id}"
    user_settings = settings.model_copy(update={"deeplake_path": user_path})
    return VectorStoreService(user_settings)
```

### 1.3 Add cleanup function to `backend/app/services/vectorstore.py`

```python
async def cleanup_user_vectorstore(user_id: str, settings: Settings) -> None:
    """Clear all data from a user's dataset (for account deletion).
    Uses overwrite=True to preserve the dataset name on DeepLake Cloud."""
    user_path = f"{settings.deeplake_path}/user-{user_id}"
    embeddings = OpenAIEmbeddings(model=settings.embedding_model)
    kwargs = {
        "dataset_path": user_path,
        "embedding_function": embeddings,
        "overwrite": True,
    }
    if user_path.startswith("hub://"):
        kwargs["runtime"] = {"tensor_db": True}
        kwargs["token"] = settings.activeloop_token
    await asyncio.to_thread(DeeplakeVectorStore, **kwargs)
```

### 1.4 Handle empty/non-existent datasets

Update `similarity_search` to return `[]` gracefully when the dataset doesn't exist (new user with no content). Add a `dataset_exists()` check or catch the appropriate exception.

---

## Phase 2: Callers — Propagate user_id to VectorStoreService

### 2.1 Update `backend/app/models/chat.py`

```python
# BEFORE
user_id: str | None = None

# AFTER
user_id: str
```

### 2.2 Update `backend/app/services/chat.py`

- Accept `user_id` as a required parameter in `ChatService.__init__` or `_retrieve_context`
- Replace `self.vectorstore = VectorStoreService(settings)` with per-request instantiation via `get_user_vectorstore(user_id, settings)`
- Keep Deep Memory settings lookup (already uses `user_id`)

### 2.3 Update `backend/app/routers/knowledge.py` — Ingestion

In `process_knowledge_job()`:

```python
# BEFORE (line ~99)
vectorstore = VectorStoreService(settings)

# AFTER
vectorstore = get_user_vectorstore(user_id, settings)
```

`user_id` is already a parameter of `process_knowledge_job` — just needs to be passed to the factory.

### 2.4 Update `backend/app/routers/knowledge.py` — Deletion

In `_delete_single_channel()`:

```python
# BEFORE
vectorstore = VectorStoreService(settings)

# AFTER
vectorstore = get_user_vectorstore(user_id, settings)
```

`user_id` is already available from the Supabase query scope.

### 2.5 Update `backend/app/services/training_generator.py`

```python
# BEFORE (line ~54)
vectorstore = VectorStoreService(settings)
all_chunks = vectorstore.get_all_chunk_ids_and_texts()

# AFTER
vectorstore = get_user_vectorstore(user_id, settings)
all_chunks = vectorstore.get_all_chunk_ids_and_texts()
```

`user_id` is fetched from the training run record — already available.

### 2.6 Update `backend/app/services/deep_memory_service.py`

```python
# BEFORE
vectorstore = VectorStoreService(settings)
deep_memory_api = vectorstore.get_deep_memory_api()

# AFTER
vectorstore = get_user_vectorstore(user_id, settings)
deep_memory_api = vectorstore.get_deep_memory_api()
```

`user_id` is loaded from the training run record.

### 2.7 Add chunk count warning for Deep Memory training

In `training_generator.py` or `deep_memory_service.py`, before training:

```python
chunk_count = vectorstore.get_chunk_count()
if chunk_count < 50:
    # Set a warning flag on the training run record
    # UI will display: "Your knowledge base has fewer than 50 chunks. Training results may be poor."
```

---

## Phase 3: Chat Router & Public API

### 3.1 Update `backend/app/routers/chat.py`

- `ChatRequest.user_id` is now required (non-optional)
- Pass to `ChatService` which uses it for vectorstore scoping

### 3.2 Update `backend/app/routers/public_query.py`

- No code changes needed — `user_id` is already extracted from the verified API key
- `ChatService._retrieve_context(question, user_id=user_id)` will now scope to the user's dataset automatically

### 3.3 Empty knowledge base response

When `_retrieve_context` returns no results (empty dataset):
- Dashboard chat: Return a helpful message like "No content found in your knowledge base. Add YouTube channels or articles to get started."
- Public API: Return `{"answer": "No knowledge base content available.", "sources": []}`

---

## Phase 4: Account Deletion Cleanup

### 4.1 Trigger mechanism

Option A (recommended): Add a Supabase database webhook or Edge Function that fires on `auth.users` DELETE, calling a backend endpoint to clean up the user's dataset.

Option B: Application-level — when the frontend triggers account deletion, it also calls a backend cleanup endpoint.

Endpoint: `DELETE /v1/api/internal/user-cleanup/{user_id}` (internal, not publicly exposed)

### 4.2 Implementation

```python
@router.delete("/internal/user-cleanup/{user_id}")
async def cleanup_user_data(user_id: str, settings: Settings = Depends(get_settings)):
    await cleanup_user_vectorstore(user_id, settings)
    return {"status": "ok"}
```

---

## Phase 5: Testing

### 5.1 Unit tests

- `test_get_user_vectorstore`: Different user_ids → different dataset paths
- `test_cleanup_user_vectorstore`: Dataset cleared after cleanup
- `test_empty_dataset_search`: Returns `[]`, no exception

### 5.2 Integration tests

- Two users add different content → User A's query returns only User A's content
- User A deletes a channel → User B's content unaffected
- Deep Memory training for User A enumerates only User A's chunks
- Public API query with User A's key → only User A's content

### 5.3 Edge case tests

- Query with nonexistent dataset (new user) → empty results, helpful message
- Deep Memory training with <50 chunks → warning logged, training proceeds
- Account deletion → dataset cleared, subsequent queries return empty

---

## Implementation Order

| # | Task | Files | Dependencies |
|---|------|-------|--------------|
| 1 | Update config semantics (deeplake_path → base path) | `backend/app/config.py` | — |
| 2 | Add `get_user_vectorstore` factory + `cleanup_user_vectorstore` | `backend/app/services/vectorstore.py` | #1 |
| 3 | Add empty dataset handling in VectorStoreService | `backend/app/services/vectorstore.py` | #2 |
| 4 | Make `user_id` required in ChatRequest model | `backend/app/models/chat.py` | — |
| 5 | Update ChatService to use per-user vectorstore | `backend/app/services/chat.py` | #2, #4 |
| 6 | Update knowledge router (ingestion path) | `backend/app/routers/knowledge.py` | #2 |
| 7 | Update knowledge router (deletion path) | `backend/app/routers/knowledge.py` | #2 |
| 8 | Update training_generator to use per-user vectorstore | `backend/app/services/training_generator.py` | #2 |
| 9 | Update deep_memory_service to use per-user vectorstore | `backend/app/services/deep_memory_service.py` | #2 |
| 10 | Add <50 chunk warning for Deep Memory training | `backend/app/services/training_generator.py` | #8 |
| 11 | Add empty KB response message in chat | `backend/app/services/chat.py` | #5 |
| 12 | Add account deletion cleanup endpoint | `backend/app/routers/` (new or existing) | #2 |
| 13 | Tests | `backend/tests/` | #1–#12 |

---

## Out of Scope for This Implementation

- Frontend changes (none needed — user_id already sent in all requests)
- Supabase schema changes (none needed)
- Connection pooling or caching of VectorStoreService instances (premature optimization)
- Rate limiting on dataset creation (trust Supabase auth)
- Monitoring dashboard for per-user dataset sizes
