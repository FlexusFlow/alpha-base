# Data Model: Chat Markdown Rendering

**Date**: 2026-03-11

## No Data Model Changes

This feature is a frontend-only rendering change. No new entities, database tables, or API models are introduced.

### Existing Entities (unchanged)

- **ChatMessage**: `{ role: "user" | "assistant", content: string, sources?: string[], sourceTypes?: string[] }` — the `content` field already contains markdown-formatted text from the AI backend. No schema changes needed.
