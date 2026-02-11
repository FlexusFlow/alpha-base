 ---                                                                                                                                
  ZipTrader (AlphaBase) — Complete Feature List
                                                                                                                                     
  Stage 1: Core YouTube Scraping & Knowledge Base Pipeline                                                                         
                                                                                                                                     
  - YouTube channel preview — Paste a channel URL, backend scrapes video metadata via yt-dlp (titles, views, URLs, up to 500 videos)
  - Automatic video categorization — Regex-based categorizer sorts videos into 5 categories: Educational & Tutorials, Congress &
  Insider Moves, Market News & Alerts, Stock Picks & Analysis, Market Commentary & Macro
  - Video selection table — MUI DataGrid with checkbox selection, sorting by views/title/category
  - Video transcription pipeline — Primary: youtube-transcript-api (free, instant); Fallback: yt-dlp subtitle download + VTT parsing
  - Transcript storage — Markdown files saved to backend/knowledge_base/transcripts/
  - DeepLake vector store ingestion — Batch vectorization of transcripts using OpenAI text-embedding-3-small embeddings, LangChain
  RecursiveCharacterTextSplitter (1000 chars, 200 overlap)
  - Background job processing — FastAPI BackgroundTasks for non-blocking transcription
  - Real-time job progress via SSE — Server-Sent Events streaming job status (progress %, processed/failed counts)
  - Job polling endpoint — GET /v1/api/knowledge/jobs/{job_id} for status polling
  - YouTube rate-limit protection — 2-second delay between consecutive transcript requests to avoid YouTube throttling (commit
  6b47c7c)
  - Backend-side transcription marking — Backend directly sets is_transcribed = true in Supabase after each successful
  transcription, rather than relying on frontend (commit 6b47c7c)
  - Succeeded videos tracking — succeeded_videos field in job model/API response so frontend knows exactly which videos were
  transcribed (commit 6b47c7c)
  - Partial failure reporting — Job completion messages distinguish between full success ("All N video(s) added successfully"),
   partial failure ("N added, M failed"), and total failure ("All N failed") (commit 6b47c7c)
  - Backend convenience script — backend/run.sh for one-command server start (commit 6b47c7c)

  Authentication & User Management (not in any plan)

  - Supabase Auth integration — Full authentication system via Supabase with server-side session management
  - Login page — Email/password sign-in at /auth/login with error handling and loading state
  - Sign-up page — Email/password registration at /auth/sign-up with password confirmation (repeat password field)
  - Sign-up success page — /auth/sign-up-success prompting user to check email for confirmation
  - Email OTP confirmation — /auth/confirm route that verifies email tokens and redirects on success/error
  - Forgot password flow — /auth/forgot-password sends reset email via Supabase, shows success confirmation
  - Update password page — /auth/update-password for setting a new password after email reset
  - Auth error page — /auth/error displays authentication error messages
  - Middleware auth guard — Next.js middleware (proxy.ts) redirects unauthenticated users to /auth/login for all non-auth
  routes
  - Root page redirect — / automatically redirects authenticated users to /dashboard, unauthenticated to /auth/login

  Stage 2: Next.js Frontend Migration

  - Next.js 15 App Router frontend — Migrated from Vite/React/MUI to Next.js + shadcn/ui + Radix
  - TanStack Table — Replaced MUI DataGrid with TanStack Table (checkbox selection, sorting, client-side pagination)
  - Knowledge Base landing page — /dashboard/knowledge with "Add YouTube Channel" and "Add Article" action cards
  - YouTube channel add page — /dashboard/knowledge/youtube/add with full scrape-preview-select-transcribe workflow
  - Projects page — /dashboard/projects (renamed from Invoices) for project-scoped work
  - Sidebar navigation — Projects + Knowledge Base menu items with lucide-react icons
  - Toast notifications — shadcn/ui toast for job progress and completion (replaced MUI Snackbar)
  - Category badge filtering — Clickable category badges to filter videos by category
  - Dashboard home page — /dashboard showing welcome message with user email
  - Theme switcher — Dark/Light/System theme toggle via next-themes dropdown in the UI
  - Collapsible sidebar — Sidebar supports icon-only collapsed mode with SidebarTrigger toggle button
  - Sidebar user menu — Footer dropdown with user icon, Sign out action, and Account/Billing placeholders
  - File upload dropzone component — Drag-and-drop file upload UI with progress tracking, file validation, error handling, and
  Supabase Storage integration (prepared for article ingestion)
  - Supabase upload hook — useSupabaseUpload hook with configurable bucket, mime type filtering, max file size/count, and
  upload state management
  - Legacy frontend preserved — Original Vite/React/MUI frontend kept as frontend_legacy/ for reference

  Stage 3: Supabase Persistence

  - Supabase database schema — channels, videos, categories tables with Row Level Security
  - Channel & video persistence — Scraped channels and all video metadata saved to Supabase
  - Transcription status tracking — is_transcribed boolean on videos table, updated after successful transcription
  - Upsert semantics — Re-scraping the same channel updates existing records without duplicates
  - User-scoped data — RLS policies ensure users only see their own channels/videos

  Stage 4: RAG Chat with Knowledge Base

  - Project creation — Users create named projects (chat sessions) stored in Supabase
  - Project deletion — Delete button on project cards with immediate UI update
  - RAG-powered chat — POST /v1/api/chat with context retrieval from DeepLake vector store
  - Similarity search — Queries DeepLake for top-5 most relevant transcript chunks per user message
  - Streaming chat responses — SSE streaming of LLM tokens (ChatOpenAI with GPT-4o)
  - Chat history persistence — Messages stored in Supabase chat_messages table
  - Chat history loading — Server-side fetch of previous messages when opening a project
  - Source citations — Retrieved context sources returned with each response
  - System prompt with RAG context — ZipTrader-specific system prompt with injected knowledge base context
  - Chat UI — ChatWindow component with message bubbles, auto-scroll, streaming display, source links

  Stage 5: Scrape-Once Caching (BFF Orchestration)

  - Next.js API route as BFF — /api/youtube/preview orchestration layer between frontend and Python backend
  - Daily scrape caching — Channel scraped once per day; subsequent requests served from Supabase (last_scraped_at check)
  - Server-side pagination — Videos served from Supabase with LIMIT/OFFSET (instant page navigation)
  - Implicit data saving — Removed manual "Save Results" button; all scraped data auto-saved on first preview
  - Category filtering from DB — Category-based video filtering queries Supabase directly

  Stage 6: Channel List & Transcription Guard

  - Channel list on Knowledge Base page — Displays all previously scraped channels as cards (title, URL, video count, last scraped
  date)
  - Click-to-navigate — Clicking a channel card auto-populates the add page URL and triggers cached preview
  - Transcription guard — Videos with is_transcribed = true have disabled checkboxes; "Select All" skips them automatically
  - Visual transcription status — Transcribed rows visually distinguished in the video table (dimmed + badge)

  Bugfixes (not in any plan)

  - Next.js hydration error fixes — Wrapped useSearchParams() in Suspense boundaries, moved await params inside Suspense on
  project chat page, replaced <Link> wrapper with onClick + router.push on channel cards to eliminate nested <a> tags (commit
  c924954)
  - Stale closure fix in job-notification — Stabilized onComplete ref in job-notification component to avoid stale closures
  (commit e92b924)

  Infrastructure & Architecture

  - Python FastAPI backend — Routers/services/models pattern, uv package manager
  - Next.js 15 frontend — App Router, shadcn/ui, Tailwind CSS v3, Supabase Auth
  - Supabase — Auth, PostgreSQL database, Row Level Security
  - DeepLake — Local vector store (with documented migration path to Activeloop Cloud)
  - Deployment options documented — Vercel + Railway + Activeloop Cloud, serverless, or single VPS
  - Speckit project configuration — Added speckit templates and commands for feature specification workflows (commit 9e4be3e)

  Planned (Not Yet Implemented)

  - "Add Article" knowledge source (button exists, disabled; dropzone component ready)
  - Deletion of scraped data from Supabase
  - Deletion of data from DeepLake vector database