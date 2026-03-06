# Data Model: Agentic Search with Web Fallback

**Feature**: ALP-012

## Entities

### No New Database Tables

This feature introduces no new Supabase tables or migrations. All changes are in-memory (agent logic, rate limiter state) and configuration (environment variables).

## Configuration (Environment Variables)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `serper_api_key` | string | _(none)_ | Serper search API key. If not set, web search is unavailable and toggle is disabled. |
| `WEB_SEARCH_RATE_LIMIT` | int | `50` | Maximum web search API calls per user per time window |
| `WEB_SEARCH_RATE_WINDOW` | int | `86400` | Rate limit time window in seconds (default: 24 hours) |
| `RAG_CONFIDENCE_THRESHOLD` | float | `0.75` | Similarity score above which to skip agent loop (fast path). Set to `1.0` to disable. |

## Modified Entities

### ChatRequest (Pydantic model — extended)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | yes | Existing field |
| `message` | string | yes | Existing field |
| `history` | list[ChatMessage] | no | Existing field |
| `extended_search` | boolean | no (default: false) | New field — when false (default), KB-only mode; when true, full agentic flow |

### SSE Event: Done (extended)

| Field | Type | Description |
|-------|------|-------------|
| `done` | boolean | Existing — always `true` |
| `sources` | list[string] | Existing — source URLs |
| `source_types` | list[string] | New — parallel array: "kb" or "web" for each URL in `sources` |

## In-Memory State

### Web Search Rate Limiter

Per-user sliding window counter. Same pattern as `RateLimiter` in `rate_limiter.py`.

- **Key**: `user_id`
- **Window**: configurable via `WEB_SEARCH_RATE_WINDOW`
- **Max**: configurable via `WEB_SEARCH_RATE_LIMIT`
- **Reset**: on server restart (no persistence)

## Tool Schemas (LangChain Agent Tools)

### search_knowledge_base

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search query for the user's knowledge base |

**Returns**: Formatted string of matching chunks with titles, relevance scores, and source URLs. Returns "No relevant content found" if empty.

### web_search (Serper)

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Web search query |

**Returns**: Serper Google SERP results (title, URL, snippet, answer box if available). Max 3 organic results per call.
