# Feature Specification: YouTube Data API v3 Migration

**Feature Branch**: `073-youtube-data-api`
**Created**: 2026-02-12
**Status**: Draft
**Input**: Replace yt-dlp channel scraping with YouTube Data API v3 for reliable, cookie-free video metadata retrieval. Keep youtube-transcript-api for transcripts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable Channel Preview (Priority: P1)

As an application user, I want to preview a YouTube channel's videos so that I can select which ones to add to my knowledge base — without encountering bot-detection or cookie-consent failures that currently occur in the deployed environment.

**Why this priority**: This is the core user-facing feature. Channel preview is the entry point for all knowledge base ingestion. If it fails, users cannot add any content. While yt-dlp scraping currently works, migrating to the official API provides long-term reliability and eliminates the risk of future cookie/bot-detection blocks.

**Independent Test**: Can be fully tested by entering any public YouTube channel URL and verifying the video list is returned with titles, view counts, and categories.

**Acceptance Scenarios**:

1. **Given** a valid YouTube channel URL (e.g., `youtube.com/@ChannelName`), **When** a user requests a channel preview, **Then** the system returns a list of videos with titles, video IDs, view counts, and categories.
2. **Given** a valid channel URL in any supported format (`/@handle`, `/channel/ID`, `/c/name`, `/user/name`), **When** a user requests a preview, **Then** the system normalizes the URL and returns results.
3. **Given** a channel with more than 500 videos, **When** a user requests a preview with default settings, **Then** the system returns up to the configured maximum number of videos.
4. **Given** the deployed production environment (no browser, no cookies), **When** a user requests a channel preview, **Then** the request succeeds without cookie or bot-detection errors.

---

### User Story 2 - Filtered and Paginated Results (Priority: P2)

As a user, I want to filter channel videos by category and paginate through results so I can efficiently find the content I need.

**Why this priority**: Filtering and pagination are existing features that must continue working after the migration. They add significant usability but the core value is delivered by Story 1.

**Independent Test**: Can be tested by requesting a channel preview with a category filter and skip/limit parameters and verifying only matching, paginated results are returned.

**Acceptance Scenarios**:

1. **Given** a channel with videos in multiple categories, **When** a user filters by a specific category, **Then** only videos matching that category are returned.
2. **Given** a channel with 100 matching videos, **When** a user requests with `skip=10` and `limit=20`, **Then** exactly 20 videos are returned starting from the 11th match.
3. **Given** a channel preview request, **When** results are returned, **Then** they are sorted by view count in descending order.

---

### User Story 3 - Transparent Transcript Fetching (Priority: P3)

As a user, I want transcript fetching to work reliably in the deployed environment so that videos I select are successfully transcribed and added to my knowledge base.

**Why this priority**: Transcript fetching is the second step in the ingestion pipeline. The primary transcript method should work without cookies. The yt-dlp fallback may be removed or replaced if it continues to fail in deployed environments.

**Independent Test**: Can be tested by triggering transcript fetching for a video with available captions and verifying the transcript text is returned.

**Acceptance Scenarios**:

1. **Given** a video with available captions, **When** the system fetches its transcript, **Then** the full transcript text is returned successfully.
2. **Given** a video where the primary transcript method fails, **When** the system cannot retrieve the transcript, **Then** the video is skipped and a clear error message is reported to the user.
3. **Given** the deployed production environment, **When** transcript fetching is attempted, **Then** no cookie or bot-detection errors occur (yt-dlp is not used).

---

### Edge Cases

- What happens when a YouTube channel URL is invalid or the channel does not exist?
- What happens when a channel has zero videos?
- What happens when the daily quota limit (10,000 units) is exceeded?
- How does the system handle private or unlisted videos in channel listings?
- What happens when a video's captions are disabled by the uploader?
- How does the system handle rate limiting or temporary service unavailability?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST retrieve video metadata (title, video ID, view count) from public YouTube channels using the official YouTube Data API.
- **FR-002**: System MUST support all existing YouTube channel URL formats: `/@handle`, `/channel/ID`, `/c/name`, `/user/name`.
- **FR-003**: System MUST categorize videos by title using the existing categorization logic.
- **FR-004**: System MUST support filtering results by category.
- **FR-005**: System MUST support pagination via skip and limit parameters.
- **FR-006**: System MUST sort results by view count in descending order.
- **FR-007**: System MUST enforce a configurable maximum video count per channel preview request.
- **FR-008**: System MUST return channel title, total video count, category counts, and paginated video list in the response.
- **FR-009**: System MUST use an administrator-managed credential (not user cookies) for channel data retrieval.
- **FR-010**: System MUST use the existing primary transcript fetching method for transcript retrieval. If the primary method fails, the system MUST skip the video and report a clear error to the user (no fallback).
- **FR-013**: System MUST NOT use yt-dlp for any functionality. The yt-dlp dependency MUST be fully removed from the project (code and package dependencies).
- **FR-011**: System MUST provide clear error messages when a channel cannot be found or accessed.
- **FR-012**: System MUST handle quota exhaustion gracefully by displaying a user-friendly error message (e.g., "Daily limit reached, please try again tomorrow") and logging the quota error event for administrator monitoring.

### Key Entities

- **Channel**: A YouTube channel identified by URL, containing a title and a collection of videos.
- **Video**: A video belonging to a channel, with attributes: video ID, title, URL, view count, category.
- **Channel Preview**: An aggregate response containing channel metadata, category breakdown, and a paginated list of videos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of channel preview requests succeed in the deployed production environment without cookie or bot-detection errors.
- **SC-002**: Channel preview results are returned within 5 seconds for channels with up to 500 videos.
- **SC-003**: All existing channel URL formats continue to resolve correctly after migration.
- **SC-004**: Video metadata (title, view count) matches what is displayed on the YouTube channel page.
- **SC-005**: 95% of transcript fetch attempts succeed for videos that have captions available.

## Clarifications

### Session 2026-02-12

- Q: Should the system track quota usage proactively or simply fail gracefully when the limit is hit? → A: Fail gracefully with user-friendly error + log quota events for admin monitoring.
- Q: What should happen when the primary transcript method fails? → A: Remove yt-dlp fallback entirely. Skip the video and report a clear error to the user.
- Q: Should yt-dlp be fully removed as a project dependency? → A: Yes, remove entirely — delete from dependencies and remove all yt-dlp code.

## Assumptions

- The YouTube Data API free tier (10,000 quota units/day) is sufficient for the expected usage volume.
- A single API key (not per-user OAuth) is appropriate since channel listing data is public.
- The existing `youtube-transcript-api` library works reliably without cookies for the majority of videos in the deployed environment.
- The existing categorization logic (`categorize_video`) and response model (`YTChannelPreview`, `YTVideo`) remain unchanged.
- Video view counts and titles from the YouTube Data API are equivalent to what yt-dlp currently returns.
