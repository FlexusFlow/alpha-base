# Internal Contract: Cookie Service

## Module: backend/app/services/cookie_service.py

This is an internal service (not an API endpoint). It is called by the transcription pipeline.

### Function: get_cookies_for_domain

```python
async def get_cookies_for_domain(
    user_id: str,
    target_url: str,
    supabase: Client
) -> str | None
```

**Parameters**:
- `user_id`: UUID string of the authenticated user
- `target_url`: Full URL being scraped (e.g., `https://www.youtube.com/watch?v=abc123`)
- `supabase`: Supabase client (service role, bypasses RLS)

**Returns**:
- `str`: JSON string containing `CookieEntry[]` array — ready to be passed to `get_transcript_via_ytdlp(cookie=...)`
- `None`: If no cookies found for the domain, or if download/parse fails

**Domain Matching Logic**:
1. Extract hostname from `target_url`
2. Normalize: lowercase, strip `www.`
3. Query `user_cookies` WHERE `user_id = ?` AND `domain = ?`
4. If no match, strip leftmost subdomain and retry (e.g., `music.youtube.com` → `youtube.com`)
5. Stop when domain has only 2 parts (TLD+1)
6. If match found, download file from `cookie-files` bucket using `file_path`
7. Return file content as string

**Error Handling**:
- All exceptions caught and logged as warnings
- Returns `None` on any failure (graceful degradation)
- Never raises exceptions to caller
