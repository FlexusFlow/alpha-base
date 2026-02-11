#!/usr/bin/env bash
cd "$(dirname "$0")" && uv run uvicorn app.main:app --reload --port 8000
