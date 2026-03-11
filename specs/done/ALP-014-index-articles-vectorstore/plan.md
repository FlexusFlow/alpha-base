# Implementation Plan: Index Articles in Vector Store

**Branch**: `feature/ALP-014-index-articles-vectorstore` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/ALP-014-index-articles-vectorstore/spec.md`

## Summary

Articles scraped via the existing article flow are currently stored only in Supabase and invisible to RAG chat. This feature adds vector store indexing during article ingestion (following the documentation pages pattern) and a backend deletion endpoint that atomically cleans up both Supabase records and vector store chunks. Duplicate URL scraping is rejected upfront.

## Technical Context

**Language/Version**: Python 3.12+ (backend), TypeScript (frontend)
**Primary Dependencies**: FastAPI, LangChain (RecursiveCharacterTextSplitter), DeepLake, Supabase
**Storage**: Supabase PostgreSQL (article records), DeepLake Cloud (vector chunks, per-user datasets)
**Testing**: pytest (backend), manual E2E (scrape → chat)
**Target Platform**: Linux server (backend), browser (frontend)
**Project Type**: Web application (backend + frontend monorepo)
**Performance Goals**: Indexing should complete within the same background task as scraping — no additional user-visible latency
**Constraints**: Per-user vector store isolation via `get_user_vectorstore()`, existing chunk_size=1000 / chunk_overlap=200
**Scale/Scope**: Same scale as existing documentation indexing — single articles indexed one at a time

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | PASS | Backend changes in Python/FastAPI, frontend proxy update in TypeScript |
| II. API-Boundary Separation | PASS | New backend DELETE endpoint under `/v1/api/articles/`, frontend calls backend |
| III. Supabase as Source of Truth | PASS | Article records remain in Supabase; vector store is a derived index |
| IV. Background Jobs with Real-Time Feedback | PASS | Indexing happens within existing background scrape task; SSE status already reports completion |
| V. Simplicity and Pragmatism | PASS | Follows existing documentation indexing pattern — no new abstractions |
| VI. Per-User Data Isolation | PASS | Uses `get_user_vectorstore(user_id)` for per-user DeepLake dataset |

## Project Structure

### Documentation (this feature)

```text
specs/ALP-014-index-articles-vectorstore/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── routers/
│   │   └── articles.py          # MODIFY: add duplicate check in scrape, add DELETE endpoint
│   ├── services/
│   │   └── vectorstore.py       # MODIFY: add add_article() and delete_by_article_ids()
│   └── models/
│       └── articles.py          # MODIFY: add ArticleDeleteResponse model
└── tests/

next-frontend/
└── app/
    └── api/
        └── articles/
            └── [id]/
                └── route.ts     # MODIFY: proxy DELETE to backend instead of direct Supabase
```

**Structure Decision**: Follows existing monorepo layout. All changes are modifications to existing files — no new files needed.

## Complexity Tracking

No constitution violations — table not needed.
