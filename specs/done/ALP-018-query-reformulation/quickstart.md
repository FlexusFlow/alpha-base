# Quickstart: Query Reformulation

## What Changes

1. **New file** (`backend/app/services/query_reformulation.py`):
   - `reformulate_query(query, settings)` — async function that calls gpt-4o-mini to correct typos/expand abbreviations
   - Returns corrected query string, or original on failure
   - Logs reformulation when query changes

2. **Modified** (`backend/app/config.py`):
   - Add `query_reformulation_model` setting (default "gpt-4o-mini")

3. **Modified** (`backend/app/services/chat.py`):
   - Call `reformulate_query()` before `vectorstore.similarity_search()` in `_stream_kb_only()`

4. **Modified** (`backend/app/services/agent_tools.py`):
   - Call `reformulate_query()` before `vectorstore.similarity_search()` in `search_knowledge_base` tool

## How to Test

1. Start backend: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
2. Start frontend: `cd next-frontend && yarn dev`
3. Add content about a well-known person (e.g., Nancy Pelosi) to your KB
4. Test typo correction:
   - Ask "what about nenci pilossi" → should find Nancy Pelosi content
   - Ask "nenci" → should find Nancy Pelosi content
   - Ask "Nancy Pelosi" → should work as before (no degradation)
5. Test abbreviation expansion:
   - Add content about "Federal Reserve"
   - Ask "fed interest rates" → should find Federal Reserve content
6. Test failure resilience:
   - Temporarily set an invalid API key → chat should still work using original query
7. Check backend logs for reformulation entries (original → corrected)
