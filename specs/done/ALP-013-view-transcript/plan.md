# Implementation Plan: View Video Transcript

**Branch**: `ALP-013-view-transcript` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/ALP-013-view-transcript/spec.md`

## Summary

Add the ability to view transcribed video transcripts in a slide-over side panel. A new backend endpoint reads the transcript markdown file from disk (scoped to the authenticated user), and the frontend displays it in a shadcn/ui Sheet component triggered from the video table. Includes a "copy all" button for clipboard support.

## Technical Context

**Language/Version**: Python 3.12+ (backend), TypeScript (Next.js 15 / React 19 frontend)
**Primary Dependencies**: FastAPI, shadcn/ui (Sheet component already installed), TanStack Table
**Storage**: Filesystem (markdown files in `knowledge_base/transcripts/`), Supabase (video metadata)
**Testing**: pytest (backend), yarn lint + tsc --noEmit (frontend)
**Target Platform**: Web (desktop + mobile browsers)
**Project Type**: Web application (monorepo: `backend/` + `next-frontend/`)
**Performance Goals**: Transcript displayed within 2 seconds of request (SC-001)
**Constraints**: Transcript files are title-based filenames, not video_id-based — requires DB lookup to resolve filename
**Scale/Scope**: Single-user reads, no concurrency concerns for file I/O

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | PASS | Backend endpoint in Python/FastAPI, frontend in TypeScript/React |
| II. API-Boundary Separation | PASS | Frontend calls backend REST endpoint via existing auth pattern |
| III. Supabase as Source of Truth | PASS | Video metadata (title, is_transcribed) read from Supabase; transcript files are derived artifacts |
| IV. Background Jobs with Real-Time Feedback | N/A | No background jobs — synchronous file read |
| V. Simplicity and Pragmatism | PASS | Reuses existing Sheet component, existing auth patterns, minimal new code |
| VI. Per-User Data Isolation | PASS | Backend scopes Supabase query by user_id from JWT; only user's own transcripts accessible |

No violations. Gate passes.

## Project Structure

### Documentation (this feature)

```text
specs/ALP-013-view-transcript/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── transcript-api.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── routers/knowledge.py        # Add GET /videos/{video_id}/transcript endpoint
│   └── services/transcriber.py     # Add get_transcript_content() function
└── tests/
    └── test_transcript_view.py     # Endpoint tests

next-frontend/
├── components/
│   └── youtube/
│       ├── video-table.tsx          # Add "view transcript" button column
│       └── transcript-panel.tsx     # New: Sheet-based transcript viewer
└── lib/
    └── api/knowledge.ts             # Add getVideoTranscript() API helper
```

**Structure Decision**: Web application structure — existing monorepo with `backend/` and `next-frontend/`. All changes extend existing files except for one new component (`transcript-panel.tsx`).
