# Data Model: ZIP-002 Cookie Consumption

## Existing Entities (No Changes)

### user_cookies (table — created in ZIP-001)

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | UUID | PK, auto-generated | |
| user_id | UUID | FK → auth.users, NOT NULL | |
| domain | TEXT | NOT NULL | Normalized: lowercase, no `www.` |
| filename | TEXT | NOT NULL | e.g., `youtube.com.cookies.json` |
| file_path | TEXT | NOT NULL | Storage path: `{user_id}/{filename}` |
| earliest_expiry | TIMESTAMPTZ | nullable | Min expiry from cookie entries |
| created_at | TIMESTAMPTZ | default NOW() | |
| | | UNIQUE(user_id, domain) | One file per user per domain |

### cookie-files (Supabase Storage bucket — created in ZIP-001)

- Private bucket, RLS enforced
- Files stored at `{user_id}/{domain}.cookies.json`
- Content: JSON array of CookieEntry objects

### CookieEntry (JSON structure — defined in ZIP-001)

```
{
  name: string,
  value: string,
  domain: string,
  path: string,
  expires?: number,       // Unix timestamp (seconds)
  httpOnly?: boolean,
  secure?: boolean,
  sameSite?: "Strict" | "Lax" | "None"
}
```

## Modified Entities

### KnowledgeAddRequest (Pydantic model)

**File**: `backend/app/models/knowledge.py`

| Field | Type | Change | Notes |
| --- | --- | --- | --- |
| channel_title | str | existing | |
| channel_id | str | existing | default "" |
| videos | list[VideoSelection] | existing | |
| **user_id** | **str** | **NEW** | Required. UUID of authenticated user |

### get_transcript_via_ytdlp() signature

**File**: `backend/app/services/transcriber.py`

| Parameter | Type | Change | Notes |
| --- | --- | --- | --- |
| video_id | str | existing | |
| **cookie** | **str \| None** | **NEW** | JSON string of CookieEntry[], default None |

### get_transcript() signature

**File**: `backend/app/services/transcriber.py`

| Parameter | Type | Change | Notes |
| --- | --- | --- | --- |
| video_id | str | existing | |
| title | str | existing | |
| **cookie** | **str \| None** | **NEW** | Passed through to yt-dlp fallback |

### process_knowledge_job() signature

**File**: `backend/app/routers/knowledge.py`

| Parameter | Type | Change | Notes |
| --- | --- | --- | --- |
| job_id | str | existing | |
| videos | list | existing | |
| channel_title | str | existing | |
| job_manager | JobManager | existing | |
| settings | Settings | existing | |
| supabase | Client | existing | |
| **user_id** | **str** | **NEW** | For cookie lookup |

## New Entities

### cookie_service (module)

**File**: `backend/app/services/cookie_service.py`

Single async function — no class needed:

```
async def get_cookies_for_domain(
    user_id: str,
    target_url: str,
    supabase: Client
) -> str | None
```

Returns: JSON string of CookieEntry[] or None if no cookies found.

Internal helpers:
- `_normalize_domain(domain: str) -> str` — lowercase, strip `www.`
- `_extract_domain(url: str) -> str` — extract hostname from URL
- `_get_parent_domains(domain: str) -> list[str]` — generate fallback domains
