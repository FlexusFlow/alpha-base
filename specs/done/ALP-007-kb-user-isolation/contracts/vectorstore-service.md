# VectorStoreService API Contract

## Factory Function

```python
def get_user_vectorstore(user_id: str, settings: Settings) -> VectorStoreService:
    """Create a VectorStoreService scoped to a specific user's dataset."""
```

**Path derivation**:
- Cloud: `f"{settings.deeplake_path}/user-{user_id}"` → `hub://<org>/user-<user_id>`
- Local: `f"{settings.deeplake_path}/user-{user_id}"` → `./knowledge_base/user-<user_id>`

## VectorStoreService Methods (unchanged signatures)

All existing methods remain the same. The isolation comes from the dataset path, not from method parameters.

### add_documents(texts, metadatas) → list[str]

Splits texts into chunks and stores in the user's dataset. Creates dataset on first call.

- **Input**: `texts: list[str]`, `metadatas: list[dict]`
- **Output**: list of chunk IDs
- **Side effect**: Dataset created at `hub://<org>/user-<user_id>` if not exists

### delete_by_video_ids(video_ids) → None

Deletes chunks matching video_ids from the user's dataset.

- **Input**: `video_ids: list[str]`
- **Side effect**: Chunks removed from user's dataset only

### similarity_search(query, k, score_threshold, deep_memory) → list[tuple[Document, float]]

Searches the user's dataset.

- **Input**: `query: str`, `k: int = 5`, `score_threshold: float = 0.3`, `deep_memory: bool = False`
- **Output**: list of (Document, relevance_score) tuples
- **Constraint**: Returns only chunks from the user's dataset (enforced by dataset path, not filtering)

### get_chunk_count() → int

Returns total chunks in the user's dataset.

### get_all_chunk_ids_and_texts() → list[dict]

Returns all chunks from the user's dataset (for Deep Memory training).

### get_deep_memory_api() → DeepMemoryAPI

Returns the Deep Memory API for the user's dataset.

## Cleanup Function

```python
async def cleanup_user_vectorstore(user_id: str, settings: Settings) -> None:
    """Clear all data from a user's dataset (account deletion).
    Uses overwrite=True to preserve dataset name."""
```

## Empty Dataset Handling

When a user has no content yet (dataset doesn't exist or is empty):

- `similarity_search()`: Returns empty list `[]` — no error
- `get_chunk_count()`: Returns `0`
- `get_all_chunk_ids_and_texts()`: Returns empty list `[]`
- `get_deep_memory_api()`: Raises error if dataset doesn't exist — caller must check chunk count first
