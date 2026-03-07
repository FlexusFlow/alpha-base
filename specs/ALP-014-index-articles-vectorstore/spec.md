# Feature Specification: Index Articles in Vector Store

**Feature Branch**: `feature/ALP-014-index-articles-vectorstore`
**Created**: 2026-03-07
**Status**: Draft
**Input**: User description: "Index articles in vectorstore — Articles are scraped to Supabase DB only and invisible to RAG. Add vectorstore.add_documents() call during article ingestion with metadata {source_type: 'article', source: url, title: title}. Articles in vectorstore should be user scoped as well as youtube videos and documentation pages content"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Newly Scraped Articles Appear in RAG Chat (Priority: P1)

A user scrapes an article via the existing article scraping flow. After scraping completes, the article content is automatically chunked and indexed in the user's personal vector store. When the user asks a question in the RAG chat, the system can retrieve relevant chunks from the article alongside existing video transcripts and documentation pages.

**Why this priority**: This is the core value — articles become searchable knowledge. Without this, articles remain isolated from the knowledge base.

**Independent Test**: Scrape any public article, then ask the RAG chat a question that only the article can answer. The response should cite the article as a source.

**Acceptance Scenarios**:

1. **Given** a user scrapes an article successfully, **When** scraping completes, **Then** the article content is chunked and added to the user's vector store with metadata `source_type: "article"`, `source: <url>`, and `title: <title>`.
2. **Given** an article is indexed in the vector store, **When** the user asks a RAG chat question relevant to the article, **Then** the system retrieves article chunks and includes them in the response with proper source attribution.
3. **Given** a user scrapes an article, **When** another user asks a question about that article's content, **Then** the other user gets no results from it (user-scoped isolation).

---

### User Story 2 - Deleting an Article Removes It from the Vector Store (Priority: P2)

When a user deletes an article from the system, the corresponding chunks are also removed from the vector store. This ensures the knowledge base stays clean and consistent with the article list.

**Why this priority**: Data consistency is important, but secondary to the core indexing feature. Stale data in the vector store could lead to confusing RAG responses referencing deleted content.

**Independent Test**: Scrape an article, confirm it appears in RAG results, delete the article, then confirm the RAG chat no longer returns results from it.

**Acceptance Scenarios**:

1. **Given** an article has been indexed in the vector store, **When** the user deletes that article, **Then** all chunks associated with that article are removed from the user's vector store.
2. **Given** an article has been deleted and its chunks removed, **When** the user asks a question previously answered by that article, **Then** no results from the deleted article appear.

---

### Edge Cases

- What happens when article scraping succeeds but vector store indexing fails? The article should still be saved in Supabase with a completed status, and the indexing failure should be logged. The article can be re-indexed later.
- What happens when an article has empty or very short content? Articles with no extractable content should skip vector store indexing. Articles with minimal content should still be indexed as a single chunk.
- What happens when the same URL is scraped again by the same user? The system rejects the request with a clear error indicating the article already exists.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST chunk and index article content in the user's vector store immediately after successful scraping.
- **FR-002**: System MUST attach metadata to each article chunk: `source_type: "article"`, `source: <article_url>`, `title: <article_title>`, and `article_id: <supabase_article_id>`.
- **FR-003**: System MUST use the same per-user vector store isolation as video transcripts and documentation pages (user-scoped dataset).
- **FR-004**: System MUST remove all article chunks from the vector store when an article is deleted, via a single backend endpoint that atomically handles both database record and vector store cleanup.
- **FR-005**: System MUST skip vector store indexing for articles with empty content.
- **FR-006**: System MUST handle vector store indexing failures gracefully — the article record in Supabase should remain intact, and the failure should be logged.
- **FR-007**: System MUST reject article scraping if the same URL already exists for the user, preventing duplicate articles and duplicate vector store entries.

### Key Entities

- **Article Chunk**: A segment of article content stored in the vector store, linked back to the source article via `article_id` and `source` URL metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can ask RAG chat questions and receive answers derived from their scraped articles within the same session the article was scraped.
- **SC-002**: Article deletion fully removes associated content from both the database and the vector store — no orphaned chunks remain.
- **SC-003**: Article content is only accessible to the user who scraped it — no cross-user data leakage.
- **SC-004**: Vector store indexing failures do not block or break the article scraping flow.

## Clarifications

### Session 2026-03-07

- Q: Should article results in RAG chat be distinguished from other KB sources (labeled "article" vs "kb")? → A: Uniform "kb" label — articles appear the same as transcripts and docs in chat results. No changes to chat source attribution needed.
- Q: Should this feature add a backend article deletion endpoint or keep frontend Supabase delete with a separate vectorstore call? → A: Single backend DELETE endpoint — handles both Supabase record and vector store cleanup atomically, following the documentation deletion pattern.
- Q: How should re-scraping the same article URL be handled? → A: Prevent duplicates — reject scrape if URL already exists for this user.

## Assumptions

- The existing text chunking strategy (RecursiveCharacterTextSplitter with configured chunk size/overlap) is suitable for article content.
- The existing RAG chat retrieval treats all knowledge base content uniformly as "kb" — no changes needed to source type labeling for articles.
- Article deletion functionality already exists or will be added as part of this feature if not present.
