# Research: KB Relevance Hint

## Decision 1: Relevance Signal Mechanism

**Decision**: Use vectorstore similarity scores to determine KB context relevance, not LLM self-assessment.

**Rationale**: The vectorstore already returns `(doc, score)` tuples from `similarity_search()`. Using the top score (or average) against a threshold is:
- Zero additional latency (scores already computed)
- Deterministic and consistent (no LLM randomness)
- Simpler to implement and test

**Alternatives considered**:
- **LLM self-assessment via structured output**: Requires either a second LLM call (adds latency/cost) or a prefix tag approach (fragile with streaming, requires buffering initial tokens). Rejected for complexity.
- **LLM self-assessment via response text parsing**: Fragile — depends on exact phrasing. Already caused the current bug.
- **Separate relevance classification call**: Adds 200-500ms latency and doubles cost. Overkill for this use case.

## Decision 2: Relevance Threshold

**Decision**: Use the existing `rag_score_threshold` from settings as the baseline. If the highest-scoring result is below a "kb relevance threshold" (configurable, default ~0.5), mark as low relevance. If no results pass `rag_score_threshold` at all (empty results), that's zero-docs case.

**Rationale**: Leverages existing configuration infrastructure. The `rag_score_threshold` already filters out very low-scoring results. A separate higher threshold for the "relevant enough" signal allows fine-tuning without affecting retrieval.

**Alternatives considered**:
- **Average score**: Penalizes when one good result is mixed with poor ones. Top score is a better indicator.
- **Fixed threshold**: Less flexible. Using a setting allows per-deployment tuning.

## Decision 3: System Prompt Strategy

**Decision**: Two prompt variants based on pre-computed relevance:
1. **High relevance**: Current-style prompt instructing to answer from context (remove canned refusal)
2. **Low relevance**: Prompt instructing to attempt a best-effort answer if tangentially related, otherwise provide a graceful fallback (not the canned "I don't have information" message)

**Rationale**: Pre-computing relevance from scores means the prompt can be tailored before the LLM call starts, no need for the LLM to self-assess.

## Decision 4: SSE Protocol Extension

**Decision**: Add `kb_relevant: boolean` to the existing `done` event payload. Existing clients that don't read this field are unaffected (additive change).

**Rationale**: Minimal protocol change. The `done` event already carries `sources` and `source_types`. Adding one boolean field is backward-compatible.

## Decision 5: Frontend Hint Rendering

**Decision**: Static text rendered in `ChatMessageBubble` below sources, styled as a muted hint. Visibility controlled by `kbRelevant === false` AND the message being from KB-only mode (not extended search).

**Rationale**: Matches clarification that the hint is informational only — the existing Extended search checkbox handles the toggle.
