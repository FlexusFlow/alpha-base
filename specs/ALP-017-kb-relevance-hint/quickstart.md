# Quickstart: KB Relevance Hint

## What Changes

1. **Backend** (`backend/app/services/chat.py`):
   - New system prompt that always attempts best-effort answers (no canned refusal)
   - Compute `kb_relevant` from top vectorstore score vs threshold
   - Yield `kb_relevant` in done event

2. **Backend** (`backend/app/routers/chat.py`):
   - Pass `kb_relevant` through SSE done event

3. **Frontend** (`next-frontend/lib/types/chat.ts`):
   - Add `kbRelevant?: boolean` and `extendedSearch?: boolean` to `ChatMessage`

4. **Frontend** (`next-frontend/lib/api/chat.ts`):
   - Parse `kb_relevant` from done event, pass to `onDone` callback

5. **Frontend** (`next-frontend/components/chat/chat-window.tsx`):
   - Pass `extendedSearch` state and `kbRelevant` to message state

6. **Frontend** (`next-frontend/components/chat/chat-message.tsx`):
   - Render "For more relevant information, try using Extended search" hint below sources when `kbRelevant === false` and `extendedSearch !== true`

## How to Test

1. Start backend: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
2. Start frontend: `cd next-frontend && yarn dev`
3. Open chat, keep Extended search **unchecked**
4. Ask a question loosely related to KB content → should see answer + sources + hint
5. Ask a question directly answered by KB content → should see answer + sources, no hint
6. Ask a question with no KB content → should see "no results" message + hint
7. Check Extended search checkbox, repeat → hint should never appear
