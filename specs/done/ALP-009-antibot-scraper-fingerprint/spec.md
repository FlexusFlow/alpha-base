# Feature Specification: Anti-Bot Browser Fingerprint for Scraper

**Feature Branch**: `ALP-009-antibot-scraper-fingerprint`
**Created**: 2026-02-27
**Status**: Draft
**Input**: User description: "Anti-Bot Browser Fingerprint for Scraper — Playwright scraper uses default headless Chrome user-agent (contains HeadlessChrome), which triggers bot detection on sites like Medium (Cloudflare security verification page). Fix: set a realistic Chrome user-agent on the browser context and add a 2-second post-load delay for JS rendering, matching the approach in medium-legal-scraper. Affects backend/app/services/article_scraper.py."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scrape Articles from Bot-Protected Sites (Priority: P1)

As a user adding an article URL from a bot-protected site (e.g., Medium behind Cloudflare), the system successfully fetches and extracts the article content instead of returning a Cloudflare verification page or an error.

**Why this priority**: This is the core problem — the scraper currently fails on any site with basic bot detection because the default headless Chrome user-agent (`HeadlessChrome`) is trivially detectable. Without this fix, a significant class of article URLs cannot be scraped at all.

**Independent Test**: Can be fully tested by submitting a Medium article URL and verifying the returned content is the actual article text (not a Cloudflare challenge page or empty content).

**Acceptance Scenarios**:

1. **Given** a Medium article URL, **When** the scraper fetches it, **Then** the returned content contains the article text (not a Cloudflare security verification page).
2. **Given** any article URL on a site with basic bot detection, **When** the scraper fetches it, **Then** the browser presents a realistic Chrome user-agent string that does not contain "HeadlessChrome".
3. **Given** any article URL, **When** the scraper loads the page, **Then** it waits for JavaScript-rendered content to fully appear before extracting text.

---

### User Story 2 - Existing Non-Protected Sites Continue Working (Priority: P1)

As a user adding article URLs from sites without bot protection, the scraper continues to work exactly as before — the fingerprint changes do not break scraping of standard sites.

**Why this priority**: Equal to P1 because a regression on currently working sites would be worse than the original bug.

**Independent Test**: Can be tested by scraping a set of known-working article URLs (e.g., standard blog posts, news sites without aggressive bot detection) and verifying content extraction succeeds.

**Acceptance Scenarios**:

1. **Given** an article URL from a site without bot detection, **When** the scraper fetches it, **Then** the article content is extracted successfully with the same quality as before.
2. **Given** an article URL from a site without bot detection, **When** the scraper fetches it, **Then** the total scrape time increases by no more than the added post-load delay (approximately 2 seconds).

---

### Edge Cases

- What happens when a site has aggressive bot detection beyond user-agent checks (e.g., CAPTCHA, JavaScript challenges)? The scraper should still fail gracefully with a descriptive error rather than returning garbled challenge page content.
- What happens when the page loads but JavaScript rendering takes longer than the post-load delay? The scraper should still extract whatever content is available after the delay period.
- What happens when the site returns a redirect chain before the final content? The realistic user-agent must persist across redirects within the same browser context.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The browser context MUST use a realistic, modern Chrome user-agent string that does not contain "HeadlessChrome" or other headless browser identifiers.
- **FR-002**: The user-agent string MUST be set at the browser context level so it applies to all page navigations and requests within a scrape session, including redirects.
- **FR-003**: After the page reports DOM content loaded, the scraper MUST wait an additional delay (approximately 2 seconds) to allow JavaScript-rendered content to appear before extracting content.
- **FR-004**: The scraper MUST continue to support all existing functionality: cookie injection, content selector priority, noise element removal, title extraction, markdown conversion, and content size truncation.
- **FR-005**: The scraper MUST NOT introduce any new external dependencies solely for fingerprint evasion (the fix should use built-in browser context options).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Articles from Medium (Cloudflare-protected) are scraped successfully, returning actual article content rather than a security challenge page.
- **SC-002**: All previously working article URLs continue to be scraped successfully with no content quality regression.
- **SC-003**: Total scrape time for any article increases by no more than 3 seconds compared to the current implementation.
- **SC-004**: The browser's outgoing requests present a user-agent string indistinguishable from a standard desktop Chrome browser.

## Assumptions

- The primary bot detection trigger is the `HeadlessChrome` token in the default headless browser user-agent string. Setting a realistic user-agent is sufficient to bypass basic bot detection (Cloudflare's initial JS challenge).
- A 2-second post-load delay is sufficient for most JavaScript-heavy sites to finish rendering their main content.
- Sites with CAPTCHA or advanced fingerprinting (beyond user-agent) are out of scope — the scraper is not expected to bypass those.
- The fix matches the approach proven in the existing `medium-legal-scraper` reference implementation.