# Feature Specification: Chat Markdown Rendering

**Feature Branch**: `ALP-016-chat-markdown-rendering`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Message content that is shown in ChatMessageBubble component is formatted in md format. Component should show it following the md formatting rules"

## Clarifications

### Session 2026-03-11

- Q: Should fenced code blocks include language-specific syntax highlighting? → A: Yes, syntax highlighting when a language tag is provided.
- Q: Should fenced code blocks include a "copy to clipboard" button? → A: Yes, show a copy button.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View formatted AI responses (Priority: P1)

A user asks a question in the RAG chat. The AI assistant responds with markdown-formatted content including headings, bold/italic text, lists, and code blocks. The user sees the response rendered with proper visual formatting instead of raw markdown syntax.

**Why this priority**: This is the core value — AI responses are already markdown-formatted but displayed as plain text, making them hard to read. Proper rendering directly improves readability and usability of every chat interaction.

**Independent Test**: Send a question that triggers a response with markdown elements (headings, lists, code). Verify the response displays with proper formatting.

**Acceptance Scenarios**:

1. **Given** an AI response contains `**bold**` and `*italic*` text, **When** the message is displayed, **Then** the text appears bold and italic respectively (not showing asterisks)
2. **Given** an AI response contains a fenced code block with a language tag (e.g., ` ```python `), **When** the message is displayed, **Then** the code appears in a distinct monospace block with language-specific syntax highlighting
3. **Given** an AI response contains a fenced code block, **When** the user hovers over or views the code block, **Then** a copy-to-clipboard button is visible and copies the code content when clicked
4. **Given** an AI response contains a numbered or bullet list, **When** the message is displayed, **Then** the list is rendered with proper indentation and markers
5. **Given** an AI response contains headings (`## Heading`), **When** the message is displayed, **Then** headings appear with appropriate size and weight hierarchy

---

### User Story 2 - View inline code and links (Priority: P2)

A user receives a response containing inline code references and hyperlinks. Inline code is visually distinct and links are clickable.

**Why this priority**: Code references and links are common in knowledge-base responses. Making them visually distinct and functional improves information scanning.

**Independent Test**: Trigger a response with inline code (`variable`) and a URL. Verify inline code has visual styling and links open in new tabs.

**Acceptance Scenarios**:

1. **Given** an AI response contains inline code (`` `variableName` ``), **When** the message is displayed, **Then** the code appears with a monospace font and subtle background
2. **Given** an AI response contains a markdown link `[text](url)`, **When** the user clicks the link, **Then** the URL opens in a new browser tab

---

### User Story 3 - User messages remain plain text (Priority: P3)

User-authored messages continue to display as plain text without markdown interpretation, preserving the current behavior for the user's own input.

**Why this priority**: Users type natural text and don't expect their messages to be markdown-rendered. Asterisks or backticks in user input should display literally.

**Independent Test**: Send a message containing markdown syntax (e.g., `**hello**`). Verify it displays as `**hello**` literally, not as bold.

**Acceptance Scenarios**:

1. **Given** a user types `**hello**` as a message, **When** the message is displayed, **Then** it shows `**hello**` literally without bold formatting
2. **Given** a user types a message with backticks or other markdown syntax, **When** the message is displayed, **Then** all characters appear as typed

---

### Edge Cases

- What happens when the AI response contains malformed or incomplete markdown (e.g., unclosed code blocks)? The component should render gracefully without breaking the layout.
- What happens when the AI response contains very long code blocks? Content should remain within the message bubble boundaries with horizontal scrolling if needed.
- What happens when the AI response contains HTML tags within markdown? HTML should be sanitized to prevent XSS — tags are stripped or escaped.
- What happens when the AI response contains markdown tables? Tables should render in a readable format within the bubble width.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render AI assistant messages as formatted markdown in all chat interfaces (RAG chat and article chat), supporting: headings, bold, italic, ordered/unordered lists, code blocks (fenced), inline code, links, and blockquotes.
- **FR-002**: System MUST display user messages as plain text without markdown interpretation, preserving current behavior.
- **FR-003**: System MUST sanitize any raw HTML in markdown content to prevent cross-site scripting (XSS) attacks.
- **FR-004**: System MUST render fenced code blocks with monospace font, visual distinction from surrounding text, and language-specific syntax highlighting when a language tag is provided.
- **FR-008**: System MUST display a copy-to-clipboard button on fenced code blocks that copies the code content when clicked.
- **FR-005**: System MUST open markdown links in a new browser tab (`target="_blank"`) with `rel="noopener noreferrer"`.
- **FR-006**: System MUST handle malformed markdown gracefully without breaking the message layout or crashing the component.
- **FR-007**: System MUST keep the existing sources section rendering unchanged — sources are displayed below the markdown content using the current implementation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All standard markdown elements (headings, bold, italic, lists, code blocks with syntax highlighting, inline code, links, blockquotes) render correctly in AI responses.
- **SC-002**: User messages display identically to current behavior — no markdown interpretation applied.
- **SC-003**: No XSS vulnerabilities introduced — HTML in message content is sanitized.
- **SC-004**: Malformed markdown does not cause visual breakage or component errors — content degrades gracefully to plain text.
- **SC-005**: Markdown-rendered messages maintain visual consistency with the existing chat theme (colors, spacing, bubble width).

## Assumptions

- The AI backend already returns markdown-formatted content in `message.content`. No backend changes are needed.
- Both `ChatMessageBubble` (RAG chat) and `ArticleChat` (article Q&A) components need markdown rendering for assistant messages. The chat data flow and message types remain unchanged.
- Standard markdown elements are sufficient — no need for extended syntax like footnotes, definition lists, or math equations.
