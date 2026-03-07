# Feature Specification: View Video Transcript

**Feature Branch**: `ALP-013-view-transcript`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "Add the ability to view the transcript of transcribed videos."

## Clarifications

### Session 2026-03-06

- Q: What UI pattern should be used to display the transcript? → A: Side panel — slide-over panel that opens alongside the video list.
- Q: Should we build custom in-app search or rely on browser-native Ctrl/Cmd+F? → A: Browser-native only — rely on Ctrl/Cmd+F, no custom search component needed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Transcript in Side Panel (Priority: P1)

A user browsing their video list sees that a video has been transcribed. They want to read the full transcript to review its content or verify the transcription quality. The user clicks on the transcribed video and a side panel slides open alongside the video list, displaying the transcript text in a readable format. The user can use browser-native Ctrl/Cmd+F to search within the transcript.

**Why this priority**: This is the core feature — without the ability to view a transcript, the transcription data is essentially inaccessible to the user outside of the RAG chat.

**Independent Test**: Can be fully tested by transcribing any video and then clicking to view its transcript in the side panel. Delivers immediate value by making transcript content directly accessible.

**Acceptance Scenarios**:

1. **Given** a video is marked as transcribed, **When** the user clicks to view the transcript, **Then** a side panel slides open displaying the full transcript text in a readable, scrollable view.
2. **Given** a video is NOT transcribed, **When** the user views the video entry, **Then** no option to view the transcript is available.
3. **Given** the user is viewing a transcript in the side panel, **When** they close the panel, **Then** the video list remains in its previous state (scroll position, selections preserved).
4. **Given** the user is viewing a transcript, **When** they click a different transcribed video, **Then** the side panel updates to show the newly selected video's transcript.

---

### User Story 2 - Copy Transcript Text (Priority: P2)

A user wants to copy part or all of the transcript to use in another context (notes, documents, etc.). They can select and copy text from the side panel, or use a "copy all" action for the entire transcript.

**Why this priority**: A natural secondary action after viewing — users often want to extract portions of the transcript for other purposes.

**Independent Test**: Can be tested by viewing a transcript and copying text to clipboard. Delivers value by enabling transcript content reuse.

**Acceptance Scenarios**:

1. **Given** the user is viewing a transcript in the side panel, **When** they select text and copy, **Then** the selected text is copied to clipboard in plain text format.
2. **Given** the user is viewing a transcript in the side panel, **When** they use a "copy all" action, **Then** the entire transcript text is copied to clipboard.

---

### Edge Cases

- What happens when a transcript file exists on disk but is empty or corrupted? The system displays an error message indicating the transcript content is unavailable.
- What happens when the `is_transcribed` flag is true but the transcript file has been deleted from disk? The system displays an error message and suggests re-transcribing the video.
- How does the system handle very long transcripts (e.g., multi-hour videos)? The transcript is displayed in a scrollable container within the side panel that loads the full text without pagination.
- What happens if two users transcribed the same video? Each user has their own transcript file via per-user data isolation, so each sees only their own.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display the transcript in a slide-over side panel alongside the video list.
- **FR-002**: System MUST only show the transcript viewing option for videos where `is_transcribed` is true.
- **FR-003**: System MUST display the transcript in a readable, scrollable format within the side panel that handles long content gracefully.
- **FR-004**: System MUST allow users to copy transcript text (both selection-based and full copy via a "copy all" action).
- **FR-005**: System MUST show an appropriate error message when a transcript file cannot be retrieved (e.g., file missing or corrupted).
- **FR-006**: System MUST respect per-user data isolation — users can only view transcripts for their own videos.
- **FR-007**: System MUST display the video title and source link alongside the transcript for context.
- **FR-008**: System MUST allow switching between transcripts by clicking different transcribed videos without closing the panel.

### Key Entities

- **Transcript**: The text content of a transcribed video, stored as a file. Linked to a video record via the video's ID and title. Contains the video title, source URL, and full transcript text.
- **Video**: An existing entity with an `is_transcribed` flag that determines transcript availability.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view any transcribed video's full transcript within 2 seconds of requesting it.
- **SC-002**: 100% of transcribed videos with valid transcript files display their transcript correctly when viewed.
- **SC-003**: Users can copy transcript text to clipboard in a single action.

## Assumptions

- Transcripts are stored as files on the backend, one file per video.
- The transcript file includes a title header, video URL, and the full transcript text.
- Browser-native Ctrl/Cmd+F provides sufficient text search within the side panel — no custom search component needed.
- Per-user data isolation is already enforced at the backend level via JWT auth middleware.
