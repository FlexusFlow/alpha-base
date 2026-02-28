# Research: ALP-008 Documentation Site Scraping

**Created**: 2026-02-26

## R-1: Discovery Strategy — LLM Link Extraction (No BFS)

**Decision**: Replace BFS crawling entirely with a single LLM call on the entry page. The entry page is treated as a table of contents — the LLM extracts all documentation links in one pass.

**Rationale**: Path-based scoping fails for documentation index pages that link to articles under different path prefixes (e.g., `/help/section/getting-started/` links to `/help/articles/*`). BFS crawling adds complexity (scope filtering, depth limits, visited tracking) and still misses cross-path links. The LLM approach is simpler, more accurate, and handles the entry-page-as-TOC pattern that most documentation sites use.

**Implementation**:
1. Load entry page with Playwright
2. Send full page HTML to OpenAI (`gpt-4o-mini`) with tested classification prompt
3. Parse URLs from LLM response, normalize, deduplicate, cap at 100
4. No recursive crawling — the LLM response is the complete page list

**Removed**: `_compute_scope_path()`, `_is_valid_doc_link()`, BFS queue, `MAX_DEPTH`, `SKIP_PATH_PATTERNS`

**Fallback**: If LLM call fails, extract all same-domain `<a href>` links from page HTML (filtered by file extension exclusions only).

**LLM choice**: Use existing OpenAI (`AsyncOpenAI`) with `gpt-4o-mini` for cost efficiency. The prompt is tested and returns structured link lists.

**Alternatives considered**:
- BFS + parent-path scoping: Fails when docs link across path prefixes; complex code
- BFS + LLM at entry page only: Unnecessary complexity — if LLM handles entry page, deeper crawling adds little value since doc index pages link to all sub-pages
- CSS content area detection (`<main>`, `<article>`): Fragile, varies per site
- Stop-list of excluded paths: Doesn't scale, requires per-site maintenance

## R-2: Page Scraping Concurrency

**Decision**: Scrape up to 3 pages concurrently with a brief delay between batches.

**Rationale**: Sequential scraping at ~2-5s per page makes 50 pages take 1.5-4 minutes — acceptable but slow. 3 concurrent workers reduce this to ~30s-1.3min while remaining polite to target servers. Most documentation sites won't rate-limit at 3 concurrent requests.

**Alternatives considered**:
- Sequential (1 at a time): Too slow for SC-1 target
- Aggressive (10 concurrent): Risk of IP blocking / rate limiting

## R-3: Reuse of Existing Scraping Infrastructure

**Decision**: Reuse `article_scraper.scrape_article()` for individual page scraping. Build new crawler layer on top.

**Rationale**: The existing scraper handles Playwright lifecycle, content extraction selectors, noise removal, Markdown conversion, and 200KB truncation. All of this applies directly to documentation pages. The new code only needs to handle: (1) link discovery/crawling, (2) collection orchestration, (3) parallel execution.

**Key reuse points**:
- `scrape_article(url, cookies_json)` → returns `{title, content_markdown, is_truncated}`
- `get_cookies_for_domain(user_id, url, supabase)` → cookie fetching
- `validate_url(url)` → SSRF protection
- `JobManager` → SSE progress updates
- `BackgroundTasks` → async processing

## R-4: Vector Store Integration Pattern

**Decision**: Follow existing YouTube transcript indexing pattern with documentation-specific metadata.

**Rationale**: The vectorstore service (`vectorstore.py`) uses `RecursiveCharacterTextSplitter` (chunk_size=1000, overlap=200) and adds documents with metadata dicts. Each documentation chunk will carry: `collection_id`, `page_url`, `page_title`, `site_name`, `source_type="documentation"`.

**Key insight**: Articles are currently NOT indexed in the vector store (discovered during research). Only YouTube transcripts are. This feature will be the first non-YouTube content type in the vector store, establishing the pattern for articles later.

**Deletion**: DeepLake supports filtering by metadata for deletion. Use `collection_id` to remove all chunks when a collection is deleted.

## R-5: Database Schema Design

**Decision**: Two new tables — `doc_collections` and `doc_pages` — following existing article table patterns.

**Rationale**: Matches the entity model from the spec. Collection → Pages is a 1:N relationship with cascade delete. Status tracking per page enables partial failure reporting and retry of failed pages only.

**Migration**: Next available number is `010_documentation_collections.sql`.

## R-6: Two-Phase UX (Discover → Confirm → Scrape)

**Decision**: Discovery returns results synchronously (or via short SSE), user confirms, then bulk scrape runs as background job with SSE progress.

**Rationale**: Discovery (loading one page + extracting links) is fast (~2-5s). It can be a synchronous POST that returns the page list. The bulk scrape is the long-running operation that needs SSE tracking. This avoids the complexity of two separate SSE streams.

**Flow**:
1. `POST /v1/api/documentation/discover` → synchronous response with discovered pages list
2. User reviews and confirms
3. `POST /v1/api/documentation/scrape` → creates collection + background job, returns job_id
4. SSE stream for scrape progress

## R-7: Frontend Integration Pattern

**Decision**: Mirror the article scraping component structure with documentation-specific additions.

**Rationale**: The existing patterns (fetch form → SSE subscription → toast progress → detail view) are well-established. Documentation adds a preview/confirm step between form submission and scrape initiation.

**Component structure**:
- `DocumentationFetchForm` — URL input + discovery + preview + confirm
- `DocumentationList` — grid of collection cards on KB hub
- `DocumentationCollectionViewer` — collection detail with page list
- `DocumentationPageViewer` — individual page Markdown rendering

**Routes**:
- `/dashboard/knowledge/documentation/add` — add form
- `/dashboard/knowledge/documentation/[id]` — collection detail
- `/dashboard/knowledge/documentation/[id]/pages/[pageId]` — page detail

## R-8: Retry Failed Pages

**Decision**: Support retrying only failed pages via a dedicated endpoint.

**Rationale**: For a 50-page collection where 3 pages failed, re-scraping everything wastes time and server resources. The per-page status tracking already exists to identify which pages need retry.

**Implementation**: `POST /v1/api/documentation/{collection_id}/retry` — resets failed pages to pending, launches background job for only those pages.
