# Feature Specification: Query Reformulation for Typo-Tolerant KB Search

**Feature Branch**: `ALP-018-query-reformulation`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Add LLM query reformulation step before vectorstore search in KB-only chat mode to correct typos, fix misspelled names, and expand abbreviations."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Typo Correction in Proper Nouns (Priority: P1)

A user asks a question about a person, topic, or entity but misspells the name (e.g., "nenci pilossi" instead of "Nancy Pelosi"). The knowledge base contains relevant content under the correct spelling. The system automatically corrects the query before searching, finds the relevant content, and returns a useful answer.

Currently, misspelled proper nouns produce no results or low-relevance results because the search embeddings for the misspelled version are too distant from the correctly spelled content.

**Why this priority**: This is the primary use case driving the feature — proper nouns and names are the most common source of typos that break semantic search.

**Independent Test**: Add content about "Nancy Pelosi" to the knowledge base, then ask about "nenci pilossi". Verify the system finds and uses the Nancy Pelosi content.

**Acceptance Scenarios**:

1. **Given** the KB contains content about "Nancy Pelosi", **When** a user asks "what does the knowledge base say about nenci pilossi", **Then** the system corrects the query, retrieves Nancy Pelosi content, and provides a relevant answer with sources.
2. **Given** the KB contains content about a specific topic, **When** a user asks using a common misspelling or phonetic variation of the topic name, **Then** the system corrects the query and returns relevant results.
3. **Given** a user submits a correctly spelled query, **When** the system processes the query, **Then** the reformulation step does not alter it and adds no noticeable delay.

---

### User Story 2 - Abbreviation and Shorthand Expansion (Priority: P2)

A user asks a question using abbreviations or shorthand (e.g., "fed" for "Federal Reserve", "AI" for "Artificial Intelligence") that the knowledge base stores under the full form. The system expands the abbreviation before searching to improve retrieval quality.

**Why this priority**: Less common than typos but still causes missed results when KB content uses full terms and users use abbreviations or vice versa.

**Independent Test**: Add content about "Federal Reserve" to the KB, then ask about "fed interest rates". Verify the system retrieves the Federal Reserve content.

**Acceptance Scenarios**:

1. **Given** the KB contains content using full terms, **When** a user asks using a common abbreviation, **Then** the system expands the abbreviation and retrieves relevant content.
2. **Given** the user query uses standard well-known abbreviations, **When** the system reformulates, **Then** it preserves the original meaning while improving search coverage.

---

### Edge Cases

- What happens when the reformulation service is temporarily unavailable? The system should fall back to searching with the original query — reformulation failure must never block the chat.
- What happens when the query is already well-formed and correctly spelled? The system should return the query unchanged with minimal added latency.
- What happens when the user intentionally uses an unusual term that the reformulation might "correct" incorrectly? The reformulation must preserve the user's intent and only correct obvious errors, not change the meaning.
- What happens with very short queries (e.g., single word "nenci")? The system should still attempt correction when possible.
- What happens when the query contains mixed languages? The system should handle the primary language and not mistranslate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Before searching the knowledge base, the system MUST attempt to reformulate the user's query to correct typos, fix misspelled names, and expand common abbreviations.
- **FR-002**: The reformulation MUST preserve the user's original intent — it should only correct obvious errors, not change the meaning or scope of the query.
- **FR-003**: The original user query MUST be preserved for display in the chat — only the reformulated version is used for search. The reformulation is silent and invisible to the user.
- **FR-004**: If the reformulation step fails or is unavailable, the system MUST fall back to searching with the original query without error or delay.
- **FR-005**: The reformulation step MUST add no more than 500 milliseconds of additional latency to the chat response time.
- **FR-006**: The reformulation MUST apply to KB-only mode. It SHOULD also apply to extended search mode's KB search step for consistency.
- **FR-007**: When the reformulated query differs from the original, the system SHOULD log the reformulation for observability (original → corrected).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Queries with common misspellings of proper nouns (1-3 character errors) return relevant results at least 90% of the time, compared to near-0% without reformulation.
- **SC-002**: Correctly spelled queries experience no more than 500ms of additional latency from the reformulation step.
- **SC-003**: The reformulation step never changes the intent of correctly spelled queries — the original and reformulated versions are identical for well-formed input.
- **SC-004**: Reformulation failures do not block chat — 100% of queries still produce a response even when reformulation is unavailable.

## Clarifications

### Session 2026-03-11

- Q: Should the user see that their query was reformulated? → A: Silent reformulation — correct the query behind the scenes, never show the user. The reformulated query is only used internally for search.

## Assumptions

- A lightweight language model can reliably correct common typos and expand abbreviations with a single, fast inference call.
- The reformulation prompt can be kept simple (no conversation history needed) since it operates on a single query string.
- The additional cost per query is negligible given the model used is fast and cheap.
- Reformulation applies to the search query only, not to the full chat context or history.
