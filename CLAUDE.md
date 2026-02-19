# ziptrader

Full-stack YouTube knowledge base app. All rules live in `.claude/rules/`.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

## Tech Notes (`.technotes/`)

When an external article or technology is reviewed and a decision is made (adopt, reject, or defer), create a technote in `.technotes/`:
- Summarize the article/technology
- Compare with ZipTrader's current approach
- Document **why** a particular option was chosen or rejected
- If something is added to `specs/backlog.md`, reference the corresponding technote

Format: `.technotes/{topic-slug}.md`

Previous version before splitting Claude.md on claude rules
https://github.com/FlexusFlow/alpha-base/commit/3bee5231bef2feb86b9d83e60d91ea8dc833b5dd#diff-6ebdb617a8104a7756d0cf36578ab01103dc9f07e4dc6feb751296b9c402faf7

## Active Technologies
- TypeScript (Next.js 15, React 19) + Next.js App Router, shadcn/ui, Supabase JS client, lucide-reac (feature/ZIP-001-cookie-management)
- Supabase (PostgreSQL for metadata, Storage for files) (feature/ZIP-001-cookie-management)

## Before SDD approach features
- see ./implemented-features.md
- keep tracking implementations in i./mplemented-features.md like it was done in  section
  ```
  ## Stage 7: Delete Scraped Channels (AB-0072)
  ```

## Recent Changes
- feature/ZIP-001-cookie-management: Added TypeScript (Next.js 15, React 19) + Next.js App Router, shadcn/ui, Supabase JS client, lucide-reac
