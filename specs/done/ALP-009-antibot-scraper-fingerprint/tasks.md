# Tasks: Anti-Bot Browser Fingerprint for Scraper

**Input**: Design documents from `/specs/ALP-009-antibot-scraper-fingerprint/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md

**Tests**: Not explicitly requested in the feature specification. Omitted.

**Organization**: Tasks are grouped by user story. Both stories share the same file (`backend/app/services/article_scraper.py`), so they are sequential rather than parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No setup needed — this feature modifies a single existing file with no new dependencies or project structure changes.

*(No tasks in this phase)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared infrastructure (import, constant) that both user stories depend on.

- [x] T001 Add `import asyncio` to imports in `backend/app/services/article_scraper.py`
- [x] T002 Add `CHROME_USER_AGENT` constant (realistic Chrome 131 macOS user-agent string, no "HeadlessChrome" identifier) after the `NOISE_SELECTORS` list in `backend/app/services/article_scraper.py`

**Checkpoint**: Constants and imports ready — user story implementation can begin.

---

## Phase 3: User Story 1 - Scrape Articles from Bot-Protected Sites (Priority: P1) 🎯 MVP

**Goal**: Medium and other Cloudflare-protected sites return actual article content instead of a security challenge page.

**Independent Test**: Submit a Medium article URL via `POST /v1/api/articles/scrape` and verify the response contains article text, not a Cloudflare challenge.

### Implementation for User Story 1

- [x] T003 [US1] Pass `user_agent=CHROME_USER_AGENT` to `browser.new_context()` call in `scrape_article()` in `backend/app/services/article_scraper.py`
- [x] T004 [US1] Add `await asyncio.sleep(2)` after `page.goto()` and before noise element removal loop in `scrape_article()` in `backend/app/services/article_scraper.py`

**Checkpoint**: Bot-protected sites (Medium) should now return real article content. Test with a Medium URL.

---

## Phase 4: User Story 2 - Existing Non-Protected Sites Continue Working (Priority: P1)

**Goal**: All previously working article URLs continue to scrape successfully with no content quality regression.

**Independent Test**: Scrape a set of known-working article URLs (standard blogs, news sites) and verify content extraction succeeds with same quality.

### Implementation for User Story 2

- [x] T005 [US2] Verify that all existing scraper functionality is preserved: cookie injection, content selector priority, noise removal, title extraction, markdown conversion, and 200KB truncation — no code changes needed, this is a manual verification pass on `backend/app/services/article_scraper.py`

**Checkpoint**: Both protected and non-protected sites work correctly.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation.

- [ ] T006 Run quickstart.md validation — test a Medium article URL and a non-protected URL via the API *(manual — requires running backend)*
- [x] T007 Update `specs/implemented-features.md` with ALP-009 implementation details

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **User Story 1 (Phase 3)**: Depends on Phase 2 (T001, T002)
- **User Story 2 (Phase 4)**: Depends on Phase 3 (verification after changes are made)
- **Polish (Phase 5)**: Depends on Phase 3 and Phase 4

### Within Each Phase

- T001 and T002 are sequential (same file, T002 depends on knowing imports are set)
- T003 and T004 are sequential (same function, logical order)
- T005 depends on T003 and T004 being complete (verifies no regression)

### Parallel Opportunities

- Limited parallelism due to single-file scope. All tasks touch `backend/app/services/article_scraper.py`.
- T006 and T007 (Polish phase) can run in parallel since they affect different files.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Add import and constant (T001, T002)
2. Complete Phase 3: Set user-agent and add delay (T003, T004)
3. **STOP and VALIDATE**: Test with a Medium article URL
4. If Medium works → MVP delivered

### Full Delivery

1. MVP (above)
2. Phase 4: Verify non-protected sites still work (T005)
3. Phase 5: Final validation and documentation (T006, T007)

---

## Notes

- All implementation tasks modify the same file: `backend/app/services/article_scraper.py`
- Total scope: 1 import, 1 constant, 2 line changes in the function body
- No new files, no new dependencies, no API contract changes
- The `scrape_article()` function signature and return type remain unchanged
