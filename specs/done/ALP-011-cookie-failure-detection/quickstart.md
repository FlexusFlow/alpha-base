# Quickstart: Cookie Failure Detection & Status Marking

**Date**: 2026-03-03
**Feature**: ALP-011

## Prerequisites

- Backend running: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
- Frontend running: `cd next-frontend && yarn dev`
- Supabase project accessible with service role key
- At least one cookie file uploaded via the cookie management UI

## Implementation Order

### Step 1: Database Migration

Add `status`, `failed_at`, `failure_reason` columns to `user_cookies` and an UPDATE RLS policy.

**Verify**: Run `SELECT column_name FROM information_schema.columns WHERE table_name = 'user_cookies'` — should include the three new columns.

### Step 2: Backend — Cookie Service Changes

1. Create `CookieResult` dataclass in `backend/app/services/cookie_service.py`
2. Update `get_cookies_for_domain` to return `CookieResult | None`
3. Add `mark_cookie_failed(cookie_id, reason, supabase)` function
4. Add `clear_cookie_failure(cookie_id, supabase)` function
5. Update all callers to use `result.cookies_json` instead of raw string

**Verify**: Backend starts without errors; existing scraping/transcription still works.

### Step 3: Backend — Auth Error Detection

1. Create `backend/app/services/auth_detection.py` with:
   - `is_cloudflare_challenge(html: str) -> bool`
   - `is_auth_error(error: Exception) -> bool`
2. Refactor `transcriber.py` — catch `DownloadError` specifically, raise `AuthenticationError` for auth failures
3. Update `article_scraper.py` — check Playwright response status + page content for CF challenge after `page.goto()`

**Verify**: Run backend tests; manually test with a known-bad cookie to confirm detection.

### Step 4: Backend — Wire Detection to Cookie Marking

1. In `knowledge.py` — catch `AuthenticationError` in per-video loop, call `mark_cookie_failed`
2. In `articles.py` — detect auth errors in `process_article_scrape`, call `mark_cookie_failed`
3. In `documentation.py`/`doc_scraper.py` — detect auth errors in `scrape_page`, call `mark_cookie_failed`
4. In all three paths — call `clear_cookie_failure` on successful use of cookies

**Verify**: Upload cookies, trigger a scrape that fails with 403 → cookie status should be "failed" in DB.

### Step 5: Frontend — Updated Badge Display

1. Update `UserCookie` type to include `status`, `failed_at`, `failure_reason`
2. Update `getExpiryBadge` in `cookie-management.tsx` to prioritize "Failed" badge
3. Add tooltip/text showing failure reason and timestamp

**Verify**: Navigate to cookie management page → failed cookies show "Failed" badge with reason.

### Step 6: Frontend — Recovery Flow

1. Verify re-upload replaces failed cookie (existing delete+insert flow)
2. Confirm new cookie shows "Active" badge

**Verify**: Re-upload cookies for a failed domain → badge changes to "Active".

## Key Files to Modify

| File | Change |
|------|--------|
| `next-frontend/supabase/migrations/` | New migration for columns + RLS policy |
| `backend/app/services/cookie_service.py` | `CookieResult`, `mark_cookie_failed`, `clear_cookie_failure` |
| `backend/app/services/auth_detection.py` | New file: auth error detection utilities |
| `backend/app/services/transcriber.py` | Refactor error handling to preserve auth errors |
| `backend/app/services/article_scraper.py` | Add HTTP status + CF challenge detection |
| `backend/app/routers/knowledge.py` | Wire auth error → cookie failure marking |
| `backend/app/routers/articles.py` | Wire auth error → cookie failure marking |
| `backend/app/services/doc_scraper.py` | Wire auth error → cookie failure marking |
| `next-frontend/lib/types/cookies.ts` | Add status/failed_at/failure_reason fields |
| `next-frontend/components/cookie-management.tsx` | Update badge logic + failure display |
