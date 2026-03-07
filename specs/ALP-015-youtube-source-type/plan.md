# Implementation Plan: Add source_type to YouTube Chunk Metadata

**Branch**: `ALP-015-youtube-source-type` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/ALP-015-youtube-source-type/spec.md`

## Summary

Add `source_type: "youtube"` to the metadata dictionary constructed during YouTube transcript vectorization in the knowledge ingestion background job. This aligns YouTube chunks with documentation (`source_type: "documentation"`) and article (`source_type: "article"`) chunks, ensuring consistent metadata across all content types in the vector store.

## Technical Context

**Language/Version**: Python 3.12+
**Primary Dependencies**: FastAPI, LangChain, DeepLake (langchain-deeplake)
**Storage**: DeepLake Cloud (per-user vector store datasets)
**Testing**: pytest
**Target Platform**: Linux server (FastAPI backend)
**Project Type**: web (monorepo: Python backend + Next.js frontend)
**Performance Goals**: N/A (no performance impact — single field addition to metadata dict)
**Constraints**: N/A
**Scale/Scope**: Single-line change in one file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | PASS | Change is backend-only (Python) |
| II. API-Boundary Separation | PASS | No API contract changes |
| III. Supabase as Source of Truth | PASS | No Supabase schema changes |
| IV. Background Jobs with Real-Time Feedback | PASS | Change is within existing background job |
| V. Simplicity and Pragmatism | PASS | Minimal change, no new abstractions |
| VI. Per-User Data Isolation | PASS | No change to data isolation model |

All gates pass. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/ALP-015-youtube-source-type/
├── plan.md              # This file
├── research.md          # Phase 0 output (minimal — no unknowns)
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
backend/
├── app/
│   └── routers/
│       └── knowledge.py    # MODIFY: Add source_type to YouTube metadata dict (line ~65)
└── tests/
    └── test_knowledge.py   # ADD/MODIFY: Test that YouTube metadata includes source_type
```

**Structure Decision**: Backend-only change. Single file modification in `backend/app/routers/knowledge.py` where the YouTube metadata dictionary is constructed at line 65. Optional test addition to verify the metadata field.

## Complexity Tracking

No violations — table not needed.
