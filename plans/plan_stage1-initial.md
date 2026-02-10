# Tech task
Create application based on the current code base wich is PoC

I need the application (frontend and backend) that allows user to create/update his Vector database and use it later

Stage 1:

Frontend application React + MUI components + tailwind css classes
Backend application is Python with FastAPI

Frontend app has Home page with the ability to input Youtube channel link and display it summary in a special way. Will be described below
User click submit button and frontend calls api method v1/api/youtube/preview?url=<channel_url>



Backend application implements GET v1/api/youtube/preview with url parameter
application scrapes video page of the channel, defines categories, scrapes video titles, urls, views count, sorts by popularity and returns data in the well structured format that includes above fields and category name for each video
applications creates python class YTChannelPrivew(BaseModal) using pydantic package

Frontend shows the response data 
- Channel title, 
- clickable url
- table with the videos. table allows to select all or particular videos
Frontend presents "Add to my knowledge" button that submits required input as body to the POST v1/app/knowledge/youtube/add 
Please research packages that can trascribe youtube videos and define the input parameter they might need

After submitting, backend start the process and makes immediate reponse like "We are updating you knowledge base"

Application need to provide mechanism to notify user that job is sucessfully completed or error happened


Backend application uses LangChain and DeepLake for storing knowledge base in vectorized data and uses these data for extending context while sending messages to the LLM

After successfully transcribe the video script it should be added to the Deep Lake vector database. Please research and define do we need to vectorize eeach script separately after it is transribaed or wait till all scripts are subsribed and add them to the vectory database at once?


# Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 ZipTrader Knowledge Base App - Stage 1 Implementation Plan                    

 Context

 The existing PoC has YouTube transcript scraping (yt-dlp + VTT parsing), video
 categorization (regex-based, 5 categories), and 46 transcribed markdown files.
 The goal is to build a full-stack app (React + FastAPI) that lets users preview a
  YouTube channel's videos, select videos, transcribe them, and store them in a
 DeepLake vector database for RAG-based LLM context.

 ---
 Project Structure

 ziptrader/
 ├── .env                          # OPENAI_API_KEY
 ├── .gitignore
 ├── backend/
 │   ├── pyproject.toml            # uv-managed deps
 │   ├── .python-version           # 3.12
 │   ├── app/
 │   │   ├── __init__.py
 │   │   ├── main.py               # FastAPI app, CORS
 │   │   ├── config.py             # pydantic-settings
 │   │   ├── dependencies.py       # DI for JobManager, Settings
 │   │   ├── models/
 │   │   │   ├── youtube.py        # YTVideo, YTChannelPreview
 │   │   │   └── knowledge.py      # KnowledgeAddRequest/Response, JobStatus
 │   │   ├── routers/
 │   │   │   ├── youtube.py        # GET /v1/api/youtube/preview
 │   │   │   ├── knowledge.py      # POST /v1/api/knowledge/youtube/add, GET
 jobs/{id}
 │   │   │   └── events.py         # GET /v1/api/events/stream/{job_id} (SSE)
 │   │   ├── services/
 │   │   │   ├── youtube_scraper.py  # yt-dlp Python API, channel scraping
 │   │   │   ├── categorizer.py      # Ported from PoC categorize_videos.py
 │   │   │   ├── transcriber.py      # youtube-transcript-api + yt-dlp fallback
 │   │   │   ├── vectorstore.py      # LangChain + DeepLake + OpenAI embeddings
 │   │   │   └── job_manager.py      # In-memory job tracking + SSE pub/sub
 │   │   └── utils/
 │   │       └── text.py             # sanitize_filename, parse_vtt (from PoC)
 │   ├── knowledge_base/            # Moved from root
 │   │   ├── transcripts/           # 46 existing .md files
 │   │   └── deeplake_store/        # Vector DB storage (gitignored)
 │   └── tests/
 ├── frontend/
 │   ├── package.json
 │   ├── vite.config.ts
 │   ├── tailwind.config.js
 │   ├── tsconfig.json
 │   ├── .env                      # VITE_API_BASE_URL=http://localhost:8000
 │   └── src/
 │       ├── main.tsx
 │       ├── App.tsx
 │       ├── api/                   # client.ts, youtube.ts, knowledge.ts,
 events.ts
 │       ├── components/            # Layout, VideoTable, ChannelInfo,
 JobNotification
 │       ├── pages/                 # HomePage.tsx
 │       ├── hooks/                 # useSSE.ts, useChannelPreview.ts
 │       ├── types/                 # youtube.ts, knowledge.ts
 │       └── theme/                 # MUI theme config
 └── poc/                           # Archived PoC scripts

 ---
 Backend Implementation (ordered)

 Phase A: Foundation

 1. Scaffold - Create backend/ dir, pyproject.toml with deps:
   - fastapi[standard], uvicorn[standard], pydantic, pydantic-settings
   - yt-dlp, youtube-transcript-api
   - langchain, langchain-openai, langchain-text-splitters, langchain-community
   - deeplake, openai, sse-starlette
 2. Config (app/config.py) - pydantic-settings.BaseSettings loading from .env:
   - openai_api_key, deeplake_path (default: ./knowledge_base/deeplake_store),
 transcripts_dir, cors_origins
   - embedding_model (default: text-embedding-3-small), chunk_size (1000),
 chunk_overlap (200)
   - preview_video_limit (default: 100)
 3. Pydantic models (app/models/youtube.py):
   - YTVideo: video_id, title, url, views, category
   - YTChannelPreview: channel_title, channel_url, total_videos, categories
 (dict), videos (list)
 4. Utils (app/utils/text.py) - Copy verbatim from PoC:
   - sanitize_filename() from transcribe_educational.py:31-39
   - parse_vtt() from transcribe_educational.py:42-69
 5. Categorizer (app/services/categorizer.py) - Copy categorize_video() from
 categorize_videos.py:1-67 verbatim (pure function, only re dependency)
 6. YouTube scraper (app/services/youtube_scraper.py):
   - Use yt_dlp.YoutubeDL Python API with extract_flat="in_playlist" (no download,
  metadata only)
   - Normalize channel URL variants → /videos page
   - Categorize each video title, sort by views desc
   - Apply configurable limit (default 100 videos) with ?limit=N query param
   - Return YTChannelPreview
   - Run in asyncio.to_thread() since yt-dlp is blocking
 7. YouTube router (app/routers/youtube.py) - GET
 /v1/api/youtube/preview?url=...&limit=100
 8. App entry (app/main.py) - FastAPI app factory with CORS

 8. Checkpoint: curl the preview endpoint against a real channel

 Phase B: Jobs & Transcription Pipeline

 9. Knowledge models (app/models/knowledge.py):
   - KnowledgeAddRequest: channel_title, videos list
   - KnowledgeAddResponse: job_id, message, total_videos
   - JobStatusResponse: job_id, status, progress, processed/failed counts, message
 10. Job manager (app/services/job_manager.py):
   - In-memory dict of jobs + asyncio.Queue-based SSE pub/sub
   - create_job(), update_job(), get_job(), subscribe()
 11. Transcriber (app/services/transcriber.py):
   - Primary: youtube-transcript-api (instant, free, no API key)
   - Fallback: yt-dlp Python API for auto-sub download + parse_vtt()
   - save_transcript_md() using existing PoC format: # {title}\n\n**Video:**
 {url}\n\n---\n\n{text}
 12. Knowledge router (app/routers/knowledge.py):
   - POST /v1/api/knowledge/youtube/add - create job, start BackgroundTasks,
 return immediately
   - GET /v1/api/knowledge/jobs/{job_id} - poll job status
 13. SSE router (app/routers/events.py):
   - GET /v1/api/events/stream/{job_id} - SSE stream using sse-starlette
 14. Background job processor - loop through videos, transcribe each, update job
 progress via SSE, then batch vectorize

 14. Checkpoint: POST a 2-video job, verify transcripts created, SSE events flow

 Phase C: Vector Store

 15. Vector store (app/services/vectorstore.py):
   - OpenAIEmbeddings (text-embedding-3-small)
   - RecursiveCharacterTextSplitter (1000 chars, 200 overlap)
   - DeepLake.from_texts() for batch ingestion
   - All transcripts batch-vectorized after transcription completes (not
 individually)
 16. Wire vectorization into the background job as the final step

 16. Checkpoint: Verify DeepLake store created after job completes

 ---
 Frontend Implementation (ordered)

 Phase D: Scaffold & Core UI

 17. Scaffold - npm create vite@latest frontend -- --template react-ts
 18. Install deps - @mui/material, @mui/icons-material, @emotion/react,
 @emotion/styled, @mui/x-data-grid, tailwindcss, @tailwindcss/vite, axios
 19. TypeScript types (src/types/) - Mirror backend models
 20. API client (src/api/) - Axios wrapper, previewChannel(), addToKnowledge()
 21. Components:
   - Layout.tsx - MUI AppBar + container
   - ChannelInfo.tsx - Channel title, clickable URL, category summary chips
   - VideoTable.tsx - MUI DataGrid with checkbox selection, columns: title, views,
  category, link
   - LoadingOverlay.tsx - Circular progress backdrop
 22. HomePage (src/pages/HomePage.tsx) - State machine: idle → loading → preview
 ready → submitting → processing → done

 22. Checkpoint: Full preview flow works end-to-end

 Phase E: Notifications

 23. SSE integration - EventSource helper (src/api/events.ts), useSSE hook
 24. JobNotification.tsx - MUI Snackbar showing progress, success/error
 25. Wire "Add to my knowledge" → SSE progress → completion notification

 25. Checkpoint: Full end-to-end flow working

 ---
 Key Technical Decisions
 Decision: Transcription
 Choice: youtube-transcript-api primary, yt-dlp fallback
 Why: Free, instant, no API key; fallback covers edge cases
 ────────────────────────────────────────
 Decision: Notifications
 Choice: SSE (Server-Sent Events)
 Why: Unidirectional, auto-reconnect, simpler than WebSocket
 ────────────────────────────────────────
 Decision: Background tasks
 Choice: FastAPI BackgroundTasks
 Why: Zero infra overhead, adequate for single-user Stage 1
 ────────────────────────────────────────
 Decision: Job state
 Choice: In-memory dict
 Why: Ephemeral, single-process, no DB needed for Stage 1
 ────────────────────────────────────────
 Decision: Vector storage
 Choice: Local filesystem (DeepLake)
 Why: No account needed, simple for Stage 1
 ────────────────────────────────────────
 Decision: Embeddings
 Choice: OpenAI text-embedding-3-small
 Why: Cheapest option, good quality
 ────────────────────────────────────────
 Decision: Vectorization
 Choice: Batch after all transcripts
 Why: 10-100x faster than individual inserts
 ────────────────────────────────────────
 Decision: Preview limit
 Choice: Default 100 videos
 Why: Fast response; large channels can be slow otherwise
 ────────────────────────────────────────
 Decision: Channel scraping
 Choice: yt-dlp Python API (not subprocess)
 Why: Structured data, proper error handling, no temp files
 ────────────────────────────────────────
 Decision: Video table
 Choice: MUI DataGrid
 Why: Built-in selection, sorting, virtualization
 ────────────────────────────────────────
 Decision: Frontend routing
 Choice: None (single page)
 Why: Only one page in Stage 1
 Code Reuse from PoC
 Source: categorize_videos.py:1-67 (categorize_video)
 Destination: backend/app/services/categorizer.py
 Changes: None - copy verbatim
 ────────────────────────────────────────
 Source: transcribe_educational.py:31-39 (sanitize_filename)
 Destination: backend/app/utils/text.py
 Changes: None - copy verbatim
 ────────────────────────────────────────
 Source: transcribe_educational.py:42-69 (parse_vtt)
 Destination: backend/app/utils/text.py
 Changes: None - copy verbatim
 ────────────────────────────────────────
 Source: transcribe_educational.py:72-136 (download_transcript)
 Destination: backend/app/services/transcriber.py
 Changes: Refactor: subprocess → yt-dlp Python API, return text instead of writing

   file
 ────────────────────────────────────────
 Source: knowledge_base/transcripts/*.md (46 files)
 Destination: backend/knowledge_base/transcripts/
 Changes: Move as-is
 Verification

 1. Backend preview: curl
 "http://localhost:8000/v1/api/youtube/preview?url=https://youtube.com/@ZipTrader"
  → verify structured response with categories + videos sorted by views
 2. Transcription job: POST 2-3 videos → verify .md files created in transcripts
 dir
 3. SSE: Subscribe to job SSE stream → verify progress events arrive in real-time
 4. Vectorization: After job completes → verify DeepLake store exists with correct
  chunk count
 5. Full E2E: Enter channel URL in UI → preview → select videos → add to knowledge
  → see progress → completion notification

