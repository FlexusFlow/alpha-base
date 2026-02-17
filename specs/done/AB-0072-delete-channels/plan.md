# Implementation Plan: Delete Scraped Channels

**Branch**: `AB-0072-delete-channels` | **Date**: 2026-02-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/AB-0072-delete-channels/spec.md`

## Summary

Add the ability to delete scraped YouTube channels with full cleanup across three systems: DeepLake vector store, transcript markdown files, and Supabase database. Deletion follows a cleanup-first strategy (vectors → files → DB) with abort on failure to prevent orphaned data. The feature includes single-channel deletion with confirmation dialog, transcription-aware warnings, active job guards, and bulk multi-channel deletion.

## Technical Context

**Language/Version**: Python 3.11+ (backend), TypeScript (frontend, Next.js 15 App Router)
**Primary Dependencies**: FastAPI, langchain-deeplake v0.1.0, deeplake v4.5.1, Supabase client, shadcn/ui, TanStack Table
**Storage**: Supabase (PostgreSQL with RLS), DeepLake (local vector store), filesystem (transcript .md files)
**Testing**: Manual integration testing (no test framework currently in place)
**Target Platform**: Web — Linux/macOS server (backend), browser (frontend)
**Project Type**: Web application (monorepo: `backend/` + `next-frontend/`)
**Performance Goals**: Single delete < 5s, bulk delete (10 channels) < 10s
**Constraints**: Cleanup-first ordering, abort on cleanup failure, user-scoped via RLS
**Scale/Scope**: ~50 channels max per user, ~500 videos per channel, ~5-50 vector chunks per video

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Frontend, Python Backend | PASS | Frontend in TypeScript (Next.js), backend in Python (FastAPI) |
| II. API-Boundary Separation | PASS | Deletion goes Frontend → Next.js API route → Python backend. No direct Supabase writes from browser for deletion. |
| III. Supabase as Source of Truth | PASS | Channel/video state lives in Supabase. Deletion removes records. Cascade delete via FK. |
| IV. Background Jobs with Real-Time Feedback | PASS | Deletion checks for active jobs before proceeding. Not a long-running operation itself (no background task needed). |
| V. Simplicity and Pragmatism | PASS | No new abstractions. Adds methods to existing services. Uses existing UI component library. |

**Post-Phase 1 Re-check**: All gates still pass. No new dependencies or architectural patterns introduced beyond what the constitution prescribes.

## Project Structure

### Documentation (this feature)

```text
specs/AB-0072-delete-channels/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research decisions
├── data-model.md        # Entity and data flow documentation
├── quickstart.md        # Implementation quick-reference
├── contracts/
│   └── delete-channel.yaml  # API contract definitions
├── checklists/
│   └── requirements.md      # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── models/
│   │   └── knowledge.py         # ADD: ChannelDeleteResponse, BulkDeleteResponse
│   ├── routers/
│   │   └── knowledge.py         # ADD: DELETE /channels/{id}, POST /channels/delete-bulk
│   ├── services/
│   │   ├── vectorstore.py       # ADD: delete_by_video_ids() method
│   │   ├── transcriber.py       # ADD: delete_transcripts() function
│   │   └── job_manager.py       # ADD: channel_id field, has_active_job_for_channel()
│   └── utils/
│       └── text.py              # EXISTING: sanitize_filename() — used for file lookup

next-frontend/
├── app/
│   ├── api/
│   │   └── channels/
│   │       ├── [channelId]/
│   │       │   └── route.ts     # NEW: DELETE handler (BFF proxy)
│   │       └── delete-bulk/
│   │           └── route.ts     # NEW: POST handler (bulk BFF proxy)
│   └── dashboard/
│       └── knowledge/
│           └── page.tsx         # MODIFY: add delete handlers, selection mode, bulk UI
├── components/
│   ├── ui/
│   │   └── alert-dialog.tsx     # NEW: install shadcn/ui AlertDialog
│   └── youtube/
│       └── channel-card.tsx     # MODIFY: add delete button
└── lib/
    └── supabase/
        └── channels.ts          # ADD: getTranscribedCount() helper
```

**Structure Decision**: Web application (Option 2). Backend handles orchestrated deletion with vector/file/DB cleanup. Frontend provides UI with BFF proxy for auth.

## Complexity Tracking

No constitution violations. No complexity justifications needed.

## Design Decisions

### D1: Cleanup-First Deletion Order

**Order**: Vector store entries → Transcript files → Database records

**Rationale**: If database deletion happens first and cleanup fails, we'd have orphaned vectors/files with no way to find them (the mapping data in Supabase is gone). Cleanup-first ensures we can always retry — the Supabase records remain as the "source of truth" for what needs cleaning.

**Abort behavior**: If vector deletion fails, stop immediately and return error. If file deletion fails after vectors are cleaned, still abort DB deletion (files can be retried; vectors are already gone but that's acceptable — slightly stale embeddings are less harmful than orphaned DB records).

### D2: Backend Orchestration (Not Frontend)

The Python backend endpoint handles the full cleanup sequence because:
1. DeepLake dataset is on the server filesystem
2. Transcript .md files are on the server filesystem
3. Constitution Principle II requires business logic writes go through backend
4. Single process can enforce strict ordering and abort semantics

### D3: Transcript Filename Derivation

Transcript files are named `sanitize_filename(video.title) + ".md"`. At deletion time:
1. Fetch all videos for the channel from Supabase (before DB deletion)
2. For each transcribed video, derive filename using same `sanitize_filename()` utility
3. Attempt to delete the file; if not found, skip silently (file may have been manually removed)

### D4: Job Conflict Detection

Add `channel_id` field to the in-memory `Job` dataclass. The deletion endpoint checks `JobManager` for any `IN_PROGRESS` jobs with matching `channel_id`. If found, return HTTP 409 with the active job_id.

### D5: AlertDialog for Confirmation

Install shadcn/ui `AlertDialog` component. The dialog shows:
- Channel name
- Total video count
- Transcribed video count (if > 0, with additional warning text)
- "This action cannot be undone" warning
- Cancel and Delete buttons (Delete in destructive variant)

### D6: Bulk Delete UX

The Knowledge Base page adds:
- Checkbox overlay on each channel card (visible in selection mode)
- "Select" button to enter selection mode
- Floating action bar when channels are selected showing count + "Delete Selected" button
- Confirmation dialog showing total channels and total videos to be deleted
