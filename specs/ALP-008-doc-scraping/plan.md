# Implementation Plan: ALP-008 Documentation Site Scraping

**Feature ID**: ALP-008
**Branch**: `feature/ALP-008-doc-scraping`
**Created**: 2026-02-26

## Technical Context

| Aspect | Details |
|--------|---------|
| Backend | Python 3.12+, FastAPI, Playwright, LangChain, DeepLake |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, shadcn/ui |
| Database | Supabase (PostgreSQL + RLS) |
| Vector Store | DeepLake Cloud (per-user datasets) |
| Package Managers | uv (Python), yarn (JS) |
| Existing Infra | Article scraping (ZIP-003), Cookie management (ZIP-001/002), JobManager SSE |

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | PASS | Backend handles scraping + discovery; frontend handles UI + proxy routes |
| II. API-Boundary Separation | PASS | Next.js API routes proxy to FastAPI; no direct Supabase writes from frontend for business logic |
| III. Supabase as Source of Truth | PASS | Collections and pages stored in Supabase with RLS; vector store is secondary index |
| IV. Background Jobs with Real-Time Feedback | PASS | Bulk scrape uses BackgroundTasks + JobManager SSE; discovery is synchronous (fast enough) |
| V. Simplicity and Pragmatism | PASS | Reuses existing scraper; LLM replaces BFS crawl — simpler, more accurate |

## Architecture Overview

```
User → [Add Documentation URL]
         ↓
  Next.js API Route → FastAPI /discover (synchronous)
         ↓                    ↓
  [Preview Page List]    Playwright loads entry page
         ↓               LLM extracts doc links (no BFS)
  [User Confirms]
         ↓
  Next.js API Route → FastAPI /scrape (async, 202)
         ↓                    ↓
  SSE Progress ←──── BackgroundTask:
                      - 3 concurrent Playwright scrapers
                      - Per-page status tracking
                      - Vector store indexing on completion
         ↓
  [Collection View] ← Supabase (collections + pages)
                     ← DeepLake (searchable via RAG)
```

## Phase 1: Database & Models

### 1.1 Supabase Migration

File: `next-frontend/supabase/migrations/010_documentation_collections.sql`

- Create `doc_collections` table (see data-model.md)
- Create `doc_pages` table with CASCADE delete
- Add indexes for user_id and collection_id queries
- Enable RLS with user-scoped policies
- Add `updated_at` trigger for `doc_collections`

### 1.2 Pydantic Models

File: `backend/app/models/documentation.py`

- `DocumentationDiscoverRequest` — url, user_id, use_cookies
- `DocumentationDiscoverResponse` — entry_url, scope_path, site_name, pages list, total_count, truncated
- `DocumentationScrapeRequest` — user_id, entry_url, site_name, scope_path, pages, use_cookies
- `DocumentationScrapeResponse` — job_id, collection_id, message
- `DocumentationRetryResponse` — job_id, collection_id, retry_count, message
- `DiscoveredPage` — url, title
- `DocumentationPage` — id, page_url, title, status, etc.

## Phase 2: Backend Services

### 2.1 Documentation Crawler

File: `backend/app/services/doc_crawler.py`

**Function**: `async def discover_pages(url, cookies_json=None) -> DiscoveryResult`

1. Launch Playwright, load entry page (with cookies if provided)
2. Get full page HTML via `page.content()`
3. Extract page title — use full `<title>` text as site_name (fallback to hostname if empty)
4. **LLM link extraction**: Send page HTML to OpenAI (`gpt-4o-mini` via `AsyncOpenAI`) with the classification prompt from FR-1. The LLM returns the complete list of documentation pages — no BFS crawling needed.
5. Parse URLs from LLM response (regex extraction from `URL — description` format)
6. Normalize URLs (resolve relative, strip anchors/trailing slashes), deduplicate
7. Cap at 100 pages
8. Return list of `{url, title}` pairs

**No BFS crawling**: The entry page is treated as a table of contents. The LLM identifies all documentation links in a single pass. Removed: `_compute_scope_path()`, `_is_valid_doc_link()`, `_extract_site_name()`, BFS queue, `MAX_DEPTH`. The full page `<title>` is used as the collection name (site_name) instead of extracting a suffix.

**Helper**: `async def _filter_links_with_llm(page_html: str, base_url: str) -> list[str]`
- Sends page HTML to OpenAI with the classification prompt from FR-1
- Parses response to extract URLs via regex (`https?://[^\s)>"]+`)
- Normalizes URLs against base_url
- Falls back to all same-domain `<a href>` links if LLM call fails

### 2.2 Documentation Scraper (Orchestrator)

File: `backend/app/services/doc_scraper.py`

**Function**: `async def scrape_collection(collection_id, pages, user_id, use_cookies, supabase, job_manager)`

1. Fetch cookies once if `use_cookies=True`
2. Create semaphore for concurrency (max 3)
3. For each page (using asyncio.gather with semaphore):
   a. Update page status to `scraping`
   b. Call existing `scrape_article(url, cookies_json)`
   c. On success: update page with title, content_markdown, is_truncated, status=completed
   d. On failure: update page with error_message, status=failed
   e. Emit SSE progress event via JobManager
4. After all pages complete:
   a. Count succeeded/failed
   b. Update collection status (completed/partial/failed) and counts
   c. Index successful pages in vector store
   d. Emit SSE completion event

### 2.3 Vector Store Extension

File: `backend/app/services/vectorstore.py` (extend existing)

**New functions**:
- `add_documentation_pages(pages, collection_id, site_name, user_id)` — chunk each page's Markdown, add to DeepLake with documentation metadata
- `delete_by_collection_id(collection_id, user_id)` — filter and delete chunks by collection_id metadata

## Phase 3: Backend Router

File: `backend/app/routers/documentation.py`

Endpoints (see contracts/api-contracts.md for full request/response shapes):

1. `POST /v1/api/documentation/discover` — synchronous discovery
2. `POST /v1/api/documentation/scrape` — async scrape with SSE
3. `POST /v1/api/documentation/{collection_id}/retry` — retry failed pages
4. `DELETE /v1/api/documentation/{collection_id}` — delete collection + vectors
5. `GET /v1/api/documentation/{collection_id}/pages` — list pages

Register in `backend/app/main.py`.

## Phase 4: Frontend Types & API Routes

### 4.1 TypeScript Types

File: `next-frontend/lib/types/documentation.ts`

- `DocumentationCollection` — id, user_id, entry_url, site_name, scope_path, total_pages, successful_pages, status, error_message, created_at, updated_at
- `DocumentationPage` — id, collection_id, page_url, title, content_markdown, status, error_message, is_truncated, display_order, created_at
- `DiscoveryResponse` — entry_url, scope_path, site_name, pages, total_count, truncated, original_count, has_cookies
- `ScrapeResponse` — job_id, collection_id, message
- `DocJobStatusUpdate` — extends base job update with total_pages, processed_pages, failed_pages, succeeded_pages

### 4.2 API Proxy Routes

- `POST /api/documentation/discover/route.ts` — auth + SSRF validation + proxy
- `POST /api/documentation/scrape/route.ts` — auth + proxy
- `POST /api/documentation/[id]/retry/route.ts` — auth + proxy
- `DELETE /api/documentation/[id]/route.ts` — auth + proxy
- `GET /api/documentation/check-cookies/route.ts` — same pattern as articles

## Phase 5: Frontend Components

### 5.1 DocumentationFetchForm

File: `next-frontend/components/documentation/documentation-fetch-form.tsx`

Two-phase form:
1. **Discovery phase**: URL input + submit → loading spinner → display discovered pages list
2. **Confirmation phase**: Page list preview with count + "Scrape All" / "Cancel" buttons
3. **Scraping phase**: SSE subscription → progress toast → redirect to collection on completion

Reuses: URL validation, debounced cookie check, `subscribeToJob()`, toast notifications.

### 5.2 DocumentationList

File: `next-frontend/components/documentation/documentation-list.tsx`

Grid of collection cards on the KB hub. Each card shows:
- Site name
- Entry URL domain
- Page count (e.g., "23 pages")
- Status badge (completed/partial/failed/scraping)
- Created date
- Click → navigate to collection detail

### 5.3 DocumentationCollectionViewer

File: `next-frontend/components/documentation/documentation-collection-viewer.tsx`

Collection detail page showing:
- Header: site name, entry URL (external link), scrape date, page stats
- Status banner for partial/failed collections
- "Retry failed pages" button (visible when status=partial)
- Page list with status indicators
- "Delete collection" button with confirmation dialog

### 5.4 DocumentationPageViewer

File: `next-frontend/components/documentation/documentation-page-viewer.tsx`

Individual page view:
- Header: page title, source URL (external link)
- Truncation warning if applicable
- Rendered Markdown content (react-markdown + remark-gfm)
- Back link to collection

### 5.5 KB Hub Integration

Modify: `next-frontend/app/dashboard/knowledge/page.tsx`

- Add "Add Documentation" card/button alongside existing "Add Channel" and "Add Article"
- Add `<DocumentationList />` section below articles section

## Phase 6: Pages & Routing

New pages:
- `/dashboard/knowledge/documentation/add/page.tsx` — renders `<DocumentationFetchForm />`
- `/dashboard/knowledge/documentation/[id]/page.tsx` — renders `<DocumentationCollectionViewer />`
- `/dashboard/knowledge/documentation/[id]/pages/[pageId]/page.tsx` — renders `<DocumentationPageViewer />`

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Target site blocks scraping | 3-concurrent limit + delays; cookie support for auth; graceful per-page failure |
| Discovery misses pages (JS-rendered nav) | Playwright renders JS before extracting HTML; deeply dynamic SPAs may still miss links |
| LLM link extraction fails or times out | Fall back to all same-domain `<a href>` links extracted from page HTML |
| LLM returns non-URL content | Parse response with URL regex extraction; skip lines that don't contain valid URLs |
| Large collections slow to load | Pagination on page list; indexes on collection_id |
| Vector store deletion performance | Filter by collection_id metadata; batch deletion |
| Race condition on retry | Check collection status before starting retry; only retry if status=partial |

## Dependencies

- Existing: `article_scraper.py`, `cookie_service.py`, `url_validator.py`, `vectorstore.py`, `job_manager.py`
- New packages: None required (all dependencies already in project)
