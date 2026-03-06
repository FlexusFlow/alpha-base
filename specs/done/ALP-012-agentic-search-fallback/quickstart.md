# Quickstart: Agentic Search with Web Fallback

**Feature**: ALP-012

## Prerequisites

- Backend running (`cd backend && uv run uvicorn app.main:app --reload --port 8000`)
- Frontend running (`cd next-frontend && yarn dev`)
- Supabase project connected with auth working
- At least one YouTube channel transcribed in the knowledge base (for KB queries)
- `SERPER_API_KEY` set in `backend/.env` (get free key from https://serper.dev)

## Verification Scenarios

### Scenario 1: KB-Only Mode (Default — Toggle OFF)

1. Open a project chat in the UI
2. Verify "Extended search" checkbox is visible and **unchecked** by default
3. Ask a question about content in your KB: "What are the main topics discussed in [channel name]?"
4. **Expected**: Response arrives with KB source links, NO source label prefix
5. **Verify**: Response time is comparable to pre-feature (~3-5 seconds)

### Scenario 2: KB-Only Mode — Question Not in KB

1. With "Extended search" unchecked, ask about something NOT in your KB: "What is the current S&P 500 price?"
2. **Expected**: Response is "I don't have information about this in my knowledge base." — no general knowledge, no web search
3. **Verify**: No agent loop, no tool calls in backend logs

### Scenario 3: Extended Search — Web Fallback

1. Check "Extended search"
2. Ask the same question: "What is the current S&P 500 price?"
3. **Expected**: Response arrives with a "From web search:" prefix and includes web URLs in sources
4. **Verify**: Response arrives within 10 seconds

### Scenario 4: Extended Search — KB Still Primary

1. With "Extended search" checked, ask a question that IS in your KB
2. **Expected**: Response comes from KB with source links, NO source label prefix (KB is primary even in extended mode)

### Scenario 5: Extended Search Toggle Off Again

1. Uncheck "Extended search"
2. Ask a question not in KB
3. **Expected**: Response is "I don't have information about this in my knowledge base." — KB-only mode restored

### Scenario 6: API Key Not Configured

1. Remove `serper_api_key` from `backend/.env` and restart backend
2. Refresh the chat page
3. Check "Extended search"
4. **Expected**: A warning icon (amber triangle) appears next to the toggle with tooltip "Web search is not configured and not available"
5. Ask a question not in KB
6. **Expected**: Response uses general knowledge (no web search attempted), labeled "From general knowledge:"
7. Restore `serper_api_key` and restart backend

### Scenario 6: Rate Limiting

1. Set `WEB_SEARCH_RATE_LIMIT=3` and `WEB_SEARCH_RATE_WINDOW=60` in `backend/.env` (3 searches per minute)
2. Restart backend
3. Ask 4 web-search-triggering questions in quick succession
4. **Expected**: First 3 get web search results. 4th falls back to general knowledge.
5. Wait 60 seconds, ask another web search question
6. **Expected**: Web search works again

### Scenario 7: Empty Knowledge Base (New User)

1. Create a new project (or use a user with no KB content)
2. Ask any question
3. **Expected**: System falls back to web search or general knowledge — no error, no "add content first" gate

### Scenario 8: General Knowledge (No Tools Needed)

1. Ask a conceptual question: "Explain what dollar-cost averaging means"
2. **Expected**: Response may come from KB if relevant content exists, otherwise from general knowledge with appropriate label

## Environment Variables

```bash
# Required for web search
SERPER_API_KEY=xxxxxxxxxxxxx

# Optional (with defaults)
WEB_SEARCH_RATE_LIMIT=50          # max web searches per user per window
WEB_SEARCH_RATE_WINDOW=86400      # window in seconds (default: 24h)
RAG_CONFIDENCE_THRESHOLD=0.75     # fast path threshold (1.0 to disable)
```

## Troubleshooting

| Issue | Check |
|-------|-------|
| Warning icon always showing | Is `serper_api_key` set and backend restarted? |
| Web search never triggers | Is "Extended search" checked? Check backend logs for "web search" entries |
| Slow responses | Check `RAG_CONFIDENCE_THRESHOLD` — if too low, everything goes through fast path and never reaches web search |
| Rate limit too aggressive | Increase `WEB_SEARCH_RATE_LIMIT` or `WEB_SEARCH_RATE_WINDOW` |
