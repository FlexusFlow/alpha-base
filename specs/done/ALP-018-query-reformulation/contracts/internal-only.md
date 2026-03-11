# Contract: Query Reformulation (Internal)

No API contract changes. This feature is entirely backend-internal:

- No new endpoints
- No changes to the `POST /v1/api/chat` request or response schema
- No changes to the SSE event format
- No frontend changes required

The reformulation function is an internal service used by `_stream_kb_only()` and `search_knowledge_base` tool before vectorstore queries.
