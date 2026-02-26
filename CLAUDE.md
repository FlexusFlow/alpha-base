# alphabase

Full-stack YouTube knowledge base app. All rules live in `.claude/rules/`.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

## Tech Notes (`.local/.technotes/`)

When an external article or technology is reviewed and a decision is made (adopt, reject, or defer), create a technote in `.local/.technotes/`:
- Summarize the article/technology
- Compare with AlphaBase's current approach
- Document **why** a particular option was chosen or rejected
- If something is added to `specs/backlog.md`, reference the corresponding technote

Format: `.local/.technotes/{topic-slug}.md`

Previous version before splitting Claude.md on claude rules
https://github.com/FlexusFlow/alpha-base/commit/3bee5231bef2feb86b9d83e60d91ea8dc833b5dd#diff-6ebdb617a8104a7756d0cf36578ab01103dc9f07e4dc6feb751296b9c402faf7

## Active Technologies
- TypeScript (Next.js 15, React 19) + Next.js App Router, shadcn/ui, Supabase JS client, lucide-react
- Supabase (PostgreSQL for metadata, Storage for files)
- DeepLake Cloud (Managed Tensor DB) with Deep Memory for RAG accuracy (ZIP-004)
- LangChain + langchain-deeplake for vector store operations

## Known Limitations
- The DeepLake vector store is shared across all users — not isolated per user. Per-user knowledge base splitting is in the backlog (project was originally built for a single client).

## Before SDD approach features
- see specs/implemented-features.md
- keep tracking implementations in specs/implemented-features.md like it was done in section
  ```
  ## Stage 7: Delete Scraped Channels (AB-0072)
  ```

## Recent Changes
- feature/ZIP-006-public-rag-api: Public RAG API with API key management and rate limiting; removed legacy frontend and POC scripts
- feature/ZIP-005-failed-training-recovery: Phase-specific failure statuses, proceed/remove actions, expandable history rows, cloud-only gate
