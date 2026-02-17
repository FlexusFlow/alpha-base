# Tasks: Delete Scraped Channels

**Input**: Design documents from `/specs/AB-0072-delete-channels/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install UI components and add shared response models needed across all stories

- [x] T001 Install shadcn/ui AlertDialog component in `next-frontend/` (run `npx shadcn@latest add alert-dialog`, creates `next-frontend/components/ui/alert-dialog.tsx`)
- [x] T002 [P] Add `ChannelDeleteResponse` and `BulkDeleteResponse` Pydantic models in `backend/app/models/knowledge.py` — include fields: `channel_id`, `channel_title`, `videos_deleted`, `vectors_deleted`, `files_deleted`, `message` per contracts/delete-channel.yaml
- [x] T003 [P] Add `channel_id: str = ""` field to Job dataclass in `backend/app/services/job_manager.py` and add `has_active_job_for_channel(channel_id: str) -> Job | None` method that iterates all jobs and returns the first IN_PROGRESS job matching the channel_id

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend service methods for vector store deletion and transcript file cleanup — needed by US1 and US2

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 [P] Add `delete_by_video_ids(video_ids: list[str]) -> int` method to `VectorStoreService` in `backend/app/services/vectorstore.py` — open DeeplakeVectorStore (overwrite=False), use TQL query `SELECT ids FROM (SELECT * WHERE metadata['video_id'] IN ({ids_str}))` on `db.dataset.query()`, then call `db.delete(ids=results["ids"][:])`, return count of deleted chunks. Handle empty video_ids list (return 0).
- [x] T005 [P] Add `delete_transcripts(videos: list[dict], transcripts_dir: str) -> int` function in `backend/app/services/transcriber.py` — for each video dict with `title` and `is_transcribed=True`, derive filename via `sanitize_filename(title) + ".md"`, build full path with `Path(transcripts_dir) / filename`, delete if exists using `Path.unlink(missing_ok=True)`, return count of files actually deleted. Import `sanitize_filename` from `app.utils.text`.

**Checkpoint**: Backend cleanup services ready — vector store and file deletion capabilities available

---

## Phase 3: User Story 1 — Delete a Channel and Its Videos (Priority: P1) 🎯 MVP

**Goal**: User can delete a single channel (with no transcribed videos) from the Knowledge Base page via a delete button on the channel card, with confirmation dialog, immediate UI removal, and toast notification.

**Independent Test**: Scrape a channel (don't transcribe any videos), click delete on the card, confirm → card disappears, channel gone from Supabase.

### Implementation for User Story 1

- [x] T006 [US1] Add `DELETE /v1/api/knowledge/channels/{channel_id}` endpoint in `backend/app/routers/knowledge.py` — accept `channel_id` path param and `user_id` query param. Orchestrate: (1) fetch channel from Supabase by id + user_id, return 404 if not found; (2) check `job_manager.has_active_job_for_channel(channel_id)`, return 409 if active; (3) fetch all videos for channel from Supabase; (4) filter transcribed videos (is_transcribed=True); (5) if transcribed videos exist: call `vectorstore.delete_by_video_ids()` then `delete_transcripts()` — if either raises, return 500 with phase info and abort; (6) delete channel from Supabase (cascade deletes videos); (7) return `ChannelDeleteResponse` with counts. Use `get_supabase()`, `get_vectorstore()`, `get_job_manager()` dependencies.
- [x] T007 [US1] Create Next.js API route `next-frontend/app/api/channels/[channelId]/route.ts` — export async DELETE handler: authenticate user via `createServerClient()`, extract user_id from session, forward request to Python backend `DELETE http://localhost:8000/v1/api/knowledge/channels/{channelId}?user_id={userId}`, return backend response. Handle 401 (no session), proxy 404/409/500 from backend.
- [x] T008 [US1] Add `getTranscribedCount(supabase, channelId: string) -> number` function in `next-frontend/lib/supabase/channels.ts` — query `videos` table filtering by `channel_id` and `is_transcribed=true`, return count. Also add this to the `createBrowserChannelHelpers()` return object.
- [x] T009 [US1] Modify `ChannelCard` component in `next-frontend/components/youtube/channel-card.tsx` — add a delete icon button (Trash2 from lucide-react) in the card header area. Use `e.stopPropagation()` to prevent card navigation when clicking delete. Add `onDelete?: (channel: DbChannel) => void` prop. When delete button clicked, call `onDelete(channel)`.
- [x] T010 [US1] Implement delete confirmation dialog and handler in `next-frontend/app/dashboard/knowledge/page.tsx` — add state: `channelToDelete: DbChannel | null`, `transcribedCount: number`, `isDeleting: boolean`. When `onDelete` fires from ChannelCard: fetch transcribed count via `getTranscribedCount()`, set `channelToDelete` to open the AlertDialog. AlertDialog shows: channel name, total_videos count, transcribed count (if > 0), "This action cannot be undone" warning. On confirm: call `DELETE /api/channels/{channelId}`, on success remove channel from state array and show success toast, on error show destructive toast. On cancel: reset `channelToDelete` to null.

**Checkpoint**: Single channel deletion works end-to-end. User can delete channels with no transcribed videos and see immediate UI feedback.

---

## Phase 4: User Story 2 — Delete a Channel with Transcribed Videos (Priority: P2)

**Goal**: Deletion of channels that have transcribed videos performs full cleanup — vector store entries removed, transcript files deleted from disk — with the confirmation dialog showing transcription counts. RAG search no longer returns results for deleted content.

**Independent Test**: Scrape a channel, transcribe 2-3 videos, delete the channel → confirm dialog shows transcribed count, after deletion: .md files gone from `backend/knowledge_base/transcripts/`, DeepLake no longer returns chunks for those video_ids, RAG chat doesn't reference deleted content.

### Implementation for User Story 2

- [x] T011 [US2] Wire `channel_id` into job creation in `backend/app/routers/knowledge.py` — in the existing `POST /v1/api/knowledge/youtube/add` handler, when calling `job_manager.create_job()`, pass the channel_id (resolve from Supabase using channel_title from the request, or accept channel_id in the request). This enables the active-job guard in the DELETE endpoint from T006.
- [x] T012 [US2] Enhance confirmation dialog in `next-frontend/app/dashboard/knowledge/page.tsx` — when `transcribedCount > 0`, show additional warning text in the AlertDialog: "{N} of {total} videos have been transcribed. Deleting this channel will also remove their transcripts and search data from the knowledge base." Use destructive text styling for this warning.
- [x] T013 [US2] Verify cleanup-first abort behavior in DELETE endpoint `backend/app/routers/knowledge.py` — ensure that if `vectorstore.delete_by_video_ids()` raises an exception, the endpoint returns HTTP 500 with `{"detail": "Vector store cleanup failed: {error}", "phase": "vector_store", "channel_id": channel_id}` and does NOT proceed to Supabase deletion. Same for transcript file deletion failure with `"phase": "transcript_files"`. The frontend should show the error detail in a destructive toast.

**Checkpoint**: Full cleanup path works — channels with transcribed videos are cleanly removed from all three systems. Active job detection prevents conflicts.

---

## Phase 5: User Story 3 — Delete Multiple Channels (Priority: P3)

**Goal**: User can select multiple channels and delete them in a single bulk operation, with a summary showing how many channels/videos were deleted and any failures.

**Independent Test**: Scrape 3+ channels, enter selection mode, select 2+, click "Delete Selected" → all selected channels removed, summary toast shown.

### Implementation for User Story 3

- [ ] T014 [P] [US3] Add `POST /v1/api/knowledge/channels/delete-bulk` endpoint in `backend/app/routers/knowledge.py` — accept `BulkDeleteRequest` body with `channel_ids: list[str]` and `user_id: str`. Iterate each channel_id: attempt the same cleanup-first deletion logic as the single-delete endpoint (reuse/extract shared function). Continue on individual failures. Return `BulkDeleteResponse` with `succeeded` array, `failed` array (with error reasons), and summary `message`.
- [ ] T015 [P] [US3] Create Next.js API route `next-frontend/app/api/channels/delete-bulk/route.ts` — export async POST handler: authenticate user, extract user_id, forward `{ channel_ids, user_id }` to Python backend `POST http://localhost:8000/v1/api/knowledge/channels/delete-bulk`, return backend response.
- [ ] T016 [US3] Add selection mode to Knowledge Base page in `next-frontend/app/dashboard/knowledge/page.tsx` — add state: `isSelectMode: boolean`, `selectedChannelIds: Set<string>`. Add "Select" / "Cancel" toggle button near the channel grid header. When in select mode, render a checkbox overlay on each ChannelCard (using a wrapper div with absolute-positioned checkbox). Clicking a card in select mode toggles selection instead of navigating.
- [ ] T017 [US3] Add bulk delete floating action bar in `next-frontend/app/dashboard/knowledge/page.tsx` — when `selectedChannelIds.size > 0`, show a fixed-bottom bar with: "{N} channels selected" text + "Delete Selected" button (destructive variant). On click: open AlertDialog showing total channels and total video count across selected channels. On confirm: call `POST /api/channels/delete-bulk` with selected IDs, on success remove all succeeded channels from state and show summary toast, on partial failure show toast with succeeded/failed counts.

**Checkpoint**: All user stories complete — single delete, transcription-aware cleanup, and bulk delete all functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling, error states, and UX refinements

- [x] T018 Handle already-deleted channel gracefully in `next-frontend/app/dashboard/knowledge/page.tsx` — if DELETE returns 404, remove the channel card from state (another tab may have deleted it) and show info toast "Channel was already deleted" instead of error toast.
- [x] T019 Handle empty channel list in `next-frontend/app/dashboard/knowledge/page.tsx` — ensure "Select" button is hidden or disabled when no channels exist, and selection mode cannot be entered with zero channels.
- [x] T020 Add loading state to delete button in `next-frontend/components/youtube/channel-card.tsx` — while deletion is in progress (`isDeleting` state), show a spinner on the delete icon button and disable it to prevent double-clicks.
- [ ] T021 Run quickstart.md validation — manually test all 7 scenarios from `specs/AB-0072-delete-channels/quickstart.md` testing checklist.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: T004 and T005 can run in parallel; no dependency on Phase 1
- **User Story 1 (Phase 3)**: Depends on T001 (AlertDialog), T002 (response models), T003 (job guard), T004 (vectorstore delete), T005 (transcript delete)
- **User Story 2 (Phase 4)**: Depends on US1 completion (Phase 3) — extends the confirmation dialog and wires job tracking
- **User Story 3 (Phase 5)**: Depends on US1 completion (Phase 3) — reuses single-delete logic for bulk operations
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Setup + Foundational — no dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 (extends the DELETE endpoint and dialog from US1)
- **User Story 3 (P3)**: Depends on US1 (reuses single-delete orchestration logic; builds bulk on top)

### Within Each User Story

- Backend endpoint before frontend API route
- Frontend API route before frontend UI integration
- Models/services before endpoints

### Parallel Opportunities

- T002 and T003 can run in parallel (different files, Phase 1)
- T004 and T005 can run in parallel (different files, Phase 2)
- T014 and T015 can run in parallel (backend + frontend API routes, Phase 5)
- Phase 1 and Phase 2 can run in parallel (no cross-dependencies)

---

## Parallel Example: Phase 1 + Phase 2

```bash
# These can all run simultaneously:
Task T001: "Install shadcn/ui AlertDialog in next-frontend/"
Task T002: "Add ChannelDeleteResponse models in backend/app/models/knowledge.py"
Task T003: "Add channel_id to Job and has_active_job_for_channel in backend/app/services/job_manager.py"
Task T004: "Add delete_by_video_ids to VectorStoreService in backend/app/services/vectorstore.py"
Task T005: "Add delete_transcripts function in backend/app/services/transcriber.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T005)
3. Complete Phase 3: User Story 1 (T006–T010)
4. **STOP and VALIDATE**: Delete a channel with no transcribed videos end-to-end
5. Deploy/demo if ready — single delete with confirmation is fully functional

### Incremental Delivery

1. Complete Setup + Foundational → Infrastructure ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Full cleanup for transcribed content → Deploy/Demo
4. Add User Story 3 → Bulk delete for power users → Deploy/Demo
5. Polish → Edge cases and UX refinements

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- No test tasks included (not requested in spec)
- US2 extends US1 (not fully independent) — this is intentional since the cleanup logic and dialog enhancement build directly on the single-delete foundation
