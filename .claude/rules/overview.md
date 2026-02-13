# Project Overview

Full-stack YouTube knowledge base app: Python FastAPI backend, Next.js 15 frontend, DeepLake vector store, Supabase auth.

## Tech Stack

- **Backend**: Python 3.12+, FastAPI, LangChain + DeepLake, Supabase, uv package manager
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, TanStack Table

## Project Structure

```text
backend/                  # FastAPI backend
  app/
    routers/              # API route handlers
    services/             # Business logic
    models/               # Pydantic models
    config.py             # Settings
    main.py               # App entrypoint
  knowledge_base/         # Transcripts & vector store data
  tests/
next-frontend/            # Next.js 15 frontend (active)
  app/                    # App Router pages & API routes
  components/             # UI components (shadcn/ui)
  lib/                    # Supabase client, API helpers, types
  hooks/
frontend_legacy/          # IGNORE - legacy, kept for history only
poc/                      # Proof-of-concept scripts
plans/                    # Architecture & feature plans
specs/                    # Feature specifications
```
