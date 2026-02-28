# AlphaBase Backlog

## Priority: RAG Quality (implemented and waiting Knowledge Base migration to the DeepLake hub)

- **Deep Memory for RAG Accuracy (+22%)** — Train Deep Lake's Deep Memory feature on AlphaBase's dataset to boost retrieval accuracy by up to 22%. Trains a lightweight transformation layer on top of existing embeddings, adapting them to financial/trading domain. Steps: (1) generate question-chunk pairs from existing transcripts via LLM, (2) `db.deep_memory.train(queries, relevance)`, (3) enable `deep_memory=True` on search. Requires Cloud DeepLake migration first. Especially valuable for trading jargon, ticker symbols, and domain-specific terminology that generic embeddings handle poorly. See technote: `.technotes/011-deep-memory-rag-accuracy.md`

## Priority: Medium

- **Cookie Failure Detection & Status Marking** — When a scrape or transcription fails due to an authentication error (e.g., 403, Cloudflare challenge) while using stored cookies, mark the cookie record as compromised/invalid (e.g., `status = "failed"` on `user_cookies` table). Display a warning badge in the cookie management UI so the user knows to re-upload. Currently cookie expiry is optimistic (uses latest expiry from the file), so runtime failure detection is needed to catch revoked sessions or invalidated tokens.

## From: Agentic Search Fallback Chain Analysis

- **Agentic Search with Web Fallback** — Replace the current "not found in KB → ask user to confirm LLM fallback" flow with a single ReAct agent that autonomously searches knowledge base first, falls back to web search (Serper/Tavily), and labels the source in every response. Removes confirmation friction, adds real-time web knowledge. Phase 1: add web search tool + source labels. Phase 2: confidence-based routing to skip agent loop for high-confidence KB hits. See technote: `.technotes/014-agentic-search-fallback-chain.md`

## Existing Ideas

- Add the ability to view the transcript of transcribed videos.

## From: Customer Support Q&A Chatbot Article

- **Temperature 0 for Factual Mode** — "Factual Mode" toggle in the chat UI that drops temperature to 0 for deterministic, fact-grounded, citation-backed answers vs. creative analysis.
- **Multi-Source Context Attribution** — RAG responses should return structured `{"answer": "...", "sources": [...]}` format with clickable links to originals. Every chunk must carry `source` metadata (video URL+timestamp for transcripts, article URL for web content, source_type for filtering). UI renders sources as clickable references under each answer. Pattern validated by RetrievalQAWithSourcesChain approach. See technote: `.technotes/010-qa-chatbot-with-sources.md`
- **Cloud DeepLake Migration** — Migrate from local DeepLake to Activeloop Cloud (migration path documented in AB-0069). Enables persistent, shared vector stores and better scalability. Deep Lake 3.71+ includes HNSW index for sub-second ANN search at scale (35M+ embeddings) and is ~80% cheaper than Pinecone/Qdrant/Weaviate. See technote: `.technotes/001-deeplake-hnsw-index.md`
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
