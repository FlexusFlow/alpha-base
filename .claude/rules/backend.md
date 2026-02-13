---
paths:
  - "backend/**"
---

# Backend Rules

- Follow standard Python conventions, use type hints
- FastAPI with routers/services/models pattern
- Use uv as the package manager

## Common Pitfalls

### SSE & Background Jobs
- SSE endpoint must send the current job state immediately on connect, before entering the event loop. Otherwise clients that connect after job start see stale "Processing" state.
- `JobManager` is a singleton via `get_job_manager()` — never instantiate a new one per-request.
- Add a 2-second delay between YouTube transcript requests to avoid rate limiting.

### YouTube & Transcription
- Use `youtube-transcript-api` first (free, instant). Only fall back to yt-dlp if it fails.
- yt-dlp: always use `extract_flat="in_playlist"` for metadata. Never download actual video/audio files.
- Channel/playlist deletion order: vector store entries → transcript files → DB records.

### Deployment
- DeepLake requires `libatomic1` — install it in the Dockerfile (`apt-get install -y libatomic1`).
- Production: bind to `0.0.0.0` with `$PORT` env var, no `--reload` flag.
