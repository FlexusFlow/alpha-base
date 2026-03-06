# API Contracts: Agentic Search with Web Fallback

**Feature**: ALP-012

## Modified Endpoints

### POST /v1/api/chat (Modified)

**Change**: Add `extended_search` field to request body.

**Request Body**:
```json
{
  "project_id": "uuid",
  "message": "What happened in the stock market today?",
  "history": [
    {"role": "user", "content": "previous question"},
    {"role": "assistant", "content": "previous answer"}
  ],
  "extended_search": true
}
```

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `project_id` | string | yes | — | Existing |
| `message` | string | yes | — | Existing |
| `history` | ChatMessage[] | no | `[]` | Existing |
| `extended_search` | boolean | no | `false` | New — when false (default), KB-only mode; when true, full agentic flow (KB → web → general knowledge) |

**SSE Response Stream** (unchanged format, extended `done` event):

Token events (unchanged):
```
data: {"token": "Based"}
data: {"token": " on"}
data: {"token": " recent"}
```

Done event (extended):
```
data: {"done": true, "sources": ["https://...", "https://..."], "source_types": ["kb", "web"]}
```

| Field | Type | Description |
|-------|------|-------------|
| `done` | boolean | Always `true` — signals stream end |
| `sources` | string[] | Source URLs (existing) |
| `source_types` | string[] | New — parallel array: `"kb"` or `"web"` per source URL |

**Error Responses** (unchanged):
- `401 Unauthorized` — missing or invalid JWT
- `404 Not Found` — project not found or not owned by user

---

## New Endpoints

### GET /v1/api/chat/config

Returns chat configuration for the frontend, including web search availability.

**Response**:
```json
{
  "web_search_available": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `web_search_available` | boolean | `true` if `serper_api_key` is configured, `false` otherwise |

**Auth**: Requires JWT (same as chat endpoint).

**Error Responses**:
- `401 Unauthorized` — missing or invalid JWT

---

## Frontend API Changes

### sendChatMessage (Modified)

Add `extended_search` to the request payload sent to `/v1/api/chat`.

### getChatConfig (New)

Fetch `/v1/api/chat/config` to determine if web search toggle should be enabled or disabled.

---

## Notes

- The `source_types` array is always the same length as `sources`. Each element corresponds to the source URL at the same index.
- When `extended_search` is `false` (default), the system uses KB-only mode — no web search, no general knowledge. If KB has no relevant results, the system declines to answer.
- When the rate limit is exceeded, the agent silently skips web search — no error is returned. The response may include a natural-language note from the LLM about web search being temporarily unavailable.
