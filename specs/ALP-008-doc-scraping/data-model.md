# Data Model: ALP-008 Documentation Site Scraping

**Created**: 2026-02-26

## Tables

### `doc_collections`

Stores metadata about a scraped documentation site collection.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Collection identifier |
| user_id | UUID | FK → auth.users, NOT NULL | Owner |
| entry_url | TEXT | NOT NULL | Original entry point URL |
| site_name | TEXT | | Extracted documentation site name |
| scope_path | TEXT | NOT NULL | Parent path used for crawl scope (e.g., `/help/section/`) |
| total_pages | INTEGER | NOT NULL, default 0 | Total discovered pages |
| successful_pages | INTEGER | NOT NULL, default 0 | Successfully scraped pages |
| status | TEXT | NOT NULL, default 'discovering' | Collection status |
| error_message | TEXT | | Error details if status='failed' |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, default now() | Last update timestamp |

**Status values**: `discovering`, `pending_confirmation`, `scraping`, `completed`, `partial`, `failed`

**Indexes**:
- `idx_doc_collections_user_id` on `(user_id, created_at DESC)`
- `idx_doc_collections_status` on `(user_id, status)`

**RLS Policies**:
- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id`
- UPDATE: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

### `doc_pages`

Stores individual pages within a documentation collection.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Page identifier |
| collection_id | UUID | FK → doc_collections ON DELETE CASCADE, NOT NULL | Parent collection |
| user_id | UUID | FK → auth.users, NOT NULL | Owner (denormalized for RLS) |
| page_url | TEXT | NOT NULL | Full URL of the page |
| title | TEXT | | Extracted page title |
| content_markdown | TEXT | | Scraped Markdown content |
| status | TEXT | NOT NULL, default 'pending' | Page scrape status |
| error_message | TEXT | | Error details if status='failed' |
| is_truncated | BOOLEAN | NOT NULL, default false | Whether content hit 200KB limit |
| display_order | INTEGER | NOT NULL, default 0 | Ordering within collection |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | Creation timestamp |

**Status values**: `pending`, `scraping`, `completed`, `failed`

**Indexes**:
- `idx_doc_pages_collection` on `(collection_id, display_order)`
- `idx_doc_pages_status` on `(collection_id, status)`

**RLS Policies**:
- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id`
- UPDATE: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

## State Transitions

### Collection Status

```
discovering → pending_confirmation (discovery complete, awaiting user confirm)
pending_confirmation → scraping (user confirms)
pending_confirmation → [deleted] (user cancels)
scraping → completed (all pages succeeded)
scraping → partial (some pages failed)
scraping → failed (all pages failed)
partial → scraping (retry failed pages)
```

### Page Status

```
pending → scraping (batch picks up page)
scraping → completed (content extracted successfully)
scraping → failed (timeout, access error, extraction error)
failed → pending (retry action resets failed pages)
```

## Vector Store Metadata

Each chunk stored in DeepLake carries:

```python
{
    "collection_id": "uuid",
    "page_url": "https://sirv.com/help/section/360-spin/getting-started/",
    "page_title": "Getting Started with 360 Spin",
    "site_name": "Sirv Help",
    "source_type": "documentation",
    "source": "https://sirv.com/help/section/360-spin/getting-started/"
}
```

**Deletion**: Filter by `collection_id` to remove all chunks when collection is deleted.

## Relationships

```
auth.users (1) ──── (N) doc_collections
doc_collections (1) ──── (N) doc_pages
doc_pages (1) ──── (N) DeepLake chunks (via collection_id metadata)
```
