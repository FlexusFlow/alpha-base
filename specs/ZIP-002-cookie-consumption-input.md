# Feature Input for /speckit.specify

## Feature Title
Backend Cookie Consumption from Supabase Storage

## Feature Branch
`feature/ZIP-002-cookie-consumption`

## Context & Motivation

ZIP-001 (Cookie Management) implemented the frontend for uploading, listing, and deleting browser cookie JSON files stored in Supabase cloud storage (`cookie-files` private bucket + `user_cookies` metadata table). However, ZIP-001 explicitly deferred **consuming** those cookies in the scraping/transcription pipeline as out of scope.

Currently in `backend/app/services/transcriber.py`, the cookie variable is hardcoded as an empty string (`cookie = ""`). The backend has the full infrastructure to parse JSON cookie entries into Python `http.cookiejar.Cookie` objects and inject them into yt-dlp — but it never fetches the actual cookie data from Supabase Storage.

This feature closes the loop: when the backend needs to scrape or transcribe content from a domain, it should automatically look up the user's cookie file for that domain in Supabase Storage, download it, parse it, and inject the cookies into the scraping tool (yt-dlp, or future Playwright integration).

## Reference Implementation

The `medium-legal-scrapper` project implements this pattern in its `/app/api/scrape-article/route.ts`:

1. Extract domain from the target URL
2. Normalize domain (strip `www.` prefix, lowercase)
3. Query `user_cookies` table: `SELECT file_path FROM user_cookies WHERE user_id = ? AND domain = ?`
4. Download file from Supabase Storage: `supabase.storage.from('cookie-files').download(file_path)`
5. Parse blob to JSON: `JSON.parse(await fileData.text())` → `CookieEntry[]`
6. Inject cookies into Playwright browser context: `context.addCookies(cookies)`

The ZipTrader backend should implement the equivalent in Python, fetching from Supabase Storage using the **service role key** (backend bypasses RLS per the constitution).

## Existing Infrastructure

### Already implemented (ZIP-001):
- Supabase `user_cookies` table with RLS (id, user_id, domain, filename, file_path, earliest_expiry, created_at)
- Supabase Storage `cookie-files` private bucket with user-scoped policies
- Frontend cookie upload/list/delete UI at `/dashboard/cookies`
- Next.js API routes at `/api/cookies` (POST, GET, DELETE)
- Cookie utility functions in `next-frontend/lib/cookies.ts` (domain extraction, normalization)
- Cookie type definitions in `next-frontend/lib/types/cookies.ts`

### Already in backend:
- Supabase client config in `backend/app/config.py` with `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- Cookie parsing logic in `backend/app/services/transcriber.py` (lines 29-83) — converts JSON cookie entries to `http.cookiejar.Cookie` objects for yt-dlp
- FastAPI dependency injection pattern in `backend/app/dependencies.py`

## What Needs to Be Built

### 1. Backend Cookie Service (`backend/app/services/cookie_service.py`)

A new service that:
- Accepts a target URL and user_id
- Extracts and normalizes the domain from the URL
- Queries `user_cookies` table via Supabase service client for the matching domain + user
- Downloads the cookie JSON file from Supabase Storage bucket `cookie-files`
- Parses the JSON into a list of cookie entry dicts
- Returns the parsed cookies (or empty list if none found)
- Handles errors gracefully (missing cookies, download failures, parse errors)

### 2. Wire Cookie Service into Transcriber

Update `backend/app/services/transcriber.py`:
- Replace hardcoded `cookie = ""` with a call to the cookie service
- Pass user_id through the transcription pipeline (from the authenticated request → service)
- The existing cookie → `http.cookiejar.Cookie` parsing code already handles injection into yt-dlp

### 3. User ID Propagation

Ensure user_id flows from the authenticated API request through to the transcriber service:
- The Next.js frontend sends requests to the Python backend with the user's Supabase auth token
- The backend extracts user_id from the token (or receives it as a parameter)
- user_id is passed to the cookie service when fetching cookies

### 4. Domain Matching Strategy

- Exact match first: `youtube.com` matches cookie for `youtube.com`
- Consider parent domain fallback: `music.youtube.com` should match cookie for `youtube.com` if no exact match exists
- Normalize all domains: lowercase, strip `www.` prefix

## Constraints & Decisions Needed

1. **Should cookie fetching be synchronous or cached?** — Cookies are small JSON files (~10-50KB). Direct download per request is likely fine. Caching adds complexity and stale-cookie risk. Recommend: no caching, direct download each time.

2. **Should expired cookies be skipped?** — The `earliest_expiry` field exists in `user_cookies`. Option A: Always use cookies regardless of expiry (let the target site decide). Option B: Skip expired cookies and warn the user. Recommend: Option A (use regardless), since individual cookie entries may still be valid even if the earliest one expired.

3. **Should this feature also integrate with future Playwright scraping?** — The cookie service should return a generic format (list of cookie entry dicts) that can be consumed by both yt-dlp (via `http.cookiejar`) and Playwright (via `context.addCookies()`). Recommend: yes, design the service to be consumer-agnostic.

4. **Error handling when cookies are missing for a domain** — Should the scraping proceed without cookies (graceful degradation) or fail? Recommend: proceed without cookies, log a warning.

5. **Should subdomain matching be supported?** — e.g., if user uploads `youtube.com.cookies.json`, should requests to `music.youtube.com` or `www.youtube.com` use those cookies? Recommend: yes, fall back to parent domain if exact match not found.

## Out of Scope

- Modifying the frontend cookie management UI (already complete in ZIP-001)
- Automatic cookie refresh or re-authentication
- Cookie content validation (checking if entries are well-formed)
- Playwright browser automation integration (design for it, but don't implement the Playwright consumer)
- Rate limiting on cookie downloads from Supabase Storage

## Success Criteria

- **SC-001**: When a user has uploaded cookies for `youtube.com` and triggers a transcription for a YouTube video, the backend automatically uses those cookies for the yt-dlp request.
- **SC-002**: When no cookies exist for a domain, scraping proceeds normally without cookies (graceful degradation).
- **SC-003**: Cookie download + parse adds less than 500ms to the scraping pipeline.
- **SC-004**: The cookie service is reusable — any future scraping consumer (Playwright, requests, etc.) can call it to get parsed cookies for a domain.
