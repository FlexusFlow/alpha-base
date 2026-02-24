# API Contracts: ZIP-003 Article Scraping Migration

## Backend (Python FastAPI) Endpoints

### POST /v1/api/articles/scrape

Initiate an async article scraping job.

**Request**:
```json
{
  "url": "https://example.com/article",
  "user_id": "uuid",
  "use_cookies": true
}
```

**Response** (202 Accepted):
```json
{
  "job_id": "uuid",
  "article_id": "uuid",
  "message": "Article scraping started"
}
```

**Errors**:
- 400: Invalid URL or SSRF-blocked address
- 401: Missing/invalid user_id

**Notes**:
- Creates article record with `status: 'pending'` immediately
- Launches background task that updates article status through `pending → scraping → completed/failed`
- Job progress available via existing SSE endpoint `/v1/api/events/stream/{job_id}`

---

## Next.js API Route Endpoints (Proxy Layer)

### POST /api/articles/scrape

Frontend proxy for article scraping. Handles auth, URL validation, cookie check.

**Request**:
```json
{
  "url": "https://example.com/article",
  "use_cookies": true
}
```

**Response** (202 Accepted):
```json
{
  "job_id": "uuid",
  "article_id": "uuid",
  "message": "Article scraping started"
}
```

**Flow**:
1. Auth check (`createClient()` → `getUser()`)
2. Validate URL (format, SSRF check)
3. If `use_cookies`, verify cookie exists for domain (optional pre-check)
4. Proxy to `POST /v1/api/articles/scrape` with `user_id` injected

---

### GET /api/articles/check-cookies?url={url}

Check if cookies exist for the given URL's domain.

**Response**:
```json
{
  "has_cookies": true,
  "domain": "medium.com"
}
```

**Flow**:
1. Auth check
2. Extract + normalize domain from URL
3. Query `user_cookies` table for user + domain (with parent fallback)

---

### Article Listing (Direct Supabase Browser Query)

Article listing is a **direct Supabase query from the browser client** (user-scoped read via RLS), per constitution Principle II. No Next.js API route is needed.

**Query**: `supabase.from('articles').select('id, url, title, status, is_truncated, created_at').order('created_at', { ascending: false }).range(offset, offset + pageSize - 1)`

**Fields returned**: `id`, `url`, `title`, `status`, `is_truncated`, `created_at`

**Pagination**: Client-side offset/limit using `.range()`

---

### GET /api/articles/{id}

Get a single article with full content.

**Response**:
```json
{
  "id": "uuid",
  "url": "https://...",
  "title": "Article Title",
  "content_markdown": "# Heading\n\n...",
  "summary": "AI summary..." | null,
  "status": "completed",
  "is_truncated": false,
  "created_at": "2026-02-22T..."
}
```

**Note**: Direct Supabase query from browser client (user-scoped read).

---

### DELETE /api/articles/{id}

Delete an article and all associated data.

**Response**:
```json
{
  "message": "Article deleted"
}
```

**Flow**:
1. Auth check
2. Delete from `articles` table (CASCADE deletes `article_chat_messages`)
3. Return success

---

### POST /api/articles/{id}/summarize

Generate or retrieve cached AI summary.

**Response**:
```json
{
  "summary": "Concise summary of the article..."
}
```

**Flow**:
1. Auth check
2. Fetch article by ID
3. If `summary` is not null, return cached
4. Call Anthropic API with article content as context
5. Store summary in `articles.summary`
6. Return summary

---

### POST /api/articles/{id}/chat

Send a question about an article.

**Request**:
```json
{
  "message": "What is the main argument?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response** (streaming):
```
data: {"token": "The"}
data: {"token": " main"}
data: {"token": " argument"}
...
data: {"done": true}
```

**Flow**:
1. Auth check
2. Fetch article content
3. Build prompt: system (article content) + history + user message
4. Stream Anthropic API response
5. After completion, save user + assistant messages to `article_chat_messages`

---

### GET /api/articles/{id}/chat/history

Load chat history for an article.

**Response**:
```json
{
  "messages": [
    { "role": "user", "content": "...", "created_at": "..." },
    { "role": "assistant", "content": "...", "created_at": "..." }
  ]
}
```

**Note**: Direct Supabase query from browser client (user-scoped read via RLS on join).

---

### DELETE /api/articles/{id}/chat/history

Clear chat history for an article.

**Response**:
```json
{
  "message": "Chat history cleared"
}
```

**Flow**:
1. Auth check
2. Delete all `article_chat_messages` where `article_id = id`
