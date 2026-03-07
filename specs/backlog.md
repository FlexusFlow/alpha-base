# AlphaBase Backlog

## Priority: Medium

## Existing Ideas

## From: Customer Support Q&A Chatbot Article

- **Temperature 0 for Factual Mode** — "Factual Mode" toggle in the chat UI that drops temperature to 0 for deterministic, fact-grounded, citation-backed answers vs. creative analysis.
- **Multi-Source Context Attribution (remaining gaps)** — Partially done: SSE `done` events already return `sources[]` + `source_types[]`, frontend renders clickable URL links, public API returns `{"answer", "sources"}`. Remaining work:
  1. ~~**Index articles in vectorstore**~~ — ✅ Done (ALP-014). Articles are now chunked and indexed in the user's per-user DeepLake dataset during scraping.
  2. **Add `source_type` to YouTube chunk metadata** — Documentation chunks have `source_type: "documentation"` but YouTube chunks have no `source_type` field. Add `source_type: "youtube"` during transcript vectorization (`knowledge.py`).
  3. **Return structured sources from backend** — Replace flat `sources: string[]` with `sources: [{url, title, source_type}]` in SSE `done` events and public API response. Backend already has `title`/`page_title` in chunk metadata but discards it before sending to frontend.
  4. **Rich source display in chat UI** — Frontend currently shows raw URLs only and ignores `source_types`. Render sources with titles, source type icons/badges (YouTube/Article/Docs/Web), and grouped by type.
  See technote: `.technotes/010-qa-chatbot-with-sources.md`
- **Custom Chunking Strategies per Source Type** — Articles have headings/paragraphs; transcripts are continuous speech. Use source-aware splitting (e.g., HTMLHeaderTextSplitter for articles, RecursiveCharacterTextSplitter for transcripts).

## From: Conversation Intelligence / SalesCopilot Article

- **Structure-Aware Transcript Splitting** — YouTube transcripts have natural structure (topic shifts, speaker pauses, segment boundaries). Instead of blind 1000-char chunks, split on semantic boundaries (topic changes, long pauses in timestamps). Highest-impact improvement to RAG answer quality.
- **Objection/Question Detection Pattern** — Detect investment-related questions in the knowledge base (e.g., "what about risk?", "why did it drop?") and pre-index them as Q&A pairs for better retrieval.
- **Context-Aware Response Recommendations** — Classify query type (market analysis, stock pick, educational, macro commentary — matching existing categories from AB-0002) and tailor retrieval strategy per category.

## From: YouTube Video Summarizer (Whisper + LangChain) Article
https://learn.activeloop.ai/courses/take/langchain/multimedia/46318091-create-a-youtube-video-summarizer-using-whisper-and-langchain

- **Whisper as 3rd Transcription Fallback (available for paid subscriptions only) **  — Add OpenAI Whisper (local model) as a third fallback when both `youtube-transcript-api` and yt-dlp subtitles fail (videos without any subtitles). Downloads audio via yt-dlp, transcribes locally. Trade-off: requires audio download and GPU for speed, but guarantees transcription for any video. See technote: `.technotes/002-youtube-summarizer-whisper-langchain.md`
- **Auto-Summary on Ingest** — Generate a short summary of each video at ingestion time using LangChain summarize chains (map_reduce for long videos, stuff for short). Display in UI alongside video title, and use as additional context in RAG retrieval. Strategies: stuff (all text in one prompt), map_reduce (summarize chunks → merge), refine (iteratively refine summary chunk by chunk). See technote: `.technotes/002-youtube-summarizer-whisper-langchain.md`

## From: Voice Assistant for Knowledge Base Article
https://learn.activeloop.ai/courses/take/langchain/multimedia/46318140-creating-a-voice-assistant-for-your-knowledge-base
- **Voice Input in Chat (Microphone Button)** — Add a microphone button to ChatWindow. Use browser Web Speech API (free, no backend) to transcribe user's voice into text, then send to existing RAG pipeline. Lowest effort, highest ROI first step toward voice. See technote: `.technotes/003-voice-assistant-knowledge-base.md`
- **Text-to-Speech Responses** — Озвучивание ответов RAG-чата через OpenAI TTS API или ElevenLabs. Полезно для мобильного сценария — слушать саммари/ответы на ходу. Add a "play" button next to each assistant message. See technote: `.technotes/003-voice-assistant-knowledge-base.md`
- **Full Voice Mode** — Combine voice input + TTS output for a hands-free "Jarvis for trader" experience. Speak a question about the market → get a spoken answer grounded in the knowledge base. See technote: `.technotes/003-voice-assistant-knowledge-base.md`

## From: Chat History Management Review

- **Server-Side Chat History with Trimming** — Current chat sends unbounded conversation history from frontend on every request. Migrate to server-side history: backend loads recent messages from Supabase `chat_messages` table, applies sliding window (last N turns) or token-budget trimming before sending to LLM. Frontend sends only `project_id` + `message`, no history payload. Reduces request size, centralizes history policy, prevents context window overflow. See technote: `.technotes/009-chat-history-management.md`

## From: Self-Critique Chain Article

- **RAG Output Guard (Self-Critique)** — Add a Self-Critique Chain after RAG answer generation to validate responses against constitutional principles: (1) answer must be grounded only in retrieved context, no hallucinations; (2) auto-append "not financial advice" disclaimer when response contains specific stock recommendations; (3) verify transcript quotes are not distorted. Complements "Temperature 0 for Factual Mode" — both improve answer reliability for financial content. See technote: `.technotes/004-self-critique-chain-output-guard.md`


## From: MCP Tools & Servers Research (ALP-001)

- **Evaluate Tavily vs Serper for Extended Search** — Tavily is a RAG-optimized search API that returns pre-extracted, structured content (vs Serper's raw SERP data). Run a side-by-side comparison on 20 representative queries from AlphaBase's chat to measure relevance and answer quality. If Tavily wins, consider replacing Serper in the agentic RAG chat (ALP-012). Free tier available. See technote: `.technotes/015-mcp-tools-research.md`
- **Add YouTube Transcript MCP to Dev Tooling** — Add `kimtaeyoon83/mcp-server-youtube-transcript` to Claude Code MCP config for faster transcript testing during development. Skips Whisper for videos with existing YouTube captions. See technote: `.technotes/015-mcp-tools-research.md`
- **Add Firecrawl MCP to Dev Tooling** — Add Firecrawl MCP server to Claude Code config for testing web scraping on JS-heavy sites. Supplements existing Playwright+markdownify pipeline. See technote: `.technotes/015-mcp-tools-research.md`
- **Add GitHub MCP to Dev Tooling** — Add official GitHub MCP server to Claude Code config for PR/issue automation. See technote: `.technotes/015-mcp-tools-research.md`
- **AlphaBase Knowledge Base MCP Server** (future) — Use FastMCP to auto-generate an MCP server from AlphaBase's FastAPI OpenAPI spec, enabling external AI tools to query user knowledge bases. Requires auth + per-user isolation. See technote: `.technotes/015-mcp-tools-research.md`

## Depricated packages still works but needs to be removed after langchain release stable 1.0 version
- **Migrate `create_react_agent` → `create_agent`** — `langgraph.prebuilt.create_react_agent` is deprecated since LangGraph v1.0 (to be removed in v2.0). Replace with `langchain.agents.create_agent` (param: `prompt` → `system_prompt`) once `langchain>=1.0` is released as stable. Single call site in `backend/app/services/chat.py`.