# Implementation Plan: Anti-Bot Browser Fingerprint for Scraper

**Branch**: `ALP-009-antibot-scraper-fingerprint` | **Date**: 2026-02-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/ALP-009-antibot-scraper-fingerprint/spec.md`

## Summary

The Playwright article scraper uses the default headless Chrome user-agent (contains `HeadlessChrome`), which triggers bot detection on Cloudflare-protected sites like Medium. Fix by setting a realistic Chrome user-agent on the browser context and adding a 2-second post-load delay for JS rendering. Single-file change to `backend/app/services/article_scraper.py`.

## Technical Context

**Language/Version**: Python 3.12+
**Primary Dependencies**: Playwright >=1.58.0, markdownify, asyncio (stdlib)
**Storage**: N/A (no data model changes)
**Testing**: pytest (no existing tests for this module)
**Target Platform**: Linux server (Docker) / macOS dev
**Project Type**: Web application (Python backend)
**Performance Goals**: Scrape time increase ≤3 seconds over current baseline
**Constraints**: No new external dependencies (FR-005)
**Scale/Scope**: Single function modification in one file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | PASS | Change is Python backend only (`backend/app/services/`) |
| II. API-Boundary Separation | PASS | No API contract changes — `scrape_article()` signature and return type unchanged |
| III. Supabase as Source of Truth | N/A | No data model or state changes |
| IV. Background Jobs with Real-Time Feedback | PASS | Scrape runs as background task via existing `process_article_scrape()` — no changes to job flow |
| V. Simplicity and Pragmatism | PASS | Minimal change: 1 import, 1 constant, 2 line modifications. No abstractions. |

**Post-design re-check**: All gates still pass. No new files, no new dependencies, no architecture changes.

## Project Structure

### Documentation (this feature)

```text
specs/ALP-009-antibot-scraper-fingerprint/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
backend/
└── app/
    └── services/
        └── article_scraper.py   # MODIFIED: user-agent + post-load delay
```

**Structure Decision**: No new files. Single modification to existing service file. This aligns with Constitution Principle V (Simplicity and Pragmatism).

## Implementation Details

### Changes to `backend/app/services/article_scraper.py`

**Change 1: Add asyncio import**
- Add `import asyncio` to the existing imports at the top of the file.

**Change 2: Add realistic Chrome user-agent constant**
- Add a `CHROME_USER_AGENT` constant after the existing `NOISE_SELECTORS` list.
- Value: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`
- This matches a real Chrome 131 on macOS and does not contain any headless identifiers.

**Change 3: Pass user-agent to browser context**
- Modify the `browser.new_context()` call to include `user_agent=CHROME_USER_AGENT`.
- This ensures all requests in the context (including redirects) use the realistic UA.

**Change 4: Add post-load delay**
- After `page.goto()` and before noise element removal, add `await asyncio.sleep(2)`.
- This gives JavaScript-rendered content time to appear (React hydration, lazy loading, etc.).

### What stays the same

- Function signature: `scrape_article(url, cookies_json)` — unchanged
- Return type: `dict` with `title`, `content_markdown`, `is_truncated` — unchanged
- All existing logic: cookie injection, content selectors, noise removal, title extraction, markdown conversion, 200KB truncation — unchanged
- Router (`backend/app/routers/articles.py`) — no changes needed

## Complexity Tracking

No constitution violations. No complexity justifications needed.
