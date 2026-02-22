# Quickstart: ZIP-003 Article Scraping Migration

## New Dependencies

### Python Backend
```bash
cd backend
uv add playwright
playwright install chromium
uv add turndown  # HTML→Markdown (or use markdownify — see research.md)
```

### Next.js Frontend
```bash
cd next-frontend
yarn add @anthropic-ai/sdk react-markdown remark-gfm jspdf
```

## Database Migration

Apply `006_articles.sql` via Supabase Dashboard (SQL Editor):
- Creates `articles` table with RLS
- Creates `article_chat_messages` table with RLS
- See `data-model.md` for full schema

## Environment Variables

### Next.js (.env.local)
```
ANTHROPIC_API_KEY=sk-ant-...  # For AI summarize + chat
```

### Python Backend (.env)
No new env vars needed — uses existing Supabase service role key.

## Dev Workflow

```bash
# Terminal 1: Backend
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd next-frontend && yarn dev
```

## Key File Locations (planned)

### Backend (new)
- `backend/app/routers/articles.py` — scrape endpoint
- `backend/app/services/article_scraper.py` — Playwright scraping logic
- `backend/app/models/articles.py` — Pydantic models

### Frontend (new)
- `next-frontend/app/api/articles/` — API route handlers
- `next-frontend/app/dashboard/knowledge/articles/` — article pages
- `next-frontend/components/articles/` — article UI components
- `next-frontend/lib/types/articles.ts` — TypeScript types
