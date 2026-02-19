# API Contract: Knowledge Add (Modified)

## POST /v1/api/knowledge/youtube/add

### Request Body

```json
{
  "channel_title": "string",
  "channel_id": "string (optional, default '')",
  "videos": [
    {
      "video_id": "string",
      "title": "string"
    }
  ],
  "user_id": "string (required, UUID)"
}
```

**Change**: Added `user_id` field (required). Follows existing pattern from `BulkDeleteRequest`.

### Response (unchanged)

```json
{
  "job_id": "string (UUID)"
}
```

### Behavior Change

- Backend uses `user_id` to look up cookies for `youtube.com` in `user_cookies` table
- If cookies found, downloads file from Supabase Storage and injects into yt-dlp
- If no cookies found, proceeds without cookies (same as current behavior)
- Cookie lookup failures are logged but do not block transcription

### Frontend Caller Update

The Next.js API route that proxies to this endpoint must include `user_id: user.id` in the request body, matching the pattern already used by `/api/channels/delete-bulk`.
