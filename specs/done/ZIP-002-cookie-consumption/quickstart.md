# Quickstart: ZIP-002 Cookie Consumption

## Prerequisites

- ZIP-001 complete (cookie upload UI, Supabase table + storage bucket)
- Backend running: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
- Frontend running: `cd next-frontend && yarn dev`
- At least one cookie file uploaded via the frontend at `/dashboard/cookies`

## What This Feature Changes

1. **New file**: `backend/app/services/cookie_service.py` — fetches user's cookies from Supabase Storage
2. **Modified**: `backend/app/models/knowledge.py` — adds `user_id` to `KnowledgeAddRequest`
3. **Modified**: `backend/app/services/transcriber.py` — accepts `cookie` parameter instead of hardcoded empty string
4. **Modified**: `backend/app/routers/knowledge.py` — passes `user_id` through pipeline, calls cookie service
5. **Modified**: Frontend API route that proxies to `/v1/api/knowledge/youtube/add` — includes `user_id` in request body

## Testing

### Manual Test

1. Upload a `youtube.com.cookies.json` file via `/dashboard/cookies`
2. Go to `/dashboard/knowledge/youtube/add` and select a video
3. Trigger transcription
4. Check backend logs for: `Found cookies for domain youtube.com for user {user_id}`
5. Verify transcription succeeds (especially for videos that previously failed without cookies)

### Without Cookies

1. Use a different account (or delete cookies for youtube.com)
2. Trigger transcription
3. Verify it proceeds normally without errors
4. Check backend logs for: `No cookies found for domain youtube.com`

## Key Design Decisions

- **No caching**: Cookie files downloaded fresh each time (small files, simple)
- **Temp file for yt-dlp**: Cookie JSON is converted to Netscape format and written to a short-lived temp file (required by yt-dlp's `cookiefile` API). Deleted immediately after use in a `finally` block
- **Graceful degradation**: Cookie failures never block transcription
- **Existing pattern reused**: `user_id` in request body, same as bulk delete
