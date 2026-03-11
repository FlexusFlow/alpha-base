# Feature Specification: Add source_type to YouTube Chunk Metadata

**Feature Branch**: `ALP-015-youtube-source-type`
**Created**: 2026-03-07
**Status**: Draft
**Input**: User description: "Add `source_type` to YouTube chunk metadata — Documentation chunks have `source_type: "documentation"` but YouTube chunks have no `source_type` field. Add `source_type: "youtube"` during transcript vectorization (`knowledge.py`)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent metadata across all knowledge sources (Priority: P1)

As a system operator, I want all vectorized content chunks to carry a `source_type` metadata field so that downstream features (filtering, analytics, source attribution) can reliably distinguish content origins without guessing based on other metadata fields.

**Why this priority**: This is the core and only deliverable — without it, YouTube chunks are the only content type missing `source_type`, creating an inconsistency that blocks any feature relying on uniform metadata.

**Independent Test**: Can be fully tested by vectorizing a YouTube video and inspecting the resulting chunk metadata in DeepLake to confirm `source_type: "youtube"` is present.

**Acceptance Scenarios**:

1. **Given** a user triggers YouTube transcript vectorization for one or more videos, **When** the transcripts are chunked and stored in the vector store, **Then** every resulting chunk's metadata includes `source_type` with the value `"youtube"`.
2. **Given** a user has previously vectorized documentation and article content, **When** they also vectorize YouTube content, **Then** all three content types have a `source_type` field (`"documentation"`, `"article"`, `"youtube"` respectively).

---

### User Story 2 - Backward compatibility with existing chunks (Priority: P2)

As a system operator, I want the addition of `source_type` to new YouTube chunks to not break any existing functionality — existing chunks without `source_type` should continue to work normally in search, chat, and deletion operations.

**Why this priority**: Ensures the change is safe to deploy without requiring data migration of existing vector store entries.

**Independent Test**: Can be tested by running RAG chat queries and deletion operations against a vector store containing both old (no `source_type`) and new (with `source_type`) YouTube chunks.

**Acceptance Scenarios**:

1. **Given** a vector store contains YouTube chunks created before this change (without `source_type`), **When** a user performs a similarity search or RAG chat, **Then** old chunks are returned normally alongside new chunks.
2. **Given** a user deletes a channel containing both old and new YouTube chunks, **When** deletion runs, **Then** all chunks are deleted regardless of whether they have `source_type` metadata.

---

### Edge Cases

- What happens when a video is re-vectorized after this change? New chunks will have `source_type: "youtube"`; old chunks (if not deleted first) will lack it. This is acceptable — the system does not re-vectorize without first deleting old chunks.
- What if downstream code filters by `source_type` and encounters old chunks without the field? Consumers must handle missing `source_type` gracefully (treat as unknown/legacy).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST include `source_type` with value `"youtube"` in the metadata dictionary for every YouTube transcript chunk stored in the vector store.
- **FR-002**: The `source_type` field MUST be added at the same point where other YouTube metadata fields (`video_id`, `title`, `channel`, `source`) are constructed during the knowledge ingestion job.
- **FR-003**: System MUST NOT require migration or backfill of existing YouTube chunks — the change applies only to newly vectorized content.
- **FR-004**: All existing operations (search, chat, deletion by video ID) MUST continue to work unchanged for chunks with or without `source_type`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of newly vectorized YouTube transcript chunks contain `source_type: "youtube"` in their metadata.
- **SC-002**: All three content types (documentation, article, YouTube) follow the same metadata convention with a `source_type` field after this change.
- **SC-003**: Zero regressions in existing knowledge base operations (search, chat, channel deletion) after deployment.

## Assumptions

- The metadata dictionary is constructed in one place for YouTube chunks (the knowledge ingestion background job). No other code path creates YouTube chunk metadata.
- Existing vector store deletion queries use `video_id` (not `source_type`), so adding the field has no impact on deletion logic.
- No data migration is needed — old chunks without `source_type` will coexist safely with new ones.
