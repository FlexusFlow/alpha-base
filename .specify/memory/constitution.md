# ZipTrader Constitution

## Core Principles

### I. Full-Stack TypeScript-First Frontend, Python Backend

The system is a monorepo with two distinct stacks:
- **Frontend**: Next.js (App Router) + TypeScript + React + shadcn/ui + Tailwind CSS v3. All UI code MUST be TypeScript. Use server components by default, `'use client'` only when hooks/interactivity required.
- **Backend**: Python 3.11+ with FastAPI. Uses `uv` as the package manager. Business logic lives in `backend/app/services/`, routes in `backend/app/routers/`, models in `backend/app/models/`.
- **Database**: Supabase (PostgreSQL + Auth + RLS). Frontend uses the browser Supabase client (respects RLS). Backend uses the service role key (bypasses RLS) for administrative operations.

### II. API-Boundary Separation

Frontend and backend communicate exclusively through well-defined API endpoints:
- Next.js API routes (`next-frontend/app/api/`) act as a proxy/aggregation layer between the browser and external services (Python backend, Supabase).
- The Python backend exposes REST endpoints under `/v1/api/` and SSE streams under `/v1/api/events/`.
- Direct Supabase queries from the frontend browser client are permitted ONLY for user-scoped reads (channel list, video status checks). All writes that involve business logic MUST go through the backend or Next.js API routes.

### III. Supabase as Source of Truth

All persistent application state (channels, videos, transcription status, user data) lives in Supabase:
- Row Level Security (RLS) MUST be enforced for all user-facing tables.
- The `is_transcribed` flag and similar state mutations MUST be updated server-side (backend or Next.js API route), never relying solely on frontend callbacks.
- Supabase caching patterns (e.g., `last_scraped_at` for channel freshness) are preferred over in-memory or local caches.

### IV. Background Jobs with Real-Time Feedback

Long-running operations (video transcription, vectorization) MUST:
- Execute asynchronously via FastAPI `BackgroundTasks`.
- Report progress through SSE (Server-Sent Events) using the `JobManager` pub/sub pattern.
- Track failed items individually (per-video granularity) so partial successes are reported accurately.
- Set final job status to `FAILED` when all items fail, `COMPLETED` with failure count when partial.

### V. Simplicity and Pragmatism

- YAGNI: Do not build abstractions for hypothetical future requirements.
- Prefer editing existing files over creating new ones.
- Keep components small and focused. A component that does one thing well is better than a configurable mega-component.
- Rate limiting and retry logic MUST be considered when integrating with external APIs (YouTube, OpenAI).

## Technology Stack

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| Frontend framework | Next.js (App Router) | Latest stable |
| UI library | React + shadcn/ui | With Tailwind CSS v3 |
| Table/data | TanStack Table | Server-side pagination |
| Backend framework | FastAPI | Python 3.11+ |
| Package manager (Python) | uv | |
| Package manager (JS) | yarn | |
| Database | Supabase (PostgreSQL) | With RLS |
| Vector store | DeepLake Cloud | Via langchain-deeplake, Managed Tensor DB |
| Transcription | youtube-transcript-api | yt-dlp as fallback |
| LLM (RAG chat) | OpenAI (gpt-4o) | For knowledge base RAG chat |
| LLM (article features) | Anthropic Claude (Haiku/Sonnet) | For article summarization & Q&A |
| Embeddings | OpenAI (text-embedding-3-small) | |

## Development Workflow

- **Monorepo structure**: `backend/`, `next-frontend/`, `poc/`, `.specify/`
- **Backend dev**: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
- **Frontend dev**: `cd next-frontend && yarn dev`
- **Type checking**: `npx tsc --noEmit` MUST pass before any PR
- **Spec-Driven Development**: All new features MUST go through the SDD pipeline (specify → plan → tasks → implement). Retroactive specs are written for existing features to establish baseline.

## Governance

- This constitution supersedes ad-hoc decisions. Amendments require updating this document with version bump and rationale.
- All PRs MUST be reviewed against these principles.
- When a principle conflicts with shipping speed, document the trade-off explicitly in the PR description.

**Version**: 1.3.0 | **Ratified**: 2026-02-11 | **Last Amended**: 2026-02-23

### Amendment Log
- **1.3.0** (2026-02-23): Updated DeepLake to Cloud Managed Tensor Database for Deep Memory support (ZIP-004).
- **1.2.0** (2026-02-22): Added Anthropic Claude (Haiku/Sonnet) as approved LLM for article summarization and Q&A (ZIP-003).
- **1.1.0** (2026-02-17): Fixed Tailwind CSS v4→v3 and npm→yarn to match actual project setup.
