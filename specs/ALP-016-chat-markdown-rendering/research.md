# Research: Chat Markdown Rendering

**Date**: 2026-03-11

## R-001: Markdown Rendering Library

**Decision**: Use existing `react-markdown` ^10.1.0 + `remark-gfm` ^4.0.1

**Rationale**: Already installed and used in `article-viewer.tsx` and `documentation-page-viewer.tsx`. Supports custom component overrides via `components` prop, which is needed for code blocks (copy button) and links (target=_blank). Handles streaming content well since it re-renders on each prop change.

**Alternatives considered**:
- `marked` + `DOMPurify`: Lower-level, requires manual React integration, no component overrides
- `markdown-it`: Similar to marked, would need additional React wrapper
- Custom parser: Over-engineering for standard markdown

## R-002: Syntax Highlighting

**Decision**: Use `rehype-highlight` (highlight.js-based rehype plugin)

**Rationale**: Lightweight rehype plugin that integrates directly into react-markdown's plugin pipeline. Adds language-specific syntax highlighting to fenced code blocks when a language tag is present. Highlight.js supports 190+ languages with auto-detection fallback. Only needs a CSS theme import — no additional component wiring for basic highlighting.

**Alternatives considered**:
- `react-syntax-highlighter`: Heavier bundle (~200KB), provides its own React component. More control but unnecessary complexity since we already use react-markdown's component overrides for the copy button.
- `rehype-prism-plus`: Prism-based, similar approach. Highlight.js has better language auto-detection which is useful when LLM responses omit language tags.
- `shiki`: Server-side highlighting, not suitable for streaming client content.

## R-003: HTML Sanitization (XSS Prevention)

**Decision**: Use `rehype-sanitize` with default schema

**Rationale**: Plugs into react-markdown's rehype pipeline. Default schema strips dangerous HTML (script, event handlers, etc.) while preserving safe structural elements. react-markdown already escapes HTML by default, but rehype-sanitize adds defense-in-depth, especially important since we're adding rehype-highlight which operates on the AST before rendering.

**Alternatives considered**:
- `DOMPurify`: Client-side DOM sanitizer, but would require post-render sanitization rather than AST-level prevention
- React-markdown's built-in escaping only: Sufficient for basic cases but rehype-sanitize provides explicit whitelist control

## R-004: Code Block Copy Button

**Decision**: Custom `CodeBlock` component via react-markdown's `components.pre` override

**Rationale**: react-markdown allows overriding any HTML element renderer. Override `pre` to wrap code blocks with a relative-positioned container that includes a copy button. Uses `navigator.clipboard.writeText()` for copying. The code content is extracted from the `children` prop (the inner `code` element's text content).

**Pattern**: Existing article viewers use `<ReactMarkdown remarkPlugins={[remarkGfm]}>` with the default `prose` class wrapper. The chat version will add `rehypePlugins` and `components` overrides while keeping the same remark pipeline.

## R-005: Streaming Compatibility

**Decision**: No special handling needed — react-markdown re-renders on prop changes

**Rationale**: The chat window updates `message.content` by appending tokens (see `chat-window.tsx` lines 103-112). Since `ReactMarkdown` is a React component that takes `children` as a prop, it naturally re-renders as content grows. Partial markdown (e.g., an unclosed code block mid-stream) may temporarily render as plain text until the closing delimiter arrives — this is acceptable and expected behavior.

**Risk**: Very long messages with complex markdown could cause rendering lag during streaming. Mitigation: not needed for MVP — react-markdown's performance is sufficient for typical LLM response lengths.

## R-006: Styling Approach

**Decision**: Use Tailwind `prose` classes scoped to assistant message bubble, with custom overrides for chat context

**Rationale**: The existing article/documentation viewers use `prose prose-sm dark:prose-invert max-w-none`. For chat bubbles, the same base classes work but need size adjustments:
- `prose-sm` for compact chat sizing
- `dark:prose-invert` for dark mode support
- `max-w-none` to fill bubble width
- Custom overrides for code block background to match chat theme (muted background)

**Note**: The project doesn't have `@tailwindcss/typography` in tailwind.config.ts plugins, but the `prose` classes are used in existing components. This needs verification — if prose classes aren't working, the typography plugin must be added.
