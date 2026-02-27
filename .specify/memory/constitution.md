<!--
Sync Impact Report
===================
Version change: 1.5.0 → 1.7.0

Modified principles:
- Principle I: Python 3.11+ → 3.12+
- Principle II: Added public RAG API layer (ZIP-006)

Added sections:
- Principle VI: Per-User Data Isolation (ALP-007)

Removed sections:
- Known Limitations → "Shared vector store" removed (resolved by ALP-007)

Templates requiring updates:
- ⚠ No .specify/templates/ found in repo (templates directory absent)

Follow-up TODOs: none
-->

# AlphaBase Constitution

## Core Principles

### I. Full-Stack TypeScript-First Frontend, Python Backend

The system is a monorepo with two distinct stacks:
- **Frontend**: Next.js (App Router) + TypeScript + React + shadcn/ui + Tailwind CSS v3. All UI code MUST be TypeScript. Use server components by default, `'use client'` only when hooks/interactivity required.
- **Backend**: Python 3.12+ with FastAPI. Uses `uv` as the package manager. Business logic lives in `backend/app/services/`, routes in `backend/app/routers/`, models in `backend/app/models/`.
- **Database**: Supabase (PostgreSQL + Auth + RLS). Frontend uses the browser Supabase client (respects RLS). Backend uses the service role key (bypasses RLS) for administrative operations.

### II. API-Boundary Separation

Frontend and backend communicate exclusively through well-defined API endpoints:
- Next.js API routes (`next-frontend/app/api/`) act as a proxy/aggregation layer between the browser and external services (Python backend, Supabase).
- The Python backend exposes REST endpoints under `/v1/api/` and SSE streams under `/v1/api/events/`.
- The Python backend also exposes a **public RAG API** under `/v1/public/` authenticated via API keys (not Supabase Auth). API keys are managed per-user with rate limiting (ZIP-006).
- Direct Supabase queries from the frontend browser client are permitted ONLY for user-scoped reads (channel list, video status checks). All writes that involve business logic MUST go through the backend or Next.js API routes.

### III. Supabase as Source of Truth

All persistent application state (channels, videos, transcription status, user data) lives in Supabase:
- Row Level Security (RLS) MUST be enforced for all user-facing tables.
- The `is_transcribed` flag and similar state mutations MUST be updated server-side (backend or Next.js API route), never relying solely on frontend callbacks.
- Supabase caching patterns (e.g., `last_scraped_at` for channel freshness) are preferred over in-memory or local caches.

### IV. Background Jobs with Real-Time Feedback

Long-running operations (video transcription, documentation scraping, vectorization) MUST:
- Execute asynchronously via FastAPI `BackgroundTasks`.
- Report progress through SSE (Server-Sent Events) using the `JobManager` pub/sub pattern.
- Track failed items individually (per-video granularity) so partial successes are reported accurately.
- Set final job status to `FAILED` when all items fail, `COMPLETED` with failure count when partial.

### V. Simplicity and Pragmatism

- YAGNI: Do not build abstractions for hypothetical future requirements.
- Prefer editing existing files over creating new ones.
- Keep components small and focused. A component that does one thing well is better than a configurable mega-component.
- Rate limiting and retry logic MUST be considered when integrating with external APIs (YouTube, OpenAI).

### VI. Per-User Data Isolation

All user data MUST be isolated at every layer:
- **Supabase**: Row Level Security (RLS) enforces per-user access on all user-facing tables.
- **DeepLake vector store**: Each user gets a dedicated dataset (`user-{id}`) via `get_user_vectorstore()`. There is no shared global vector store — all ingestion, search, deletion, and Deep Memory training operate on the user's own dataset.
- **Backend callers**: All backend services (chat, knowledge ingestion, deletion, deep memory) MUST resolve `user_id` and use the per-user vectorstore factory. Chat resolves `user_id` from project ownership rather than requiring it in the request body.

## Technology Stack

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| Frontend framework | Next.js (App Router) | Latest stable |
| UI library | React + shadcn/ui | With Tailwind CSS v3 |
| Table/data | TanStack Table | Server-side pagination |
| Backend framework | FastAPI | Python 3.12+ |
| Package manager (Python) | uv | |
| Package manager (JS) | yarn | |
| Database | Supabase (PostgreSQL) | With RLS |
| Vector store | DeepLake Cloud | Per-user datasets, Managed Tensor DB |
| Web scraping | Playwright + markdownify | Article & documentation scraping |
| Transcription | youtube-transcript-api | yt-dlp as fallback |
| LLM (RAG chat) | OpenAI (gpt-4o) | For knowledge base RAG chat |
| LLM (article features) | Anthropic Claude (Haiku/Sonnet) | For article summarization & Q&A |
| Embeddings | OpenAI (text-embedding-3-small) | |
| Public API auth | API keys + rate limiting | Per-user keys (ZIP-006) |

## Development Workflow

- **Monorepo structure**: `backend/`, `next-frontend/`, `.specify/`
- **Backend dev**: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
- **Frontend dev**: `cd next-frontend && yarn dev`
- **Type checking**: `npx tsc --noEmit` MUST pass before any PR
- **Spec-Driven Development**: All new features MUST go through the SDD pipeline (specify → plan → tasks → implement). Retroactive specs are written for existing features to establish baseline.

## Known Limitations

- **No FastAPI auth middleware**: Backend endpoints accept `user_id` from request body/query params. While Next.js API routes inject the authenticated user's ID, FastAPI endpoints themselves are unauthenticated — any direct caller can pass any `user_id`. JWT validation middleware is in the backlog.

## Governance

- This constitution supersedes ad-hoc decisions. Amendments require updating this document with version bump and rationale.
- All PRs MUST be reviewed against these principles.
- When a principle conflicts with shipping speed, document the trade-off explicitly in the PR description.

**Version**: 1.8.0 | **Ratified**: 2026-02-11 | **Last Amended**: 2026-02-27

### Amendment Log
- **1.8.0** (2026-02-27): Added Playwright + markdownify to Technology Stack for web scraping (articles & documentation); updated Principle IV to list documentation scraping as a long-running operation (ALP-008).
- **1.7.0** (2026-02-27): Added Principle VI (Per-User Data Isolation) — ALP-007 implemented per-user DeepLake datasets via `get_user_vectorstore()`; removed "shared vector store" from Known Limitations; updated Known Limitations to document missing FastAPI auth middleware.
- **1.6.0** (2026-02-27): Documented ZIP-006 public RAG API in Principle II and Technology Stack — public endpoints under `/v1/public/` with API key auth and rate limiting; updated Python version 3.11+ → 3.12+; removed `poc/` from monorepo structure (deleted in ZIP-006).
- **1.5.0** (2026-02-25): Added Known Limitations section — documented shared DeepLake vector store (not user-isolated); added ZIP-006 public RAG API context.
- **1.4.0** (2026-02-24): Documented Deep Memory cloud-only requirement — Deep Memory features are gated behind `hub://` DeepLake paths; local vector stores show a warning (ZIP-005).
- **1.3.0** (2026-02-23): Updated DeepLake to Cloud Managed Tensor Database for Deep Memory support (ZIP-004).
- **1.2.0** (2026-02-22): Added Anthropic Claude (Haiku/Sonnet) as approved LLM for article summarization and Q&A (ZIP-003).
- **1.1.0** (2026-02-17): Fixed Tailwind CSS v4→v3 and npm→yarn to match actual project setup.