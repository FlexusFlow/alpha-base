# Feature Specification: Cookie Management

**Feature Branch**: `feature/ZIP-001-cookie-management`
**Created**: 2026-02-17
**Status**: Draft
**Input**: Migrate cookie management functionality from medium-legal-scrapper project to ZipTrader — enabling users to upload, list, and delete browser cookie JSON files stored in Supabase for accessing paywalled content during scraping.

## Clarifications

### Session 2026-02-17

- Q: Should deleting a cookie require user confirmation? → A: No confirmation — delete immediately on click, show success/error toast.
- Q: Should cookie upload use a file picker button or drag-and-drop dropzone? → A: Simple file picker button — click to browse, single file at a time.
- Q: Should subdomains like www.youtube.com and youtube.com be treated as the same domain? → A: Yes, normalize by stripping www. prefix.
- Q: What should the cookie warning modal warn about? → A: Security warning — cookie files contain sensitive auth tokens, handle with care.
- Q: Should there be a max number of cookies per user? → A: Cap at 50. When limit reached, decline upload with message guiding user to review and clean unnecessary cookies. Show expired cookie indicators to help cleanup.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload a Cookie File (Priority: P1)

A user navigates to the Cookies page in the dashboard, clicks a file picker button to select a browser cookie JSON file from their computer, and uploads it. The system extracts the domain from the filename, stores the file in secure cloud storage, and records the cookie metadata. The uploaded cookie appears in the cookies table immediately.

**Why this priority**: Core value — without upload capability, no cookies exist in the system for any other operation.

**Independent Test**: Can be fully tested by uploading a `.cookies.json` file and verifying it appears in the cookies table with correct domain and filename.

**Acceptance Scenarios**:

1. **Given** the user is on the Cookies page with no cookies uploaded, **When** they upload a valid `youtube.com.cookies.json` file, **Then** the file is stored securely, and a new row appears in the cookies table showing domain "youtube.com", the filename, and upload date.
2. **Given** the user already has a cookie for domain "youtube.com", **When** they upload another cookie file for the same domain, **Then** the existing cookie is replaced with the new one (one cookie per domain per user).
3. **Given** the user uploads a file, **When** the upload fails (network error, storage error), **Then** an error message is displayed and no partial data is saved.

---

### User Story 2 - View Uploaded Cookies (Priority: P1)

A user navigates to the Cookies page and sees a table listing all their previously uploaded cookie files, showing the domain, filename, and upload date for each.

**Why this priority**: Users need to see what cookies they have before deciding to delete or upload new ones.

**Independent Test**: Can be tested by pre-populating cookies and verifying the table displays all entries with correct information.

**Acceptance Scenarios**:

1. **Given** the user has uploaded 3 cookie files, **When** they visit the Cookies page, **Then** all 3 cookies are displayed in the table with domain, filename, and creation date.
2. **Given** the user has no uploaded cookies, **When** they visit the Cookies page, **Then** an empty state is shown (no table rows, just the upload form).
3. **Given** the user is not authenticated, **When** they try to access the Cookies page, **Then** they are redirected to the login page.

---

### User Story 3 - Delete a Cookie (Priority: P2)

A user sees a cookie they no longer need in the cookies table and clicks the delete button next to it. The cookie file is removed from storage and the row disappears from the table.

**Why this priority**: Users need to manage their cookies — removing stale or incorrect cookies — but this is secondary to upload/view.

**Independent Test**: Can be tested by uploading a cookie, then deleting it and verifying it no longer appears in the table or storage.

**Acceptance Scenarios**:

1. **Given** the user has a cookie uploaded for "youtube.com", **When** they click the delete button for that cookie, **Then** the file is immediately removed from storage, the database record is deleted, the row disappears from the table, and a success toast is shown (no confirmation dialog).
2. **Given** the user deletes a cookie, **When** the deletion fails, **Then** an error toast is displayed and the cookie remains in the table.

---

### User Story 4 - Navigate to Cookies from Sidebar (Priority: P2)

A user clicks the "Cookies" link in the dashboard sidebar and is taken to the Cookies management page.

**Why this priority**: Discoverability — users need to find the Cookies page, but the core functionality is more critical.

**Independent Test**: Can be tested by clicking the sidebar link and verifying navigation to the correct page.

**Acceptance Scenarios**:

1. **Given** the user is on any dashboard page, **When** they click "Cookies" in the sidebar, **Then** they are navigated to the Cookies management page.
2. **Given** the user is on the Cookies page, **When** they look at the sidebar, **Then** the "Cookies" item is visually highlighted as the active page.

---

### Edge Cases

- What happens when the user uploads a non-JSON file or a file that doesn't match the `<domain>.cookies.json` naming convention? The system should reject it with a clear error.
- What happens when the user uploads an extremely large cookie file? A reasonable file size limit (e.g., 1 MB) should be enforced.
- What happens when Supabase storage is unavailable? The system should show a clear error without leaving partial state (no database record without a stored file).
- What happens when two browser tabs upload cookies for the same domain simultaneously? The unique constraint (one cookie per domain per user) prevents duplicates; the last upload wins.
- What happens when the user has 50 cookies and tries to upload another for a new domain? The upload is declined with a message guiding them to review and remove unnecessary cookies first. Expired cookies are visually flagged to assist cleanup.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow authenticated users to upload browser cookie JSON files.
- **FR-002**: System MUST extract the domain from the cookie filename (e.g., `youtube.com.cookies.json` → `youtube.com`) and normalize it by stripping the `www.` prefix (e.g., `www.youtube.com` → `youtube.com`).
- **FR-003**: System MUST store uploaded cookie files in a private, user-scoped storage bucket.
- **FR-004**: System MUST record cookie metadata (domain, filename, file path, upload date) in a database table.
- **FR-005**: System MUST enforce a one-cookie-per-domain-per-user constraint, replacing existing cookies for the same domain on re-upload.
- **FR-006**: System MUST display all uploaded cookies in a table showing domain, filename, upload date, and expiration status (active/expired indicator).
- **FR-007**: System MUST allow users to delete individual cookie files, removing both the stored file and database record.
- **FR-008**: System MUST enforce Row Level Security so users can only see, upload, and delete their own cookies.
- **FR-009**: System MUST include a "Cookies" navigation item in the dashboard sidebar.
- **FR-010**: System MUST provide API endpoints for all cookie operations (upload, list, delete).
- **FR-011**: System MUST enforce a maximum of 50 cookie files per user. When the limit is reached, the system MUST decline new uploads with a message: "Maximum cookie files reached. Please review and remove unnecessary cookies to upload new ones."
- **FR-012**: System MUST detect and visually indicate expired cookies in the cookies table to help users identify candidates for cleanup.

### Key Entities

- **UserCookie**: Represents a user's uploaded cookie file. Key attributes: user identity, domain, filename, storage path, creation date. One cookie per domain per user (unique constraint).
- **CookieFile**: The actual cookie JSON file stored in private cloud storage, organized by user identity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can upload a cookie file and see it in their cookies list within 3 seconds.
- **SC-002**: Users can delete a cookie and see it removed from their list within 2 seconds.
- **SC-003**: The Cookies page loads and displays all user cookies within 2 seconds.
- **SC-004**: No user can see, modify, or delete another user's cookies (100% data isolation).
- **SC-005**: The cookie management page is accessible from the dashboard sidebar in a single click.
- **SC-006**: Re-uploading a cookie for the same domain replaces the old one without creating duplicates.

## Assumptions

- Cookie files follow the naming convention `<domain>.cookies.json` (e.g., `youtube.com.cookies.json`).
- The existing Supabase infrastructure (auth, storage, database) used by ZipTrader is available and configured.
- A cookie warning modal component will be created as a security warning (informing users that cookie files contain sensitive authentication tokens and should be handled with care), not wired to any consumer in this feature but ready for future scraping flow integration. Cookie deletion itself requires no confirmation.
- No new frontend dependencies are required; all necessary UI components and icons are already available.
- Cookie files are small (typically under 1 MB) so no chunked upload or progress tracking is needed.

## Dependencies

- Supabase database: A new `user_cookies` table with RLS policies must be created.
- Supabase storage: A new private `cookie-files` bucket with user-scoped access policies must be created.
- These are manual setup steps that must be completed before the feature can function.

## Out of Scope

- Consuming/using cookie files in the scraping pipeline (future feature).
- Cookie file content validation (checking if JSON contains valid cookie entries).
- Automatic cookie refresh or re-authentication (expiration is detected and displayed, but not acted upon automatically).
- Bulk cookie upload or import from browser extensions.
