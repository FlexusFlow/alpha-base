# Feature Specification: KB Relevance Hint

**Feature Branch**: `ALP-017-kb-relevance-hint`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "I need to show any knowledge extracted from knowledge base. But if LLM decides it is not relevant, Show the warning below resources. Like 'For more relevant information please use Extended search'"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Always Show KB Sources and Best-Effort Answer (Priority: P1)

When a user asks a question in KB-only mode and the knowledge base returns matching documents, the system always displays those sources and the LLM always attempts an answer using the retrieved context — even if the content is only tangentially related.

Currently, the LLM sometimes responds with "I don't have information about this in my knowledge base" while still showing source links, creating a contradictory experience. Instead, the LLM should always use whatever context was retrieved to give its best answer.

**Why this priority**: Core value — users should never lose access to knowledge found in their KB. Hiding or contradicting available sources undermines trust.

**Independent Test**: Ask a question where KB has loosely related content. Verify the LLM attempts an answer using that content and sources are displayed.

**Acceptance Scenarios**:

1. **Given** a user asks a question in KB-only mode and the KB returns documents, **When** the LLM considers the context highly relevant, **Then** the response includes a direct answer with source links (no change to happy path).
2. **Given** a user asks a question in KB-only mode and the KB returns documents but the LLM considers them not directly relevant, **When** the response is displayed, **Then** the LLM still provides a best-effort answer using the available context and source links are shown.

---

### User Story 2 - Extended Search Hint on Low Relevance (Priority: P1)

When the LLM determines that the KB context is not highly relevant to the user's question, the system displays a hint below the sources suggesting the user try "Extended search" for better results.

**Why this priority**: Equal to Story 1 — together they form the complete experience. The hint guides users toward a better answer without hiding what was found.

**Independent Test**: Ask a question where KB has tangentially related content. Verify the hint appears below sources.

**Acceptance Scenarios**:

1. **Given** a user asks a question in KB-only mode and the LLM signals the KB context has low relevance, **When** the response is displayed, **Then** a hint appears below the sources: "For more relevant information, try using Extended search".
2. **Given** a user asks a question in KB-only mode and the LLM provides a confident answer from relevant KB context, **When** the response is displayed, **Then** no hint is shown.
3. **Given** a user asks a question in KB-only mode and the KB returns zero documents, **When** the response is displayed, **Then** the system shows a "no results found" message with the extended search hint.

---

### Edge Cases

- What happens when the KB returns documents but all have very low relevance scores? The system should still show sources and include the extended search hint.
- What happens when the user already has Extended search enabled? The hint MUST NOT appear since the user is already in extended mode.
- What happens when the LLM response is partially relevant (uses some context but not all)? The hint should not appear — only show it when the LLM signals overall low relevance.
- What happens when KB context is completely unrelated to the question (e.g., user asks about cooking, KB has only tech content)? The LLM provides a graceful fallback acknowledging no direct answer found, sources are still shown, and the extended search hint appears.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST always display source links when the KB returns matching documents, regardless of the LLM's relevance assessment.
- **FR-002**: System MUST instruct the LLM to attempt a best-effort answer using the provided KB context when the context is at least tangentially related. When the context is completely unrelated to the question, the LLM MUST provide a graceful fallback acknowledging no direct answer was found (not the canned "no information" refusal). In both cases, sources are still shown.
- **FR-003**: System MUST obtain a structured relevance signal from the LLM (separate from the response text) indicating whether the KB context adequately answers the user's question.
- **FR-004**: When the LLM signals low relevance in KB-only mode, the frontend MUST display a static text hint below the sources: "For more relevant information, try using Extended search". The hint is informational only — the user toggles the existing Extended search checkbox themselves.
- **FR-005**: When the LLM signals adequate relevance, the system MUST NOT display the extended search hint.
- **FR-006**: The extended search hint MUST NOT appear when the user is already using Extended search mode.
- **FR-007**: When the KB returns zero documents in KB-only mode, the system MUST display a "no results found" message accompanied by the extended search hint.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users always see KB source links when the knowledge base finds matching documents — zero cases of sources being hidden or contradicted by the response text.
- **SC-002**: The extended search hint appears only when appropriate (low relevance or no results in KB-only mode) and never in Extended search mode.
- **SC-003**: The LLM never responds with the canned "I don't have information about this in my knowledge base" refusal when KB documents are available.
- **SC-004**: Users who follow the extended search hint and switch to Extended search receive a more relevant answer.

## Clarifications

### Session 2026-03-11

- Q: Should the "Extended search" hint be interactive (clickable) or static text? → A: Static text — Extended search is an existing checkbox in the UI, the hint just points users to it.
- Q: When KB context is completely unrelated to the question, should the LLM still force a best-effort answer? → A: Relevance threshold — LLM attempts an answer only if context is at least tangentially related; otherwise graceful fallback acknowledging no direct answer found while still showing sources and hint.

## Assumptions

- The LLM can reliably self-assess the relevance of retrieved context and communicate this through a structured output (e.g., a relevance flag) rather than embedding it in the response text.
- The current chat SSE protocol can be extended with an additional field (e.g., `kb_relevant: boolean`) without breaking existing clients.
- "Extended search" refers to the existing `extended_search` toggle already available in the chat UI.
