# Research: Add source_type to YouTube Chunk Metadata

**Date**: 2026-03-07
**Feature**: ALP-015-youtube-source-type

## Overview

No significant unknowns or technical decisions required for this feature. The change is a single metadata field addition following an established pattern.

## Research Findings

### R1: Existing source_type Pattern

**Decision**: Follow the existing `source_type` convention used by documentation and article chunks.

**Rationale**: The codebase already establishes a clear pattern:
- `backend/app/services/vectorstore.py:115` — Documentation chunks use `"source_type": "documentation"`
- `backend/app/services/vectorstore.py:145` — Article chunks use `"source_type": "article"`
- YouTube chunks (built in `backend/app/routers/knowledge.py:65-70`) are the only content type missing this field.

**Alternatives considered**:
- Using `"source_type": "transcript"` — Rejected because the value should identify the *source platform*, not the content format. Documentation and articles are also text, but their `source_type` identifies origin.
- Using `"source_type": "video"` — Rejected because the content is specifically from YouTube transcripts, not generic video content. `"youtube"` is more precise and matches the router name (`knowledge/youtube/add`).

### R2: Metadata Location

**Decision**: Add `source_type` in `backend/app/routers/knowledge.py` at line 65-70, where the metadata dict is constructed during the `process_knowledge_job` background task.

**Rationale**: This is the single point where YouTube chunk metadata is built before being passed to `vectorstore.add_documents()`. Adding it here ensures all YouTube chunks receive the field consistently.

**Alternatives considered**:
- Adding it in `VectorStoreService.add_documents()` as a default — Rejected because `add_documents` is a generic method used by all content types. Content-type-specific metadata should be set by the caller, as documentation and articles already do.

### R3: Backward Compatibility

**Decision**: No migration needed. Old chunks without `source_type` coexist safely.

**Rationale**: All existing vector store queries (similarity search, deletion) use `video_id`, `collection_id`, or `article_id` for filtering — none depend on `source_type`. The field is purely additive.
