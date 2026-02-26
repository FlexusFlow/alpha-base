# ALP-007 Quickstart

## What's Changing

The single shared DeepLake vector store is replaced with per-user datasets. Each user gets `hub://<org>/user-<user_id>` as their isolated knowledge base.

## Key Files to Modify

1. **`backend/app/services/vectorstore.py`** — Add `get_user_vectorstore()` factory, update `__init__` to accept dynamic path, add `cleanup_user_vectorstore()`
2. **`backend/app/config.py`** — Change `deeplake_path` semantics from full dataset path to org prefix
3. **`backend/app/services/chat.py`** — Make `user_id` required in `ChatService`, create vectorstore per-request using factory
4. **`backend/app/routers/knowledge.py`** — Pass `user_id` to vectorstore factory in ingestion and deletion paths
5. **`backend/app/services/training_generator.py`** — Use per-user vectorstore for chunk enumeration
6. **`backend/app/services/deep_memory_service.py`** — Use per-user vectorstore for Deep Memory training
7. **`backend/app/routers/chat.py`** — Make `user_id` required in `ChatRequest`
8. **`backend/app/models/chat.py`** — Change `user_id` from `str | None` to `str`

## No New Files Needed

This is a refactoring of existing code paths. No new routers, pages, or tables.

## No Frontend Changes

The frontend already sends `user_id` in all relevant requests. No UI changes needed.

## No Supabase Migration

No schema changes. Existing RLS policies already enforce user scoping on metadata tables.

## Development Flow

```bash
# 1. Update vectorstore service (core change)
# 2. Update config (path semantics)
# 3. Update all callers (knowledge, chat, training, deep_memory)
# 4. Update chat model (make user_id required)
# 5. Add empty-dataset handling
# 6. Add account deletion cleanup
# 7. Test with two local user datasets
```

## Testing Strategy

- Unit test: `get_user_vectorstore()` returns distinct instances for different user_ids
- Unit test: `cleanup_user_vectorstore()` clears dataset
- Integration test: Two users add different content, verify cross-user isolation in search results
- Integration test: Deep Memory training uses only the user's chunks
- Edge case: Query with no dataset yet → empty results, not an error
