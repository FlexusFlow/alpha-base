# Tasks: Cookie Failure Detection & Status Marking

**Input**: Design documents from `/specs/ALP-011-cookie-failure-detection/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration and shared types/utilities that all user stories depend on

- [x] T001 Create Supabase migration to add `status` (TEXT, CHECK NULL or 'failed'), `failed_at` (TIMESTAMPTZ), `failure_reason` (TEXT) columns to `user_cookies` table and add UPDATE RLS policy (`auth.uid() = user_id`) in `next-frontend/supabase/migrations/012_cookie_failure_columns.sql`
- [x] T002 Apply migration to the connected Supabase project via MCP or Supabase CLI

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend utilities and service changes that MUST be complete before any user story can be wired up

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create `AuthenticationError` exception class (subclass of `Exception` with `message`, `domain`, `error_type` fields) in `backend/app/models/errors.py` — if the file doesn't exist, create it; if it does, add to it
- [x] T004 [P] Create `backend/app/services/auth_detection.py` with `is_cloudflare_challenge(html: str) -> bool` (checks for Cloudflare fingerprints: title "Just a moment"/"Attention Required", `id="challenge-running"`, `/cdn-cgi/challenge-platform/` scripts) and `is_auth_error(error: Exception) -> bool` (checks for 403, Cloudflare challenge content, yt-dlp "Sign in" / "login required" patterns in error message)
- [x] T005 [P] Create `CookieResult` dataclass in `backend/app/services/cookie_service.py` with fields `cookie_id: str`, `domain: str`, `cookies_json: str`. Update `get_cookies_for_domain` to SELECT `id, domain, file_path` (instead of just `file_path`) and return `CookieResult | None` instead of `str | None`
- [x] T006 Add `mark_cookie_failed(cookie_id: str, reason: str, supabase: Client) -> None` function to `backend/app/services/cookie_service.py` — updates `user_cookies` row with `status='failed'`, `failed_at=now()`, `failure_reason=reason`
- [x] T007 Add `clear_cookie_failure(cookie_id: str, supabase: Client) -> None` function to `backend/app/services/cookie_service.py` — sets `status=None`, `failed_at=None`, `failure_reason=None`
- [x] T008 Update all callers of `get_cookies_for_domain` to use `result.cookies_json` instead of the raw string return value. Affected files: `backend/app/routers/knowledge.py`, `backend/app/routers/articles.py`, `backend/app/services/doc_scraper.py`, `backend/app/routers/documentation.py`. Each caller must store the full `CookieResult` for later use in failure marking. Ensure existing behavior is preserved (pass `result.cookies_json` where `cookie_str`/`cookies_json` was passed before, handle `None` the same way).
- [x] T009 Refactor `get_transcript_via_ytdlp` in `backend/app/services/transcriber.py`: replace bare `except Exception: return None` with specific `yt_dlp.utils.DownloadError` catch. If the error message matches auth patterns ("Sign in", "403", "bot", "age", "Premium members"), raise `AuthenticationError(message=str(e), domain="youtube.com", error_type="login_required")`. For non-auth `DownloadError` and other exceptions, continue returning `None`.
- [x] T010 Update `scrape_article` in `backend/app/services/article_scraper.py`: capture the `Response` object returned by `page.goto()`, check `response.status` for 403. After page load, get page content via `page.content()` and call `is_cloudflare_challenge()`. If either check triggers, raise `AuthenticationError` with appropriate `error_type` ("http_403" or "cloudflare_challenge") and `domain` extracted from the URL. Import `AuthenticationError` from `models.errors` and `is_cloudflare_challenge` from `services.auth_detection`.

**Checkpoint**: Foundation ready — all utilities, types, and detection logic in place. Existing scraping still works (callers updated to new return type). User story implementation can now begin.

---

## Phase 3: User Story 1 — Cookie Auto-Invalidation on Auth Failure (Priority: P1) MVP

**Goal**: When a scrape/transcription fails due to auth errors while using stored cookies, automatically mark the cookie record as "failed" in the database.

**Independent Test**: Upload known-bad cookies, run a scrape/transcription, verify the `user_cookies` row has `status='failed'`, `failed_at` set, and `failure_reason` populated.

### Implementation for User Story 1

- [x] T011 [US1] Wire cookie failure marking in YouTube transcription path: in `backend/app/routers/knowledge.py` `process_knowledge_job`, catch `AuthenticationError` separately in the per-video try/except block. When caught and a `CookieResult` was used, call `mark_cookie_failed(cookie_result.cookie_id, str(e), supabase)`. Only mark once per job (use a flag to avoid redundant updates on subsequent videos). Let the existing failure counting continue as-is.
- [x] T012 [P] [US1] Wire cookie failure marking in article scraping path: in `backend/app/routers/articles.py` `process_article_scrape`, catch `AuthenticationError` separately before the generic `Exception` catch. When caught and a `CookieResult` was used, call `mark_cookie_failed(cookie_result.cookie_id, str(e), supabase)`. Set the article status to "failed" with the error message as before.
- [x] T013 [P] [US1] Wire cookie failure marking in documentation scraping path: in `backend/app/services/doc_scraper.py` `scrape_page` function (or equivalent per-page handler inside `scrape_collection`), catch `AuthenticationError` separately. When caught and a `CookieResult` was used, call `mark_cookie_failed(cookie_result.cookie_id, str(e), supabase)`. Only mark once per collection scrape job (use a flag or check current status before updating). Continue normal per-page failure handling.
- [x] T014 [US1] Wire cookie success recovery in all three paths: after successful use of cookies (transcription succeeds with cookies, article scrape succeeds with cookies, doc page scrape succeeds with cookies), call `clear_cookie_failure(cookie_result.cookie_id, supabase)` to reset any prior failure state. This is safe to call even if status is already NULL (idempotent UPDATE). Affected files: `backend/app/routers/knowledge.py`, `backend/app/routers/articles.py`, `backend/app/services/doc_scraper.py`.

**Checkpoint**: Cookie auto-invalidation and recovery fully functional. Backend marks cookies as failed on auth errors and clears failure on success. Verifiable via direct DB queries.

---

## Phase 4: User Story 2 — Failed Cookie Badge in Management UI (Priority: P2)

**Goal**: Display a "Failed" warning badge (with reason and timestamp) on the cookie management page for cookies that have been marked as failed at runtime.

**Independent Test**: Manually set a cookie's `status='failed'` in the DB, load the cookie management page, verify the "Failed" badge renders with reason and timestamp.

### Implementation for User Story 2

- [x] T015 [US2] Update `UserCookie` type in `next-frontend/lib/types/cookies.ts`: add `status: string | null`, `failed_at: string | null`, `failure_reason: string | null` fields
- [x] T016 [US2] Update badge logic in `next-frontend/components/cookie-management.tsx`: modify `getExpiryBadge` (or equivalent badge function) to check `status === 'failed'` FIRST (highest priority). Return a destructive/warning badge (e.g., red/orange with "Failed" text) that overrides "Active"/"Expired"/"Unknown" when status is "failed". Use existing shadcn Badge component with `variant="destructive"`.
- [x] T017 [US2] Add failure details display in `next-frontend/components/cookie-management.tsx`: when a cookie has `status === 'failed'`, show `failure_reason` and `failed_at` (formatted as relative time, e.g., "2 hours ago") via a Tooltip on the badge or inline text beneath the domain name. Use existing date formatting patterns from the codebase.

**Checkpoint**: Failed cookies show a clear "Failed" badge with reason/timestamp. Re-uploading cookies for the same domain replaces the record (existing delete+insert flow), so the new record naturally shows "Active".

---

## Phase 5: User Story 3 — Cookie Status Recovery on Successful Use (Priority: P3)

**Goal**: Automatically clear a cookie's "failed" status when the cookies are successfully used in a subsequent scrape, preventing stale failure badges.

**Independent Test**: Mark a cookie as failed in DB, run a successful scrape using those cookies, verify the status reverts to NULL and the badge shows "Active".

### Implementation for User Story 3

> **Note**: The core recovery logic (`clear_cookie_failure` calls) was already wired in T014 as part of US1. This phase validates and ensures the full end-to-end recovery flow works correctly.

- [x] T018 [US3] Verify recovery flow end-to-end: ensure `clear_cookie_failure` is called in all three success paths (YouTube transcription, article scraping, doc scraping) by tracing T014 implementation. Confirm that the `GET /api/cookies` response for a recovered cookie shows `status: null`, `failed_at: null`, `failure_reason: null`. Confirm the frontend badge correctly transitions from "Failed" to "Active"/"Expired"/"Unknown" based on expiry date after recovery.

**Checkpoint**: Full lifecycle verified — cookies transition from Active → Failed → Active seamlessly across all three scraping paths.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T019 Run `cd backend && uv run ruff check .` to verify no linting issues in modified/new Python files
- [x] T020 Run `cd next-frontend && yarn build` to verify TypeScript compilation passes with updated types
- [x] T021 Run quickstart.md validation — walk through each verification step to confirm feature works end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (migration applied)
- **US1 (Phase 3)**: Depends on Phase 2 completion
- **US2 (Phase 4)**: Depends on Phase 1 only (just needs DB columns + frontend types) — can run in parallel with US1
- **US3 (Phase 5)**: Depends on US1 (T014 wires the recovery logic)
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Requires Phase 2. No dependency on other stories.
- **User Story 2 (P2)**: Requires Phase 1 (DB columns exist) and T015 (types). Can proceed in parallel with Phase 2 and US1.
- **User Story 3 (P3)**: Requires US1 T014 (recovery calls wired). Primarily a verification task.

### Within Each User Story

- Cookie service changes (T005-T007) before caller wiring (T008, T011-T014)
- Auth detection (T004) before scraper refactors (T009-T010)
- Type changes (T015) before UI changes (T016-T017)

### Parallel Opportunities

**Phase 2 parallel groups**:
- Group A (can run together): T003, T004, T005
- Group B (after T005): T006, T007
- Group C (after T005): T008
- Group D (after T003, T004): T009, T010

**Phase 3 parallel**: T011 || T012 || T013 (different files)

**Phase 4 parallel with Phase 3**: US2 (T015-T017) can start as soon as Phase 1 is done, in parallel with US1

---

## Parallel Example: Foundational Phase

```bash
# Launch independent foundational tasks together:
Task: "Create AuthenticationError in backend/app/models/errors.py"     # T003
Task: "Create auth_detection.py in backend/app/services/"               # T004
Task: "Create CookieResult + update get_cookies_for_domain"             # T005

# After T005 completes:
Task: "Add mark_cookie_failed to cookie_service.py"                     # T006
Task: "Add clear_cookie_failure to cookie_service.py"                   # T007

# After T003+T004+T005 complete:
Task: "Update all callers of get_cookies_for_domain"                    # T008
Task: "Refactor transcriber.py error handling"                          # T009
Task: "Update article_scraper.py with auth detection"                   # T010
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Migration
2. Complete Phase 2: Foundational (cookie service, auth detection, scraper refactors)
3. Complete Phase 3: US1 (wire failure marking + recovery in all 3 paths)
4. **STOP and VALIDATE**: Trigger auth failures → verify `user_cookies.status = 'failed'` in DB
5. This delivers the core detection value even without UI — the data is there for future display

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Cookies auto-marked as failed → Verifiable via DB (MVP!)
3. Add US2 → Failed badge visible in UI → User-facing value complete
4. Add US3 → Recovery verified end-to-end → Full lifecycle complete
5. Polish → Linting, build, validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- T014 (recovery wiring) is in US1 because it's part of the core marking flow, but serves US3's goal
- No test tasks generated (not requested in spec)
- Migration number 012 is the next available (after 011_deep_memory_total_chunks.sql)
