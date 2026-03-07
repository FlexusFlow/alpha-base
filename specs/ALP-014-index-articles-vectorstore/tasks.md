# Tasks: Index Articles in Vector Store

**Input**: Design documents from `/specs/ALP-014-index-articles-vectorstore/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: VectorStoreService methods needed by both user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 Add `add_article(article_id, content_markdown, title, url)` method to `backend/app/services/vectorstore.py` — follow the `add_documentation_pages()` pattern: accept single article params, build metadata dict with `article_id`, `title`, `source_type: "article"`, `source: url`, skip if `content_markdown` is empty, call `self.add_documents()` internally, return chunk count
- [x] T002 Add `delete_by_article_ids(article_ids: list[str])` method to `backend/app/services/vectorstore.py` — follow the `delete_by_collection_id()` pattern: query `metadata['article_id']` to find matching chunk IDs, delete them, return count of deleted chunks

**Checkpoint**: VectorStoreService supports article indexing and deletion

---

## Phase 2: User Story 1 - Newly Scraped Articles Appear in RAG Chat (Priority: P1) 🎯 MVP

**Goal**: After scraping, article content is chunked and indexed in the user's vector store, making it searchable via RAG chat

**Independent Test**: Scrape a public article, then ask RAG chat a question only that article can answer — the response should cite the article

### Implementation for User Story 1

- [x] T003 [US1] Add duplicate URL check in `scrape_article_endpoint()` in `backend/app/routers/articles.py` — before creating the article record, query `articles` table for existing row with same `url` and `user_id`; if found, raise `HTTPException(status_code=409, detail="Article with this URL already exists")`
- [x] T004 [US1] Add vectorstore indexing in `process_article_scrape()` in `backend/app/routers/articles.py` — after successful Supabase update (after line ~114), get user vectorstore via `get_user_vectorstore(user_id, settings)`, call `vs.add_article(article_id, content_markdown, title, url)`, update cached chunk count via `update_cached_chunk_count()`; wrap in try/except to log failures without breaking the scrape flow (FR-006); add `settings` param to `process_article_scrape()` function signature (currently not passed) and update the `background_tasks.add_task()` call in `scrape_article_endpoint()` to pass `settings` through

**Checkpoint**: Scraping an article indexes it in the vector store. Duplicate URLs are rejected. RAG chat can find article content.

---

## Phase 3: User Story 2 - Deleting an Article Removes It from the Vector Store (Priority: P2)

**Goal**: When a user deletes an article, both the Supabase record and vector store chunks are removed atomically via a backend endpoint

**Independent Test**: Delete a previously scraped article, then confirm RAG chat no longer returns results from it

### Implementation for User Story 2

- [x] T005 [P] [US2] Add `ArticleDeleteResponse` model in `backend/app/models/articles.py` — fields: `message: str`, `vectors_deleted: bool`
- [x] T006 [US2] Add backend `DELETE /v1/api/articles/{article_id}` endpoint in `backend/app/routers/articles.py` — follow `delete_collection()` pattern from `backend/app/routers/documentation.py`: authenticate via `get_current_user`, verify article exists and belongs to user, delete vector store chunks first via `vs.delete_by_article_ids([article_id])`, update cached chunk count, delete article record from Supabase, return `ArticleDeleteResponse`; if vectorstore deletion fails, log warning and proceed with DB deletion
- [x] T007 [US2] Update frontend `DELETE` route in `next-frontend/app/api/articles/[id]/route.ts` — instead of deleting directly from Supabase, proxy the request to backend `DELETE /v1/api/articles/{article_id}` with the user's auth token forwarded as Bearer token; pass through the backend response

**Checkpoint**: Article deletion cleans up both Supabase and vector store. Frontend proxies through backend.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across both user stories

- [x] T008 Run quickstart.md E2E validation — execute all 5 test scenarios from `specs/ALP-014-index-articles-vectorstore/quickstart.md`: scrape article → verify RAG chat finds it → scrape same URL again (expect 409) → delete article → verify RAG chat no longer finds it

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **User Story 1 (Phase 2)**: Depends on Phase 1 (needs `add_article()`)
- **User Story 2 (Phase 3)**: Depends on Phase 1 (needs `delete_by_article_ids()`). Independent of US1 but best done after US1 for E2E testing.
- **Polish (Phase 4)**: Depends on both US1 and US2 being complete

### Within Each User Story

- T003 and T004 are sequential (same file, T004 depends on imports from T001)
- T005 can run in parallel with T006 prep (different files)
- T006 depends on T005 (uses `ArticleDeleteResponse` model)
- T007 depends on T006 (needs backend endpoint to exist)

### Parallel Opportunities

- T001 and T002 are in the same file — sequential
- T005 can run in parallel with any US1 task (different file)
- US1 and US2 implementation phases could run in parallel if T001+T002 are complete

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001, T002)
2. Complete Phase 2: User Story 1 (T003, T004)
3. **STOP and VALIDATE**: Scrape an article, ask RAG chat about it
4. Deploy if ready — articles are now searchable

### Incremental Delivery

1. Foundational → VectorStoreService ready
2. Add User Story 1 → Articles indexed on scrape (MVP!)
3. Add User Story 2 → Clean deletion with vectorstore cleanup
4. Polish → Full E2E validation

---

## Notes

- All changes are modifications to existing files — no new files created
- 4 files modified total: `vectorstore.py`, `articles.py` (backend router), `articles.py` (backend models), `route.ts` (frontend)
- Follow existing patterns: `add_documentation_pages()` for indexing, `delete_collection()` for deletion
- `settings` must be passed to `process_article_scrape()` — it's not currently in the function signature
