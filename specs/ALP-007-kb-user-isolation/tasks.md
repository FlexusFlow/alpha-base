# ALP-007: Per-User Knowledge Base Isolation — Tasks

**Feature**: Per-User Knowledge Base Isolation
**Branch**: `feature/ALP-007-kb-user-isolation`
**Generated**: 2026-02-26

---

## Phase 1: Setup — Config & Factory

Goal: Change `deeplake_path` semantics and create the per-user factory function. This is the foundation all other tasks depend on.

- [x] T001 Update `deeplake_path` default from `"./knowledge_base/deeplake_store"` to `"./knowledge_base"` in `backend/app/config.py`
- [x] T002 Add `get_user_vectorstore(user_id, settings)` factory function to `backend/app/services/vectorstore.py` — derives per-user path as `f"{settings.deeplake_path}/user-{user_id}"`, creates `VectorStoreService` with user-scoped settings via `settings.model_copy(update={"deeplake_path": user_path})`
- [x] T003 Add `cleanup_user_vectorstore(user_id, settings)` async function to `backend/app/services/vectorstore.py` — clears a user's dataset using `overwrite=True` to preserve the dataset name on DeepLake Cloud; detect cloud vs local via `startswith("hub://")`

## Phase 2: Foundational — Empty Dataset Handling

Goal: Ensure graceful behavior when a user has no content yet. Blocks all user story phases.

- [x] T004 Add empty/non-existent dataset handling to `similarity_search()` in `backend/app/services/vectorstore.py` — catch dataset-not-found exceptions and return `[]` instead of raising; same for `get_chunk_count()` returning `0` and `get_all_chunk_ids_and_texts()` returning `[]`
- [x] T005 [P] Make `user_id` required (non-optional) in `ChatRequest` model in `backend/app/models/chat.py` — change `user_id: str | None = None` to `user_id: str`

## Phase 3: User Story 1 — User Queries Only Their Own Content (Scenarios 1, 3)

Goal: RAG chat queries are scoped to the authenticated user's dataset. New users with no content get a helpful empty-state message.

**Independent test criteria**: User A and User B each have their own dataset. User A's query returns only User A's content. A new user with no content sees an empty-state message, not an error.

- [x] T006 [US1] Update `ChatService` in `backend/app/services/chat.py` — remove `self.vectorstore = VectorStoreService(settings)` from `__init__`; in `_retrieve_context`, make `user_id` a required parameter and instantiate vectorstore via `get_user_vectorstore(user_id, self.settings)` for each query
- [x] T007 [US1] Add empty knowledge base response handling in `_retrieve_context` in `backend/app/services/chat.py` — when similarity_search returns empty results, set context to a message like "No content found in your knowledge base. Add YouTube channels or articles to get started."
- [x] T008 [US1] Update `ChatService.stream()` in `backend/app/services/chat.py` — make `user_id` required parameter (not optional), pass through to `_retrieve_context`
- [x] T009 [US1] Update chat router in `backend/app/routers/chat.py` — no changes needed, already passes user_id — pass `request.user_id` (now required) to `ChatService.stream()`

## Phase 4: User Story 2 — User Adds Content to Their Own Knowledge Base (Scenario 2)

Goal: Video transcription vectorization writes to the user's own dataset, creating it on first write.

**Independent test criteria**: After User A transcribes videos, chunks exist only in User A's dataset path. User B's dataset is unaffected.

- [x] T010 [US2] Update `process_knowledge_job()` in `backend/app/routers/knowledge.py` — replace `VectorStoreService(settings)` with `get_user_vectorstore(user_id, settings)` for the vectorization step; `user_id` is already a parameter of the function

## Phase 5: User Story 3 — User Deletes Content Without Affecting Others (Scenario 4)

Goal: Channel/video deletion removes chunks only from the requesting user's dataset.

**Independent test criteria**: User A deletes a channel; chunks are removed from User A's dataset. User B's dataset (even with the same channel) is unchanged.

- [x] T011 [US3] Update `_delete_single_channel()` in `backend/app/routers/knowledge.py` — replace `VectorStoreService(settings)` with `get_user_vectorstore(user_id, settings)` for the vector deletion step; `user_id` is already available from the Supabase query scope

## Phase 6: User Story 4 — Public API Queries User-Scoped Content (Scenario 5)

Goal: Public RAG API queries (ZIP-006) search only the API key owner's dataset.

**Independent test criteria**: API key owned by User A returns only User A's content from `POST /v1/api/public/query`.

- [x] T012 [US4] Verify `backend/app/routers/public_query.py` works with the updated `ChatService` — `user_id` is already extracted from the verified API key and passed to `_retrieve_context`; confirm no code changes needed beyond the ChatService refactor in T006–T008; add empty-state JSON response `{"answer": "No knowledge base content available.", "sources": []}` if applicable

## Phase 7: User Story 5 — Deep Memory Training Uses Only User's Content (Scenario 6)

Goal: Deep Memory training generates pairs and trains a model scoped to the user's dataset only. Warning shown for <50 chunks.

**Independent test criteria**: User A's Deep Memory training enumerates only User A's chunks. Training produces a model scoped to User A's dataset. Warning logged if <50 chunks.

- [x] T013 [US5] Update `generate_training_data()` in `backend/app/services/training_generator.py` — replace `VectorStoreService(settings)` with `get_user_vectorstore(user_id, settings)` for chunk enumeration; `user_id` is already fetched from the training run record
- [x] T014 [US5] Add <50 chunk warning in `backend/app/services/training_generator.py` — after getting chunk count from the user's vectorstore, if count < 50, set a warning flag on the training run record in Supabase (e.g., update a `warning` field or log message)
- [x] T015 [US5] Update `train_deep_memory()` in `backend/app/services/deep_memory_service.py` — replace `VectorStoreService(settings)` with `get_user_vectorstore(user_id, settings)` for `get_deep_memory_api()`; `user_id` is already loaded from the training run record

## Phase 8: User Story 6 — Account Deletion Cleanup (FR-5)

Goal: When a user account is deleted, their vector store dataset is cleared automatically.

**Independent test criteria**: After cleanup, the user's dataset is empty. Other users' datasets are unaffected.

- [x] T016 [US6] Add internal cleanup endpoint `DELETE /v1/api/internal/user-cleanup/{user_id}` — create in a new or existing router file under `backend/app/routers/`; calls `cleanup_user_vectorstore(user_id, settings)` from T003; not publicly exposed (internal use only)
- [x] T017 [US6] Register the cleanup router in `backend/app/main.py` — add `app.include_router(...)` for the new cleanup endpoint

## Phase 9: Polish & Cross-Cutting

- [x] T018 Remove old shared `deeplake_store` default path references — search for `deeplake_store` across the codebase and update any remaining references to the old path pattern (documentation, comments, .env.example files)
- [x] T019 Update `.env.example` or `.env.dev` to document the new `DEEPLAKE_PATH` semantics — .env.dev already correct (hub://alphabase), README updated — local: `./knowledge_base`, cloud: `hub://<org>`

---

## Dependencies

```
T001 ─→ T002 ─→ T003
              ─→ T004
              ─→ T006 ─→ T007 ─→ T008 ─→ T009
              ─→ T010
              ─→ T011
              ─→ T012 (depends on T006-T008)
              ─→ T013 ─→ T014
              ─→ T015
              ─→ T016 ─→ T017
T005 ─→ T006 (parallel with T001-T002)
T018, T019: independent, can run any time after T001
```

## Parallel Execution Opportunities

| Parallel Group | Tasks | Rationale |
|----------------|-------|-----------|
| After T002 completes | T004, T006, T010, T011, T013, T015, T016 | All depend only on the factory (T002), touching different files |
| T005 with T001-T002 | T005 | ChatRequest model change is independent of vectorstore changes |
| Polish tasks | T018, T019 | Independent of all user story tasks |

## Implementation Strategy

**MVP (minimum shippable)**: Phase 1 + Phase 2 + Phase 3 + Phase 4 (T001–T010)
- Covers: config change, factory, empty handling, chat isolation, ingestion isolation
- This alone delivers the core value: users query and add to their own knowledge base

**Incremental delivery**:
1. MVP above
2. Add deletion isolation (T011) — Phase 5
3. Public API verification (T012) — Phase 6
4. Deep Memory scoping (T013–T015) — Phase 7
5. Account cleanup (T016–T017) — Phase 8
6. Polish (T018–T019) — Phase 9
