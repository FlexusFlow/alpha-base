# Tasks: Chat Markdown Rendering

**Feature Branch**: `feature/ALP-016-chat-markdown-rendering`
**Generated**: 2026-03-11
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Phase 1: Setup

- [x] T001 Install `rehype-highlight` and `rehype-sanitize` dependencies in `next-frontend/package.json` using yarn
- [x] T002 Verify `@tailwindcss/typography` is available for `prose` classes; if missing, install and add to `next-frontend/tailwind.config.ts` plugins array

## Phase 2: Foundational

- [x] T003 Create `CodeBlock` component in `next-frontend/components/chat/code-block.tsx` that wraps `<pre>` with a relative container, extracts language from child `<code>` className, displays a copy-to-clipboard button (using `navigator.clipboard.writeText()`), and shows copied/check feedback state

## Phase 3: User Story 1 — View Formatted AI Responses (P1)

**Goal**: AI assistant messages render markdown (headings, bold, italic, lists, code blocks with syntax highlighting) instead of plain text.

**Independent test**: Send a question that triggers a markdown-rich response. Verify headings, lists, bold/italic, and code blocks display with proper formatting and syntax highlighting.

- [x] T004 [US1] Modify `ChatMessageBubble` in `next-frontend/components/chat/chat-message.tsx` to conditionally render assistant messages with `<ReactMarkdown>` using `remarkPlugins={[remarkGfm]}` and `rehypePlugins={[rehypeHighlight, rehypeSanitize]}`; keep user messages as plain text with existing `whitespace-pre-wrap` div
- [x] T005 [US1] Add `components` prop override to `ReactMarkdown` in `next-frontend/components/chat/chat-message.tsx`: override `pre` with `CodeBlock` component from `code-block.tsx`
- [x] T006 [US1] Import a highlight.js CSS theme in `next-frontend/components/chat/chat-message.tsx` (or `code-block.tsx`) for syntax highlighting colors — choose a theme that works in both light and dark modes (e.g., `github` / `github-dark` or a neutral theme like `atom-one-dark`)
- [x] T007 [US1] Add Tailwind `prose prose-sm dark:prose-invert max-w-none` wrapper around the `ReactMarkdown` output in `next-frontend/components/chat/chat-message.tsx` for proper markdown typography styling; add custom overrides for code block backgrounds to match the chat muted theme

## Phase 4: User Story 2 — Inline Code and Links (P2)

**Goal**: Inline code has visual styling; links open in new tabs.

**Independent test**: Trigger a response with inline code and URLs. Verify inline code has monospace + background, links open in new tab.

- [x] T008 [US2] Add `components` prop override for `a` element in `ReactMarkdown` in `next-frontend/components/chat/chat-message.tsx` — render links with `target="_blank"` and `rel="noopener noreferrer"`, styled to be visually distinct (underline, appropriate color)
- [x] T009 [US2] Add `components` prop override for `code` (inline) element in `ReactMarkdown` in `next-frontend/components/chat/chat-message.tsx` — render inline code with monospace font, subtle background, and rounded padding (distinguish from block code by checking absence of parent `pre`)

## Phase 5: User Story 3 — User Messages Remain Plain Text (P3)

**Goal**: User messages display as plain text without markdown interpretation.

**Independent test**: Send a message containing `**hello**`. Verify it displays literally as `**hello**` not bold.

- [x] T010 [US3] Verify in `next-frontend/components/chat/chat-message.tsx` that the conditional rendering logic correctly bypasses ReactMarkdown for `role === "user"` messages — the existing `whitespace-pre-wrap` div must be preserved for user messages

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T011 Verify edge cases in `next-frontend/components/chat/chat-message.tsx`: malformed markdown renders gracefully, long code blocks have horizontal scroll (`overflow-x-auto` on `pre`), markdown tables render within bubble width
- [x] T012 Run `yarn build` in `next-frontend/` to verify no TypeScript errors or build failures
- [x] T013 Verify existing sources section in `next-frontend/components/chat/chat-message.tsx` renders unchanged below markdown content — sources links must not be affected by ReactMarkdown

## Dependencies

```text
T001 → T003, T004 (dependencies must be installed first)
T002 → T007 (prose classes need typography plugin)
T003 → T005 (CodeBlock component must exist before wiring)
T004 → T005, T006, T007, T008, T009 (base ReactMarkdown setup before overrides)
T010 → T004 (verify after conditional rendering is implemented)
T011, T012, T013 → all previous tasks
```

## Parallel Execution Opportunities

- **T001 + T002**: Independent setup tasks (different files)
- **T008 + T009**: Independent component overrides (link vs inline code, same file but different overrides)
- **T011 + T013**: Independent verification tasks

## Implementation Strategy

**MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T007) — delivers core markdown rendering with syntax highlighting and copy button. This alone provides the primary value.

**Incremental delivery**:
1. MVP (T001–T007): Full markdown rendering for assistant messages
2. +Phase 4 (T008–T009): Enhanced inline code and link handling
3. +Phase 5 (T010): Verify user message behavior preserved
4. +Phase 6 (T011–T013): Polish, edge cases, build verification
