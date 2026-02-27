# ALP-007 Data Model

## Entities

### DeepLake Dataset (per user)

Each user gets their own DeepLake Cloud dataset. No Supabase table needed — the dataset existence IS the partition record.

| Property | Type | Description |
|----------|------|-------------|
| dataset_path | string | `hub://<org>/user-<user_id>` |
| tensors | auto | `text`, `embedding`, `ids`, `metadata` (created by langchain-deeplake on first write) |
| deep_memory_model | auto | Trained model stored alongside dataset (created by `.deep_memory.train()`) |

**Lifecycle**:
- Created lazily on first `add_texts()` call during video vectorization
- Queried on every RAG chat and public API request
- Cleared via `overwrite=True` on account deletion

### Vector Chunk Metadata (per chunk, stored in DeepLake)

Existing metadata fields — unchanged from current implementation:

| Field | Type | Description |
|-------|------|-------------|
| video_id | string | YouTube video ID (links to `videos.video_id` in Supabase) |
| title | string | Video title |
| channel | string | Channel name |
| source | string | URL to original video |

**Note**: `user_id` is NOT stored in chunk metadata. Isolation is achieved by separate datasets, not metadata filtering.

### Existing Supabase Tables (unchanged)

These tables already enforce user scoping via RLS. No schema changes needed:

- **channels**: `user_id` FK, RLS enforced
- **videos**: `user_id` FK, RLS enforced, `video_id` field links to DeepLake chunk metadata
- **projects** / **chat_messages**: `user_id` FK via projects
- **articles**: `user_id` FK, RLS enforced
- **deep_memory_training_runs**: `user_id` FK
- **deep_memory_training_pairs**: linked via `training_run_id`
- **deep_memory_settings**: `user_id` UNIQUE
- **api_keys**: `user_id` FK (ZIP-006)

## Configuration Changes

### `backend/app/config.py`

| Setting | Current | New |
|---------|---------|-----|
| `deeplake_path` | `"./knowledge_base/deeplake_store"` (full path) | `"hub://<org>"` (org prefix only) |

The per-user dataset path is derived at runtime: `f"{settings.deeplake_path}/user-{user_id}"`

For local development, the pattern becomes: `f"./knowledge_base/user-{user_id}"`

## State Transitions

```
User signs up
  → (no dataset yet — created lazily)
  → User adds channel + transcribes videos
    → First add_texts() call creates dataset at hub://<org>/user-<user_id>
    → Subsequent transcriptions write to existing dataset
  → User queries RAG chat
    → VectorStoreService opens user's dataset (read_only=True)
    → similarity_search returns only user's content
  → User triggers Deep Memory training
    → get_all_chunk_ids_and_texts() returns only user's chunks
    → deep_memory.train() creates model scoped to user's dataset
  → User deletes channel
    → delete_by_video_ids() removes chunks from user's dataset only
  → User account deleted
    → overwrite=True clears user's dataset (preserves name)
```
