# Data Model: ZIP-006 Public RAG API

## Entity Relationship Diagram

```
auth.users (existing)
    │
    ├── 1:N ──► api_keys (new)
    │               │
    │               └── 1:N ──► api_usage_logs (new)
    │
    └── 1:N ──► api_usage_logs (new)
```

## Tables

### api_keys (new)

Stores API keys for public RAG API access. Keys are hashed for security.

| Column       | Type         | Constraints                                  | Notes                          |
|--------------|--------------|----------------------------------------------|--------------------------------|
| id           | UUID         | PK, DEFAULT gen_random_uuid()                | Primary key                    |
| user_id      | UUID         | FK → auth.users(id) ON DELETE CASCADE, NOT NULL | Key owner                      |
| key_hash     | TEXT         | NOT NULL, UNIQUE                             | SHA-256 hash of full key       |
| key_prefix   | TEXT         | NOT NULL                                     | First 12 chars for UI display  |
| name         | TEXT         | NOT NULL, CHECK (char_length(name) <= 100)   | User-provided label            |
| created_at   | TIMESTAMPTZ  | DEFAULT NOW()                                | Creation timestamp             |
| last_used_at | TIMESTAMPTZ  |                                              | Last successful auth timestamp |
| is_active    | BOOLEAN      | DEFAULT TRUE                                 | Revocation flag                |

**Indexes**:
- `idx_api_keys_hash ON (key_hash)` — Fast verification lookups
- `idx_api_keys_user_active ON (user_id, is_active)` — User's active keys listing

**RLS Policies**:
- `own_keys_select`: Users can SELECT only their own keys (`auth.uid() = user_id`)
- `own_keys_insert`: Users can INSERT only with their own user_id
- `own_keys_update`: Users can UPDATE only their own keys
- `own_keys_delete`: Users can DELETE only their own keys

**Key Format**: `zt_{secrets.token_urlsafe(32)}` — 44+ characters total. The `zt_` prefix identifies ZipTrader keys.

**Security Note**: The full key is NEVER stored. Only the SHA-256 hash (`key_hash`) and the prefix (`key_prefix`) are persisted.

---

### api_usage_logs (new)

Tracks all public API requests for auditing and diagnostics.

| Column      | Type         | Constraints                                  | Notes                          |
|-------------|--------------|----------------------------------------------|--------------------------------|
| id          | UUID         | PK, DEFAULT gen_random_uuid()                | Primary key                    |
| api_key_id  | UUID         | FK → api_keys(id) ON DELETE SET NULL         | Which key was used (nullable)  |
| user_id     | UUID         | FK → auth.users(id) ON DELETE CASCADE, NOT NULL | Key owner at request time      |
| endpoint    | TEXT         | NOT NULL                                     | Endpoint path (e.g., "/v1/api/public/query") |
| status_code | INT          | NOT NULL                                     | HTTP response status code      |
| created_at  | TIMESTAMPTZ  | DEFAULT NOW()                                | Request timestamp              |

**Indexes**:
- `idx_usage_logs_key_ts ON (api_key_id, created_at)` — Per-key usage analytics
- `idx_usage_logs_user_ts ON (user_id, created_at)` — Per-user usage analytics

**RLS Policies**:
- `own_logs_select`: Users can SELECT only their own logs (`auth.uid() = user_id`)

**Minimal Fields for MVP**: No IP address, token counts, or request body tracking. These can be added later if needed.

**ON DELETE Behavior**:
- `api_key_id ON DELETE SET NULL` — If a key is deleted, logs remain but key reference is cleared
- `user_id ON DELETE CASCADE` — If a user is deleted, all their logs are removed

## Migration File

`009-public-rag-api.sql` — follows existing numbering convention (after `008_failed_training_statuses.sql`).

See `009-public-rag-api.sql` for full SQL. Includes:
- CREATE TABLE for `api_keys` with CHECK constraint on name length
- CREATE TABLE for `api_usage_logs`
- RLS policies for both tables
- Indexes for performance

## State Diagram: API Key Lifecycle

```
[Created: is_active=true] ──► [Used: last_used_at updated] ──► [Revoked: is_active=false]
                                        ↑                               │
                                        └───────────────────────────────┘
                                        (cannot be re-activated)
```

**Notes**:
- Keys cannot transition back to `is_active=true` after revocation (user must create a new key)
- `last_used_at` updates on every successful verification
- Revoked keys remain in the database for audit trail purposes
