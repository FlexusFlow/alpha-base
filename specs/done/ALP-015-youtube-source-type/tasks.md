# Tasks: Add source_type to YouTube Chunk Metadata

**Input**: Design documents from `/specs/ALP-015-youtube-source-type/`
**Prerequisites**: plan.md, spec.md, research.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Consistent metadata across all knowledge sources (Priority: P1) MVP

**Goal**: Add `source_type: "youtube"` to the metadata dictionary built during YouTube transcript vectorization so all content types have consistent metadata.

**Independent Test**: Vectorize a YouTube video and inspect the resulting chunk metadata in DeepLake to confirm `source_type: "youtube"` is present.

### Implementation for User Story 1

- [x] T001 [US1] Add `"source_type": "youtube"` to the metadata dict in `process_knowledge_job()` in `backend/app/routers/knowledge.py` (line ~65, alongside existing `video_id`, `title`, `channel`, `source` fields)

**Checkpoint**: New YouTube chunks now include `source_type: "youtube"` in metadata. Existing operations (search, chat, deletion) are unaffected since they query by `video_id`, not `source_type`.

---

## Phase 2: User Story 2 - Backward compatibility (Priority: P2)

**Goal**: Confirm that existing operations work unchanged with mixed chunks (old without `source_type`, new with it).

**Independent Test**: Run existing pytest suite to verify no regressions in search, chat, or deletion paths.

### Implementation for User Story 2

- [x] T002 [US2] Run existing test suite (`cd backend && uv run pytest`) to verify no regressions from the metadata field addition
- [x] T003 [US2] Verify that `delete_by_video_ids()` in `backend/app/services/vectorstore.py` continues to work correctly (queries by `video_id`, not affected by new `source_type` field)

**Checkpoint**: All existing tests pass. Backward compatibility confirmed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately
- **Phase 2 (US2)**: Depends on Phase 1 completion (T001 must be done before T002-T003)

### Within Each Phase

- T001 is the only implementation task
- T002 and T003 are verification tasks that run after T001

### Parallel Opportunities

- T002 and T003 can run in parallel after T001 completes

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete T001: Add `source_type` field to metadata dict
2. **STOP and VALIDATE**: Run tests, inspect vectorized chunks
3. Deploy if ready

### Full Delivery

1. T001: Implementation
2. T002 + T003: Verification (parallel)
3. Done — commit and merge

---

## Notes

- This is a single-line change in one file — the smallest possible feature
- No setup or foundational phases needed (existing project, no new dependencies)
- No data migration required — purely additive metadata field
- Commit after T001 with verification from T002-T003
