# Quickstart: Chat Markdown Rendering

## Prerequisites

- Node.js 18+
- yarn

## Setup

```bash
cd next-frontend
yarn install    # installs new deps: rehype-highlight, rehype-sanitize
yarn dev        # start dev server
```

## Verify

1. Open the chat interface in the dashboard
2. Ask a question that produces a markdown-rich response (e.g., "Explain how X works with code examples")
3. Verify:
   - Headings, bold, italic, lists render with proper formatting
   - Code blocks show syntax highlighting and a copy button
   - Links open in new tabs
   - User messages display as plain text (no markdown rendering)

## New Dependencies

| Package | Purpose |
|---------|---------|
| `rehype-highlight` | Syntax highlighting for fenced code blocks via highlight.js |
| `rehype-sanitize` | HTML sanitization to prevent XSS in markdown content |

## Files Changed

| File | Change |
|------|--------|
| `next-frontend/components/chat/chat-message.tsx` | Add ReactMarkdown rendering for assistant messages |
| `next-frontend/components/chat/code-block.tsx` | New — code block with syntax highlighting + copy button |
| `next-frontend/package.json` | Add rehype-highlight, rehype-sanitize |
