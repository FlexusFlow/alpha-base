# Research: Anti-Bot Browser Fingerprint for Scraper

**Feature**: ALP-009-antibot-scraper-fingerprint
**Date**: 2026-02-27

## R1: Playwright User-Agent Configuration

**Decision**: Use Playwright's `browser.new_context(user_agent=...)` parameter to set a realistic Chrome user-agent string.

**Rationale**: Playwright's `new_context()` accepts a `user_agent` option that overrides the default headless Chrome UA for all requests in that context, including redirects. This is the simplest approach — no new dependencies, one line of code, and it's the officially supported way to customize the UA in Playwright.

**Alternatives considered**:
- `playwright-stealth` (third-party plugin): Patches multiple browser APIs (WebGL, navigator.plugins, etc.) to avoid detection. Overkill for this use case — the primary trigger is the `HeadlessChrome` token in the UA string, not advanced fingerprinting. Also violates FR-005 (no new dependencies).
- Launch args (`--user-agent`): Chromium launch arg works but is less granular than context-level — can't vary per context if needed. Context-level is the Playwright-recommended approach.

## R2: Realistic User-Agent String

**Decision**: Use a hardcoded, modern Chrome desktop UA string: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`

**Rationale**: This matches a real Chrome 131 on macOS, which is a common and current browser version. The string does not contain "HeadlessChrome" or any headless identifiers. A static string is simpler than dynamically generating one and sufficient for bypassing basic bot detection.

**Alternatives considered**:
- Dynamic UA from `fake-useragent` library: Generates random realistic UAs. Unnecessary complexity and a new dependency for a scraper that just needs to not look headless.
- Playwright's `devices` preset (e.g., `playwright.devices['Desktop Chrome']`): Provides a UA but also sets viewport/device scale which may interfere with content extraction. Context-level `user_agent` param is more surgical.

## R3: Post-Load Delay Strategy

**Decision**: Add `await asyncio.sleep(2)` after `page.goto()` completes and before content extraction begins.

**Rationale**: A fixed 2-second delay is simple, predictable, and matches the approach in the medium-legal-scraper reference. It gives JavaScript-heavy sites (React, Angular, Vue SSR hydration) time to render their content after the initial DOM load.

**Alternatives considered**:
- `wait_until="networkidle"` in `page.goto()`: Waits until no network requests for 500ms. Unreliable — many sites have continuous polling, analytics, or websocket connections that prevent "idle" from ever being reached, causing timeouts.
- `page.wait_for_selector()` on content selectors: Would need to try each selector in sequence; complex logic and still might miss content on sites that render progressively.
- Configurable delay via environment variable: Over-engineering for now. Can be added later if needed. The 2-second default is proven sufficient.

## R4: Existing Codebase Impact

**Decision**: Modify only `backend/app/services/article_scraper.py` — specifically the `scrape_article()` function.

**Rationale**:
- No tests exist for the article scraper, so no test updates needed (though adding tests is recommended as follow-up).
- No existing user-agent configuration exists anywhere in the backend.
- The router (`backend/app/routers/articles.py`) calls `scrape_article()` and doesn't need changes — the interface (url, cookies_json) → dict stays the same.
- Playwright >=1.58.0 is already a dependency and supports `user_agent` in `new_context()`.

**Changes needed**:
1. Add `import asyncio` at the top of `article_scraper.py`
2. Add a `CHROME_USER_AGENT` constant string
3. Pass `user_agent=CHROME_USER_AGENT` to `browser.new_context()`
4. Add `await asyncio.sleep(2)` after `page.goto()` and before noise removal
