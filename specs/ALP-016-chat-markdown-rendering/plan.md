# Implementation Plan: Chat Markdown Rendering

**Branch**: `feature/ALP-016-chat-markdown-rendering` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/ALP-016-chat-markdown-rendering/spec.md`

## Summary

Render AI assistant chat messages as formatted markdown in the `ChatMessageBubble` component. The project already uses `react-markdown` + `remark-gfm` in article/documentation viewers. This plan reuses those dependencies and adds `rehype-highlight` for syntax highlighting, plus custom component overrides for code blocks (copy button) and links (new tab). User messages remain plain text.

## Technical Context

**Language/Version**: TypeScript (Next.js 15, React 19)
**Primary Dependencies**: react-markdown ^10.1.0 (existing), remark-gfm ^4.0.1 (existing), rehype-highlight (new), rehype-sanitize (new)
**Storage**: N/A — frontend-only change
**Testing**: Manual testing (existing project pattern) + yarn build verification
**Target Platform**: Web (all modern browsers)
**Project Type**: Web application (frontend-only change)
**Performance Goals**: Markdown renders without perceptible delay during token-by-token SSE streaming
**Constraints**: Must work with streaming content (tokens appended incrementally); must fit within chat bubble max-width (75%)
**Scale/Scope**: Single component change (`ChatMessageBubble`), one new utility component (`CodeBlock`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TS Frontend, Python Backend | PASS | Frontend-only TypeScript change |
| II. API-Boundary Separation | PASS | No API changes — rendering only |
| III. Supabase as Source of Truth | N/A | No data changes |
| IV. Background Jobs with Real-Time Feedback | PASS | Compatible with existing SSE streaming |
| V. Simplicity and Pragmatism | PASS | Reuses existing `react-markdown` + `remark-gfm`; adds minimal new deps |
| VI. Per-User Data Isolation | N/A | No data changes |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/ALP-016-chat-markdown-rendering/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
next-frontend/
├── components/
│   └── chat/
│       ├── chat-message.tsx       # MODIFY — add markdown rendering for assistant messages
│       └── code-block.tsx         # NEW — code block with syntax highlighting + copy button
└── package.json                   # MODIFY — add rehype-highlight, rehype-sanitize
```

**Structure Decision**: Minimal footprint — modify existing `ChatMessageBubble` component, add one new `CodeBlock` component in the same directory. No new directories needed.
