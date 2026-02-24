# Research: ZIP-003 Article Scraping Migration

## R-1: Where Should Scraping Run — Next.js or Python Backend?

**Decision**: Python backend (FastAPI)

**Rationale**:
- The spec's Assumption #1 originally said Next.js, but the clarification changed scraping to async (Q3). The constitution (Principle IV) requires async jobs to use FastAPI `BackgroundTasks` + `JobManager` + SSE. Running Playwright in a Next.js API route would block the serverless function and violate the established pattern.
- The Python backend already has: `JobManager` singleton, SSE `/v1/api/events/stream/{job_id}`, `BackgroundTasks` integration, and Supabase service-role access.
- Playwright has first-class Python support (`playwright` package) and fits naturally into the `asyncio.to_thread()` pattern used for yt-dlp.

**Alternatives Considered**:
1. *Next.js API route with Playwright* — Would work for sync scraping but blocks serverless function for 10-30s. Doesn't support SSE/job progress. Conflicts with constitution Principle IV.
2. *Hybrid (Next.js triggers, Python scrapes)* — This is what we're doing. Next.js handles auth + validates URL, Python backend handles the actual scraping job.

## R-2: Where Should AI Features Run — Next.js or Python Backend?

**Decision**: Next.js API routes (direct Anthropic SDK)

**Rationale**:
- Summarization and chat are synchronous, request-response operations (not background jobs). They complete within seconds.
- The source project already has working Anthropic SDK integration in Next.js.
- No need to route through Python backend — these don't involve DeepLake, vector store, or any Python-specific services.
- The Anthropic TypeScript SDK (`@anthropic-ai/sdk`) is mature and well-supported.

**Alternatives Considered**:
1. *Python backend with LangChain* — Overengineered for simple prompt-in/text-out. No RAG needed since article content is passed directly.
2. *Python backend direct Anthropic* — Adds unnecessary network hop. No benefit over calling from Next.js.

## R-3: Playwright in Python — Installation & Patterns

**Decision**: Use `playwright` Python package with async API

**Rationale**:
- `pip install playwright && playwright install chromium` — installs only Chromium (not Firefox/WebKit)
- Async API: `async with async_playwright() as p:` — integrates with FastAPI's event loop via `asyncio.to_thread()`
- Cookie injection via `browser_context.add_cookies()` — accepts list of dicts with name/value/domain/path
- Content extraction: use `page.query_selector()` with the same priority selector list from the source project

**Key Considerations**:
- Playwright binary (~150MB for Chromium) must be installed in the Docker image
- Browser context should be created per-scrape and disposed after (no shared browser state)
- Set a 30-second navigation timeout to match SC-1

## R-4: URL Validation & SSRF Protection

**Decision**: Validate URL on the Next.js side before forwarding to backend

**Rationale**:
- Parse URL with `new URL()` — reject non-HTTP(S) schemes
- Resolve hostname to IP and check against private ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, fe80::)
- Block `localhost`, `0.0.0.0`, metadata endpoints (169.254.169.254)
- This validation happens in the Next.js API route (fast, before any backend call)
- Backend should also validate as defense-in-depth

## R-5: Async Notification Mechanism

**Decision**: Reuse existing SSE/JobManager pattern + article status field

**Rationale**:
- The existing `JobManager` + SSE pattern works well for YouTube transcription.
- For articles: create a job, return `job_id` to frontend, frontend subscribes to SSE.
- Additionally, the `articles` table should have a `status` field (`pending`, `scraping`, `completed`, `failed`) so the article list shows current state even without SSE.
- When scraping completes, the job status updates and the article record transitions to `completed`.

## R-6: Content Size Enforcement

**Decision**: Enforce 200KB limit at extraction time in the backend

**Rationale**:
- After HTML→Markdown conversion, check byte length of result
- If > 200KB, truncate at the last complete paragraph boundary before 200KB
- Store truncation flag in article record so UI can show "Content truncated" notice
- This prevents unbounded storage and keeps AI context manageable

## R-7: Existing Chat Messages Table Reuse

**Decision**: Create a separate `article_chat_messages` table (not reuse `chat_messages`)

**Rationale**:
- The existing `chat_messages` table is tied to `projects` (FK to `projects.id`). Articles are a different entity.
- A separate table keeps the schema clean and allows article-specific RLS policies.
- The schema mirrors `chat_messages` but references `article_id` instead of `project_id`.
- No `sources` column needed (article chat doesn't reference external sources — the article itself is the source).
