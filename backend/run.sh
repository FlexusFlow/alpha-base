#!/usr/bin/env bash
cd "$(dirname "$0")" && uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
