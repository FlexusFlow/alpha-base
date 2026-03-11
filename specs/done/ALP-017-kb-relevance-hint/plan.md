# Implementation Plan: KB Relevance Hint

**Branch**: `ALP-017-kb-relevance-hint` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/ALP-017-kb-relevance-hint/spec.md`

## Summary

Replace the contradictory "no information" + sources behavior in KB-only chat mode. Use vectorstore relevance scores to determine context adequacy, update the system prompt to always attempt a best-effort answer, pass a `kb_relevant` flag through the SSE protocol, and show a static "try Extended search" hint on the frontend when relevance is low.

## Technical Context

**Language/Version**: Python 3.12+ (backend), TypeScript (Next.js 15 frontend)
**Primary Dependencies**: FastAPI, LangChain + ChatOpenAI, React 19, shadcn/ui
**Storage**: Supabase (chat_messages table for persistence)
**Testing**: pytest (backend), manual E2E (frontend)
**Target Platform**: Web application
**Project Type**: Web (backend + frontend monorepo)
**Performance Goals**: No additional latency — relevance determined from existing vectorstore scores, no extra LLM call
**Constraints**: Must not break existing SSE protocol for clients that don't read the new field
**Scale/Scope**: 2 backend files, 4 frontend files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | PASS | Changes in both stacks, following existing patterns |
| II. API-Boundary Separation | PASS | New field added to existing SSE protocol, frontend consumes via existing API client |
| III. Supabase as Source of Truth | PASS | No schema changes; chat_messages storage unchanged |
| IV. Background Jobs with Real-Time Feedback | N/A | Not a background job feature |
| V. Simplicity and Pragmatism | PASS | Uses existing vectorstore scores instead of extra LLM call; minimal new code |
| VI. Per-User Data Isolation | PASS | No change to data isolation; operates within existing per-user vectorstore |

## Project Structure

### Documentation (this feature)

```text
specs/ALP-017-kb-relevance-hint/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── services/
│   │   └── chat.py           # Modified: system prompt, relevance scoring, kb_relevant flag
│   └── routers/
│       └── chat.py           # Modified: pass kb_relevant through SSE done event

next-frontend/
├── lib/
│   ├── types/
│   │   └── chat.ts           # Modified: add kbRelevant to ChatMessage
│   └── api/
│       └── chat.ts           # Modified: parse kb_relevant from done event
├── components/
│   └── chat/
│       ├── chat-message.tsx  # Modified: render extended search hint
│       └── chat-window.tsx   # Modified: pass extendedSearch to message context
```

**Structure Decision**: Web application — changes span existing backend service/router and frontend components. No new files needed.

## Complexity Tracking

No violations — all changes fit within existing architecture.
