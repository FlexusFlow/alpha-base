# API Contracts: ALP-008 Documentation Site Scraping

**Created**: 2026-02-26

## Backend Endpoints (FastAPI)

### POST `/v1/api/documentation/discover`

Discover documentation pages from an entry URL. Synchronous response.

**Request**:
```json
{
  "url": "https://sirv.com/help/section/360-spin/",
  "user_id": "uuid",
  "use_cookies": true
}
```

**Response 200**:
```json
{
  "entry_url": "https://sirv.com/help/section/360-spin/",
  "scope_path": "/help/section/360-spin/",
  "site_name": "Sirv Help - 360 Spin",
  "pages": [
    {
      "url": "https://sirv.com/help/section/360-spin/",
      "title": "360 Spin Overview"
    },
    {
      "url": "https://sirv.com/help/section/360-spin/getting-started/",
      "title": "Getting Started"
    }
  ],
  "total_count": 23,
  "truncated": false,
  "has_cookies": true
}
```

**Response 200 (truncated)**:
```json
{
  "entry_url": "...",
  "scope_path": "...",
  "site_name": "...",
  "pages": ["... first 100 pages ..."],
  "total_count": 100,
  "truncated": true,
  "original_count": 247,
  "has_cookies": false
}
```

**Response 400**:
```json
{
  "detail": "Invalid URL format" | "URL blocked by SSRF protection"
}
```

**Response 422**:
```json
{
  "detail": "No documentation pages found at this URL"
}
```

---

### POST `/v1/api/documentation/scrape`

Start bulk scraping of discovered pages. Returns immediately with job_id.

**Request**:
```json
{
  "user_id": "uuid",
  "entry_url": "https://sirv.com/help/section/360-spin/",
  "site_name": "Sirv Help - 360 Spin",
  "scope_path": "/help/section/360-spin/",
  "pages": [
    { "url": "https://sirv.com/help/section/360-spin/", "title": "360 Spin Overview" },
    { "url": "https://sirv.com/help/section/360-spin/getting-started/", "title": "Getting Started" }
  ],
  "use_cookies": true
}
```

**Response 202**:
```json
{
  "job_id": "uuid",
  "collection_id": "uuid",
  "message": "Scraping 23 documentation pages..."
}
```

**SSE Progress Events** (via `/v1/api/events/stream/{job_id}`):

```json
{
  "id": "job_id",
  "status": "in_progress",
  "progress": 35,
  "total_pages": 23,
  "processed_pages": 8,
  "failed_pages": ["uuid-of-failed-page"],
  "succeeded_pages": ["uuid1", "uuid2", "..."],
  "message": "Scraping page 8 of 23..."
}
```

**SSE Completion Event**:
```json
{
  "id": "job_id",
  "status": "completed" | "partial" | "failed",
  "progress": 100,
  "total_pages": 23,
  "processed_pages": 23,
  "failed_pages": ["uuid1"],
  "succeeded_pages": ["uuid2", "uuid3", "..."],
  "message": "Completed: 22 of 23 pages scraped successfully"
}
```

---

### POST `/v1/api/documentation/{collection_id}/retry`

Retry scraping failed pages in a collection.

**Request**:
```json
{
  "user_id": "uuid"
}
```

**Response 202**:
```json
{
  "job_id": "uuid",
  "collection_id": "uuid",
  "retry_count": 3,
  "message": "Retrying 3 failed pages..."
}
```

**Response 404**:
```json
{
  "detail": "Collection not found"
}
```

**Response 400**:
```json
{
  "detail": "No failed pages to retry"
}
```

---

### DELETE `/v1/api/documentation/{collection_id}`

Delete a documentation collection and all associated data.

**Request**:
```json
{
  "user_id": "uuid"
}
```

**Response 200**:
```json
{
  "message": "Collection deleted",
  "pages_deleted": 23,
  "vectors_deleted": true
}
```

---

### GET `/v1/api/documentation/{collection_id}/pages`

List pages in a collection.

**Response 200**:
```json
{
  "collection_id": "uuid",
  "pages": [
    {
      "id": "uuid",
      "page_url": "https://...",
      "title": "Getting Started",
      "status": "completed",
      "is_truncated": false,
      "display_order": 1
    }
  ]
}
```

---

## Frontend API Routes (Next.js Proxy)

### POST `/api/documentation/discover`

**Proxy to**: `POST /v1/api/documentation/discover`

**Auth**: Injects `user_id` from Supabase session.

**Additional validation**: SSRF protection (block private IPs, localhost).

---

### POST `/api/documentation/scrape`

**Proxy to**: `POST /v1/api/documentation/scrape`

**Auth**: Injects `user_id` from Supabase session.

---

### POST `/api/documentation/[id]/retry`

**Proxy to**: `POST /v1/api/documentation/{collection_id}/retry`

**Auth**: Injects `user_id` from Supabase session.

---

### DELETE `/api/documentation/[id]`

**Proxy to**: `DELETE /v1/api/documentation/{collection_id}`

**Auth**: Injects `user_id` from Supabase session.

---

### GET `/api/documentation/check-cookies`

**Query param**: `?url=<entry_url>`

**Response 200**:
```json
{
  "has_cookies": true,
  "domain": "sirv.com"
}
```

**Implementation**: Same pattern as `/api/articles/check-cookies` — query `user_cookies` table with domain + parent domain fallback.
