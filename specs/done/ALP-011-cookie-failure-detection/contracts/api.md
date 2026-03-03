# API Contracts: Cookie Failure Detection & Status Marking

**Date**: 2026-03-03
**Feature**: ALP-011

## Modified Endpoints

### `GET /api/cookies` (Next.js API route)

No URL/method changes. Response payload updated to include new fields.

**Response** (existing, updated):

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "domain": "youtube.com",
    "filename": "youtube.com.cookies.json",
    "file_path": "user-id/youtube.com.cookies.json",
    "earliest_expiry": "2027-01-15T00:00:00Z",
    "created_at": "2026-03-01T12:00:00Z",
    "status": null,
    "failed_at": null,
    "failure_reason": null
  },
  {
    "id": "uuid",
    "domain": "example.com",
    "status": "failed",
    "failed_at": "2026-03-03T14:30:00Z",
    "failure_reason": "403 Forbidden during article scraping"
  }
]
```

**Changes**: Three new nullable fields (`status`, `failed_at`, `failure_reason`) included in each cookie record. No query parameter changes.

---

## Internal Backend Contracts (Service Layer)

These are not HTTP endpoints — they are Python function signatures called within background tasks.

### `cookie_service.get_cookies_for_domain` (modified)

**Before**:
```
get_cookies_for_domain(user_id, target_url, supabase) -> str | None
```

**After**:
```
get_cookies_for_domain(user_id, target_url, supabase) -> CookieResult | None

CookieResult:
  cookie_id: str    # UUID of the matched user_cookies row
  domain: str       # matched domain
  cookies_json: str  # raw cookie file content
```

### `cookie_service.mark_cookie_failed` (new)

```
mark_cookie_failed(cookie_id, reason, supabase) -> None
```

Updates the `user_cookies` row: `status = 'failed'`, `failed_at = now()`, `failure_reason = reason`.

### `cookie_service.clear_cookie_failure` (new)

```
clear_cookie_failure(cookie_id, supabase) -> None
```

Clears failure state: `status = NULL`, `failed_at = NULL`, `failure_reason = NULL`.

### `auth_error_detection.is_auth_error` (new utility)

```
is_auth_error(error: Exception) -> bool
```

Returns `True` if the exception indicates an authentication/authorization failure (403, Cloudflare challenge, yt-dlp login-required). Returns `False` for all other errors.

### `auth_error_detection.is_cloudflare_challenge` (new utility)

```
is_cloudflare_challenge(page_content: str) -> bool
```

Returns `True` if the HTML content matches Cloudflare challenge fingerprints.
