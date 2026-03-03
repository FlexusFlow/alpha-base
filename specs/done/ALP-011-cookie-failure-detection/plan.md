# Implementation Plan: Cookie Failure Detection & Status Marking

**Branch**: `feature/ALP-011-cookie-failure-detection` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/ALP-011-cookie-failure-detection/spec.md`

## Summary

Detect authentication-related failures (HTTP 403, Cloudflare challenges, yt-dlp login-required errors) during scraping and transcription operations that use stored cookies, and mark the corresponding cookie record as failed in the database. Display a "Failed" badge in the cookie management UI with the failure reason and timestamp. Automatically clear the failure when cookies are successfully used or re-uploaded.

## Technical Context

**Language/Version**: Python 3.12+ (backend), TypeScript (Next.js 15 frontend)
**Primary Dependencies**: FastAPI, yt-dlp, Playwright, Supabase JS/Python clients, shadcn/ui
**Storage**: Supabase (PostgreSQL) — `user_cookies` table extended with status columns
**Testing**: pytest (backend), manual E2E verification
**Target Platform**: Web application (Linux/macOS server + browser)
**Project Type**: Web (monorepo: `backend/` + `next-frontend/`)
**Performance Goals**: Cookie failure marking must not add perceptible latency to scraping jobs (single UPDATE query per failure detection)
**Constraints**: Must not break existing scraping flows; backward-compatible with existing cookie records (NULL status = active)
**Scale/Scope**: Single-user app; cookie table has low row count per user (< 50)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | PASS | Backend changes in Python/FastAPI, frontend in TypeScript/Next.js |
| II. API-Boundary Separation | PASS | Cookie status flows through existing GET /api/cookies; backend marks failures via service layer |
| III. Supabase as Source of Truth | PASS | Cookie failure state persisted in `user_cookies` table, not in-memory |
| IV. Background Jobs with Real-Time Feedback | PASS | Failure detection happens inside existing background tasks; no new SSE needed (badge is read on page load) |
| V. Simplicity and Pragmatism | PASS | Three columns on existing table; no new abstractions or tables. Auth detection is a simple utility module. |
| VI. Per-User Data Isolation | PASS | Cookie records are already per-user with RLS; failure marking scoped to the user's own cookie record |

**Post-Phase 1 re-check**: All gates still pass. No new services, tables, or architectural patterns introduced.

## Project Structure

### Documentation (this feature)

```text
specs/ALP-011-cookie-failure-detection/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── services/
│   │   ├── cookie_service.py       # Modified: CookieResult, mark/clear functions
│   │   ├── auth_detection.py       # New: auth error detection utilities
│   │   ├── transcriber.py          # Modified: preserve auth errors
│   │   ├── article_scraper.py      # Modified: CF challenge + HTTP status detection
│   │   └── doc_scraper.py          # Modified: wire auth detection → cookie marking
│   ├── routers/
│   │   ├── knowledge.py            # Modified: wire auth error → cookie marking
│   │   └── articles.py             # Modified: wire auth error → cookie marking
│   └── models/
│       └── errors.py               # Modified or new: AuthenticationError exception

next-frontend/
├── supabase/
│   └── migrations/
│       └── 00N_cookie_failure_columns.sql  # New: add status columns + UPDATE RLS
├── lib/
│   └── types/
│       └── cookies.ts              # Modified: add status/failed_at/failure_reason
└── components/
    └── cookie-management.tsx       # Modified: Failed badge + failure details display
```

**Structure Decision**: Follows existing monorepo layout. New file `auth_detection.py` lives in `services/` alongside `cookie_service.py`. No new directories needed.

## Design Decisions

### D-001: Cookie Service Returns Structured Result

Change `get_cookies_for_domain` from returning `str | None` to `CookieResult | None` containing `cookie_id`, `domain`, and `cookies_json`. This gives callers everything they need to mark failures without a second DB query.

See: [research.md R-003](./research.md#r-003-cookie-service-return-type)

### D-002: Auth Error Detection as Utility Module

Create `auth_detection.py` with `is_cloudflare_challenge(html)` and `is_auth_error(exception)` functions. These are pure functions with no side effects, easy to test and reuse across all three scraping paths.

See: [research.md R-001](./research.md#r-001-yt-dlp-authentication-error-detection), [R-002](./research.md#r-002-cloudflare-challenge-page-detection)

### D-003: Transcriber Error Refactor

Replace bare `except Exception: return None` in `get_transcript_via_ytdlp` with specific `DownloadError` handling. Raise `AuthenticationError` (subclass of `TranscriptionError`) for auth failures, return `None` only for non-auth issues.

See: [research.md R-007](./research.md#r-007-error-propagation-refactor-in-transcriber)

### D-004: Article Scraper Adds Response + Content Checks

After `page.goto()`, check `response.status` for 403 and call `is_cloudflare_challenge()` on page content. Raise `AuthenticationError` for detected auth failures instead of proceeding to extract content from challenge pages.

See: [research.md R-002](./research.md#r-002-cloudflare-challenge-page-detection)

### D-005: Failure Marking Happens in Callers, Not Services

The decision to mark a cookie as failed lives in the router/background-task layer (knowledge.py, articles.py, doc_scraper.py), not inside the transcriber or scraper services. This keeps services focused on their primary job and avoids coupling them to cookie management.

### D-006: First Auth Failure Triggers Marking

No threshold — the first auth failure in any scraping path marks the cookie as failed. Recovery is easy (re-upload or auto-clear on success), and delaying the signal provides no benefit.

See: [research.md R-005](./research.md#r-005-auth-failure-detection-threshold-for-documentation-scraping)

### D-007: Nullable Status Column (NULL = Active)

Using NULL as the default/active state avoids migrating existing rows and keeps queries simple. The "Failed" badge only renders when `status = 'failed'`, all other logic remains unchanged.

See: [research.md R-004](./research.md#r-004-cookie-failure-persistence-strategy), [data-model.md](./data-model.md)

## Complexity Tracking

No constitution violations. No complexity justifications needed.
