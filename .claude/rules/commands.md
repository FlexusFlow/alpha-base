# Dev Commands

```bash
# Backend
cd backend && uv run uvicorn app.main:app --reload --port 8000
cd backend && uv run pytest
cd backend && uv run ruff check .

# Frontend
cd next-frontend && yarn dev
cd next-frontend && yarn build
cd next-frontend && yarn lint
```
