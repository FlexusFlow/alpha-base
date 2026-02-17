# Research: Delete Scraped Channels

**Feature**: AB-0072-delete-channels
**Date**: 2026-02-11

## R1: DeepLake Selective Deletion

**Decision**: Use two-step deletion — query by metadata filter, then delete by IDs.

**Rationale**: The `langchain-deeplake` v0.1.0 `DeeplakeVectorStore` class includes a `delete(ids)` method. DeepLake's TQL supports metadata filtering with `SELECT ids FROM (SELECT * WHERE metadata['video_id'] IN (...))`. Combined, this allows deletion of all chunks belonging to specific videos.

**Alternatives considered**:
- Rebuild entire dataset: Too destructive, would remove all users' data.
- Direct row-index deletion: Lower-level API, fragile. The LangChain wrapper handles index shifting correctly.

**Implementation pattern**:
```python
# Query matching document IDs
query = f"SELECT ids FROM (SELECT * WHERE metadata['video_id'] IN ({ids_str}))"
results = db.dataset.query(query)
# Delete by IDs
db.delete(ids=results["ids"][:])
```

## R2: Transcript File Naming Convention

**Decision**: Transcript files use `sanitize_filename(title) + ".md"` pattern, stored in `settings.transcripts_dir` (default: `./knowledge_base/transcripts`).

**Rationale**: The `save_transcript_md()` function in `backend/app/services/transcriber.py` sanitizes the title by removing special characters, replacing spaces with hyphens, and collapsing multiple hyphens. Files are named by title, not video_id.

**Implication for deletion**: Cannot reliably reconstruct the filename from video_id alone. Two options:
1. Re-derive filename using `sanitize_filename(video.title)` — requires knowing the title at deletion time (available from Supabase before DB deletion).
2. Store the transcript filename in the videos table — requires schema migration.

**Decision**: Use option 1 (re-derive from title). The video title is available from Supabase before the database deletion step. No schema change needed.

## R3: Deletion Orchestration Layer

**Decision**: Backend endpoint handles the full cleanup-first orchestration. Frontend calls a single backend DELETE endpoint.

**Rationale**: The cleanup involves server-side resources (local filesystem, DeepLake dataset) that the frontend cannot access. The backend already has access to Supabase (service role), DeepLake, and the filesystem. Centralizing orchestration in a single backend endpoint simplifies error handling and abort logic.

**Alternatives considered**:
- Frontend orchestrates (calls multiple endpoints): Leaks implementation details, requires multiple round-trips, no filesystem access.
- Next.js API route orchestrates: Could work but adds unnecessary hop since Python backend has all the dependencies.

## R4: Active Job Detection

**Decision**: Query Supabase for videos with `is_transcribed = false` that are part of the channel, cross-referenced with in-memory `JobManager` active jobs. If any active job references videos from this channel, block deletion.

**Rationale**: The `JobManager` stores jobs in memory with `succeeded_videos` and `failed_videos` lists containing video_ids. However, there is no direct channel-to-job mapping. The pragmatic approach is to check if any `IN_PROGRESS` job references video_ids belonging to the target channel.

**Alternatives considered**:
- Add channel_id to Job model: Cleaner but requires modifying the existing Job dataclass and all callers.
- Frontend-only guard: Unreliable since users can open multiple tabs.

**Decision**: For simplicity (YAGNI), add `channel_id` field to the Job dataclass. This is a single-field addition with minimal blast radius.

## R5: Frontend Confirmation Dialog

**Decision**: Install shadcn/ui `AlertDialog` component. Use it for both single and bulk delete confirmation.

**Rationale**: No AlertDialog or Dialog component currently exists in the UI library. AlertDialog is the standard shadcn/ui pattern for destructive confirmations. It is accessibility-compliant (focus trap, escape to close) and consistent with the existing UI patterns.

**Alternatives considered**:
- Custom modal with Sheet component: Over-engineered for a confirmation dialog.
- Browser `window.confirm()`: Poor UX, not customizable, can't show transcription counts.

## R6: Supabase Direct Delete vs Backend-Mediated Delete

**Decision**: The frontend calls the Python backend `DELETE /v1/api/knowledge/channels/{channel_id}` endpoint. The backend handles all cleanup. The frontend does NOT directly delete from Supabase.

**Rationale**: Per the constitution (Principle II — API-Boundary Separation): "All writes that involve business logic MUST go through the backend or Next.js API routes." Channel deletion involves business logic (vector cleanup, file deletion, job conflict check). The backend uses the service role key and has access to DeepLake and the filesystem.

**Flow**: Frontend → Next.js API route (auth proxy) → Python backend DELETE endpoint → orchestrated cleanup.
