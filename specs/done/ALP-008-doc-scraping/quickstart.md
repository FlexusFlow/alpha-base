# Quickstart: ALP-008 Documentation Site Scraping

**Created**: 2026-02-26

## Prerequisites

- Backend running: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
- Frontend running: `cd next-frontend && yarn dev`
- Supabase migration applied: `010_documentation_collections.sql`
- Playwright installed: `uv run playwright install chromium`

## Implementation Order

### Phase 1: Database & Backend Foundation

1. **Migration** — Create `doc_collections` and `doc_pages` tables with RLS
2. **Pydantic models** — `DocumentationDiscoverRequest`, `DocumentationScrapeRequest`, `DocumentationCollection`, `DocumentationPage`
3. **Discovery service** — `doc_crawler.py`: load page with Playwright, extract links, filter via LLM call (entry page) / path scope (deeper pages), deduplicate, limit to 100
4. **Scrape service** — `doc_scraper.py`: orchestrate parallel scraping (3 concurrent) using existing `scrape_article()`, track per-page status
5. **Vector indexing** — Extend `vectorstore.py` with `add_documentation_pages()` and `delete_by_collection_id()`
6. **Router** — `documentation.py`: discover, scrape, retry, delete, list pages endpoints
7. **Register router** in `main.py`

### Phase 2: Frontend Integration

8. **TypeScript types** — `lib/types/documentation.ts`
9. **API routes** — Proxy routes under `/api/documentation/`
10. **DocumentationFetchForm** — URL input → discover → preview → confirm → scrape
11. **DocumentationList** — Collection cards on KB hub
12. **DocumentationCollectionViewer** — Collection detail page with page list
13. **DocumentationPageViewer** — Individual page Markdown rendering
14. **KB Hub integration** — Add documentation section and "Add Documentation" button
15. **Retry UI** — "Retry failed pages" button on collections with `partial` status

## Testing Checklist

- [ ] Discover pages from `https://sirv.com/help/section/getting-started/` — expect article pages (e.g., `/help/articles/*`), not just section pages
- [ ] Verify LLM filtering — navigation/marketing/login links excluded from discovery results
- [ ] Verify scope filtering at depth > 0 — pages outside entry URL path are excluded
- [ ] Scrape discovered pages — verify Markdown content stored
- [ ] Check vector store — documentation chunks have correct metadata
- [ ] RAG query — ask a question answerable only from documentation content
- [ ] Partial failure — simulate timeout on one page, verify others succeed
- [ ] Retry failed — retry only failed pages, verify collection status updates
- [ ] Delete collection — verify DB records and vector store entries removed
- [ ] Cookie-protected site — test with uploaded cookies for authenticated scraping
- [ ] 100-page limit — test with a site exceeding 100 links, verify truncation warning

## Key Files to Create

### Backend
- `backend/app/services/doc_crawler.py` — Link discovery and crawl logic
- `backend/app/services/doc_scraper.py` — Bulk scraping orchestrator
- `backend/app/routers/documentation.py` — API endpoints
- `backend/app/models/documentation.py` — Pydantic models

### Frontend
- `next-frontend/lib/types/documentation.ts` — TypeScript interfaces
- `next-frontend/app/api/documentation/discover/route.ts`
- `next-frontend/app/api/documentation/scrape/route.ts`
- `next-frontend/app/api/documentation/[id]/route.ts`
- `next-frontend/app/api/documentation/[id]/retry/route.ts`
- `next-frontend/app/api/documentation/check-cookies/route.ts`
- `next-frontend/app/dashboard/knowledge/documentation/add/page.tsx`
- `next-frontend/app/dashboard/knowledge/documentation/[id]/page.tsx`
- `next-frontend/app/dashboard/knowledge/documentation/[id]/pages/[pageId]/page.tsx`
- `next-frontend/components/documentation/documentation-fetch-form.tsx`
- `next-frontend/components/documentation/documentation-list.tsx`
- `next-frontend/components/documentation/documentation-collection-viewer.tsx`
- `next-frontend/components/documentation/documentation-page-viewer.tsx`

### Database
- `next-frontend/supabase/migrations/010_documentation_collections.sql`

## Key Reuse Points

| Existing Code | Reuse For |
|---------------|-----------|
| `article_scraper.scrape_article()` | Individual page content extraction |
| `cookie_service.get_cookies_for_domain()` | Cookie injection for all pages |
| `url_validator.validate_url()` | SSRF protection on entry URL |
| `JobManager` | SSE progress updates during bulk scrape |
| `vectorstore.add_documents()` | Indexing documentation chunks |
| `subscribeToJob()` (frontend) | SSE subscription in fetch form |
| `ArticleFetchForm` pattern | Form structure and cookie check flow |
| `ArticleList` pattern | Collection card grid layout |
