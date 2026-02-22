# Tasks: ZIP-003 Article Scraping Migration

**Feature**: Article Scraping Migration
**Branch**: `feature/ZIP-003-article-scraping-migration`
**Total Tasks**: 28
**Generated**: 2026-02-22

## User Story Mapping

| Story | Spec Scenario | Summary |
| --- | --- | --- |
| US1 | Scenario 1 + 2 + 8 | User scrapes an article (public or cookie-authenticated) with async notification |
| US2 | Scenario 3 + 7 | User views a saved article and can delete it |
| US3 | Scenario 4 | User generates an AI summary of an article |
| US4 | Scenario 5 | User asks questions about an article via chat |
| US5 | Scenario 6 | User downloads an article as PDF |

---

## Phase 1: Setup — Dependencies & Database

- [ ] T001 [P] Install Python backend dependencies: `playwright` and `markdownify` in `backend/pyproject.toml`
  - Run `cd backend && uv add playwright markdownify`
  - Run `cd backend && uv run playwright install chromium`
  - `markdownify` converts HTML→Markdown (pure Python, no JS dependency needed)

- [ ] T002 [P] Install Next.js frontend dependencies in `next-frontend/package.json`
  - Run `cd next-frontend && yarn add @anthropic-ai/sdk react-markdown remark-gfm jspdf`

- [ ] T003 [P] Create database migration `next-frontend/supabase/migrations/006_articles.sql`
  - Create `articles` table per `data-model.md`: id, user_id, url, title, content_markdown, summary, status (CHECK: pending/scraping/completed/failed), error_message, is_truncated, created_at
  - Create `article_chat_messages` table per `data-model.md`: id, article_id, user_id, role (CHECK: user/assistant), content, created_at
  - Enable RLS on both tables
  - Create RLS policies: articles uses `auth.uid() = user_id` for all operations; article_chat_messages uses `EXISTS (SELECT 1 FROM articles WHERE id = article_id AND user_id = auth.uid())` for SELECT/INSERT/DELETE
  - Create indexes: `idx_articles_user_id` on `(user_id, created_at DESC)`, `idx_articles_status` on `(user_id, status)`, `idx_article_chat_messages_article` on `(article_id, created_at ASC)`
  - Follow patterns from `005_cookie_files_storage.sql` and `002_chat_projects.sql`

---

## Phase 2: Foundational — Backend Scraping Service

These tasks create the article scraping backend that all frontend stories depend on.

- [ ] T004 [P] Create Pydantic models in `backend/app/models/articles.py`
  - `ArticleScrapeRequest`: url (str), user_id (str), use_cookies (bool, default True)
  - `ArticleScrapeResponse`: job_id (str), article_id (str), message (str)
  - `ArticleJob` dataclass: id (str), status (str), message (str) — lightweight job for SSE dispatch, separate from YouTube `Job` dataclass (Option A per plan Generalization Notes)
  - Reuse existing `JobStatus` enum from `backend/app/models/knowledge.py`

- [ ] T005 [P] Create URL validation utility in `backend/app/services/url_validator.py`
  - `def validate_url(url: str) -> str`: returns normalized URL or raises ValueError
  - Check scheme is http or https (reject ftp, file, data, javascript, etc.)
  - Parse with `urllib.parse.urlparse`
  - Resolve hostname to IP via `socket.getaddrinfo`
  - Block private IP ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
  - Block link-local: 169.254.0.0/16 (AWS metadata endpoint)
  - Block IPv6 loopback (::1) and link-local (fe80::/10)
  - Block hostnames: `localhost`, `0.0.0.0`
  - Raise `ValueError` with descriptive message for blocked URLs

- [ ] T006 Create article scraper service in `backend/app/services/article_scraper.py`
  - `async def scrape_article(url: str, cookies_json: str | None = None) -> dict`
  - Launch Playwright Chromium (headless) via `async_playwright()`
  - Create browser context; if `cookies_json` provided, parse JSON and call `context.add_cookies()` with list of dicts
  - Navigate to URL with 30-second timeout
  - Extract article body using selector priority: `article`, `[role="article"]`, `.article-content`, `.post-content`, `.entry-content`, `.content-body`, `main`, `.main-content`, fallback to `body`
  - Strip noise: remove `script`, `style`, `nav`, `footer`, `aside`, `header`, elements with class containing `ad`, `comment`, `sidebar`
  - Extract title: try `og:title` meta, then `<h1>`, then `<title>`
  - Get `inner_html()` of selected element
  - Convert HTML → Markdown via `markdownify.markdownify(html, heading_style="ATX", strip=["img"])`
  - Enforce 200KB Markdown limit: if exceeds, truncate at last `\n\n` before 200KB boundary, set `is_truncated = True`
  - Return dict: `{ title, content_markdown, is_truncated }`
  - Close browser context and browser in `finally` block
  - Raise descriptive exceptions on failure (timeout, navigation error, empty content)

- [ ] T007 Create article router in `backend/app/routers/articles.py`
  - `POST /v1/api/articles/scrape` endpoint per `contracts/api-contracts.md`
  - Validate URL via `url_validator.validate_url()` — return 400 on failure
  - Create article record in Supabase with `status='pending'`, `url`, `user_id` — get back `article_id`
  - Create a lightweight `ArticleJob` (Option A per plan Generalization Notes — separate from YouTube `Job` dataclass). Fields: `id`, `status`, `message`. Register with `job_manager` for SSE event dispatch only.
  - Launch `BackgroundTasks.add_task(process_article_scrape, ...)` with job_id, article_id, url, user_id, use_cookies
  - Return 202 with `{ job_id, article_id, message }`
  - Background task `process_article_scrape()`:
    1. Update job status to IN_PROGRESS, article status to 'scraping'
    2. If use_cookies: call `get_cookies_for_domain(user_id, url, supabase)` from existing cookie service
    3. Call `scrape_article(url, cookies_json=cookie_str)`
    4. Update article record: title, content_markdown, is_truncated, status='completed'
    5. Update job status to COMPLETED with message
    6. On exception: update article status='failed' with error_message, job status to FAILED
  - Dependencies: `get_job_manager`, `get_supabase`, `get_settings`

- [ ] T008 Register article router in `backend/app/main.py`
  - Import `from app.routers import articles`
  - Add `app.include_router(articles.router)`
  - Follow same pattern as `app.include_router(knowledge.router)`

---

## Phase 3: US1 — Scrape Article from URL (Frontend)

**Goal**: User can paste a URL, submit it, and receive async notification when scraping completes. Cookie-aware scraping with warning modal.

**Independently testable**: Submit a URL via the form, see "Scraping started" toast, wait for SSE notification, verify article appears in list with status "completed".

- [ ] T009 [P] Create TypeScript types in `next-frontend/lib/types/articles.ts`
  - `Article` interface: id, url, title, content_markdown, summary (nullable), status ('pending' | 'scraping' | 'completed' | 'failed'), error_message (nullable), is_truncated, created_at
  - `ArticleScrapeResponse` interface: job_id, article_id, message
  - `CookieCheckResponse` interface: has_cookies, domain

- [ ] T010 [P] Create cookie check API route in `next-frontend/app/api/articles/check-cookies/route.ts`
  - GET handler with `url` query param
  - Auth check via `createClient()` → `getUser()`
  - Extract domain from URL, normalize (lowercase, strip www.)
  - Query `user_cookies` table for matching domain with parent fallback (same logic as `backend/app/services/cookie_service.py`)
  - Return `{ has_cookies: boolean, domain: string }`

- [ ] T011 [P] Create scrape proxy API route in `next-frontend/app/api/articles/scrape/route.ts`
  - POST handler
  - Auth check → get user.id
  - Validate URL format (basic `new URL()` check + SSRF: block private IPs, localhost)
  - Proxy to `POST ${NEXT_PUBLIC_API_BASE_URL}/v1/api/articles/scrape` with `{ url, user_id: user.id, use_cookies }`
  - Return 202 with backend response `{ job_id, article_id, message }`

- [ ] T012 Create article fetch form component in `next-frontend/components/articles/article-fetch-form.tsx`
  - `"use client"` component
  - URL input with validation (show error for invalid URLs)
  - On URL change (debounced 500ms): fetch `GET /api/articles/check-cookies?url=...`
  - If no cookies: show warning with "Proceed without cookies" and "Cancel" buttons (use existing `AlertDialog` from shadcn/ui)
  - Submit: POST to `/api/articles/scrape` with `{ url, use_cookies }`
  - On success: show toast "Article scraping started", subscribe to SSE via `subscribeToJob(job_id)` using existing `next-frontend/lib/api/events.ts`
  - Show job notification using toast pattern from `next-frontend/components/youtube/job-notification.tsx`
  - On job complete: show toast with link to article viewer
  - Loading state on submit button

- [ ] T013 Create article add page in `next-frontend/app/dashboard/knowledge/articles/add/page.tsx`
  - Simple page wrapper that renders `<ArticleFetchForm />`
  - Page title: "Add Article"

- [ ] T014 Update Knowledge Base hub in `next-frontend/app/dashboard/knowledge/page.tsx`
  - Enable the "Add Article" button (remove `disabled` prop)
  - Change `<Button disabled>Add Article</Button>` to `<Button asChild><Link href="/dashboard/knowledge/articles/add">Add Article</Link></Button>`
  - Remove "(Coming soon)" from CardDescription
  - Add "Scraped Articles" section below "Scraped Channels" that renders `<ArticleList />`

- [ ] T015 Create article list component in `next-frontend/components/articles/article-list.tsx`
  - `"use client"` component
  - Fetch articles via direct Supabase browser query (no API route — per constitution Principle II): `supabase.from('articles').select('id, url, title, status, is_truncated, created_at').order('created_at', { ascending: false }).range(offset, offset + pageSize - 1)`
  - Display as cards grid (similar to channel cards in knowledge page): title, domain extracted from URL, creation date, status badge (pending=yellow, scraping=blue, completed=green, failed=red)
  - Click card → navigate to `/dashboard/knowledge/articles/{id}`
  - Delete button per card with `AlertDialog` confirmation
  - Delete: call `DELETE /api/articles/{id}` → show toast → refresh list
  - Pagination (client-side is fine for MVP; server-side if needed later)

- [ ] T016 Create article delete API route in `next-frontend/app/api/articles/[id]/route.ts`
  - DELETE handler
  - Auth check → get user.id
  - Delete from `articles` table via server Supabase client (CASCADE handles chat messages)
  - Return `{ message: "Article deleted" }`

---

## Phase 4: US2 — View Article

**Goal**: User can view a saved article with rendered Markdown, metadata, and action buttons.

**Independently testable**: Navigate to a completed article → see rendered Markdown with title, source link, date. Action buttons visible (Summarize, Ask Questions, Download PDF, Delete).

- [ ] T017 Create article view page in `next-frontend/app/dashboard/knowledge/articles/[id]/page.tsx`
  - Server component: fetch article from Supabase server client by ID
  - If not found or status != 'completed': redirect to `/dashboard/knowledge`
  - Pass article data to `<ArticleViewer article={article} />`

- [ ] T018 Create article viewer component in `next-frontend/components/articles/article-viewer.tsx`
  - `"use client"` component
  - Render Markdown content via `react-markdown` with `remark-gfm` plugin
  - Show article title as `<h1>`
  - Show source URL as external link with lucide `ExternalLink` icon
  - Show creation date formatted
  - If `is_truncated`: show info banner "This article was truncated to fit size limits"
  - Action buttons row: Summarize, Ask Questions, Download PDF, Delete
  - Summarize and Ask Questions initially render as buttons (functional in US3/US4)
  - Delete: `AlertDialog` confirmation → DELETE API → redirect to knowledge hub

---

## Phase 5: US3 — AI Summary

**Goal**: User can generate and view a cached AI summary of an article.

**Independently testable**: View article → click "Summarize" → see loading spinner → summary appears → reload page → summary still displayed (cached).

- [ ] T019 Create summarize API route in `next-frontend/app/api/articles/[id]/summarize/route.ts`
  - POST handler
  - Auth check → get user.id
  - Fetch article from Supabase server client by ID (verify user owns it)
  - If `article.summary` is not null: return cached `{ summary: article.summary }`
  - Call Anthropic API (Haiku model for cost efficiency):
    - System prompt: "You are a summarizer. Provide a concise summary of the following article."
    - User message: article.content_markdown
    - Max tokens: 1024
  - Store summary: update `articles.summary` in Supabase
  - Return `{ summary }`

- [ ] T020 Create article summary component in `next-frontend/components/articles/article-summary.tsx`
  - `"use client"` component
  - Props: `articleId: string`, `initialSummary: string | null`
  - If `initialSummary` exists: display it immediately
  - "Summarize" button: POST to `/api/articles/{id}/summarize`
  - Loading spinner during API call
  - Display summary text in a styled card/section below article metadata
  - Error handling: toast on failure

- [ ] T021 Integrate summary into article viewer in `next-frontend/components/articles/article-viewer.tsx`
  - Replace placeholder Summarize button with `<ArticleSummary articleId={article.id} initialSummary={article.summary} />`

---

## Phase 6: US4 — Article Q&A Chat

**Goal**: User can ask questions about an article in a chat interface with streaming responses and persistent history.

**Independently testable**: View article → click "Ask Questions" → type question → receive streaming response → reload → chat history preserved → clear history works.

- [ ] T022 Create chat API route in `next-frontend/app/api/articles/[id]/chat/route.ts`
  - POST handler with streaming response
  - Auth check → get user.id
  - Parse body: `{ message: string, history: { role, content }[] }`
  - Fetch article from Supabase server client (verify ownership)
  - Build Anthropic request:
    - System: "Answer questions about the following article. Only use information from the article.\n\n" + article.content_markdown
    - Messages: history + new user message
    - Model: claude-sonnet-4-5-20250929 (per constitution LLM choice)
    - Stream: true
  - Stream response tokens as SSE: `data: {"token": "..."}\n\n`
  - After stream completes: save user message + full assistant response to `article_chat_messages`
  - Send final `data: {"done": true}\n\n`

- [ ] T023 [P] Create chat history routes in `next-frontend/app/api/articles/[id]/chat/history/route.ts`
  - GET handler: auth check → fetch `article_chat_messages` ordered by `created_at ASC` for article_id → return `{ messages: [...] }`
  - DELETE handler: auth check → delete all `article_chat_messages` where `article_id` matches → return `{ message: "Chat history cleared" }`

- [ ] T024 Create article chat component in `next-frontend/components/articles/article-chat.tsx`
  - `"use client"` component
  - Props: `articleId: string`
  - On mount: fetch chat history from `GET /api/articles/{id}/chat/history`
  - Chat input with send button
  - On send: POST to `/api/articles/{id}/chat` with message + history
  - Parse SSE stream: append tokens to assistant message in real-time
  - Display messages using bubble pattern from existing `next-frontend/components/chat/chat-message-bubble.tsx`
  - "Clear history" button: DELETE `/api/articles/{id}/chat/history` → clear local state
  - Auto-scroll to bottom on new messages
  - Disable input while streaming

- [ ] T025 Integrate chat into article viewer in `next-frontend/components/articles/article-viewer.tsx`
  - Replace placeholder "Ask Questions" button with expandable section or tab that renders `<ArticleChat articleId={article.id} />`

---

## Phase 7: US5 — PDF Export

**Goal**: User can download an article as a formatted PDF file.

**Independently testable**: View article → click "Download PDF" → PDF file downloads with article title as filename.

- [ ] T026 Create PDF generation utility in `next-frontend/lib/pdf.ts`
  - `function generateArticlePdf(title: string, content: string): void`
  - Use `jsPDF` to create A4 document
  - Add title as bold header
  - Add content as body text with basic formatting (paragraphs, line breaks)
  - Trigger browser download with filename: `${sanitizeFilename(title)}.pdf`
  - `sanitizeFilename`: replace non-alphanumeric chars (except hyphens/spaces) with underscore, limit to 100 chars

- [ ] T027 Integrate PDF download button in `next-frontend/components/articles/article-viewer.tsx`
  - Import `generateArticlePdf` from `@/lib/pdf`
  - Replace placeholder "Download PDF" button with onClick handler: `generateArticlePdf(article.title, article.content_markdown)`
  - Use lucide `Download` icon

---

## Phase 8: Polish & Cross-Cutting

- [ ] T028 Manual end-to-end test per `quickstart.md`
  - Apply migration `006_articles.sql` via Supabase Dashboard
  - Scrape a public article URL → verify it appears in list with "completed" status
  - View the article → verify Markdown renders correctly
  - Generate AI summary → verify it caches on reload
  - Ask a question via chat → verify streaming response + history persistence
  - Download PDF → verify file downloads
  - Delete article → verify all data removed (article + chat messages)
  - Test cookie-aware scraping: upload cookies for a domain, scrape article from that domain
  - Test SSRF protection: try submitting `http://127.0.0.1` or `http://169.254.169.254`
  - Test error handling: submit an invalid/unreachable URL

---

## Dependencies

```
T001 ──┐
T002 ──┤
T003 ──┼──→ T004 ──┐
       │    T005 ──┼──→ T006 ──→ T007 ──→ T008
       │           │
       └───────────┘
                   │
T009 ──┐           │
T010 ──┤           │
T011 ──┼──→ T012 ──→ T013 ──→ T014 ──→ T015 ──→ T016
       │
       └──→ T017 ──→ T018
                      │
                      ├──→ T019 ──→ T020 ──→ T021
                      ├──→ T022 ──→ T023 ──→ T024 ──→ T025
                      └──→ T026 ──→ T027
                                          │
                                          └──→ T028
```

**Key dependency chains**:
- **Backend**: T001 → T004/T005 (parallel) → T006 → T007 → T008
- **Frontend scraping**: T002/T003 → T009/T010/T011 (parallel) → T012 → T013 → T014 → T015/T016
- **Viewer**: T017 → T018 (after US1 so articles exist to view)
- **AI Summary**: T019 → T020 → T021 (after viewer exists)
- **Chat**: T022/T023 (parallel) → T024 → T025 (after viewer exists)
- **PDF**: T026 → T027 (after viewer exists)
- **US3, US4, US5 are independent of each other** — can be done in any order after US2

## Parallel Execution Opportunities

| Parallel Group | Tasks | Why Parallel |
| --- | --- | --- |
| Phase 1 setup | T001, T002, T003 | Different stacks (Python, JS, SQL) |
| Phase 2 backend | T004, T005 | Independent services, different files |
| Phase 3 frontend routes | T009, T010, T011 | Independent API routes and types |
| Phase 6 chat routes | T022, T023 | POST chat and GET/DELETE history are independent files |
| Post-viewer features | US3, US4, US5 | Independent feature branches off article viewer |

## Implementation Strategy

**MVP (Phase 1-3)**: T001-T016 — Users can scrape articles and see them in a list. Satisfies SC-1, SC-5, SC-6.

**Core experience (Phase 4)**: T017-T018 — Article viewer with Markdown rendering. Satisfies SC-2.

**AI features (Phase 5-6)**: T019-T025 — Summary and chat. Satisfies SC-3, SC-4.

**Polish (Phase 7-8)**: T026-T028 — PDF export and E2E verification. Satisfies SC-7.

**Fastest path**: Install deps (T001-T003 parallel) → Backend service (T004-T008) → Frontend (T009-T016) → Viewer (T017-T018) → AI/PDF in parallel (T019-T027) → E2E (T028).
