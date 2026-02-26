# Caller Contract Changes

All callers of `VectorStoreService` must switch from direct instantiation to the factory function, passing `user_id`.

## Before → After

### knowledge.py (ingestion)

```python
# BEFORE
vectorstore = VectorStoreService(settings)
vectorstore.add_documents(transcripts, metadatas)

# AFTER
vectorstore = get_user_vectorstore(user_id, settings)
vectorstore.add_documents(transcripts, metadatas)
```

### knowledge.py (deletion)

```python
# BEFORE
vectorstore = VectorStoreService(settings)
vectorstore.delete_by_video_ids(video_ids)

# AFTER
vectorstore = get_user_vectorstore(user_id, settings)
vectorstore.delete_by_video_ids(video_ids)
```

### chat.py (RAG query)

```python
# BEFORE (in ChatService.__init__)
self.vectorstore = VectorStoreService(settings)

# AFTER (in ChatService.__init__)
# Remove vectorstore from __init__; accept user_id parameter

# BEFORE (in _retrieve_context)
results = await self.vectorstore.similarity_search(...)

# AFTER (in _retrieve_context, user_id is required, not optional)
vectorstore = get_user_vectorstore(user_id, settings)
results = await vectorstore.similarity_search(...)
```

### chat.py router

```python
# BEFORE
chat_service = ChatService(settings, supabase=supabase)
# user_id only used for Deep Memory settings lookup

# AFTER
chat_service = ChatService(settings, supabase=supabase)
# user_id now required — used for both vectorstore scoping AND Deep Memory settings
```

### public_query.py

```python
# BEFORE
chat_service = ChatService(settings, supabase=supabase)
context, sources = await chat_service._retrieve_context(request.question, user_id=user_id)

# AFTER (no change in router — user_id already extracted from API key)
# ChatService internally uses user_id for vectorstore scoping
```

### training_generator.py

```python
# BEFORE
vectorstore = VectorStoreService(settings)
all_chunks = vectorstore.get_all_chunk_ids_and_texts()  # returns ALL users' chunks

# AFTER
vectorstore = get_user_vectorstore(user_id, settings)
all_chunks = vectorstore.get_all_chunk_ids_and_texts()   # returns only this user's chunks
```

### deep_memory_service.py

```python
# BEFORE
vectorstore = VectorStoreService(settings)
deep_memory_api = vectorstore.get_deep_memory_api()  # global model

# AFTER
vectorstore = get_user_vectorstore(user_id, settings)
deep_memory_api = vectorstore.get_deep_memory_api()   # user-scoped model
```

## user_id Requirement Changes

| Caller | user_id before | user_id after |
|--------|---------------|---------------|
| `ChatService._retrieve_context()` | `Optional[str]` (only for Deep Memory toggle) | `str` (required — determines dataset) |
| `ChatService.stream()` | `Optional[str]` | `str` (required) |
| `ChatRequest` model | `user_id: str \| None = None` | `user_id: str` (required) |
| `process_knowledge_job()` | Available but not passed to vectorstore | Passed to `get_user_vectorstore()` |
| `_delete_single_channel()` | Available, used for Supabase scope only | Also passed to `get_user_vectorstore()` |
