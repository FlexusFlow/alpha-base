# Data Model: ZIP-003 Article Scraping Migration

## Entity Relationship Diagram

```
auth.users (existing)
    │
    ├── 1:N ──► articles
    │               │
    │               └── 1:N ──► article_chat_messages
    │
    └── 1:N ──► user_cookies (existing, ZIP-001)
```

## Tables

### articles (new)

| Column             | Type         | Constraints                          | Notes                              |
|--------------------|--------------|--------------------------------------|------------------------------------|
| id                 | UUID         | PK, DEFAULT gen_random_uuid()        |                                    |
| user_id            | UUID         | FK → auth.users(id) ON DELETE CASCADE, NOT NULL |                         |
| url                | TEXT         | NOT NULL                             | Source URL                         |
| title              | TEXT         |                                      | Nullable — extracted from page     |
| content_markdown   | TEXT         |                                      | Markdown version (single content column — plain text is redundant) |
| summary            | TEXT         |                                      | AI-generated, cached               |
| status             | TEXT         | NOT NULL, DEFAULT 'pending', CHECK (status IN ('pending', 'scraping', 'completed', 'failed')) | Job lifecycle |
| error_message      | TEXT         |                                      | Error details if status = 'failed' |
| is_truncated       | BOOLEAN      | DEFAULT false                        | True if content exceeded 200KB     |
| created_at         | TIMESTAMPTZ  | DEFAULT NOW()                        |                                    |

**Indexes**:
- `idx_articles_user_id` on `(user_id, created_at DESC)` — article list query
- `idx_articles_status` on `(user_id, status)` — pending/in-progress filter

**RLS Policies**:
- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id`
- UPDATE: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

**State Transitions**:
```
pending → scraping → completed
                   → failed
```

### article_chat_messages (new)

| Column     | Type         | Constraints                                      | Notes              |
|------------|--------------|--------------------------------------------------|--------------------|
| id         | UUID         | PK, DEFAULT gen_random_uuid()                     |                    |
| article_id | UUID         | FK → articles(id) ON DELETE CASCADE, NOT NULL      |                    |
| user_id    | UUID         | FK → auth.users(id) ON DELETE CASCADE, NOT NULL    |                    |
| role       | TEXT         | NOT NULL, CHECK (role IN ('user', 'assistant'))    |                    |
| content    | TEXT         | NOT NULL                                          |                    |
| created_at | TIMESTAMPTZ  | DEFAULT NOW()                                     |                    |

**Indexes**:
- `idx_article_chat_messages_article` on `(article_id, created_at ASC)` — chat history query

**RLS Policies**:
- SELECT: `EXISTS (SELECT 1 FROM articles WHERE id = article_id AND user_id = auth.uid())`
- INSERT: `EXISTS (SELECT 1 FROM articles WHERE id = article_id AND user_id = auth.uid())`
- DELETE: `EXISTS (SELECT 1 FROM articles WHERE id = article_id AND user_id = auth.uid())`

## Migration File

`006_articles.sql` — follows existing numbering convention (after `005_cookie_files_storage.sql`).
