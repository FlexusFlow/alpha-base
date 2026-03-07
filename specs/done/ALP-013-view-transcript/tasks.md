# Tasks: View Video Transcript

**Input**: Design documents from `/specs/ALP-013-view-transcript/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not requested — test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup needed — all infrastructure (FastAPI, Next.js, shadcn/ui Sheet, auth middleware) already exists. Skip to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend service and endpoint that both user stories depend on

**⚠️ CRITICAL**: US1 and US2 both need the backend transcript retrieval to work first

- [x] T001 [US1] Add `get_transcript_content(video_id, user_id)` function to `backend/app/services/transcriber.py` — query Supabase for video record scoped to user_id, reconstruct filename via `sanitize_filename(title) + ".md"`, read file from `settings.transcripts_dir`, parse content after `---` separator, return `{video_id, title, url, content}`. Raise 404 if video not found, not transcribed, or file missing/empty.
- [x] T002 [US1] Add `GET /v1/api/knowledge/videos/{video_id}/transcript` endpoint to `backend/app/routers/knowledge.py` — use `get_current_user` dependency for auth, call `get_transcript_content()`, return `TranscriptResponse` model. Add `TranscriptResponse` Pydantic model to `backend/app/models/` (or inline in router). Follow existing endpoint patterns in the same file.
- [x] T003 [P] [US1] Add `getVideoTranscript(videoId: string)` async function to `next-frontend/lib/api/knowledge.ts` — call `GET /v1/api/knowledge/videos/${videoId}/transcript` with auth headers from `getAuthHeaders()`, return `{ video_id: string, title: string, url: string, content: string }`.

**Checkpoint**: Backend endpoint callable and returning transcript content. Frontend API helper ready.

---

## Phase 3: User Story 1 — View Transcript in Side Panel (Priority: P1) 🎯 MVP

**Goal**: User clicks a transcribed video in the video table and a side panel slides open showing the full transcript text with video title and YouTube link.

**Independent Test**: Transcribe any video, click its "view transcript" button, verify the side panel opens with correct transcript content.

### Implementation for User Story 1

- [x] T004 [US1] Create `next-frontend/components/youtube/transcript-panel.tsx` — a controlled component that accepts `videoId: string | null`, `open: boolean`, `onOpenChange: (open: boolean) => void`. When `open && videoId`: call `getVideoTranscript(videoId)`, show loading state, then render transcript in shadcn/ui `Sheet` with `side="right"` and `className="sm:max-w-2xl w-full overflow-y-auto"`. Display: `SheetTitle` with video title, YouTube link (external, opens new tab), scrollable transcript content as plain text. Handle errors (404, network) with inline error message in the panel suggesting re-transcription. When `videoId` changes while open, re-fetch the new transcript.
- [x] T005 [US1] Update `next-frontend/components/youtube/video-table.tsx` — add a new column after the existing `link` column that renders a "view transcript" icon button (lucide-react `FileText` icon) only for rows where `is_transcribed === true`. Add `onViewTranscript: (video: YTVideo) => void` to `VideoTableProps`. Wire the button's `onClick` to call `onViewTranscript(row.original)`.
- [x] T006 [US1] Integrate transcript panel into the parent page that renders `VideoTable` — add state for `selectedVideoId` and `isPanelOpen`, pass `onViewTranscript` callback to `VideoTable` that sets the selected video ID and opens the panel, render `TranscriptPanel` alongside the table. Clicking a different transcribed video updates the panel content without closing it (FR-008). Find the parent page/component that uses `VideoTable` and add integration there.

**Checkpoint**: User Story 1 fully functional — transcribed videos show view button, clicking opens side panel with transcript, switching between videos works, closing panel preserves table state.

---

## Phase 4: User Story 2 — Copy Transcript Text (Priority: P2)

**Goal**: User can copy the entire transcript to clipboard via a "Copy all" button in the side panel.

**Independent Test**: Open any transcript in the side panel, click "Copy all", paste into a text editor and verify the full transcript text was copied.

### Implementation for User Story 2

- [x] T007 [US2] Add "Copy all" button to `next-frontend/components/youtube/transcript-panel.tsx` — place a button (lucide-react `Copy` or `ClipboardCopy` icon + "Copy all" label) in the `SheetHeader` area. On click, use `navigator.clipboard.writeText(content)` to copy the transcript text. Show brief visual feedback (e.g., button text changes to "Copied!" for 2 seconds, or use a toast). Text selection and manual copy (Ctrl/Cmd+C) should work naturally since the transcript is rendered as plain text.

**Checkpoint**: User Stories 1 AND 2 both work — view transcript + copy to clipboard.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T008 Run `cd backend && uv run ruff check .` and fix any linting issues in modified files
- [x] T009 Run `cd next-frontend && yarn lint` and `cd next-frontend && npx tsc --noEmit` and fix any issues
- [x] T010 Run quickstart.md verification steps end-to-end to validate the full feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — can start immediately
  - T001 → T002 (endpoint depends on service function)
  - T003 can run in parallel with T001/T002 (different codebase)
- **User Story 1 (Phase 3)**: Depends on T002 and T003
  - T004 and T005 can run in parallel (different files)
  - T006 depends on T004 and T005
- **User Story 2 (Phase 4)**: Depends on T004 (modifies same component)
- **Polish (Phase 5)**: Depends on all previous phases

### Parallel Opportunities

```
T001 ──→ T002 ──┐
                 ├──→ T004 ──┐
T003 ───────────┘     |      ├──→ T006 ──→ T007 ──→ T008, T009, T010
                      T005 ──┘
```

- T001 + T003 can run in parallel (backend service + frontend API helper)
- T004 + T005 can run in parallel (panel component + table column)
- T008 + T009 can run in parallel (backend lint + frontend lint)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001–T003)
2. Complete Phase 3: User Story 1 (T004–T006)
3. **STOP and VALIDATE**: Test viewing transcripts end-to-end
4. Deploy/demo if ready

### Incremental Delivery

1. T001–T003 → Backend + API helper ready
2. T004–T006 → View transcript in side panel → **MVP!**
3. T007 → Copy all button → Full feature complete
4. T008–T010 → Polish and validate

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No new database migrations required — reads existing data only
- Reuse existing `sanitize_filename()` from `backend/app/utils/text.py`
- Sheet component already installed at `next-frontend/components/ui/sheet.tsx`
- Commit after each task or logical group
