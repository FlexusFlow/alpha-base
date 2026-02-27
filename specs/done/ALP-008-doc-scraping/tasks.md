# Tasks: ALP-008 Documentation Site Scraping

**Feature ID**: ALP-008
**Branch**: `feature/ALP-008-doc-scraping`
**Created**: 2026-02-26

## User Stories

| Story | Description | Spec Scenarios | Priority |
|-------|-------------|----------------|----------|
| US1 | Discover & scrape documentation site from entry URL | S1, S2, S7 | P1 |
| US2 | View documentation collections and pages | S3 | P2 |
| US3 | Documentation content searchable via RAG | S4 | P3 |
| US4 | Delete documentation collections | S5 | P4 |
| US5 | Error handling & retry failed pages | S6 | P5 |

---

## Phase 1: Setup

- [x] T001 Create Supabase migration with `doc_collections` and `doc_pages` tables, indexes, RLS policies, and `updated_at` trigger in `next-frontend/supabase/migrations/010_documentation_collections.sql`
- [x] T002 [P] Create Pydantic models (`DocumentationDiscoverRequest`, `DocumentationDiscoverResponse`, `DocumentationScrapeRequest`, `DocumentationScrapeResponse`, `DocumentationRetryResponse`, `DiscoveredPage`, `DocumentationPageModel`) in `backend/app/models/documentation.py`
- [x] T003 [P] Create TypeScript type definitions (`DocumentationCollection`, `DocumentationPage`, `DiscoveryResponse`, `ScrapeResponse`, `DocJobStatusUpdate`) in `next-frontend/lib/types/documentation.ts`

**Completion criteria**: Migration applies cleanly. Pydantic models importable. TypeScript types compile.

---

## Phase 2: Foundational — Vector Store Extension

- [x] T004 Add `add_documentation_pages(pages, collection_id, site_name, user_id)` function to `backend/app/services/vectorstore.py` — chunks each page's Markdown with RecursiveCharacterTextSplitter (chunk_size=1000, overlap=200), adds to DeepLake with metadata: `collection_id`, `page_url`, `page_title`, `site_name`, `source_type="documentation"`, `source`
- [x] T005 Add `delete_by_collection_id(collection_id, user_id)` function to `backend/app/services/vectorstore.py` — filters DeepLake chunks by `collection_id` metadata and deletes them

**Completion criteria**: Vector store functions work with test data — can add chunks with documentation metadata and delete by collection_id.

---

## Phase 3: US1 — Discover & Scrape Documentation

**Goal**: User enters a documentation URL → system discovers pages → user previews and confirms → pages are scraped as a collection with real-time progress.

### Backend

- [x] T006 [US1] Implement `discover_pages(url, cookies_json=None)` in `backend/app/services/doc_crawler.py` — computes parent-path scope from entry URL, launches Playwright, loads entry page (with cookies if provided), extracts all `<a href>` links, filters by same domain + parent-path scope, excludes non-doc patterns (file extensions, login paths, external domains), normalizes and deduplicates URLs, follows links recursively via BFS up to depth 3, caps at 100 pages, returns list of `{url, title}` pairs with scope_path and site_name
- [x] T007 [US1] Implement `scrape_collection(collection_id, pages, user_id, use_cookies, supabase, job_manager)` in `backend/app/services/doc_scraper.py` — fetches cookies once if needed, creates asyncio.Semaphore(3) for concurrency, scrapes each page using existing `scrape_article()`, updates per-page status in Supabase (pending→scraping→completed/failed), emits SSE progress events via JobManager, after all pages complete: updates collection status (completed/partial/failed) and counts, calls `add_documentation_pages()` for successful pages, emits SSE completion event
- [x] T008 [US1] Create documentation router in `backend/app/routers/documentation.py` with:
  - `POST /v1/api/documentation/discover` — validates URL (SSRF), checks cookies, calls `discover_pages()`, returns synchronous response per api-contracts.md
  - `POST /v1/api/documentation/scrape` — creates `doc_collections` and `doc_pages` records in Supabase, launches `scrape_collection` as BackgroundTask, returns 202 with job_id and collection_id
- [x] T009 [US1] Register documentation router in `backend/app/main.py`

### Frontend API Routes

- [x] T010 [P] [US1] Create `POST /api/documentation/discover/route.ts` in `next-frontend/app/api/documentation/discover/` — auth check, SSRF validation, inject user_id, proxy to backend `/v1/api/documentation/discover`
- [x] T011 [P] [US1] Create `POST /api/documentation/scrape/route.ts` in `next-frontend/app/api/documentation/scrape/` — auth check, inject user_id, proxy to backend `/v1/api/documentation/scrape`
- [x] T012 [P] [US1] Create `GET /api/documentation/check-cookies/route.ts` in `next-frontend/app/api/documentation/check-cookies/` — same pattern as `/api/articles/check-cookies`, query `user_cookies` table with domain + parent domain fallback

### Frontend Components & Pages

- [x] T013 [US1] Create `DocumentationFetchForm` component in `next-frontend/components/documentation/documentation-fetch-form.tsx` — two-phase form: (1) URL input with validation + debounced cookie check (500ms) → submit calls `/api/documentation/discover` → (2) shows discovered pages list with titles, URLs, total count, truncation warning if >100 → "Scrape All" and "Cancel" buttons → on confirm calls `/api/documentation/scrape` → subscribes to SSE via `subscribeToJob()` → shows progress toasts → redirects to collection detail on completion. Cookie warning dialog if no cookies found.
- [x] T014 [US1] Create add documentation page at `next-frontend/app/dashboard/knowledge/documentation/add/page.tsx` — renders heading "Add Documentation" with description and `<DocumentationFetchForm />`

**Test criteria (US1)**: Enter `https://sirv.com/help/section/360-spin/` → pages discovered → preview shown with count → confirm → pages scraped with progress updates → collection created in database with all pages.

---

## Phase 4: US2 — View Documentation Collections & Pages

**Goal**: User can browse documentation collections on the KB hub and view individual pages.

- [x] T015 [US2] Create `DocumentationList` component in `next-frontend/components/documentation/documentation-list.tsx` — loads collections from Supabase `doc_collections` table for current user, renders grid of Cards showing: site name, entry URL domain, page count (e.g., "23 pages"), status badge (completed/partial/failed/scraping), created date. Click navigates to `/dashboard/knowledge/documentation/[id]`. Handles loading and empty states.
- [x] T016 [US2] Create `DocumentationCollectionViewer` component in `next-frontend/components/documentation/documentation-collection-viewer.tsx` — displays collection header (site name, entry URL as external link, scrape date, page stats "22 of 23 pages"), lists pages with title, status indicator, click navigates to page detail. Shows status banner for partial/failed collections.
- [x] T017 [US2] Create `DocumentationPageViewer` component in `next-frontend/components/documentation/documentation-page-viewer.tsx` — displays page title, source URL (external link), truncation warning if `is_truncated`, rendered Markdown content via `react-markdown` + `remark-gfm`, back link to collection.
- [x] T018 [US2] Create collection detail page at `next-frontend/app/dashboard/knowledge/documentation/[id]/page.tsx` — fetches collection from Supabase, fetches pages from Supabase, renders `<DocumentationCollectionViewer />`
- [x] T019 [US2] Create page detail page at `next-frontend/app/dashboard/knowledge/documentation/[id]/pages/[pageId]/page.tsx` — fetches page from Supabase, renders `<DocumentationPageViewer />`
- [x] T020 [US2] Integrate documentation into KB hub page `next-frontend/app/dashboard/knowledge/page.tsx` — add "Add Documentation" card/button alongside existing "Add Channel" and "Add Article", add `<DocumentationList />` section below articles section

**Test criteria (US2)**: KB hub shows documentation collections. Click collection → see page list. Click page → see rendered Markdown content. Empty state displayed when no collections exist.

---

## Phase 5: US3 — RAG Integration

**Goal**: Documentation content is searchable via RAG chat with proper citations.

- [x] T021 [US3] Verify vector store indexing end-to-end — scrape a documentation site, confirm chunks appear in DeepLake with correct metadata (`collection_id`, `page_url`, `page_title`, `site_name`, `source_type="documentation"`)
- [x] T022 [US3] Update RAG chat system prompt in the chat service to mention documentation as a content source alongside YouTube videos and articles, so the LLM knows to cite documentation pages when relevant

**Test criteria (US3)**: Scrape a documentation site → ask a question in RAG chat answerable only from documentation → response includes answer with documentation page citation (title + URL).

---

## Phase 6: US4 — Delete Collections

**Goal**: User can delete a documentation collection with full cascade (DB records + vector store).

- [x] T023 [US4] Add `DELETE /v1/api/documentation/{collection_id}` endpoint to `backend/app/routers/documentation.py` — validates ownership, calls `delete_by_collection_id()` to remove vector store entries, deletes collection from Supabase (CASCADE deletes pages), returns confirmation with counts
- [x] T024 [P] [US4] Create `DELETE /api/documentation/[id]/route.ts` in `next-frontend/app/api/documentation/[id]/` — auth check, inject user_id, proxy to backend
- [x] T025 [US4] Add delete button with `AlertDialog` confirmation to `DocumentationCollectionViewer` in `next-frontend/components/documentation/documentation-collection-viewer.tsx` — on confirm calls `DELETE /api/documentation/[id]`, shows success toast, redirects to KB hub

**Test criteria (US4)**: Delete a collection → DB records gone → vector store entries removed → user redirected to KB hub with success toast.

---

## Phase 7: US5 — Error Handling & Retry

**Goal**: Partial failures are handled gracefully. Users can retry failed pages without re-scraping successful ones.

- [x] T026 [US5] Add `POST /v1/api/documentation/{collection_id}/retry` endpoint to `backend/app/routers/documentation.py` — validates ownership, checks collection has status=partial, resets failed pages to status=pending, updates collection status to scraping, launches `scrape_collection` as BackgroundTask for only the failed pages, returns 202 with job_id and retry_count
- [x] T027 [P] [US5] Create `POST /api/documentation/[id]/retry/route.ts` in `next-frontend/app/api/documentation/[id]/retry/` — auth check, inject user_id, proxy to backend
- [x] T028 [US5] Add "Retry failed pages" button to `DocumentationCollectionViewer` (visible when status=partial) — on click calls `/api/documentation/[id]/retry`, subscribes to SSE for retry progress, updates page list on completion

**Test criteria (US5)**: Collection with partial status → click "Retry failed pages" → only failed pages re-scraped → collection status updates → newly scraped pages indexed in vector store.

---

## Phase 8: Polish & Cross-Cutting

- [x] T029 Add `GET /v1/api/documentation/{collection_id}/pages` endpoint to `backend/app/routers/documentation.py` — returns paginated page list with status, title, display_order (used by collection viewer if direct Supabase query is insufficient)
- [x] T030 Verify TypeScript compilation: run `cd next-frontend && npx tsc --noEmit` and fix any type errors
- [x] T031 Verify backend linting: run `cd backend && uv run ruff check .` and fix any issues

---

## Dependencies

```
T001 (migration) ← T004, T005 (vector store needs tables context)
T001 (migration) ← T006, T007 (services need DB tables)
T002 (pydantic) ← T006, T007, T008 (services/router use models)
T003 (TS types) ← T010-T014 (frontend uses types)
T006 (crawler) ← T008 (router calls crawler)
T007 (scraper) ← T008 (router calls scraper)
T004 (vector add) ← T007 (scraper calls vector add after scrape)
T005 (vector delete) ← T023 (delete endpoint calls vector delete)
T008, T009 (router registered) ← T010, T011 (proxy routes need backend)
T013 (fetch form) ← T014 (page renders form)
T015-T017 (components) ← T018-T020 (pages render components)
T023 (delete endpoint) ← T024, T025 (frontend delete needs backend)
T026 (retry endpoint) ← T027, T028 (frontend retry needs backend)
```

## Parallel Execution Opportunities

**Phase 1**: T002 and T003 can run in parallel (different stacks, no deps between them). Both depend on T001.

**Phase 3 (US1)**: T010, T011, T012 can all run in parallel (independent API routes). T013 depends on all three.

**Phase 6 (US4)**: T024 can run in parallel with T023 (frontend proxy is independent of backend logic pattern).

**Phase 7 (US5)**: T027 can run in parallel with T026.

## Implementation Strategy

**MVP (US1 only)**: Tasks T001–T014. Delivers the core discover→scrape flow. User can add documentation sites and see them scraped. ~60% of feature value.

**Increment 2 (US2)**: Tasks T015–T020. Adds browsing and viewing. Combined with MVP, delivers a complete read/write flow. ~80% of feature value.

**Increment 3 (US3–US5)**: Tasks T021–T028. RAG integration, deletion, and retry. Completes the feature. 100% of feature value.

**Polish**: Tasks T029–T031. Non-blocking cleanup.

---

## Phase 9: LLM Link Extraction — Replace BFS with LLM (2026-02-27)

**Context**: Discovery phase returns irrelevant links (nav/header/footer chrome) because heuristic scope filtering can't distinguish doc links from site navigation. Entry pages often link to articles under different path prefixes (e.g., `/help/section/getting-started/` → `/help/articles/*`), so path-based filtering misses real doc pages while including non-doc section pages.

**Solution**: Replace BFS crawling entirely with a single LLM call. The entry page is treated as a table of contents — the LLM extracts all documentation links in one pass. Remove `_compute_scope_path()`, `_is_valid_doc_link()`, BFS queue, `MAX_DEPTH`, and `SKIP_PATH_PATTERNS`.

### New User Stories

| ID  | Story | Priority | FR |
|-----|-------|----------|-----|
| US6 | Discovery returns only documentation-relevant links (not nav/marketing chrome) | P1 | FR-1 |
| US7 | Discovery falls back gracefully if LLM call fails | P1 | FR-1 |

### Foundational

- [x] T032 Add `doc_link_filter_model` setting (default `gpt-4o-mini`) to `backend/app/config.py`

### US6: LLM Link Extraction

- [x] T033 [US6] Implement `async def _filter_links_with_llm(page_html: str, base_url: str) -> list[str]` in `backend/app/services/doc_crawler.py`
  - Use `AsyncOpenAI` client with model from `settings.doc_link_filter_model`
  - Send page HTML with the classification prompt from FR-1 spec (exact prompt in spec.md)
  - Parse LLM response to extract URLs — use regex `https?://[^\s)>"]+` since response is free-text with `URL — description` format, category headers, blank lines
  - Normalize extracted URLs against base_url using `_normalize_url()`
  - Return deduplicated list of documentation-relevant absolute URLs
- [x] T034 [US6] Rewrite `discover_pages()` in `backend/app/services/doc_crawler.py` to replace BFS with LLM extraction:
  - Load entry page with Playwright (with cookies if provided)
  - Get page HTML via `page.content()`, extract page title for site_name
  - Call `_filter_links_with_llm(page_html, url)` to get documentation URLs
  - Normalize, deduplicate, cap at 100 pages
  - Return result dict (same shape as before, minus `scope_path`)
  - Remove: BFS queue/loop, `_compute_scope_path()`, `_is_valid_doc_link()`, `MAX_DEPTH`, `SKIP_PATH_PATTERNS`, `from_entry_page` parameter
  - Keep: `SKIP_EXTENSIONS`, `_normalize_url()`, `MAX_PAGES`
  - Note: `_extract_site_name()` was later removed in T038 (full page title used instead)

### US7: Fallback & Robustness

- [x] T035 [US7] Add fallback in `discover_pages()` when `_filter_links_with_llm()` fails — if LLM call raises an exception or returns empty list, log warning and fall back to extracting all same-domain `<a href>` links from the page HTML (filtered by `SKIP_EXTENSIONS` only) in `backend/app/services/doc_crawler.py`
- [x] T036 [US7] Handle LLM response parsing edge cases in `_filter_links_with_llm()` in `backend/app/services/doc_crawler.py` — skip lines without URLs, handle markdown formatting (`[text](url)`), resolve relative URLs against base_url, ignore external domains

### Polish

- [x] T037 Keep `scope_path` in models (DB column is NOT NULL) — now stores entry URL path instead of parent path. Updated frontend display to show "Found N documentation pages" instead of showing scope_path.
- [x] T038 Use full page title as collection name — remove `_extract_site_name()` from `backend/app/services/doc_crawler.py`, use raw `<title>` text (fallback to hostname) as `site_name` in `discover_pages()`
- [ ] T039 Manual test: discover pages from `https://sirv.com/help/section/getting-started/` and verify results include `/help/articles/*` pages (e.g., upload-images, image-zoom) and exclude non-doc pages (pricing, blog, login)
- [x] T040 Add configurable `LOG_LEVEL` — add `log_level: str = "INFO"` to `backend/app/config.py` Settings, configure `logging.basicConfig()` in `backend/app/main.py` reading from `settings.log_level`

### Dependencies

```
T032 ──→ T033
T033 ──→ T034
T033 ──→ T035
T033 ──→ T036
T034 ──→ T037
```

### Parallel Execution

- T035 and T036 can run in parallel (independent error handling additions to `_filter_links_with_llm`)

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 40 (39 complete + 1 remaining) |
| Phase 1 (Setup) | 3 tasks ✅ |
| Phase 2 (Foundational) | 2 tasks ✅ |
| US1 (Discover & Scrape) | 9 tasks ✅ |
| US2 (View Collections) | 6 tasks ✅ |
| US3 (RAG Integration) | 2 tasks ✅ |
| US4 (Delete) | 3 tasks ✅ |
| US5 (Retry) | 3 tasks ✅ |
| Polish (original) | 3 tasks ✅ |
| LLM Foundational | 1 task ✅ (T032) |
| US6 (LLM Extraction) | 2 tasks ✅ (T033–T034) |
| US7 (Fallback) | 2 tasks ✅ (T035–T036) |
| LLM Polish | 4 tasks (T037–T040, T039 remaining) |
