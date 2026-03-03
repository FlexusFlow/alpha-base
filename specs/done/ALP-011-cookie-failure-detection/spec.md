# Feature Specification: Cookie Failure Detection & Status Marking

**Feature Branch**: `feature/ALP-011-cookie-failure-detection`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: "When a scrape or transcription fails due to an authentication error (e.g., 403, Cloudflare challenge) while using stored cookies, mark the cookie record as compromised/invalid. Display a warning badge in the cookie management UI so the user knows to re-upload. Currently cookie expiry is optimistic (uses latest expiry from the file), so runtime failure detection is needed to catch revoked sessions or invalidated tokens."

## User Scenarios & Testing

### User Story 1 - Cookie Auto-Invalidation on Auth Failure (Priority: P1)

A user has uploaded cookies for youtube.com and starts a transcription job for age-restricted videos. The cookies have been revoked server-side (e.g., user logged out of YouTube in their browser). The transcription fails with authentication-related errors. The system detects these failures are cookie-related and automatically marks the cookie record as failed, so the user sees a clear "Failed" badge next time they visit the cookie management page.

**Why this priority**: This is the core value of the feature — without runtime detection, users have no way to know their cookies stopped working until they manually investigate failed jobs.

**Independent Test**: Can be fully tested by uploading known-bad cookies, running a scrape/transcription, and verifying the cookie record gets marked as failed in the database and UI.

**Acceptance Scenarios**:

1. **Given** a user has cookies stored for youtube.com, **When** a transcription job fails with a 403/authentication error while those cookies were used, **Then** the cookie record for youtube.com is marked as failed with a timestamp and reason.
2. **Given** a user has cookies stored for a domain, **When** an article scrape fails with a Cloudflare challenge page while those cookies were used, **Then** the cookie record for that domain is marked as failed.
3. **Given** a user has cookies stored for a domain, **When** a documentation scrape encounters repeated auth failures on multiple pages while those cookies were used, **Then** the cookie record for that domain is marked as failed.
4. **Given** a scrape fails for a non-authentication reason (e.g., network timeout, page not found), **When** the system evaluates the error, **Then** the cookie record is NOT marked as failed.

---

### User Story 2 - Failed Cookie Badge in Management UI (Priority: P2)

A user navigates to the cookie management page. One of their cookie records has been marked as failed by the runtime detection system. The user sees a prominent "Failed" warning badge on that cookie entry, clearly distinguishable from the existing "Active", "Expired", and "Unknown" badges. The badge communicates that the cookies were rejected at runtime and need to be re-uploaded.

**Why this priority**: The visual feedback completes the user-facing loop — detection without visibility provides no user value.

**Independent Test**: Can be tested by manually setting a cookie record's status to "failed" in the database and verifying the UI renders the correct badge.

**Acceptance Scenarios**:

1. **Given** a cookie record has status "failed", **When** the user views the cookie management page, **Then** a distinct "Failed" warning badge is displayed for that cookie entry.
2. **Given** a cookie record has status "failed" with a failure reason, **When** the user views the cookie entry, **Then** the failure reason and timestamp are visible (e.g., via tooltip or inline text).
3. **Given** a cookie record has status "failed", **When** the user re-uploads cookies for the same domain, **Then** the failed record is replaced and the new record shows "Active" status.

---

### User Story 3 - Cookie Status Recovery on Successful Use (Priority: P3)

A user has a cookie record previously marked as failed. They re-upload new cookies for the same domain. The existing upload-replacement flow already handles this (delete old + insert new). Additionally, if a previously-failed cookie is successfully used in a scrape (edge case: the server accepted the cookies despite earlier failures), the status should revert to active.

**Why this priority**: Prevents stale failure badges from persisting after cookies are refreshed or intermittent failures resolve.

**Independent Test**: Can be tested by marking a cookie as failed, then running a successful scrape with those cookies, and verifying the status reverts.

**Acceptance Scenarios**:

1. **Given** a cookie record has status "failed", **When** the user uploads new cookies for the same domain, **Then** the old record is replaced and the new record has no failure status.
2. **Given** a cookie record has status "failed", **When** the cookies are successfully used in a subsequent scrape, **Then** the status is cleared back to active.

---

### Edge Cases

- What happens when a single documentation scrape job has mixed results (some pages succeed, some fail with 403)? The cookie should be marked as failed only if a threshold of failures are auth-related (e.g., 3 or more auth failures in a single job).
- What happens when cookies are used for a parent domain match (e.g., cookies for `youtube.com` used for `music.youtube.com`)? The failure should be attributed to the stored cookie record that was actually matched and used.
- What happens when a scrape fails with 403 but cookies were NOT used (no cookies stored for that domain)? No cookie status update should occur.
- What happens if the system detects a cookie failure during a job that is processing multiple items? The cookie should be marked as failed promptly, but the remaining items in the job should still attempt to proceed (the job itself handles per-item failures already).
- What happens when a cookie is marked as failed but has not yet expired by date? The "Failed" status takes precedence over the expiry-based "Active" badge.

## Requirements

### Functional Requirements

- **FR-001**: System MUST detect authentication-related failures during scraping and transcription operations. Authentication failures include HTTP 403 responses, Cloudflare challenge pages (identifiable by challenge page content patterns), and yt-dlp authentication error codes.
- **FR-002**: System MUST mark the corresponding cookie record as failed when an authentication failure is detected during an operation that used stored cookies. The failure record MUST include a timestamp and a human-readable reason.
- **FR-003**: System MUST NOT mark cookies as failed when failures are clearly non-authentication-related (e.g., network timeouts, DNS errors, 404 responses, empty transcript errors).
- **FR-004**: System MUST display a distinct visual indicator (badge) for failed cookie records in the cookie management interface, clearly distinguishable from "Active", "Expired", and "Unknown" states.
- **FR-005**: System MUST show the failure reason and timestamp for failed cookie records in the management interface.
- **FR-006**: System MUST clear a cookie's failed status when new cookies are uploaded for the same domain (handled by existing replacement flow — delete + re-insert).
- **FR-007**: System MUST clear a cookie's failed status when the same cookies are subsequently used successfully in a scrape or transcription.
- **FR-008**: System MUST attribute cookie failures to the correct cookie record when parent-domain matching is used (e.g., failure on `music.youtube.com` should mark the `youtube.com` cookie record that was matched).

### Key Entities

- **Cookie Record** (`user_cookies`): Extended with a status indicator (active vs. failed), a failure timestamp, and a failure reason. Currently has no status column — defaults to active when no failure has been recorded.
- **Auth Failure Signal**: A transient detection result produced by scraping/transcription services, containing the domain, error type, and error details. Used to trigger cookie status updates.

## Success Criteria

### Measurable Outcomes

- **SC-001**: When cookies are rejected at runtime (403, Cloudflare challenge), the user sees a failure badge on the cookie management page within one page refresh after the job completes.
- **SC-002**: False positive rate for cookie failure detection is near zero — non-authentication errors (timeouts, 404s, missing transcripts) do not trigger cookie invalidation.
- **SC-003**: Users can identify and replace failed cookies in a single session: see the badge, re-upload, and verify the new cookies show "Active" status.
- **SC-004**: Cookie failure detection works across all three scraping paths (YouTube transcription, article scraping, documentation scraping) without requiring separate user action for each.

## Assumptions

- The existing `user_cookies` table can be extended with new columns (status, failure metadata) via a migration without breaking existing functionality.
- Cloudflare challenge pages can be reliably detected by inspecting response content patterns (e.g., challenge scripts, specific HTML markers).
- yt-dlp authentication failures produce distinguishable error messages or exit codes that can be parsed to differentiate from other failure types.
- The existing cookie replacement flow (delete old record + insert new) already handles the "re-upload clears failure" case since the new record starts fresh without any failure metadata.

## Out of Scope

- Proactive cookie validation (testing cookies against the target site before using them in a job).
- Automatic cookie refresh or renewal.
- Push notifications or email alerts for cookie failures — the badge on the management page is sufficient.
- Changes to the optimistic expiry calculation logic — this feature complements it with runtime detection rather than replacing it.
