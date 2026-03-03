# Research: Cookie Failure Detection & Status Marking

**Date**: 2026-03-03
**Feature**: ALP-011

## R-001: yt-dlp Authentication Error Detection

**Decision**: Catch `yt_dlp.utils.DownloadError` specifically (instead of bare `Exception`) and inspect the error message string for auth-related patterns.

**Rationale**: yt-dlp wraps all extraction failures in `DownloadError`. Auth failures produce distinctive messages:
- `"Sign in to confirm you're not a bot"`
- `"Sign in to confirm your age"`
- `"HTTP Error 403: Forbidden"`
- `"This video is only available to Music Premium members"`

These can be matched with substring/regex checks. Non-auth errors (network, missing subtitles) produce different messages like `"Unable to extract"`, `"No video formats found"`, etc.

**Alternatives considered**:
- Catching `ExtractorError` directly — not viable because yt-dlp wraps it inside `DownloadError` before surfacing.
- Checking yt-dlp exit codes — not applicable when using the Python API (exceptions are raised, not exit codes).

**Current gap**: `get_transcript_via_ytdlp()` has `except Exception: return None` — all error info is discarded. Must refactor to preserve the error message and category.

## R-002: Cloudflare Challenge Page Detection

**Decision**: After Playwright loads a page, check the response body for Cloudflare challenge fingerprints before proceeding with content extraction.

**Rationale**: Playwright does NOT raise on HTTP 4xx/5xx — it loads the page normally. Cloudflare challenge pages have reliable signatures:
- `<title>` contains "Just a moment" or "Attention Required"
- Page contains `id="challenge-running"` or `id="cf-challenge-running"`
- Page includes `/cdn-cgi/challenge-platform/` script references
- `<noscript>` content about enabling JavaScript

Checking 2-3 of these markers gives high confidence with near-zero false positives.

**Alternatives considered**:
- Checking HTTP response status via `page.goto()` return value (`Response.status`) — good for 403 but Cloudflare challenges often return 403 *or* 503, and some use JavaScript redirects that appear as 200. Content check is more reliable.
- Using a third-party Cloudflare-bypass library — over-engineered for detection-only needs.

**Current gap**: `article_scraper.py` has zero HTTP status or challenge page detection. A Cloudflare-blocked page silently returns challenge HTML as "article content."

## R-003: Cookie Service Return Type

**Decision**: Extend `get_cookies_for_domain` to return a typed result containing both the cookie JSON string and the cookie record ID, instead of just the string.

**Rationale**: All three callers (knowledge.py, articles.py, documentation.py) need the cookie record ID to mark it as failed. Currently only `file_path` is selected from the DB. Adding `id` and `domain` to the select is trivial and avoids a second query.

**Alternatives considered**:
- Second DB query by `user_id + domain` after failure — adds latency and race conditions (cookie could be re-uploaded between queries).
- Passing domain string to a separate `mark_cookie_failed(user_id, domain)` function — works but is less precise; the service already has the exact record during lookup.

## R-004: Cookie Failure Persistence Strategy

**Decision**: Add three nullable columns to `user_cookies`: `status` (text, default NULL = active), `failed_at` (timestamptz), `failure_reason` (text). Use UPDATE (not delete+re-insert) for failure marking.

**Rationale**:
- NULL status = active (backward-compatible, no migration needed for existing rows).
- Separate `failed_at` timestamp allows UI to show when the failure was detected.
- `failure_reason` stores a human-readable message (e.g., "403 Forbidden during YouTube transcription").
- The existing RLS policy has no UPDATE policy — need to add one.
- On re-upload, the existing delete+insert flow naturally clears failure state since the new row has NULL status.

**Alternatives considered**:
- Separate `cookie_failures` table — over-engineered for a simple status flag; would require JOINs in the frontend query.
- Boolean `is_failed` column — doesn't capture when/why; less useful for the UI.
- Enum type for status — overkill; only two states needed (NULL=active, "failed").

## R-005: Auth Failure Detection Threshold for Documentation Scraping

**Decision**: Mark cookie as failed after the first auth failure in a documentation scrape job (not after a threshold count).

**Rationale**: If even one page returns a Cloudflare challenge or 403 while using cookies, the cookies are likely invalid for the entire domain. Waiting for 3+ failures just delays the signal. The spec mentions a threshold as an edge case, but in practice:
- Cloudflare challenges block all pages, not selectively
- 403s from expired sessions affect all authenticated requests
- A single false positive (marking cookies failed when they're fine) is recoverable — user sees badge, tries again, cookies auto-recover on success (FR-007)

**Alternatives considered**:
- Threshold of 3+ auth failures — adds unnecessary complexity and delays user notification.

## R-006: Supabase RLS Policy for Cookie Updates

**Decision**: Add an UPDATE RLS policy on `user_cookies` scoped to `auth.uid() = user_id`, limited to the `status`, `failed_at`, and `failure_reason` columns. Backend uses service role key (bypasses RLS), but the policy is needed for correctness.

**Rationale**: The current table has SELECT, INSERT, DELETE policies but no UPDATE policy. Since the backend uses the service role key, the missing policy doesn't block functionality, but it should exist for defense-in-depth. The update will only be called from the backend (service role), so this is primarily a schema hygiene concern.

## R-007: Error Propagation Refactor in Transcriber

**Decision**: Refactor `get_transcript_via_ytdlp` to raise a typed exception (e.g., `AuthenticationError` subclass of `TranscriptionError`) instead of returning `None` on auth failures. Return `None` only for non-auth failures (missing subtitles, format issues).

**Rationale**: The current `except Exception: return None` discards all error information. The caller (`get_transcript`) then raises a generic `TranscriptionError("No transcript available")`. To detect auth failures, the error category must survive the call chain. A typed exception lets callers distinguish auth errors from content errors without string matching at the router level.

**Alternatives considered**:
- Returning a tuple `(text, error_category)` — awkward API, mixes return types.
- Logging the error and checking logs — not programmatically actionable.
- String matching on `TranscriptionError.message` in the router — fragile; better to use exception types.
