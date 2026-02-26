# AlphaBase Backlog

## Priority: High

- **Per-User Knowledge Base Isolation** — The DeepLake vector store is shared across all users — not isolated per user. All users contribute to and consume the same shared vector store. Any user who adds YouTube channels or articles updates the knowledge base for everyone. Implement per-user isolation so each user has their own vector store partition. The project was originally built for a single client.
- **FastAPI Auth Middleware (Defense in Depth)** — Backend endpoints accept `user_id` from request body/query params. While Next.js API routes inject the authenticated user's ID, the FastAPI endpoints themselves are unauthenticated — any direct caller can pass any `user_id` and access another user's data (Supabase service-role client bypasses RLS). Add JWT validation middleware to FastAPI that extracts `user_id` from the Supabase access token. Affects all existing routers (`chat`, `knowledge`, `youtube`, `articles`, `deep_memory`). Discovered during ZIP-004 PR review.

## Priority: RAG Quality (implemented and waiting Knowledge Base migration to the DeepLake hub)

- **Deep Memory for RAG Accuracy (+22%)** — Train Deep Lake's Deep Memory feature on AlphaBase's dataset to boost retrieval accuracy by up to 22%. Trains a lightweight transformation layer on top of existing embeddings, adapting them to financial/trading domain. Steps: (1) generate question-chunk pairs from existing transcripts via LLM, (2) `db.deep_memory.train(queries, relevance)`, (3) enable `deep_memory=True` on search. Requires Cloud DeepLake migration first. Especially valuable for trading jargon, ticker symbols, and domain-specific terminology that generic embeddings handle poorly. See technote: `.technotes/deep-memory-rag-accuracy.md`

## Existing Ideas

- Add the ability to view the transcript of transcribed videos.

## From: Customer Support Q&A Chatbot Article

- **Temperature 0 for Factual Mode** — "Factual Mode" toggle in the chat UI that drops temperature to 0 for deterministic, fact-grounded, citation-backed answers vs. creative analysis.
- **Multi-Source Context Attribution** — RAG responses should return structured `{"answer": "...", "sources": [...]}` format with clickable links to originals. Every chunk must carry `source` metadata (video URL+timestamp for transcripts, article URL for web content, source_type for filtering). UI renders sources as clickable references under each answer. Pattern validated by RetrievalQAWithSourcesChain approach. See technote: `.technotes/qa-chatbot-with-sources.md`
- **Cloud DeepLake Migration** — Migrate from local DeepLake to Activeloop Cloud (migration path documented in AB-0069). Enables persistent, shared vector stores and better scalability. Deep Lake 3.71+ includes HNSW index for sub-second ANN search at scale (35M+ embeddings) and is ~80% cheaper than Pinecone/Qdrant/Weaviate.
- **Custom Chunking Strategies per Source Type** — Articles have headings/paragraphs; transcripts are continuous speech. Use source-aware splitting (e.g., HTMLHeaderTextSplitter for articles, RecursiveCharacterTextSplitter for transcripts).

## From: Conversation Intelligence / SalesCopilot Article

- **Structure-Aware Transcript Splitting** — YouTube transcripts have natural structure (topic shifts, speaker pauses, segment boundaries). Instead of blind 1000-char chunks, split on semantic boundaries (topic changes, long pauses in timestamps). Highest-impact improvement to RAG answer quality.
- **Objection/Question Detection Pattern** — Detect investment-related questions in the knowledge base (e.g., "what about risk?", "why did it drop?") and pre-index them as Q&A pairs for better retrieval.
- **Context-Aware Response Recommendations** — Classify query type (market analysis, stock pick, educational, macro commentary — matching existing categories from AB-0002) and tailor retrieval strategy per category.

## From: YouTube Video Summarizer (Whisper + LangChain) Article
https://learn.activeloop.ai/courses/take/langchain/multimedia/46318091-create-a-youtube-video-summarizer-using-whisper-and-langchain

- **Whisper as 3rd Transcription Fallback (available for paid subscriptions only) **  — Add OpenAI Whisper (local model) as a third fallback when both `youtube-transcript-api` and yt-dlp subtitles fail (videos without any subtitles). Downloads audio via yt-dlp, transcribes locally. Trade-off: requires audio download and GPU for speed, but guarantees transcription for any video.
- **Auto-Summary on Ingest** — Generate a short summary of each video at ingestion time using LangChain summarize chains (map_reduce for long videos, stuff for short). Display in UI alongside video title, and use as additional context in RAG retrieval. Strategies: stuff (all text in one prompt), map_reduce (summarize chunks → merge), refine (iteratively refine summary chunk by chunk).

## From: Voice Assistant for Knowledge Base Article
https://learn.activeloop.ai/courses/take/langchain/multimedia/46318140-creating-a-voice-assistant-for-your-knowledge-base
- **Voice Input in Chat (Microphone Button)** — Add a microphone button to ChatWindow. Use browser Web Speech API (free, no backend) to transcribe user's voice into text, then send to existing RAG pipeline. Lowest effort, highest ROI first step toward voice.
- **Text-to-Speech Responses** — Озвучивание ответов RAG-чата через OpenAI TTS API или ElevenLabs. Полезно для мобильного сценария — слушать саммари/ответы на ходу. Add a "play" button next to each assistant message.
- **Full Voice Mode** — Combine voice input + TTS output for a hands-free "Jarvis for trader" experience. Speak a question about the market → get a spoken answer grounded in the knowledge base.

## From: Chat History Management Review

- **Server-Side Chat History with Trimming** — Current chat sends unbounded conversation history from frontend on every request. Migrate to server-side history: backend loads recent messages from Supabase `chat_messages` table, applies sliding window (last N turns) or token-budget trimming before sending to LLM. Frontend sends only `project_id` + `message`, no history payload. Reduces request size, centralizes history policy, prevents context window overflow. See technote: `.technotes/chat-history-management.md`

## From: Self-Critique Chain Article

- **RAG Output Guard (Self-Critique)** — Add a Self-Critique Chain after RAG answer generation to validate responses against constitutional principles: (1) answer must be grounded only in retrieved context, no hallucinations; (2) auto-append "not financial advice" disclaimer when response contains specific stock recommendations; (3) verify transcript quotes are not distorted. Complements "Temperature 0 for Factual Mode" — both improve answer reliability for financial content.
