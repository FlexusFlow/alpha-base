# Implementation Plan: ZIP-002 Backend Cookie Consumption

**Feature**: Backend Cookie Consumption from Supabase Storage
**Branch**: `feature/ZIP-002-cookie-consumption`
**Created**: 2026-02-18

## Technical Context

| Aspect | Detail |
| --- | --- |
| Backend | Python 3.12+, FastAPI, `uv` package manager |
| Frontend | Next.js 15 (App Router), TypeScript, `yarn` |
| Database | Supabase (PostgreSQL + Storage) |
| Auth pattern | Frontend extracts user_id via `supabase.auth.getUser()`, passes in request body |
| Transcription | `youtube-transcript-api` primary, `yt-dlp` fallback (cookie injection applies to yt-dlp only) |
| Cookie storage | Supabase Storage `cookie-files` bucket, metadata in `user_cookies` table |
| Existing cookie code | `transcriber.py:31-57` — Original JSON → `http.cookiejar.CookieJar` + `_opener` injection was **non-functional** (relied on uninitialized yt-dlp internals). Replaced with Netscape temp file + `cookiefile` option |

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Full-Stack TS Frontend / Python Backend | PASS | New code is Python backend service + minor TS frontend change |
| II. API-Boundary Separation | PASS | Frontend passes user_id via BFF proxy; backend service is internal |
| III. Supabase as Source of Truth | PASS | Cookies stored in Supabase Storage. Short-lived temp files on local filesystem permitted for yt-dlp's `cookiefile` API; deleted immediately after use |
| IV. Background Jobs with Real-Time Feedback | PASS | Cookie fetch integrated into existing background job pipeline |
| V. Simplicity and Pragmatism | PASS | No caching, no abstractions, minimal new code. Uses yt-dlp's official `cookiefile` API instead of hacking internals |

## Implementation Steps

### Step 1: Create Cookie Service (`backend/app/services/cookie_service.py`)

**New file**. Single async function with domain matching logic.

```python
# Pseudocode
async def get_cookies_for_domain(user_id, target_url, supabase) -> str | None:
    domain = extract_and_normalize_domain(target_url)
    domains_to_try = [domain] + parent_domains(domain)

    for d in domains_to_try:
        result = supabase.table("user_cookies").select("file_path").eq("user_id", user_id).eq("domain", d).execute()
        if result.data:
            file_bytes = supabase.storage.from_("cookie-files").download(result.data[0]["file_path"])
            return file_bytes.decode("utf-8")

    return None
```

Key implementation details:
- `_normalize_domain()`: lowercase + strip `www.`
- `_extract_domain()`: use `urllib.parse.urlparse` to get hostname
- `_get_parent_domains()`: strip leftmost label iteratively, stop at 2 parts (TLD+1)
- All errors caught → log warning → return None
- See `contracts/cookie-service.md` for full contract

### Step 2: Add `user_id` to KnowledgeAddRequest

**File**: `backend/app/models/knowledge.py` (line 18)

Add `user_id: str` to the request model. This follows the same pattern as `BulkDeleteRequest` (line 50-52 in same file).

### Step 3: Wire user_id and cookies through the pipeline

**File**: `backend/app/routers/knowledge.py`

Changes:
1. In `add_youtube_to_knowledge()` (line 136): pass `user_id=request.user_id` to `process_knowledge_job()`
2. In `process_knowledge_job()` (line 27): add `user_id: str` parameter
3. Inside the video processing loop (line 42): before calling `get_transcript()`, call `get_cookies_for_domain(user_id, youtube_url, supabase)` to fetch cookies
4. Pass cookie string to `get_transcript()`

### Step 4: Modify transcriber to use Netscape temp file for cookies

**File**: `backend/app/services/transcriber.py`

Changes:
1. `get_transcript(video_id, title, cookie=None)` — add optional `cookie` parameter
2. `get_transcript_via_ytdlp(video_id, cookie=None)` — add optional `cookie` parameter
3. Replace hardcoded `cookie = ""` with the passed parameter: `cookie = cookie or ""`
4. **Replace** the old `http.cookiejar.CookieJar` + `ydl._opener` injection with:
   - Parse cookie JSON string into list of cookie dicts
   - Write cookies to a `tempfile.NamedTemporaryFile` in Netscape format (tab-separated: domain, flag, path, secure, expires, name, value)
   - Pass temp file path via `ydl_opts["cookiefile"]`
   - Delete temp file in `finally` block via `Path(cookie_file_path).unlink(missing_ok=True)`
5. Remove `http.cookiejar` and `HTTPCookieProcessor` imports; add `tempfile` import

### Step 5: Update frontend to pass user_id

**File**: The Next.js API route that proxies to `/v1/api/knowledge/youtube/add`

Add `user_id: user.id` to the request body, following the pattern from `app/api/channels/delete-bulk/route.ts` (line 23).

### Step 6: Add logging

Add structured logging to cookie service:
- `logger.info("Found cookies for domain %s for user %s", domain, user_id)` — when cookies found
- `logger.debug("No cookies found for domain %s for user %s", domain, user_id)` — when no match
- `logger.warning("Failed to download/parse cookies for domain %s: %s", domain, error)` — on failure

## File Change Summary

| File | Change Type | Description |
| --- | --- | --- |
| `backend/app/services/cookie_service.py` | NEW | Cookie retrieval service with domain matching |
| `backend/app/models/knowledge.py` | MODIFY | Add `user_id: str` to `KnowledgeAddRequest` |
| `backend/app/services/transcriber.py` | MODIFY | Add `cookie` parameter to function signatures, remove hardcoded empty string |
| `backend/app/routers/knowledge.py` | MODIFY | Wire user_id through pipeline, call cookie service |
| Frontend API route (youtube/add proxy) | MODIFY | Include `user_id` in request body |

## Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Supabase Storage download latency | Adds time to transcription | Cookie files are small (10-50KB); SC-3 requires <500ms |
| Malformed cookie JSON in storage | Parse failure | Graceful degradation: catch exception, log warning, proceed without cookies |
| Missing user_id in request | Cookie lookup fails | Make `user_id` required in Pydantic model; frontend always provides it |
| Breaking existing non-cookie transcription flow | Regression | `cookie` parameter defaults to None; all existing behavior unchanged when no cookies provided |

## Design Artifacts

- [research.md](./research.md) — All technical decisions with rationale
- [data-model.md](./data-model.md) — Entity changes and new signatures
- [contracts/knowledge-add.md](./contracts/knowledge-add.md) — Modified API contract
- [contracts/cookie-service.md](./contracts/cookie-service.md) — Internal service contract
- [quickstart.md](./quickstart.md) — Testing guide
