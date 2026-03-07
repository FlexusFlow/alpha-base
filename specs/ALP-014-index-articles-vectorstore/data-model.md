# Data Model: Index Articles in Vector Store

**Date**: 2026-03-07

## Existing Entities (no schema changes)

### Article (Supabase `articles` table)

| Field             | Type         | Notes                        |
|-------------------|--------------|------------------------------|
| id                | UUID (PK)    | Auto-generated               |
| user_id           | UUID (FK)    | References auth.users        |
| url               | TEXT         | Article source URL           |
| title             | TEXT?        | Extracted after scraping      |
| content_markdown  | TEXT?        | Full article content          |
| summary           | TEXT?        | AI-generated summary          |
| status            | TEXT         | pending/scraping/completed/failed |
| error_message     | TEXT?        | Error details if failed       |
| is_truncated      | BOOLEAN      | Whether content was truncated |
| created_at        | TIMESTAMPTZ  | Auto-generated               |

**No schema changes required.** The existing table fully supports this feature.

## New Vector Store Metadata (DeepLake chunks)

### Article Chunk Metadata

When an article is indexed, each text chunk is stored in the user's DeepLake dataset with this metadata:

| Field       | Type   | Value                              |
|-------------|--------|------------------------------------|
| article_id  | string | Supabase article UUID              |
| title       | string | Article title (or empty string)    |
| source_type | string | `"article"` (literal)              |
| source      | string | Article URL                        |

**Deletion key**: `article_id` — used to find and remove all chunks for an article via `metadata['article_id']` filter.

## Entity Relationships

```text
Article (Supabase)
  └──< Article Chunks (DeepLake, per-user dataset)
       Linked by: metadata['article_id'] = article.id
```

## State Transitions

```text
Article.status:
  pending → scraping → completed (+ vector store indexed)
                     → failed (no vector store entry)
```

If vector store indexing fails after scraping succeeds, the article status remains `completed` (content is in Supabase), and the indexing failure is logged. No new status value is introduced.
