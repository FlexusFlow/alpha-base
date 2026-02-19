# Data Model: Cookie Management (ZIP-001)

**Date**: 2026-02-17
**Branch**: `feature/ZIP-001-cookie-management`

## Entities

### UserCookie (Database Table: `user_cookies`)

Represents a user's uploaded cookie file metadata.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| user_id | UUID | FK → auth.users(id), ON DELETE CASCADE, NOT NULL | Owner of the cookie |
| domain | TEXT | NOT NULL | Normalized domain (lowercase, no www.) |
| filename | TEXT | NOT NULL | Original uploaded filename |
| file_path | TEXT | NOT NULL | Storage path: `{user_id}/{filename}` |
| earliest_expiry | TIMESTAMPTZ | NULLABLE | Earliest cookie expiration from file content. NULL if no expiry data found. |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Upload timestamp |

**Constraints**:
- UNIQUE(user_id, domain) — one cookie per domain per user
- Maximum 50 rows per user_id (enforced at application level in API route)

**RLS Policies**:
- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

### CookieFile (Supabase Storage: `cookie-files` bucket)

The actual JSON file stored in private cloud storage.

| Property | Value |
|----------|-------|
| Bucket | `cookie-files` (private) |
| Path pattern | `{user_id}/{filename}` |
| Access | User-scoped via storage policies |

**Storage Policies**:
- INSERT: `bucket_id = 'cookie-files' AND auth.uid()::text = (storage.foldername(name))[1]`
- SELECT: `bucket_id = 'cookie-files' AND auth.uid()::text = (storage.foldername(name))[1]`
- DELETE: `bucket_id = 'cookie-files' AND auth.uid()::text = (storage.foldername(name))[1]`

### CookieEntry (TypeScript type only — not persisted)

Represents a single cookie entry within an uploaded JSON file. Used for expiration parsing.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Cookie name |
| value | string | Cookie value |
| domain | string | Cookie domain |
| path | string | Cookie path |
| expires | number (optional) | Unix timestamp of expiration |
| httpOnly | boolean (optional) | HTTP-only flag |
| secure | boolean (optional) | Secure flag |
| sameSite | 'Strict' \| 'Lax' \| 'None' (optional) | SameSite attribute |

## Relationships

```
auth.users (1) ──── (0..50) user_cookies
                              │
                              │ file_path references
                              ▼
                    cookie-files storage bucket
```

## State Transitions

UserCookie has no complex lifecycle — it's a simple CRUD entity:

1. **Created** — User uploads a cookie file → file stored + DB row inserted
2. **Replaced** — User uploads for same domain → old file deleted, old row deleted, new file + row created
3. **Deleted** — User clicks delete → file removed from storage, DB row deleted

## Expiration Status (Derived, Not Stored as State)

Computed at display time from `earliest_expiry`:
- `earliest_expiry IS NULL` → "Unknown" (gray badge)
- `earliest_expiry > NOW()` → "Active" (green badge)
- `earliest_expiry <= NOW()` → "Expired" (red badge)
