# Research: Index Articles in Vector Store

**Date**: 2026-03-07

## Decision 1: Vector Store Indexing Pattern

**Decision**: Follow the `add_documentation_pages()` pattern — create an `add_article()` method on `VectorStoreService`.

**Rationale**: The documentation indexing pattern is battle-tested in this codebase. It handles chunking via `add_documents()`, attaches structured metadata, and integrates with the cached chunk count. Articles are simpler (single document per call vs. batch pages), so the method is even more straightforward.

**Alternatives considered**:
- Call `add_documents()` directly from the router — rejected because it skips the service layer abstraction and would duplicate metadata construction logic.
- Create a generic `add_content()` method — rejected per YAGNI; each content type has distinct metadata fields.

## Decision 2: Deletion Pattern

**Decision**: Create `delete_by_article_ids(article_ids)` method on `VectorStoreService`, following `delete_by_collection_id()` pattern. Backend DELETE endpoint follows the documentation `delete_collection()` pattern.

**Rationale**: Documentation deletion is the established pattern — verify ownership, delete vector chunks, update chunk count cache, delete DB record. The article deletion endpoint mirrors this exactly.

**Alternatives considered**:
- Keep frontend direct Supabase delete + separate vectorstore call — rejected because it creates partial-delete risk and doesn't follow the established pattern.

## Decision 3: Duplicate URL Prevention

**Decision**: Check `articles` table for existing URL+user_id before inserting. Return HTTP 409 Conflict if duplicate found.

**Rationale**: Simplest approach — a single Supabase query before insert. No schema changes needed (no unique constraint required, though one could be added later). The check happens in the scrape endpoint before launching the background task.

**Alternatives considered**:
- Database unique constraint on (url, user_id) — viable but would surface as a generic DB error; explicit check gives a better error message.
- Allow duplicates — rejected per clarification decision.

## Decision 4: Integration Point for Indexing

**Decision**: Add vectorstore indexing in `process_article_scrape()` immediately after the successful Supabase update (line ~114 in articles.py), before updating the job status to COMPLETED.

**Rationale**: This is the same point where documentation indexing happens in `doc_scraper.py`. The article content is already available from the scrape result. If indexing fails, the article record remains in Supabase (FR-006), and the failure is logged.

**Alternatives considered**:
- Separate background task for indexing — rejected; adds complexity and the indexing is fast (single article).
- Index before DB update — rejected; if DB update fails, we'd have orphaned chunks.

## Decision 5: Frontend DELETE Proxy

**Decision**: Update `next-frontend/app/api/articles/[id]/route.ts` to proxy the DELETE request to the backend instead of deleting directly from Supabase.

**Rationale**: The backend endpoint handles both vector store cleanup and DB deletion atomically. The frontend should not bypass this by deleting directly from Supabase.

**Alternatives considered**:
- Keep frontend direct delete and add a post-delete hook — rejected; creates timing issues and partial-delete scenarios.
