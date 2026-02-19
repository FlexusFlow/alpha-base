# Feature Specification: Backend Cookie Consumption from Supabase Storage

**Feature ID**: ZIP-002
**Branch**: `feature/ZIP-002-cookie-consumption`
**Status**: Draft
**Created**: 2026-02-18

## Overview

When a user triggers YouTube video transcription, the system should automatically retrieve and use the user's previously uploaded browser cookies for the target domain. This enables authenticated access to age-restricted, region-locked, or rate-limited YouTube content that would otherwise fail without cookies.

Currently, the cookie pipeline is incomplete: users can upload cookie files (ZIP-001), but the backend never fetches or uses them during transcription. The cookie variable remains permanently empty, rendering all existing cookie injection code unreachable.

## Problem Statement

Users who upload browser cookies for YouTube expect those cookies to be used when transcribing videos. Without cookie injection:

- Age-restricted videos return 403 errors
- YouTube rate-limits unauthenticated yt-dlp requests
- Private or unlisted videos are inaccessible
- Users have no way to know their uploaded cookies are being ignored

## User Scenarios & Testing

### Scenario 1: User with Uploaded Cookies Transcribes a Video

**Given** a user has previously uploaded a `youtube.com.cookies.json` file via the cookie management UI
**When** the user selects YouTube videos and triggers transcription
**Then** the system automatically retrieves the user's YouTube cookies from storage and uses them for the yt-dlp request

**Acceptance Criteria**:
- Cookies are fetched by matching the target video's domain to the user's stored cookie domain
- The transcription request includes the user's cookies
- The user does not need to take any additional action beyond having uploaded cookies previously

### Scenario 2: User Without Cookies Transcribes a Video

**Given** a user has NOT uploaded any cookies for YouTube
**When** the user triggers transcription
**Then** the system proceeds normally without cookies (graceful degradation)

**Acceptance Criteria**:
- No error is shown to the user
- Transcription proceeds as it does today (without cookies)
- A warning is logged server-side for debugging purposes

### Scenario 3: Subdomain Cookie Matching

**Given** a user has uploaded cookies for `youtube.com`
**When** the user transcribes a video from `music.youtube.com` or `www.youtube.com`
**Then** the system falls back to the parent domain and uses the `youtube.com` cookies

**Acceptance Criteria**:
- Exact domain match is attempted first
- If no exact match, parent domain lookup is performed (strip one subdomain level at a time)
- Domain matching is case-insensitive and ignores `www.` prefix

### Scenario 4: Expired Cookie File

**Given** a user has uploaded cookies where the earliest expiry has passed
**When** the user triggers transcription
**Then** the system still uses those cookies (lets the target site decide validity)

**Acceptance Criteria**:
- Expired cookies are not filtered or skipped
- Individual cookie entries may still be valid even if the earliest one expired

## Functional Requirements

### FR-1: Cookie Retrieval Service

The system must provide a backend service that, given a user identifier and target URL:

1. Extracts the domain from the target URL
2. Normalizes the domain (lowercase, strip `www.` prefix)
3. Queries the cookie metadata store for a matching domain and user
4. If no exact match, attempts parent domain fallback (e.g., `music.youtube.com` -> `youtube.com`)
5. Downloads the cookie file content from Supabase Storage (the `cookie-files` bucket)
6. Parses the file content into structured cookie data
7. Returns the parsed cookies, or an empty collection if none found

**Constraint**: Cookie files must be stored in and retrieved from Supabase Storage exclusively. Short-lived temporary files on the local filesystem are permitted when required by the transcription tool's API (e.g., Netscape-format cookie files), provided they are deleted immediately after use. Persistent local storage of cookie files is prohibited.

### FR-2: User Identity Propagation

The user's identity must flow from the initial transcription request through the entire processing pipeline to the point where cookies are fetched. Specifically:

1. The transcription request must carry the user's identity
2. Background job processing must retain the user identity
3. The cookie retrieval service receives the user identity when fetching cookies

### FR-3: Cookie Injection into Transcription Tool

When cookies are available for the target domain:

1. The retrieved cookie JSON must be converted to Netscape cookie file format (tab-separated: domain, flag, path, secure, expires, name, value)
2. The Netscape-format cookies must be written to a short-lived temporary file on the local filesystem
3. The temporary file path must be passed to the transcription tool via its native cookie file option (e.g., yt-dlp's `cookiefile` parameter)
4. The temporary file must be deleted immediately after use, in a `finally` block, regardless of success or failure
5. If cookie retrieval fails (network error, parse error), transcription must proceed without cookies

**Note**: Direct programmatic injection of cookie objects into the transcription tool's internals is unreliable — the tool's internal HTTP handler may not be initialized at the point of injection. The file-based approach uses the tool's officially supported cookie mechanism.

### FR-4: Domain Matching Strategy

Cookie-to-domain matching must follow this precedence:

1. **Exact match**: `youtube.com` cookie matches `youtube.com` URL
2. **Parent domain fallback**: `music.youtube.com` URL matches `youtube.com` cookie if no exact match exists
3. **Normalization**: All domains are lowercased and `www.` prefix is stripped before matching

### FR-5: Error Handling and Graceful Degradation

1. Missing cookies for a domain: proceed without cookies, log a debug-level message
2. Cookie file download failure: proceed without cookies, log a warning
3. Cookie file parse failure (malformed JSON): proceed without cookies, log a warning
4. Cookie retrieval must not block or delay the pipeline beyond an acceptable threshold

## Key Entities

### Cookie File (existing)
- Stored in cloud storage as JSON arrays
- Each entry contains: name, value, domain, path, optional expiry/security flags
- Metadata tracked in database: user_id, domain, filename, file_path, earliest_expiry

### User Cookie Metadata (existing)
- Links a user to their uploaded cookie file for a specific domain
- Unique constraint: one cookie file per user per domain

## Success Criteria

- **SC-1**: When a user has uploaded cookies for `youtube.com` and triggers a transcription for a YouTube video, the system automatically uses those cookies for the request
- **SC-2**: When no cookies exist for a domain, transcription proceeds normally without cookies — no errors, no degraded user experience
- **SC-3**: Cookie retrieval and injection adds less than 500ms to the transcription pipeline
- **SC-4**: The cookie retrieval service can be reused by any future scraping consumer without modification
- **SC-5**: Subdomain URLs correctly fall back to parent domain cookies when no exact match exists

## Assumptions

1. The original cookie injection code (constructing `http.cookiejar.CookieJar` objects and injecting via `ydl._opener`) was **not functional** — it relied on private yt-dlp internals that are not reliably initialized. Cookie injection must use the transcription tool's official file-based cookie mechanism instead
2. Cookie files stored in Supabase Storage are well-formed JSON arrays matching the CookieEntry schema (validated at upload time by ZIP-001)
3. The backend Supabase client (service role) has read access to the cookie-files storage bucket and user_cookies table
4. YouTube is the primary (and currently only) domain requiring cookie support, but the solution should work for any domain
5. Cookie files are small (10-50KB), so direct download per request is acceptable without caching
6. One cookie file per user per domain (enforced by existing UNIQUE constraint)

## Dependencies

- **ZIP-001** (Cookie Management): Must be complete — provides the cookie upload UI, storage bucket, metadata table, and RLS policies. **Status: Complete.**

## Out of Scope

- Modifying the frontend cookie management UI (already complete in ZIP-001)
- Automatic cookie refresh or re-authentication flows
- Cookie content validation beyond JSON parsing (ZIP-001 validates at upload time)
- Playwright browser automation integration (design for reusability, but only implement yt-dlp consumer)
- Rate limiting on cookie downloads from Supabase Storage
- Caching of downloaded cookies (direct download per request is acceptable given file sizes)
