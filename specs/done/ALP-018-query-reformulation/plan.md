# Implementation Plan: Query Reformulation

**Branch**: `ALP-018-query-reformulation` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/ALP-018-query-reformulation/spec.md`

## Summary

Add a lightweight LLM query reformulation step before vectorstore search to correct typos, fix misspelled names, and expand abbreviations. Uses gpt-4o-mini for fast, cheap inference. Applies to KB-only mode and extended search mode's KB search step. Silent to the user — original query displayed, reformulated query used for search only. Falls back to original query on any failure.

## Technical Context

**Language/Version**: Python 3.12+
**Primary Dependencies**: FastAPI, LangChain + ChatOpenAI (gpt-4o-mini for reformulation)
**Storage**: N/A (no new persistence)
**Testing**: pytest (backend)
**Target Platform**: Web application (backend only)
**Project Type**: Web (backend + frontend monorepo) — backend changes only
**Performance Goals**: Reformulation adds < 500ms latency; gpt-4o-mini typically responds in 100-300ms
**Constraints**: Must not block chat on failure; must preserve original query for display
**Scale/Scope**: 2-3 backend files modified, 1 new service function

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | PASS | Backend-only change in Python |
| II. API-Boundary Separation | PASS | No API changes; reformulation is internal to chat service |
| III. Supabase as Source of Truth | N/A | No data persistence changes |
| IV. Background Jobs with Real-Time Feedback | N/A | Not a background job |
| V. Simplicity and Pragmatism | PASS | Single function, simple prompt, uses existing ChatOpenAI pattern |
| VI. Per-User Data Isolation | PASS | Operates on query string only, no user data accessed |

## Project Structure

### Documentation (this feature)

```text
specs/ALP-018-query-reformulation/
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
│   ├── config.py                  # Modified: add query_reformulation_model setting
│   ├── services/
│   │   ├── chat.py                # Modified: call reformulate_query before vectorstore search
│   │   └── query_reformulation.py # NEW: reformulate_query function
│   └── tests/                     # Optional: unit test for reformulation
```

**Structure Decision**: Backend-only — one new service file for the reformulation function, modifications to chat service and config.

## Complexity Tracking

No violations — single new utility function with simple integration.
