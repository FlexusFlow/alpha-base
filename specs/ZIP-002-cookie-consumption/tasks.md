# Tasks: ZIP-002 Backend Cookie Consumption

**Feature**: Backend Cookie Consumption from Supabase Storage
**Branch**: `feature/ZIP-002-cookie-consumption`
**Total Tasks**: 8
**Generated**: 2026-02-18 (regenerated after FR-3 amendment)

## User Story Mapping

| Story | Spec Scenario | Summary |
| --- | --- | --- |
| US1 | Scenario 1 + 3 | User with cookies transcribes a video (includes subdomain fallback) |
| US2 | Scenario 2 + 4 | User without cookies transcribes normally; expired cookies still passed through |

> **Note**: Scenarios 3 (subdomain matching) and 4 (expired cookies) are handled within US1/US2 — subdomain matching is part of the cookie service logic, and expired cookies are used as-is (no filtering).

---

## Phase 1: Foundational — Request Model & Cookie Service

These tasks create the building blocks that all user stories depend on.

- [x] T001 [P] Add `user_id: str` field to `KnowledgeAddRequest` in `backend/app/models/knowledge.py`
  - Follow the same pattern as `BulkDeleteRequest.user_id` in the same file
  - Field is required (no default)

- [x] T002 [P] Add `user_id: string` field to TypeScript interface in `next-frontend/lib/types/knowledge.ts`
  - Add `user_id: string` to the `KnowledgeAddRequest` interface

- [x] T003 [P] Create cookie retrieval service in `backend/app/services/cookie_service.py`
  - Implement `async def get_cookies_for_domain(user_id: str, target_url: str, supabase: Client) -> str | None`
  - Implement `_extract_domain(url)` using `urllib.parse.urlparse`
  - Implement `_normalize_domain(domain)` — lowercase + strip `www.`
  - Implement `_get_parent_domains(domain)` — strip leftmost subdomain iteratively, stop at 2 parts (TLD+1)
  - Domain matching: exact match first, then parent domain fallback (FR-4)
  - Query `user_cookies` table, download from `cookie-files` bucket, return decoded UTF-8 string
  - All exceptions caught → log warning → return None (FR-5)
  - Structured logging: info on match, debug on no match, warning on errors
  - See `contracts/cookie-service.md` for full contract

- [x] T004 [P] Replace cookie injection with Netscape temp file approach in `backend/app/services/transcriber.py`
  - Add `cookie: str | None = None` parameter to both `get_transcript_via_ytdlp()` and `get_transcript()`
  - Replace hardcoded `cookie = ""` with `cookie = cookie or ""`
  - **Remove** old `http.cookiejar.CookieJar` + `ydl._opener.add_handler(HTTPCookieProcessor(jar))` code entirely
  - **Remove** `from urllib.request import HTTPCookieProcessor` and `import http.cookiejar` imports
  - **Add** `import tempfile` import
  - When cookie string is provided and non-empty:
    1. Parse JSON into list of cookie dicts
    2. Create `tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)`
    3. Write `# Netscape HTTP Cookie File` header line
    4. For each cookie, write tab-separated line: `domain\tflag\tpath\tsecure\texpires\tname\tvalue`
       - `flag`: `TRUE` if domain starts with `.`, else `FALSE`
       - `secure`: `TRUE` if secure flag set, else `FALSE`
       - `expires`: `str(int(expires))` if expires exists and != -1, else `"0"`
    5. Close the file
    6. Set `ydl_opts["cookiefile"] = cookie_file_path`
  - Delete temp file in `finally` block: `Path(cookie_file_path).unlink(missing_ok=True)`
  - When cookie is None/empty: no temp file created, no `cookiefile` in ydl_opts (existing behavior preserved)

---

## Phase 2: US1 — Pipeline Wiring & Frontend Integration

**Goal**: When a user has uploaded cookies for a domain, the backend automatically retrieves and uses them via yt-dlp's `cookiefile` option.

**Independently testable**: Upload `youtube.com.cookies.json` via frontend, trigger transcription, verify backend logs show "Found cookies for domain youtube.com" and transcription succeeds.

- [x] T005 [US1] Wire user_id and cookie service into knowledge pipeline in `backend/app/routers/knowledge.py`
  - Add `user_id: str` parameter to `process_knowledge_job()` function signature
  - In `add_youtube_to_knowledge()`: pass `user_id=request.user_id` to `process_knowledge_job()`
  - Inside video processing loop: before `get_transcript()`, call `await get_cookies_for_domain(user_id, f"https://www.youtube.com/watch?v={video.video_id}", supabase)`
  - Pass cookie string to `get_transcript(video.video_id, video.title, cookie=cookie_str)`
  - Import `get_cookies_for_domain` from `app.services.cookie_service`

- [x] T006 [US1] Pass `user_id` from frontend to backend in `next-frontend/app/dashboard/knowledge/youtube/add/page.tsx`
  - Get authenticated user via Supabase browser client: `supabase.auth.getUser()`
  - Add `user_id: user.id` to the request body sent to the knowledge add endpoint
  - Follow the pattern from `app/api/channels/delete-bulk/route.ts`

---

## Phase 3: Verification & Polish

- [x] T007 [US2] Verify graceful degradation: no-cookie and expired-cookie paths
  - Confirm `get_cookies_for_domain()` returning `None` → `get_transcript()` called with `cookie=None` → no temp file created → transcription proceeds normally
  - Confirm expired cookies are not filtered (passed through as-is to yt-dlp, which decides validity)
  - Code review task — the logic from T004/T005 should handle this, verify the `None` → `cookie or ""` → no `cookiefile` path works

- [ ] T008 Manual end-to-end test per `quickstart.md` *(requires live testing)*
  - Upload `youtube.com.cookies.json` via `/dashboard/cookies`
  - Trigger transcription for a YouTube video
  - Check backend logs for cookie retrieval messages
  - Test without cookies (different account or delete cookies)
  - Test subdomain matching (e.g., `www.youtube.com` URL matches `youtube.com` cookies)

---

## Dependencies

```
T001 ──┐
T002 ──┤
T003 ──┼──→ T005 ──→ T006 ──→ T007 ──→ T008
T004 ──┘
```

- **T001, T002, T003, T004** (Phase 1): All parallel — modify independent files
- **T005** depends on T001, T003, T004 (needs model field, cookie service, and transcriber signatures)
- **T006** depends on T002, T005 (needs TS type and working backend)
- **T007** depends on T005 (verifies the no-cookie path through wired pipeline)
- **T008** depends on T006 (end-to-end after all code changes)

## Parallel Execution Opportunities

| Parallel Group | Tasks | Why Parallel |
| --- | --- | --- |
| Phase 1 | T001, T002, T003, T004 | Different files, no interdependencies |
| Phase 2 prep | T006 TS work can be prepped while T005 is wired | Frontend and backend are independent files |

## Implementation Strategy

**MVP (Phase 1 + 2)**: T001-T006 — user with cookies gets them injected into yt-dlp via Netscape temp file. Satisfies SC-1, SC-5.

**Verification (Phase 3)**: T007-T008 — confirm no-cookie path works (SC-2) and manual E2E.

**Fastest path**: T001 + T002 + T003 + T004 in parallel → T005 → T006 → T007 → T008.
