# Quickstart: View Video Transcript

## Prerequisites

- Backend running: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
- Frontend running: `cd next-frontend && yarn dev`
- At least one video transcribed (has `is_transcribed = true` in Supabase)

## What Gets Built

1. **Backend endpoint**: `GET /v1/api/knowledge/videos/{video_id}/transcript`
   - Authenticated via JWT (existing `get_current_user` middleware)
   - Returns `{ video_id, title, url, content }` where `content` is the transcript text
   - 404 if video not found, not transcribed, or file missing

2. **Frontend API helper**: `getVideoTranscript(videoId)` in `lib/api/knowledge.ts`
   - Calls the backend endpoint with auth headers

3. **Transcript panel component**: `components/youtube/transcript-panel.tsx`
   - shadcn/ui Sheet (right side panel, `sm:max-w-2xl`)
   - Displays video title, YouTube link, transcript text
   - "Copy all" button for clipboard

4. **Video table integration**: Updated `video-table.tsx`
   - New column with "view transcript" icon button for transcribed videos
   - Click opens the transcript panel

## Key Implementation Notes

- Transcript filename is derived from video title via `sanitize_filename()`, NOT from `video_id`
- The endpoint must query Supabase first to get the title, then reconstruct the filename
- Reuse the existing `sanitize_filename()` from `backend/app/utils/text.py`
- Sheet component is already installed at `next-frontend/components/ui/sheet.tsx`

## Verification

1. Open the video list for a channel with transcribed videos
2. Transcribed rows should show a "view transcript" icon button
3. Click the button — side panel slides open with transcript content
4. Verify video title and YouTube link appear at top
5. Click "Copy all" — transcript text copied to clipboard
6. Click a different transcribed video — panel updates
7. Close panel — video list state preserved
