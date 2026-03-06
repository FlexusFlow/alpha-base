# Research: Agentic Search with Web Fallback

**Date**: 2026-03-05
**Feature**: ALP-012

## R1: Web Search API Provider

**Decision**: Serper (`GoogleSerperAPIWrapper` via `langchain-community`)

**Rationale**:
- Cheapest option at scale: $0.001/query vs Tavily's $0.008/credit
- Already available via `langchain-community` (no new dependency — already in project)
- Returns structured Google SERP data including organic results, answer boxes, and knowledge graph
- `GoogleSerperAPIWrapper.aresults()` provides async support with parsed JSON output
- Free tier: 2,500 searches/month
- Env var: `SERPER_API_KEY`

**Alternatives Considered**:
- **Tavily**: LLM-ready content, first-party `langchain-tavily` package, but more expensive ($0.008/credit) and adds an extra dependency. Better for agents that need pre-processed content.
- **Exa**: Semantic search engine, good for research but more expensive and less general-purpose.
- **Perplexity Sonar**: Pre-synthesized answers but less control over raw sources.

**Configuration**:
```python
GoogleSerperAPIWrapper(serper_api_key=key, k=3)
```

---

## R2: Agent Framework

**Decision**: `create_react_agent` from `langgraph.prebuilt` (v1.0.8+)

**Rationale**:
- Standard LangChain-recommended way to create ReAct agents in 2026
- Returns a compiled `StateGraph` with `.invoke()`, `.astream()`, `.astream_events()` support
- Accepts `model`, `tools`, and `prompt` parameters
- Works with `ChatOpenAI(streaming=True)` already in use

**Alternatives Considered**:
- **`langchain.agents.create_agent`**: Newer high-level API but sparse documentation, reports of missing `stream_mode` support (issue #34613). Too early to adopt.
- **Custom `StateGraph`**: Maximum control but unnecessary complexity for a standard ReAct pattern.
- **Legacy `AgentExecutor`**: Deprecated. Do not use.

**New dependencies**: `langgraph-prebuilt` (pulls in `langgraph`)

---

## R3: Agent Streaming with SSE

**Decision**: Use `stream_mode="messages"` with metadata filtering, fallback to `astream_events(version="v2")`

**Rationale**:
- `stream_mode="messages"` is the simplest approach for token-level streaming of agent final answers
- Filter by `metadata["langgraph_node"]` to skip tool call messages and tool outputs
- Compatible with existing `sse-starlette` SSE transport (no changes needed to frontend SSE parsing)
- Known regression in LangGraph v0.5.0 (issue #5249) — `astream_events` is the fallback

**Primary pattern**:
```python
async for chunk, metadata in agent.astream(input, stream_mode="messages"):
    if metadata.get("langgraph_node") == "tools":
        continue
    if hasattr(chunk, "tool_calls") and chunk.tool_calls:
        continue
    if chunk.content:
        yield {"token": chunk.content}
```

**Fallback pattern** (if `stream_mode="messages"` has issues):
```python
async for event in agent.astream_events(input, version="v2"):
    if event["event"] == "on_chat_model_stream":
        content = event["data"]["chunk"].content
        if content:
            yield {"token": content}
```

---

## R4: Wrapping DeepLake Search as a Tool

**Decision**: Factory function with `@tool` decorator, creating per-request tool instances

**Rationale**:
- `@tool` decorator is the simplest LangChain pattern for custom tools
- Existing `VectorStoreService.similarity_search()` is already async and returns `list[tuple(doc, score)]`
- Per-request state (user_id, vectorstore) injected via closure in a factory function
- Docstring is critical — LLM reads it to decide when to use the tool

**Pattern**:
```python
def make_kb_search_tool(vectorstore: VectorStoreService) -> BaseTool:
    @tool
    async def search_knowledge_base(query: str) -> str:
        """Search the user's personal knowledge base of YouTube transcripts, articles,
        and documentation. Always use this tool first before web search."""
        results = await vectorstore.similarity_search(query=query, k=5, score_threshold=0.3)
        if not results:
            return "No relevant content found in the knowledge base."
        # Format results with source attribution
        ...
    return search_knowledge_base
```

**Alternatives Considered**:
- **`BaseTool` subclass**: More Pythonic for stateful tools but adds boilerplate. Factory pattern achieves the same result more simply.
- **`StructuredTool.from_function()`**: Overkill for a single-query search.

---

## R5: Source Extraction from Agent Responses

**Decision**: Extract source URLs from tool call results within the agent stream, send in SSE `done` event

**Rationale**:
- KB sources: already available in chunk metadata (`source` field) — extracted when formatting tool results
- Web sources: Serper returns `link` field per organic result — captured when tool runs
- Both collected during streaming, aggregated, and sent in the final `{"done": true, "sources": [...]}` SSE event
- Frontend source display code (`chat-message.tsx`) continues to work unchanged

**Source labeling**: The agent's system prompt instructs it to:
- NOT label KB-sourced answers (behave like current system)
- Prefix web-sourced answers with "From web search:" in the response text
- Prefix general-knowledge answers with "From general knowledge:" in the response text

---

## R6: Rate Limiter for Web Search

**Decision**: Reuse existing `RateLimiter` class pattern from `backend/app/services/rate_limiter.py`

**Rationale**:
- In-memory sliding window rate limiter already exists (ZIP-006)
- Same pattern: `RateLimiter(max_requests=N, window_seconds=W)` with `is_allowed(user_id)`
- Config via env vars: `WEB_SEARCH_RATE_LIMIT` (max requests) and `WEB_SEARCH_RATE_WINDOW` (seconds)
- No persistence needed (resets on server restart, acceptable for MVP)

---

## R7: Web Search Availability Check (Frontend)

**Decision**: Backend exposes web search availability in an existing config/status endpoint, frontend uses it to set toggle state

**Rationale**:
- Frontend needs to know if web search API key is configured (to disable/gray out the toggle)
- Backend already has settings/config patterns; adding a `web_search_available: bool` field is minimal
- Alternative: frontend tries to detect availability from response behavior — too fragile and delayed
