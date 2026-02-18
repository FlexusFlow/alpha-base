# ZipTrader (AlphaBase) — Implemented Features

## Stage 1: Core YouTube Scraping & Knowledge Base Pipeline

- AB-0001 YouTube channel preview — Paste a channel URL, backend scrapes video metadata via yt-dlp (titles, views, URLs, up to 500 videos)
- AB-0002 Automatic video categorization — Regex-based categorizer sorts videos into 5 categories: Educational & Tutorials, Congress & Insider Moves, Market News & Alerts, Stock Picks & Analysis, Market Commentary & Macro
- AB-0003 Video selection table — MUI DataGrid with checkbox selection, sorting by views/title/category
- AB-0004 Video transcription pipeline — Primary: youtube-transcript-api (free, instant); Fallback: yt-dlp subtitle download + VTT parsing
- AB-0005 Transcript storage — Markdown files saved to backend/knowledge_base/transcripts/
- AB-0006 DeepLake vector store ingestion — Batch vectorization of transcripts using OpenAI text-embedding-3-small embeddings, LangChain RecursiveCharacterTextSplitter (1000 chars, 200 overlap)
- AB-0007 Background job processing — FastAPI BackgroundTasks for non-blocking transcription
- AB-0008 Real-time job progress via SSE — Server-Sent Events streaming job status (progress %, processed/failed counts)
- AB-0009 Job polling endpoint — GET /v1/api/knowledge/jobs/{job_id} for status polling
- AB-0010 YouTube rate-limit protection — 2-second delay between consecutive transcript requests to avoid YouTube throttling
- AB-0011 Backend-side transcription marking — Backend directly sets is_transcribed = true in Supabase after each successful transcription, rather than relying on frontend
- AB-0012 Succeeded videos tracking — succeeded_videos field in job model/API response so frontend knows exactly which videos were transcribed
- AB-0013 Partial failure reporting — Job completion messages distinguish between full success ("All N video(s) added successfully"), partial failure ("N added, M failed"), and total failure ("All N failed")
- AB-0014 Backend convenience script — backend/run.sh for one-command server start

## Authentication & User Management (pre-SDD)

- AB-0015 Supabase Auth integration — Full authentication system via Supabase with server-side session management
- AB-0016 Login page — Email/password sign-in at /auth/login with error handling and loading state
- AB-0017 Sign-up page — Email/password registration at /auth/sign-up with password confirmation (repeat password field)
- AB-0018 Sign-up success page — /auth/sign-up-success prompting user to check email for confirmation
- AB-0019 Email OTP confirmation — /auth/confirm route that verifies email tokens and redirects on success/error
- AB-0020 Forgot password flow — /auth/forgot-password sends reset email via Supabase, shows success confirmation
- AB-0021 Update password page — /auth/update-password for setting a new password after email reset
- AB-0022 Auth error page — /auth/error displays authentication error messages
- AB-0023 Middleware auth guard — Next.js middleware (proxy.ts) redirects unauthenticated users to /auth/login for all non-auth routes
- AB-0024 Root page redirect — / automatically redirects authenticated users to /dashboard, unauthenticated to /auth/login

## Stage 2: Next.js Frontend Migration

- AB-0025 Next.js 15 App Router frontend — Migrated from Vite/React/MUI to Next.js + shadcn/ui + Radix
- AB-0026 TanStack Table — Replaced MUI DataGrid with TanStack Table (checkbox selection, sorting, client-side pagination)
- AB-0027 Knowledge Base landing page — /dashboard/knowledge with "Add YouTube Channel" and "Add Article" action cards
- AB-0028 YouTube channel add page — /dashboard/knowledge/youtube/add with full scrape-preview-select-transcribe workflow
- AB-0029 Projects page — /dashboard/projects (renamed from Invoices) for project-scoped work
- AB-0030 Sidebar navigation — Projects + Knowledge Base menu items with lucide-react icons
- AB-0031 Toast notifications — shadcn/ui toast for job progress and completion (replaced MUI Snackbar)
- AB-0032 Category badge filtering — Clickable category badges to filter videos by category
- AB-0033 Dashboard home page — /dashboard showing welcome message with user email
- AB-0034 Theme switcher — Dark/Light/System theme toggle via next-themes dropdown in the UI
- AB-0035 Collapsible sidebar — Sidebar supports icon-only collapsed mode with SidebarTrigger toggle button
- AB-0036 Sidebar user menu — Footer dropdown with user icon, Sign out action, and Account/Billing placeholders
- AB-0037 File upload dropzone component — Drag-and-drop file upload UI with progress tracking, file validation, error handling, and Supabase Storage integration (prepared for article ingestion)
- AB-0038 Supabase upload hook — useSupabaseUpload hook with configurable bucket, mime type filtering, max file size/count, and upload state management
- AB-0039 Legacy frontend preserved — Original Vite/React/MUI frontend kept as frontend_legacy/ for reference

## Stage 3: Supabase Persistence

- AB-0040 Supabase database schema — channels, videos, categories tables with Row Level Security
- AB-0041 Channel & video persistence — Scraped channels and all video metadata saved to Supabase
- AB-0042 Transcription status tracking — is_transcribed boolean on videos table, updated after successful transcription
- AB-0043 Upsert semantics — Re-scraping the same channel updates existing records without duplicates
- AB-0044 User-scoped data — RLS policies ensure users only see their own channels/videos

## Stage 4: RAG Chat with Knowledge Base

- AB-0045 Project creation — Users create named projects (chat sessions) stored in Supabase
- AB-0046 Project deletion — Delete button on project cards with immediate UI update
- AB-0047 RAG-powered chat — POST /v1/api/chat with context retrieval from DeepLake vector store
- AB-0048 Similarity search — Queries DeepLake for top-5 most relevant transcript chunks per user message
- AB-0049 Streaming chat responses — SSE streaming of LLM tokens (ChatOpenAI with GPT-4o)
- AB-0050 Chat history persistence — Messages stored in Supabase chat_messages table
- AB-0051 Chat history loading — Server-side fetch of previous messages when opening a project
- AB-0052 Source citations — Retrieved context sources returned with each response
- AB-0053 System prompt with RAG context — ZipTrader-specific system prompt with injected knowledge base context
- AB-0054 Chat UI — ChatWindow component with message bubbles, auto-scroll, streaming display, source links

## Stage 5: Scrape-Once Caching (BFF Orchestration)

- AB-0055 Next.js API route as BFF — /api/youtube/preview orchestration layer between frontend and Python backend
- AB-0056 Daily scrape caching — Channel scraped once per day; subsequent requests served from Supabase (last_scraped_at check)
- AB-0057 Server-side pagination — Videos served from Supabase with LIMIT/OFFSET (instant page navigation)
- AB-0058 Implicit data saving — Removed manual "Save Results" button; all scraped data auto-saved on first preview
- AB-0059 Category filtering from DB — Category-based video filtering queries Supabase directly

## Stage 6: Channel List & Transcription Guard

- AB-0060 Channel list on Knowledge Base page — Displays all previously scraped channels as cards (title, URL, video count, last scraped date)
- AB-0061 Click-to-navigate — Clicking a channel card auto-populates the add page URL and triggers cached preview
- AB-0062 Transcription guard — Videos with is_transcribed = true have disabled checkboxes; "Select All" skips them automatically
- AB-0063 Visual transcription status — Transcribed rows visually distinguished in the video table (dimmed + badge)

## Bugfixes (pre-SDD)

- AB-0064 Next.js hydration error fixes — Wrapped useSearchParams() in Suspense boundaries, moved await params inside Suspense on project chat page, replaced `<Link>` wrapper with onClick + router.push on channel cards to eliminate nested `<a>` tags (commit c924954)
- AB-0065 Stale closure fix in job-notification — Stabilized onComplete ref in job-notification component to avoid stale closures (commit e92b924)

## Infrastructure & Architecture

- AB-0066 Python FastAPI backend — Routers/services/models pattern, uv package manager
- AB-0067 Next.js 15 frontend — App Router, shadcn/ui, Tailwind CSS v3, Supabase Auth
- AB-0068 Supabase — Auth, PostgreSQL database, Row Level Security
- AB-0069 DeepLake — Local vector store (with documented migration path to Activeloop Cloud)
- AB-0070 Deployment options documented — Vercel + Railway + Activeloop Cloud, serverless, or single VPS
- AB-0071 Speckit project configuration — Added speckit templates and commands for feature specification workflows (commit 9e4be3e)

## Stage 7: Delete Scraped Channels (AB-0072)

- AB-0072 Single channel deletion — Delete button on channel cards with confirmation dialog, cleanup-first orchestration (vectors → files → DB), immediate UI removal, toast notifications
- AB-0072 Transcription-aware deletion — Confirmation dialog shows transcribed video count, deletes DeepLake vector entries and transcript markdown files, active job conflict detection (409)
- AB-0072 Bulk channel deletion — Selection mode with checkbox overlays, floating action bar, bulk delete endpoint with partial failure handling, summary toast
- AB-0072 Delete cleanup services — VectorStoreService.delete_by_video_ids (TQL metadata query + delete), delete_transcripts (file cleanup by sanitized title)
- AB-0072 Delete BFF proxy routes — Next.js API routes for single DELETE and bulk POST, forwarding authenticated requests to Python backend
- AB-0072 Delete polish — Loading spinner on delete button, 404 graceful handling (already-deleted channels), empty channel list guard for selection mode

## Stage 8: Cookie Management (ZIP-001)

- ZIP-001 Cookie file upload — File picker for uploading `{domain}.cookies.json` files to Supabase Storage, with filename validation, 1 MB size limit, domain normalization (www. stripping), and same-domain replacement semantics
- ZIP-001 Cookie metadata persistence — `user_cookies` table (id, user_id, domain, filename, file_path, earliest_expiry, created_at) with UNIQUE(user_id, domain) constraint and Row Level Security policies for SELECT/INSERT/DELETE
- ZIP-001 Cookie file storage — Private `cookie-files` Supabase Storage bucket with user-scoped access policies (`{user_id}/{filename}` path structure)
- ZIP-001 Cookie listing & status — Table view showing domain, filename, upload date, and expiration status badges (Active/Expired/Unknown) based on earliest cookie expiry extracted from file content
- ZIP-001 Cookie deletion — Per-row delete button removing both storage file and database record with toast feedback
- ZIP-001 Cookie API routes — Next.js API routes (GET/POST/DELETE /api/cookies) handling authentication, validation, 50-cookie-per-user limit, and Supabase Storage + DB operations
- ZIP-001 Cookie warning modal — AlertDialog component warning about sensitive authentication tokens (prepared for future scraping flow integration)
- ZIP-001 Dashboard integration — /dashboard/cookies page with CookieManagement component, sidebar navigation entry with Cookie icon
- ZIP-001 Utility functions — Domain extraction from filenames, domain normalization, earliest expiry calculation from cookie entries
- ZIP-001 Constitution alignment — Fixed Tailwind v4→v3 and npm→yarn drift in speckit constitution

## Planned (Not Yet Implemented)

- "Add Article" knowledge source (button exists, disabled; dropzone component ready)
