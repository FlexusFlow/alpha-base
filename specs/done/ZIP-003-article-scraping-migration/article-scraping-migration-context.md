# Article Scraping Migration Context

This document provides full context for migrating article scraping functionality from `medium-legal-scrapper` to `alphabase/next-frontend`. Use this as input to `/speckit.specify`.

---

## What Exists in the Source Project

The source project (`medium-legal-scrapper`) has a complete article scraping pipeline:

### Scraping Flow
1. User enters a URL in the Article Fetch Form
2. System checks if cookies exist for that domain (GET `/api/scrape-article?url=...`)
3. If no cookies → warning modal; user can proceed without or cancel
4. POST `/api/scrape-article` with `{ url, useCookies }`
5. Server downloads cookie file from Supabase storage if available
6. Playwright launches headless Chromium, injects cookies, navigates to URL
7. Extracts article content by trying selectors in order: `article`, `[role="article"]`, `.article-content`, `.post-content`, `.entry-content`, `.content-body`, `main`, `.main-content`, fallback to `body`
8. Strips noise (scripts, ads, nav, footer, comments)
9. Converts HTML to Markdown via Turndown
10. Saves to `articles` table (user_id, url, title, content, content_markdown)
11. Redirects to article viewer

### Article Viewer
- Displays article as rendered Markdown (or plain text fallback)
- Shows title, source URL link, creation date
- Action buttons: Download PDF, Summarize, Ask Questions, Delete

### AI Features on Articles
- **Summarize**: POST `/api/ai/summarize` → Claude Haiku generates summary, cached in `articles.summary` column
- **Chat**: POST `/api/ai/chat` → Claude Sonnet answers questions using article content as system prompt context, messages stored in `chat_messages` table

### Database Schema (Source)
**articles table**:
- `id` UUID PK
- `user_id` UUID FK → auth.users
- `url` text
- `title` text (nullable)
- `content` text (plain text)
- `content_markdown` text
- `summary` text (nullable, AI-generated)
- `created_at` timestamptz

**chat_messages table** (for article Q&A):
- `id` UUID PK
- `article_id` UUID FK → articles
- `user_id` UUID FK → auth.users
- `role` text ('user' | 'assistant')
- `content` text
- `created_at` timestamptz

### Source Files Involved
- `app/api/scrape-article/route.ts` — GET (cookie check) + POST (scrape & save)
- `lib/playwright.ts` — browser automation, cookie injection, content extraction
- `lib/markdown.ts` — HTML→Markdown via Turndown
- `lib/cookies.ts` — domain extraction utilities
- `lib/claude.ts` — Anthropic SDK wrapper (haiku for summaries, sonnet for chat)
- `lib/pdf.ts` — jsPDF article export
- `lib/types.ts` — ScrapeResult, UserCookie, CookieEntry interfaces
- `components/article-fetch-form.tsx` — URL input + cookie check flow
- `components/article-viewer.tsx` — full article display with actions
- `components/article-summary.tsx` — AI summary display
- `components/ai-chat.tsx` — Q&A chat interface
- `components/article-list.tsx` — article list on dashboard
- `app/api/ai/summarize/route.ts` — summary generation endpoint
- `app/api/ai/chat/route.ts` — chat response endpoint
- `app/api/ai/chat/history/route.ts` — chat history load/clear
- `app/api/articles/[id]/route.ts` — article deletion
- `app/dashboard/article/view/page.tsx` — article view page

### NPM Dependencies Used by Scraping
- `playwright` — browser automation
- `turndown` — HTML to Markdown
- `jspdf` — PDF export
- `@anthropic-ai/sdk` — Claude API
- `react-markdown` + `remark-gfm` — Markdown rendering

---

## What Exists in the Target Project

### Architecture
- Next.js 15 with App Router, React 19, Supabase, shadcn/ui, Tailwind CSS
- Python backend at `NEXT_PUBLIC_API_BASE_URL` handles heavy processing (YouTube scraping, transcription, RAG chat)
- Next.js API routes act as auth-checked proxies to the Python backend

### Existing Similar Functionality
- **YouTube channel scraping**: preview channels, paginated video lists, batch transcription jobs
- **Knowledge Base**: hub page with cards for YouTube channels + placeholder "Add Article" (marked "Coming soon")
- **Chat/Projects**: per-project chat with streaming responses from Python backend
- **Cookie management**: already migrated (spec 073) — upload, list, delete cookie files

### Relevant Existing Patterns
- API routes: create server client → check auth → proxy to backend or query Supabase → return JSON
- Client components: `"use client"` with useState, fetch to API routes, toast notifications
- Tables: TanStack React Table with pagination and selection
- Job status: EventSource subscriptions for real-time progress
- Types: organized in `lib/types/*.ts`
- Supabase helpers: organized in `lib/supabase/*.ts`

### Existing Tables
- `channels`, `videos`, `categories` (YouTube)
- `projects`, `chat_messages` (chat)
- `user_cookies` (cookies — already migrated)

### Installed shadcn/ui Components
button, input, label, card, badge, checkbox, alert, alert-dialog, dropdown-menu, table, pagination, progress, separator, skeleton, sidebar, sheet, toast, toaster, tooltip

### Missing Dependencies (would need to install)
- `playwright` — not currently used (scraping is in Python backend)
- `turndown` — not installed
- `react-markdown` — not installed
- `jspdf` — not installed

### Navigation (app-sidebar.tsx)
Items array: Projects, Knowledge Base, Cookies — article pages would likely live under Knowledge Base

---

## Key Architectural Decision

The target project uses a **Python backend for heavy processing** (YouTube scraping, transcription, RAG). The source project does scraping directly in Next.js via Playwright.

Options for article scraping in target:
1. **Port Playwright scraping to Next.js** (like source) — simpler, self-contained, but doesn't follow target's backend pattern
2. **Add article scraping to Python backend** — consistent architecture, but requires backend changes outside next-frontend
3. **Hybrid**: Next.js handles the UI/API routes and cookie management, delegates actual scraping to Python backend via API call

---

## Scope Considerations

The migration could be phased:
- **Phase 1**: Article CRUD (save URL + metadata, list, view, delete) — no scraping, just manual article management
- **Phase 2**: Scraping integration (Playwright or Python backend)
- **Phase 3**: AI features (summarize, chat) on articles
- **Phase 4**: PDF export

The cookie management dependency (spec 073) is already handled.
