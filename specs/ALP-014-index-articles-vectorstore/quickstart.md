# Quickstart: Index Articles in Vector Store

**Date**: 2026-03-07

## What This Feature Does

Makes scraped articles searchable in RAG chat by indexing their content in the vector store. Also adds a backend deletion endpoint that cleans up both the database record and vector store chunks atomically.

## Files to Modify

| File | Change |
|------|--------|
| `backend/app/services/vectorstore.py` | Add `add_article()` and `delete_by_article_ids()` methods |
| `backend/app/routers/articles.py` | Add duplicate URL check in scrape endpoint, add vectorstore indexing in background task, add DELETE endpoint |
| `backend/app/models/articles.py` | Add `ArticleDeleteResponse` model |
| `next-frontend/app/api/articles/[id]/route.ts` | Proxy DELETE to backend instead of direct Supabase delete |

## Implementation Order

1. **VectorStoreService methods** — `add_article()` and `delete_by_article_ids()`
2. **Duplicate URL check** — in `scrape_article_endpoint()` before insert
3. **Vector store indexing** — in `process_article_scrape()` after successful scraping
4. **Backend DELETE endpoint** — new `delete_article()` in articles router
5. **Frontend proxy** — update Next.js DELETE route to call backend

## Testing

1. Scrape a public article → verify chunks appear in user's vector store
2. Ask RAG chat a question about the article → verify answer cites the article
3. Scrape the same URL again → verify HTTP 409 rejection
4. Delete the article → verify chunks removed from vector store
5. Ask the same question again → verify no results from deleted article
