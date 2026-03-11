# alphabase

Full-stack YouTube knowledge base app. All rules live in `.claude/rules/`.

<!-- MANUAL ADDITIONS START -->
## Communication
- Always respond in English, even if the user writes in another language (e.g., Russian). Only switch language if explicitly asked.
<!-- MANUAL ADDITIONS END -->

## Tech Notes (`.local/.technotes/`)

When an external article or technology is reviewed and a decision is made (adopt, reject, or defer), create a technote in `.local/.technotes/`:
- Summarize the article/technology
- Compare with AlphaBase's current approach
- Document **why** a particular option was chosen or rejected
- If something is added to `specs/backlog.md`, reference the corresponding technote

Format: `.local/.technotes/{NNN}-{topic-slug}.md` where `NNN` is the next sequential index (e.g., `015-`, `016-`). Check existing files to determine the next number.

Previous version before splitting Claude.md on claude rules
https://github.com/FlexusFlow/alpha-base/commit/3bee5231bef2feb86b9d83e60d91ea8dc833b5dd#diff-6ebdb617a8104a7756d0cf36578ab01103dc9f07e4dc6feb751296b9c402faf7

## Active Technologies
- TypeScript (Next.js 15, React 19) + Next.js App Router, shadcn/ui, Supabase JS client, lucide-react
- Supabase (PostgreSQL for metadata, Storage for files)
- DeepLake Cloud (Managed Tensor DB) with Deep Memory for RAG accuracy (ZIP-004)
- LangChain 0.3+ + langchain-deeplake for vector store operations
- LangGraph (prebuilt agents) + ChatOpenAI for agentic RAG chat (ALP-012)
- Serper (Google SERP API) for web search fallback — application-level config via `SERPER_API_KEY` env var, not per-user (ALP-012)
- Playwright + markdownify for web scraping (articles & documentation sites)
- sse-starlette for SSE streaming

## Known Limitations
- None currently tracked.

## Before SDD approach features
- see specs/implemented-features.md
- keep tracking implementations in specs/implemented-features.md like it was done in section
  ```
  ## Stage 7: Delete Scraped Channels (AB-0072)
  ```

## Recent Changes
- feature/ALP-016-chat-markdown-rendering: Render AI chat/summary content as formatted markdown with syntax highlighting, copy-to-clipboard on code blocks, collapsible AI summary, and relative link resolution for scraped articles.
- feature/ALP-015-youtube-source-type: Add `source_type: "youtube"` to YouTube chunk metadata for consistent source attribution across all content types.
- feature/ALP-014-index-articles-vectorstore: Index scraped articles in vector store for RAG chat, add backend DELETE endpoint with vectorstore cleanup, reject duplicate URLs.
