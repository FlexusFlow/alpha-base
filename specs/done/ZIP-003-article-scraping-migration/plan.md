# Implementation Plan: ZIP-003 Article Scraping Migration

**Feature ID**: ZIP-003
**Branch**: `feature/ZIP-003-article-scraping-migration`
**Created**: 2026-02-22

## Technical Context

| Aspect | Detail |
|--------|--------|
| Frontend | Next.js 15, React 19, TypeScript, shadcn/ui, Tailwind CSS v3 |
| Backend | Python 3.12+, FastAPI, uv |
| Database | Supabase (PostgreSQL + RLS + Storage) |
| AI | Anthropic SDK (TypeScript) for summarize/chat |
| Scraping | Playwright (Python) in FastAPI background tasks |
| Real-time | SSE via sse-starlette + JobManager singleton |
| Package managers | yarn (frontend), uv (backend) |

## Constitution Check

| Principle | Compliance | Notes |
|-----------|------------|-------|
| I. TypeScript Frontend, Python Backend | ✅ | Scraping in Python backend, UI in TypeScript |
| II. API-Boundary Separation | ✅ | Next.js API routes proxy to backend for scraping; direct Supabase reads for article list/view |
| III. Supabase Source of Truth | ✅ | All article data in Supabase with RLS |
| IV. Background Jobs with Real-Time Feedback | ✅ | Scraping uses FastAPI BackgroundTasks + JobManager + SSE |
| V. Simplicity and Pragmatism | ✅ | Reuses existing patterns; no unnecessary abstractions |

**Spec Assumption Update**: Assumption #1 said scraping runs in Next.js. Per the async clarification and constitution Principle IV, scraping moves to the Python backend. AI features (summarize, chat) remain in Next.js API routes — they're synchronous request-response, not background jobs.

## Architecture Overview

```
Browser                    Next.js API Routes           Python Backend
  │                              │                           │
  │─ POST /api/articles/scrape ─►│                           │
  │                              │─ validate URL (SSRF) ──►  │
  │                              │─ POST /v1/api/articles/ ─►│
  │                              │  scrape {url, user_id,    │
  │                              │   use_cookies}            │
  │◄── 202 {job_id, article_id} ─│◄── 202 ──────────────────│
  │                              │                           │
  │─ EventSource /v1/api/ ──────────────────────────────────►│
  │   events/stream/{job_id}     │          BackgroundTask:  │
  │                              │          - fetch cookies   │
  │◄── SSE: scraping ───────────────────────- Playwright     │
  │◄── SSE: completed ──────────────────────- save to DB     │
  │                              │                           │
  │─ GET articles (Supabase) ───►│ (direct browser query)    │
  │◄── article data ─────────────│                           │
  │                              │                           │
  │─ POST /api/articles/         │                           │
  │   {id}/summarize ───────────►│─ Anthropic API ──►        │
  │◄── summary ──────────────────│                           │
  │                              │                           │
  │─ POST /api/articles/         │                           │
  │   {id}/chat ────────────────►│─ Anthropic API (stream) ─►│
  │◄── streaming tokens ─────────│                           │
```

## Implementation Phases

### Phase 1: Database & Backend Foundation

**Goal**: Articles table, scraping endpoint, Playwright integration.

1. **Migration `006_articles.sql`**: Create `articles` and `article_chat_messages` tables with RLS (see `data-model.md`)
2. **Backend models** (`backend/app/models/articles.py`): Pydantic models for scrape request/response
3. **Article scraper service** (`backend/app/services/article_scraper.py`):
   - URL validation (SSRF check: block private IPs, localhost, metadata endpoints)
   - Playwright browser launch → context with optional cookies → navigate → extract content
   - Content selector priority: `article`, `[role="article"]`, `.article-content`, `.post-content`, `.entry-content`, `.content-body`, `main`, `.main-content`, `body`
   - Strip noise elements (script, style, nav, footer, aside, .ads, .comments)
   - Title extraction: `<title>`, `<h1>`, `og:title` meta
   - HTML → Markdown conversion (single content column — no separate plain text)
   - 200KB content limit with truncation
4. **Article router** (`backend/app/routers/articles.py`):
   - `POST /v1/api/articles/scrape` — creates article record (status=pending), launches background task, returns job_id + article_id
   - Background task: fetch cookies via existing `cookie_service`, run scraper, update article status
   - Reuse existing `JobManager` + SSE pattern (generalize Job dataclass for articles)
5. **Register router** in `backend/app/main.py`

### Phase 2: Frontend — Scraping UI & Article List

**Goal**: Users can submit URLs and see their articles.

1. **TypeScript types** (`next-frontend/lib/types/articles.ts`): Article, ArticleScrapeResponse, etc.
2. **Cookie check API route** (`next-frontend/app/api/articles/check-cookies/route.ts`): GET with URL param, checks `user_cookies` for domain
3. **Scrape proxy API route** (`next-frontend/app/api/articles/scrape/route.ts`): Auth → validate URL → proxy to backend
4. **Article fetch form component** (`next-frontend/components/articles/article-fetch-form.tsx`):
   - URL input with validation
   - Cookie check on URL change (debounced)
   - Warning modal if no cookies
   - Submit → POST to API → show toast "Scraping started"
   - Job notification via existing `subscribeToJob` + toast
5. **Knowledge Base hub update** (`next-frontend/app/dashboard/knowledge/page.tsx`):
   - Enable the "Add Article" button, link to article add page
   - Add "Scraped Articles" section below channels (or on separate tab)
6. **Article list component** (`next-frontend/components/articles/article-list.tsx`):
   - Fetch articles from Supabase (direct browser client, user-scoped read)
   - Display as cards (title, domain, date, status badge for pending/failed)
   - Pagination
   - Delete action with confirmation dialog
7. **Delete API route** (`next-frontend/app/api/articles/[id]/route.ts`): Auth → delete from Supabase

### Phase 3: Article Viewer

**Goal**: Full article display with metadata and actions.

1. **Article view page** (`next-frontend/app/dashboard/knowledge/articles/[id]/page.tsx`):
   - Server component: fetch article from Supabase, pass to client component
   - Redirect to article list if not found
2. **Article viewer component** (`next-frontend/components/articles/article-viewer.tsx`):
   - Render Markdown via `react-markdown` + `remark-gfm`
   - Show title, source URL link, creation date
   - "Content truncated" notice if `is_truncated`
   - Action buttons: Summarize, Ask Questions, Download PDF, Delete

### Phase 4: AI Features

**Goal**: Summarization and Q&A chat on articles.

1. **Summarize API route** (`next-frontend/app/api/articles/[id]/summarize/route.ts`):
   - Fetch article, check cached summary
   - If not cached: call Anthropic (Haiku for cost efficiency) with article content
   - Store summary in `articles.summary`, return
2. **Summary component** (`next-frontend/components/articles/article-summary.tsx`):
   - "Summarize" button triggers API call
   - Loading spinner during generation
   - Display summary text once available
3. **Chat API route** (`next-frontend/app/api/articles/[id]/chat/route.ts`):
   - Stream Anthropic (Sonnet) response using article as system context
   - Save messages to `article_chat_messages` after completion
4. **Chat history routes**: GET for loading, DELETE for clearing
5. **Chat component** (`next-frontend/components/articles/article-chat.tsx`):
   - Reuse `ChatWindow` patterns (streaming, message bubbles)
   - Scoped to single article context

### Phase 5: PDF Export

**Goal**: Download articles as PDF.

1. **PDF generation utility** (`next-frontend/lib/pdf.ts`):
   - Use `jsPDF` to create PDF from article title + content_markdown
   - Client-side generation (no server needed)
2. **Download button** in article viewer:
   - Click → generate PDF → trigger download
   - Filename: sanitized article title

## Generalization Notes

The existing `JobManager` and `Job` dataclass are YouTube-specific (fields like `total_videos`, `processed_videos`, etc.). For article scraping, the job is simpler (single item, no batch progress). Options:

- **Option A**: Create a lightweight `ArticleJob` alongside the existing `Job` — keep them separate, simple.
- **Option B**: Generalize `Job` to support both video batches and single-item tasks.

**Decision**: Option A — per constitution Principle V (YAGNI). A single-article job only needs `id`, `status`, `message`. If batch article scraping is added later, generalize then.

## Risk Considerations

1. **Playwright in Docker**: Chromium binary adds ~150MB to image. Ensure Dockerfile installs Playwright dependencies (`playwright install-deps chromium`).
2. **Scraping reliability**: Sites may block headless browsers. Mitigation: user-agent string, cookie support, and graceful failure messaging.
3. **Anthropic API key management**: New dependency for Next.js (currently only Python backend uses LLM). Requires `ANTHROPIC_API_KEY` in `.env.local`.
4. **Content extraction quality**: CSS selector cascade may not work for all sites. The source project's selectors cover major platforms — document this limitation.

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Research | `specs/ZIP-003-article-scraping-migration/research.md` | ✅ Complete |
| Data Model | `specs/ZIP-003-article-scraping-migration/data-model.md` | ✅ Complete |
| API Contracts | `specs/ZIP-003-article-scraping-migration/contracts/api-contracts.md` | ✅ Complete |
| Quickstart | `specs/ZIP-003-article-scraping-migration/quickstart.md` | ✅ Complete |
| Tasks | `specs/ZIP-003-article-scraping-migration/tasks.md` | ✅ Complete |
