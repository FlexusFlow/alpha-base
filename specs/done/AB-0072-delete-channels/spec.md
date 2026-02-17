# Feature Specification: Delete Scraped Channels

**Feature Branch**: `AB-0072-delete-channels`
**Created**: 2026-02-11
**Status**: Draft
**Input**: User description: "Add ability to delete scraped channels and their videos from Supabase. See plans/implemented-features.md for current channel list behavior (Stage 6) and persistence layer (Stage 3)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Delete a Channel and Its Videos (Priority: P1)

A user navigates to the Knowledge Base page, which displays their previously scraped YouTube channels as cards. The user decides they no longer need a particular channel (e.g., they scraped the wrong one, or the content is no longer relevant). They click a delete action on the channel card, confirm their intent via a confirmation dialog, and the channel along with all its associated videos is permanently removed from their account.

**Why this priority**: This is the core feature — without it, users have no way to clean up unwanted data. It directly addresses the gap identified in the implemented features list ("Deletion of scraped data from Supabase — not yet implemented").

**Independent Test**: Can be fully tested by scraping a channel, verifying it appears in the channel list, deleting it, and confirming it disappears from the list along with all its videos.

**Acceptance Scenarios**:

1. **Given** a user has one or more scraped channels displayed on the Knowledge Base page, **When** they click the delete action on a channel card, **Then** a confirmation dialog appears showing the channel name, the number of videos that will be deleted, and a warning that this action is permanent.
2. **Given** the confirmation dialog is displayed, **When** the user confirms the deletion, **Then** the channel and all its associated videos are removed from the database, the channel card disappears from the Knowledge Base page, and a success notification is shown.
3. **Given** the confirmation dialog is displayed, **When** the user cancels the deletion, **Then** no data is deleted and the dialog closes.
4. **Given** a user deletes a channel, **When** they navigate to any other page and return to the Knowledge Base, **Then** the deleted channel is no longer visible.

---

### User Story 2 - Delete a Channel That Has Transcribed Videos (Priority: P2)

A user wants to delete a channel that contains videos which have already been transcribed and added to the knowledge base. The system warns the user that transcribed video data exists and proceeds with deletion upon confirmation. The system performs full cleanup: removing database records, vector store entries (DeepLake chunks matched by video_id metadata), and transcript markdown files from disk.

**Why this priority**: Many channels will have transcribed videos. Users need clear communication about what happens to already-transcribed content. This story ensures the feature handles the most common real-world scenario gracefully.

**Independent Test**: Can be tested by scraping a channel, transcribing some videos, then deleting the channel and verifying the database records are removed while the system remains stable.

**Acceptance Scenarios**:

1. **Given** a channel has some videos marked as transcribed, **When** the user initiates deletion, **Then** the confirmation dialog indicates how many videos are transcribed (e.g., "5 of 20 videos have been transcribed").
2. **Given** a channel with transcribed videos, **When** the user confirms deletion, **Then** the channel and all videos (including transcribed ones) are removed from the database.
3. **Given** a channel with transcribed videos has been deleted, **When** the user uses the RAG chat, **Then** previously transcribed content no longer appears in search results (vector entries and transcript files are removed as part of deletion).

---

### User Story 3 - Delete Multiple Channels (Priority: P3)

A user wants to clean up several channels at once. Rather than deleting channels one by one, they can select multiple channels and delete them in a single operation.

**Why this priority**: Useful for power users or bulk cleanup, but single-channel deletion (P1) covers the essential need. This is a convenience enhancement.

**Independent Test**: Can be tested by scraping 3+ channels, selecting multiple for deletion, confirming, and verifying all selected channels and their videos are removed.

**Acceptance Scenarios**:

1. **Given** a user has multiple channels displayed, **When** they enter a selection mode and select two or more channels, **Then** a bulk delete action becomes available.
2. **Given** multiple channels are selected for deletion, **When** the user confirms the bulk delete, **Then** all selected channels and their associated videos are removed, and a success notification summarizes the result (e.g., "3 channels and 150 videos deleted").
3. **Given** a bulk deletion is in progress, **When** one channel fails to delete, **Then** the system continues deleting the remaining channels and reports which ones succeeded and which failed.

---

### Edge Cases

- What happens if a user tries to delete a channel while a transcription job is in progress for that channel? The system should prevent deletion and inform the user to wait until the job completes.
- What happens if the deletion request fails due to a network error? The system should show an error notification and leave the data unchanged.
- What happens if the channel was already deleted (e.g., two browser tabs open)? The system should handle the missing record gracefully and refresh the channel list.
- What happens if the user has no channels? The delete action should not be available and the empty state should remain unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a user to delete a single channel and all its associated videos from the database.
- **FR-002**: System MUST display a confirmation dialog before executing any channel deletion, showing the channel name and total video count.
- **FR-003**: The confirmation dialog MUST indicate how many of the channel's videos have been transcribed, if any.
- **FR-004**: System MUST remove the deleted channel card from the UI immediately after successful deletion without requiring a full page reload.
- **FR-005**: System MUST display a success notification after a channel is successfully deleted.
- **FR-006**: System MUST display an error notification if a deletion fails, without removing the channel from the UI.
- **FR-007**: System MUST prevent deletion of a channel while a transcription job is actively processing videos from that channel.
- **FR-008**: System MUST ensure users can only delete their own channels (enforced by existing data isolation policies).
- **FR-009**: Deleting a channel MUST cascade to delete all associated video records from the database.
- **FR-010**: For transcribed videos, the system MUST delete corresponding vector store entries (matched by video_id metadata) from the knowledge base.
- **FR-011**: For transcribed videos, the system MUST delete corresponding transcript markdown files from disk.
- **FR-012**: The system MUST delete in this order: vector store entries first, then transcript files, then database records. If vector store or file cleanup fails, the system MUST abort the deletion and report the error to the user without removing database records.
- **FR-013**: If a channel has no transcribed videos, the system MUST skip vector store and file cleanup steps and proceed directly to database deletion.
- **FR-014**: System MUST support selecting and deleting multiple channels in a single operation.
- **FR-015**: For bulk deletion, the system MUST report how many channels and videos were deleted in the success notification.
- **FR-016**: For bulk deletion, if some channels fail to delete, the system MUST continue deleting the remaining ones and report partial results.

### Key Entities

- **Channel**: Represents a scraped YouTube channel belonging to a user. Key attributes: name, URL, video count, last scraped date. Deleting a channel cascades to all its videos.
- **Video**: Represents a single YouTube video within a channel. Key attributes: title, URL, views, category, transcription status. Videos are deleted when their parent channel is deleted.
- **Transcript file**: A markdown file stored on disk containing a video's transcript text. Deleted from disk when the parent channel is removed.
- **Vector store entry**: Embedded transcript chunks stored in the vector database for RAG search, keyed by video_id metadata. Deleted from the vector store when the parent channel is removed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can delete a single channel and all its videos in under 5 seconds (from clicking delete to seeing confirmation of removal).
- **SC-002**: Users can delete multiple channels in a single operation, with the total operation completing within 10 seconds for up to 10 channels.
- **SC-003**: 100% of deletion attempts by authorized users succeed when the system is available and no conflicting operations are in progress.
- **SC-004**: Zero data leakage — users never see or can delete channels belonging to other users.
- **SC-005**: After deletion, the Knowledge Base page accurately reflects the current state (deleted channels do not reappear on navigation or refresh).

## Clarifications

### Session 2026-02-11

- Q: Should deletion clean up vector store entries and transcript files, or only Supabase records? → A: Full cleanup — delete from Supabase, vector store (DeepLake), AND transcript markdown files on disk.
- Q: What is the deletion order and failure strategy across the three systems? → A: Cleanup-first — delete vector entries and transcript files first, then database records last. Abort entirely if cleanup fails (no orphaned data).
- Q: How should deletion behave for channels with no transcribed videos? → A: Auto-skip — silently skip vector store and file cleanup steps when no transcribed videos exist; proceed straight to database deletion.

## Assumptions

- Database cascade delete (channel deletion automatically removes associated videos) is already configured and working correctly.
- Row-level security policies already prevent cross-user data access, including deletions.
- Deletion performs full cleanup: Supabase records, DeepLake vector entries, and transcript markdown files on disk.
- Deletion follows cleanup-first order: vector store → transcript files → database. If cleanup fails, deletion aborts entirely to prevent orphaned data.
- The existing channel card UI on the Knowledge Base page is the primary surface for the delete action.
