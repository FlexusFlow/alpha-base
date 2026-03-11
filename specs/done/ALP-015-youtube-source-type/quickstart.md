# Quickstart: Add source_type to YouTube Chunk Metadata

## What Changed

A single metadata field `source_type: "youtube"` is added to YouTube transcript chunks during vectorization, aligning them with documentation and article chunks that already have this field.

## Files Modified

1. **`backend/app/routers/knowledge.py`** — Add `"source_type": "youtube"` to the metadata dict in `process_knowledge_job()` (around line 65-70).

## How to Verify

1. Start the backend: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
2. Trigger YouTube transcript vectorization for any video via the UI or API
3. Inspect the vector store chunks — new YouTube chunks should contain `source_type: "youtube"` in metadata
4. Existing chunks (without `source_type`) should continue to work normally in search and chat

## Tests

Run: `cd backend && uv run pytest tests/ -k knowledge`
