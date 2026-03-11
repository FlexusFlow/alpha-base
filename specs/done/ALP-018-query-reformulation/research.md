# Research: Query Reformulation

## Decision 1: Reformulation Model

**Decision**: Use gpt-4o-mini via ChatOpenAI for query reformulation.

**Rationale**:
- Already available in the project (openai_api_key in settings)
- Fast inference (~100-300ms), well within the 500ms budget
- Cheap ($0.15/1M input tokens) — negligible cost per query
- Excellent at typo correction and entity recognition

**Alternatives considered**:
- **gpt-4o**: More capable but slower and more expensive. Overkill for simple query correction.
- **Local spell-checker (e.g., pyspellchecker)**: Fast and free but cannot handle proper nouns, context-dependent corrections, or abbreviation expansion. Would miss "nenci pilossi" → "Nancy Pelosi".
- **Embedding-based fuzzy matching**: Search for similar terms in the KB metadata. Complex to implement, requires maintaining a term index, and doesn't handle abbreviations.

## Decision 2: Reformulation Strategy

**Decision**: Single non-streaming LLM call with a focused prompt that takes only the query string (no chat history). Return the corrected query as a plain string.

**Rationale**:
- Chat history is not needed for typo correction — the query alone has sufficient context
- Non-streaming is simpler and appropriate since we need the full result before searching
- Plain string output avoids parsing complexity

**Alternatives considered**:
- **Structured output (JSON with original + corrected)**: Adds parsing overhead for no benefit since we already have the original.
- **Include chat history for context**: Adds tokens/cost and latency. The LLM can infer "nenci" = name without context.

## Decision 3: Integration Points

**Decision**: Apply reformulation in two places:
1. `_stream_kb_only()` — before the vectorstore similarity_search call
2. `agent_tools.py` `search_knowledge_base` tool — before the tool's vectorstore search (for extended search mode consistency)

**Rationale**: FR-006 says reformulation MUST apply to KB-only mode and SHOULD apply to extended search. Applying it in the KB search tool ensures it works regardless of the code path.

**Alternatives considered**:
- **Only in `_stream_kb_only()`**: Simpler but misses extended search mode's KB search.
- **Middleware/decorator pattern**: Over-engineered for two call sites.

## Decision 4: Failure Handling

**Decision**: Wrap the reformulation call in try/except with a timeout. On any failure (timeout, API error, rate limit), log the error and return the original query unchanged.

**Rationale**: FR-004 requires that reformulation failure never blocks chat. The simplest approach is a try/except that silently falls back.

## Decision 5: Short-Circuit for Clean Queries

**Decision**: Always call the LLM — do not attempt to detect "clean" queries client-side. The LLM will return the query unchanged if it's already correct, and the latency is minimal (~100-300ms).

**Rationale**: Any heuristic to detect "clean" queries (e.g., spell-check, dictionary lookup) would miss the exact cases we're trying to fix (proper nouns). The LLM cost and latency is low enough that always calling it is the simplest correct approach.

**Alternatives considered**:
- **Spell-check pre-filter**: Skip LLM if all words are in dictionary. Would miss proper nouns entirely — the primary use case.
- **Cache repeated queries**: Adds complexity. Users rarely repeat exact queries.
