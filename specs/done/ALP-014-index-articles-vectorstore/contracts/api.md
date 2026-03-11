# API Contracts: Index Articles in Vector Store

**Date**: 2026-03-07

## Modified Endpoints

### POST `/v1/api/articles/scrape` (existing — modified)

**Change**: Add duplicate URL check before creating article record.

**New error response** (HTTP 409):
```json
{
  "detail": "Article with this URL already exists"
}
```

**Existing success response** (HTTP 202 — unchanged):
```json
{
  "job_id": "uuid",
  "article_id": "uuid",
  "message": "Article scraping started"
}
```

**New behavior**: After scraping completes successfully, article content is automatically chunked and indexed in the user's vector store. No response changes — indexing happens in the background task.

---

### DELETE `/v1/api/articles/{article_id}` (new endpoint)

**Authentication**: Bearer token (JWT via `get_current_user`)

**Path parameters**:
- `article_id` (string, required): UUID of the article to delete

**Success response** (HTTP 200):
```json
{
  "message": "Article deleted",
  "vectors_deleted": true
}
```

**Error responses**:
- HTTP 401: Not authenticated
- HTTP 404: Article not found or not owned by user

**Behavior**:
1. Verify article exists and belongs to authenticated user
2. Delete article chunks from user's vector store (by `article_id` metadata)
3. Update cached chunk count
4. Delete article record from Supabase (cascades to `article_chat_messages`)
5. Return result

If vector store deletion fails, log warning and proceed with DB deletion (vector store is a derived index, not source of truth).

## Internal Service Methods (VectorStoreService)

### `add_article(article_id, content_markdown, title, url)` → `int`

Chunks and indexes a single article's content. Returns number of chunks added.

**Metadata per chunk**:
```json
{
  "article_id": "<article_id>",
  "title": "<title>",
  "source_type": "article",
  "source": "<url>"
}
```

### `delete_by_article_ids(article_ids: list[str])` → `int`

Deletes all vector store chunks matching any of the given article IDs. Returns number of chunks deleted.

**Query**: `SELECT ids FROM (SELECT * WHERE metadata['article_id'] IN (...))`

## Frontend Proxy Changes

### DELETE `/api/articles/[id]` (Next.js API route — modified)

**Change**: Instead of deleting directly from Supabase, proxy the request to the backend `DELETE /v1/api/articles/{article_id}` endpoint.

**Request**: Forward the user's auth token to the backend.
**Response**: Pass through the backend response.
