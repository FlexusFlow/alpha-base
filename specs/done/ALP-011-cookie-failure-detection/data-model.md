# Data Model: Cookie Failure Detection & Status Marking

**Date**: 2026-03-03
**Feature**: ALP-011

## Entity Changes

### Modified: `user_cookies` (Supabase)

Existing columns (unchanged):
- `id` (UUID, PK)
- `user_id` (UUID, FK → auth.users)
- `domain` (TEXT, NOT NULL)
- `filename` (TEXT, NOT NULL)
- `file_path` (TEXT, NOT NULL)
- `earliest_expiry` (TIMESTAMPTZ, nullable) — stores latest expiry despite column name
- `created_at` (TIMESTAMPTZ, default NOW())
- UNIQUE constraint on `(user_id, domain)`

**New columns**:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `status` | TEXT | NULL | NULL = active, `'failed'` = auth failure detected at runtime |
| `failed_at` | TIMESTAMPTZ | NULL | Timestamp when the failure was detected |
| `failure_reason` | TEXT | NULL | Human-readable failure description (max ~200 chars) |

**Constraints**:
- `status` CHECK: value must be NULL or `'failed'`
- All three new columns are NULL together or non-NULL together (enforced at application level, not DB constraint — simpler)

**RLS changes**:
- Add UPDATE policy: `auth.uid() = user_id` (backend uses service role, but needed for schema completeness)

### State Transitions

```
                    ┌──────────────────┐
                    │  Active (NULL)   │ ← initial state / after re-upload
                    └────────┬─────────┘
                             │
                    auth failure detected
                             │
                             ▼
                    ┌──────────────────┐
                    │  Failed          │
                    │  status='failed' │
                    │  failed_at=now() │
                    │  failure_reason  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         re-upload     successful use   manual clear
         (delete+insert)  (UPDATE→NULL)  (future scope)
              │              │              │
              ▼              ▼              ▼
         ┌──────────────────────────────────┐
         │  Active (NULL)                   │
         └──────────────────────────────────┘
```

## New Types (Backend)

### `CookieResult` (return type for `get_cookies_for_domain`)

| Field | Type | Description |
|-------|------|-------------|
| `cookie_id` | str (UUID) | The `user_cookies.id` of the matched record |
| `domain` | str | The matched domain (may differ from request domain due to parent matching) |
| `cookies_json` | str | Raw cookie file content (JSON string) |

Replaces current `str | None` return type. Callers use `result.cookies_json` where they previously used the raw string, and `result.cookie_id` / `result.domain` for failure attribution.

### `AuthFailureError` (exception)

Subclass of existing `TranscriptionError` (for transcriber) and a new base for scraper auth errors.

| Field | Type | Description |
|-------|------|-------------|
| `message` | str | Human-readable error description |
| `domain` | str | The domain that rejected the request |
| `error_type` | str | Category: `"http_403"`, `"cloudflare_challenge"`, `"login_required"` |

## Frontend Type Changes

### `UserCookie` (existing, in `lib/types/cookies.ts`)

Add three optional fields to match new DB columns:

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string \| null` | `null` = active, `"failed"` = runtime failure |
| `failed_at` | `string \| null` | ISO timestamp of failure detection |
| `failure_reason` | `string \| null` | Human-readable failure description |

## Badge Priority Logic (Frontend)

The cookie management UI currently shows badges based on expiry date. With the new `status` field, the priority order becomes:

1. **Failed** (status = "failed") — highest priority, overrides all others
2. **Expired** (expiry date in the past, status is not "failed")
3. **Active** (expiry date in the future, status is not "failed")
4. **Unknown** (no expiry date, status is not "failed")
