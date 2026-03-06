# Feature Specification: Agentic Search with Web Fallback

**Feature Branch**: `feature/ALP-012-agentic-search-fallback`
**Created**: 2026-03-05
**Status**: Draft
**Input**: Replace the current "not found in KB → ask user to confirm LLM fallback" flow with a single autonomous agent that searches knowledge base first, falls back to web search, and labels the source in every response.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Autonomous Multi-Source Search (Priority: P1)

A user asks a question in the project chat. The system automatically searches the user's knowledge base first. If the knowledge base contains relevant information, the system responds using that content. If not, the system automatically performs a web search and uses those results instead. The user never sees a confirmation prompt — the response simply arrives with a clear label indicating where the information came from.

**Why this priority**: This is the core value proposition. It removes the friction of the current confirmation step and adds real-time web knowledge as a new information source. Every subsequent story depends on this working.

**Independent Test**: Ask a question that exists in the knowledge base — response should come from KB with a "Knowledge Base" source label. Ask a question about a recent event not in KB — response should come from web search with a "Web" source label. In both cases, no confirmation dialog should appear.

**Acceptance Scenarios**:

1. **Given** a user has YouTube transcripts in their knowledge base about investing, **When** they ask "What did Warren Buffett say about index funds?", **Then** the system searches the knowledge base, finds relevant content, and responds with a "Knowledge Base" source label and citation links.
2. **Given** a user's knowledge base has no content about today's news, **When** they ask "What happened in the stock market today?", **Then** the system searches the knowledge base, finds nothing relevant, automatically searches the web, and responds with a "Web" source label.
3. **Given** a user asks a general conceptual question like "What is dollar-cost averaging?", **When** the knowledge base has partial information, **Then** the system may combine KB results with its own knowledge, labeling each source appropriately.
4. **Given** a user asks a question, **When** the system processes it, **Then** no confirmation prompt like "Would you like me to provide general information?" is shown — the response is delivered directly.

---

### User Story 2 — Source Attribution Labels (Priority: P1)

Every response from the chat clearly indicates the source of the information. Source labels distinguish between three categories: knowledge base content, web search results, and the model's general knowledge. Labels appear inline in the response text or as a structured header, making it immediately obvious where each piece of information originated.

**Why this priority**: Source transparency is essential for user trust. Users need to know whether they're reading their own curated knowledge, live web results, or general model knowledge. This is tightly coupled with US1 and must ship together.

**Independent Test**: Send three different queries — one answerable from KB, one requiring web search, one purely conceptual. Verify each response carries the correct source label and that the existing source citation links (URLs) continue to work.

**Acceptance Scenarios**:

1. **Given** the system responds using knowledge base content, **When** the response is displayed, **Then** it looks the same as current KB responses — no extra source label, just the existing source citation URLs.
2. **Given** the system responds using web search results, **When** the response is displayed, **Then** it includes a visible label such as "From web search" in the response text and lists the web page URLs used.
3. **Given** the system responds from general model knowledge (no tools used), **When** the response is displayed, **Then** it includes a label such as "From general knowledge" to distinguish it from KB-sourced information.
4. **Given** a response combines information from multiple sources (e.g., KB and web), **When** displayed, **Then** only the non-KB portions are labeled with their respective source.

---

### User Story 3 — Extended Search Toggle (Priority: P1)

The chat interface includes a visible "Extended search" checkbox next to the message input field. When disabled (default), the system operates in KB-only mode — it searches the knowledge base and answers strictly from that context, declining if no relevant information is found. When enabled, the system uses the full agentic flow (KB → web search → general knowledge). The toggle is always clickable. If the Serper API key is not configured, a warning icon appears next to the toggle when enabled, indicating web search is unavailable (extended search still works but falls back to general knowledge only). The toggle state is per-conversation and remembered for the duration of the session.

**Why this priority**: Users must have explicit control over their search mode. The default KB-only mode ensures the knowledge base is always the single source of truth. Extended search is opt-in for when users need broader information. This is a P1 because it directly affects the user's control over the core feature and should ship with US1.

**Independent Test**: Open a project chat, verify the "Extended search" checkbox is visible next to the input and unchecked by default. Ask a question not in KB — verify response is "I don't have information about this in my knowledge base." Toggle it on, ask the same question — verify web search or general knowledge is used with appropriate labels.

**Acceptance Scenarios**:

1. **Given** the user opens a project chat, **When** the chat interface loads, **Then** an "Extended search" checkbox is visible near the message input field, unchecked by default.
2. **Given** the "Extended search" checkbox is disabled, **When** the user asks a question in KB, **Then** the system responds from KB with source links.
3. **Given** the "Extended search" checkbox is disabled, **When** the user asks a question not in KB, **Then** the system responds with "I don't have information about this in my knowledge base." — no general knowledge or web search.
4. **Given** the "Extended search" checkbox is enabled, **When** the user asks a question not in KB, **Then** the system performs a web search (if available) and labels the response, or falls back to general knowledge with a label.
5. **Given** the user toggles the checkbox mid-conversation, **When** the next message is sent, **Then** the new toggle state is respected immediately.
6. **Given** the Serper API key is not configured and "Extended search" is enabled, **Then** a warning icon appears next to the toggle with a tooltip "Web search is not configured and not available".

---

### User Story 4 — Web Search Rate Limiting and Cost Control (Priority: P2)

Web search API calls are rate-limited per user to prevent abuse and control costs. Users who exhaust their web search quota still get knowledge base results and general model knowledge — only the web search fallback is disabled until the quota resets.

**Why this priority**: Without rate limiting, a single user could generate significant API costs. This is a guardrail that must exist before any production deployment but is not required for initial development and testing.

**Independent Test**: Trigger web search queries repeatedly for a single user and verify that after hitting the limit, subsequent queries that would need web search instead respond with KB + general knowledge only, with a note that web search quota has been reached.

**Acceptance Scenarios**:

1. **Given** a user has not exceeded their web search quota, **When** a query requires web search, **Then** the web search executes normally.
2. **Given** a user has exceeded their web search quota, **When** a query would normally trigger web search, **Then** the system skips web search, responds using KB and/or general knowledge, and includes a brief note that web search is temporarily unavailable.
3. **Given** the rate limit window resets (e.g., next hour or next day), **When** the user sends a new query, **Then** web search is available again.

---

### User Story 5 — Confidence-Based Fast Path (Priority: P3)

When the knowledge base returns highly relevant results (high similarity scores), the system skips the agent reasoning loop entirely and responds directly — behaving like the current non-agentic pipeline. This reduces latency and cost for the majority of queries where the KB has a clear answer.

**Why this priority**: This is a performance optimization. The agentic loop adds 1-2 extra model calls per query. For users with rich knowledge bases, most queries will be answerable from KB alone. Skipping the agent loop for these cases preserves the current fast response time. However, the feature works correctly without this optimization — it just costs more and has higher latency.

**Independent Test**: Ask a question with a very high KB relevance score — verify the response arrives faster (fewer model calls) than a question requiring web search. Verify the source label still shows "Knowledge Base".

**Acceptance Scenarios**:

1. **Given** the knowledge base returns results above a high-confidence threshold, **When** the user sends a query, **Then** the system responds directly without entering the agent reasoning loop, and the response includes "Knowledge Base" source labels.
2. **Given** the knowledge base returns results below the confidence threshold, **When** the user sends a query, **Then** the system enters the full agent reasoning loop and may fall back to web search.
3. **Given** the confidence-based routing is active, **When** a high-confidence KB query is processed, **Then** the response latency is comparable to the current (pre-feature) chat response time.

---

### Edge Cases

- What happens when the web search API is down or returns an error? The system gracefully degrades to KB + general knowledge, with no error shown to the user (logged server-side).
- What happens when the user's knowledge base is empty (new user)? The system falls back to web search or general knowledge without error. No "add content first" gate.
- What happens when web search returns irrelevant results? The agent evaluates relevance and may choose to answer from general knowledge instead, labeling the source accordingly.
- What happens when the user sends a follow-up question in a conversation? The agent has access to conversation history and uses it for context, consistent with current behavior.
- What happens when streaming is interrupted mid-response? Existing error handling continues to work — the agent adds no new failure mode to SSE streaming.
- What happens when the user disables web search and asks about current events? The system responds from general knowledge with appropriate caveats about potentially outdated information, labeled as "General Knowledge".
- What happens when the web search API key is not configured? The "Extended search" toggle is always clickable. When enabled without a Serper key, a warning icon appears with a tooltip "Web search is not configured and not available". Extended search still works but falls back to general knowledge only (no web results).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST search the user's knowledge base before attempting any other information source.
- **FR-002**: The system MUST automatically search the web when the knowledge base does not contain relevant results, without requiring user confirmation.
- **FR-003**: The system MUST label responses sourced from web search or general model knowledge. Knowledge base responses MUST NOT carry a source label (KB is the default, unlabeled source).
- **FR-004**: When a response combines multiple sources, the system MUST attribute each portion to its respective source.
- **FR-005**: The system MUST stream response tokens to the user in real-time, consistent with the current chat experience.
- **FR-006**: The system MUST support conversation history context, so follow-up questions work naturally.
- **FR-007**: The system MUST rate-limit web search API calls per user. The rate limit cap and time window MUST be configurable via environment variables.
- **FR-008**: When web search is rate-limited or unavailable, the system MUST gracefully degrade to knowledge base and general model knowledge without showing an error.
- **FR-009**: The system MUST preserve existing source citation behavior (returning source URLs in the response).
- **FR-010**: Web search results MUST include the URLs of pages used, displayed alongside existing KB source links.
- **FR-011**: The chat interface MUST include an "Extended search" toggle (checkbox) next to the message input field.
- **FR-012**: The extended search toggle MUST default to disabled (KB-only mode).
- **FR-012a**: When extended search is disabled, the system MUST answer strictly from KB context. If KB has no relevant information, the system MUST respond with "I don't have information about this in my knowledge base." without using general knowledge or web search.
- **FR-013**: When extended search is enabled, the system MUST search KB first, then fall back to web search (if available) and general knowledge, labeling non-KB responses.
- **FR-014**: The toggle state MUST be sent with each chat request so the backend respects the user's preference.
- **FR-014a**: The toggle MUST always be clickable (never disabled). When the Serper API key is not configured and extended search is enabled, a warning icon MUST appear with a tooltip "Web search is not configured and not available".
- **FR-015**: The system SHOULD skip the agent reasoning loop when knowledge base results are above a high-confidence threshold, to reduce latency and cost.

### Key Entities

- **Search Source**: The origin of information in a response — knowledge base, web search, or general model knowledge. Each source has a label and optional citation URLs.
- **Web Search Result**: A result returned from the external search API, containing a title, URL, and content snippet.
- **Rate Limit Quota**: Per-user tracking of web search API calls within a time window, with a configurable maximum.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users receive answers to questions outside their knowledge base without any confirmation step — 100% of queries are answered directly.
- **SC-002**: Responses from web search or general knowledge always include a visible source label — 100% of non-KB responses are labeled. KB responses carry no extra label.
- **SC-003**: Responses to knowledge-base-answerable questions arrive within 5 seconds (comparable to current performance).
- **SC-004**: Responses requiring web search arrive within 10 seconds.
- **SC-005**: Web search costs are bounded — no single user can trigger more than a configurable number of web searches per time period.
- **SC-006**: When the web search service is unavailable, the system still responds using knowledge base and general knowledge within 5 seconds (graceful degradation).
- **SC-007**: Source attribution accuracy — the source label matches the actual origin of information in at least 95% of responses.

## Clarifications

### Session 2026-03-05

- Q: How should source labels be rendered — inline in LLM text, structured metadata, or both? → A: Agent includes labels in response text. Labels are only shown when the source is NOT the knowledge base (i.e., "Web" or "General Knowledge" get labels; KB responses look the same as today with no extra label).
- Q: What are the rate limit specifics for web search (window and cap)? → A: Configurable via environment variable with no hardcoded default. Operator sets the limit and window.
- Q: What happens when the web search API key is not configured? → A: Toggle is always clickable. When extended search is enabled without a Serper key, a warning icon appears with tooltip "Web search is not configured and not available". Extended search still works but without web results (falls back to general knowledge only).

## Assumptions

- A web search API (such as Serper or Tavily) will be provisioned with an API key. The choice of provider is an implementation decision.
- The existing streaming (SSE) infrastructure can support agent-based responses without architectural changes.
- The current conversation history mechanism (frontend sends history with each request) is sufficient for the agent to maintain conversational context. Server-side history management is a separate backlog item.
- Rate limiting for web search will use an in-memory approach consistent with the existing API key rate limiter (ZIP-006). Persistence across server restarts is not required for MVP.
- The confidence threshold for the fast path (US4) will be tunable via configuration, not hardcoded.

## Scope Boundaries

**In scope**:
- Replacing the current confirmation-based fallback with autonomous agent search
- Adding web search as a new information source
- User-facing "Extended search" toggle in the chat interface
- Source attribution labels on all responses
- Per-user web search rate limiting
- Confidence-based fast path optimization (Phase 2)

**Out of scope**:
- Server-side chat history management (separate backlog item)
- Structured source attribution with title/type/timestamp (separate "Multi-Source Context Attribution" backlog item — this feature adds labels only, not the full structured format)
- Adding new source types beyond KB and web (e.g., SQL, code repositories)
- Web search configuration UI beyond the per-chat toggle (API key is server-side config only)
- Persisting the toggle preference across sessions or projects (session-only for MVP)
