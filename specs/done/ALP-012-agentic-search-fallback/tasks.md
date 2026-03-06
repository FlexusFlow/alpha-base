# Tasks: Agentic Search with Web Fallback

**Input**: Design documents from `/specs/ALP-012-agentic-search-fallback/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story. US1 and US2 are combined in one phase because they are tightly coupled (the agent's system prompt handles source labeling as part of the search flow).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies and configure environment variables

- [x] T001 Install `langgraph` and `langgraph-prebuilt` dependencies in `backend/pyproject.toml` (Serper via existing `langchain-community`)
- [x] T002 Add new env vars (`serper_api_key`, `WEB_SEARCH_RATE_LIMIT`, `WEB_SEARCH_RATE_WINDOW`, `RAG_CONFIDENCE_THRESHOLD`) to `backend/app/config.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create shared modules that multiple user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Create KB search tool factory (`make_kb_search_tool`) and web search tool factory (`make_web_search_tool`) in `backend/app/services/agent_tools.py`. KB tool wraps `VectorStoreService.similarity_search()` with formatted output including titles, scores, and source URLs. Web tool wraps `GoogleSerperAPIWrapper(serper_api_key=key, k=3)`. Both use `@tool` decorator with factory pattern for per-request state injection via closure.
- [x] T004 [P] Create per-user web search rate limiter in `backend/app/services/web_search_limiter.py`. Reuse sliding window pattern from `backend/app/services/rate_limiter.py`. Key by `user_id`, window from `WEB_SEARCH_RATE_WINDOW`, max from `WEB_SEARCH_RATE_LIMIT`.
- [x] T005 [P] Add `use_web_search: bool = True` field to `ChatRequest` model in `backend/app/models/chat.py`

**Checkpoint**: Foundation ready — agent tools, rate limiter, and extended request model available for all stories

---

## Phase 3: User Story 1 + User Story 2 — Autonomous Multi-Source Search & Source Attribution Labels (Priority: P1) 🎯 MVP

**Goal**: Replace `ChatService` with `AgentChatService` using a LangGraph ReAct agent that autonomously searches KB → web → general knowledge, streams responses via SSE, and labels non-KB responses with source prefix.

**Independent Test**: Ask a KB-answerable question — response arrives with no source label, existing citation URLs work. Ask a current-events question — response arrives with "From web search:" prefix and web URLs. Ask a conceptual question — response arrives with "From general knowledge:" prefix. No confirmation prompts in any case.

### Implementation

- [x] T006 [US1] [US2] Rewrite `backend/app/services/chat.py` — replace `ChatService` with `AgentChatService`. Use `create_react_agent` from `langgraph.prebuilt` with two tools (from `agent_tools.py`). System prompt instructs: always try KB first, only web search if KB insufficient, label non-KB responses with "From web search:" or "From general knowledge:" prefix. Implement `stream()` method using `agent.astream(input, stream_mode="messages")` with metadata filtering to skip tool call messages. Collect source URLs and source types (kb/web) during streaming. Yield `{"token": ...}` for content chunks and `{"done": true, "sources": [...], "source_types": [...]}` at end.
- [x] T007 [US1] Update `backend/app/routers/chat.py` — pass `use_web_search` from request to `AgentChatService`. Ensure SSE streaming works with the new service. Keep existing auth, project ownership checks, and message persistence unchanged.
- [x] T008 [P] [US1] Add `GET /v1/api/chat/config` endpoint to `backend/app/routers/chat.py` — returns `{"web_search_available": bool}` based on whether `serper_api_key` is set in config. Requires JWT auth (same as chat endpoint).

**Checkpoint**: Core agentic search works end-to-end. KB queries return unlabeled responses with citations. Web queries return labeled responses with web URLs. Config endpoint reports web search availability.

---

## Phase 4: User Story 3 — Web Search Toggle (Priority: P1)

**Goal**: Add "Use websearch" checkbox to chat UI that controls whether web search is used. Toggle is disabled (grayed out) when API key is not configured.

**Independent Test**: Open chat — checkbox visible and checked by default. Uncheck it, ask a current-events question — response uses general knowledge only (no web URLs). Recheck it, ask again — web search resumes. Remove `serper_api_key` from backend — checkbox is grayed out with tooltip.

### Implementation

- [x] T009 [P] [US3] Add `use_web_search` field to `ChatRequest` type and `source_types` to response types in `next-frontend/lib/types/chat.ts`
- [x] T010 [P] [US3] Update `sendChatMessage` in `next-frontend/lib/api/chat.ts` — include `use_web_search` boolean in request payload. Parse `source_types` from SSE done event.
- [x] T011 [P] [US3] Add `getChatConfig` function in `next-frontend/lib/api/chat.ts` — fetch `GET /api/chat/config` to check web search availability.
- [x] T012 [P] [US3] Create frontend proxy route at `next-frontend/app/api/chat/config/route.ts` — SKIPPED: getChatConfig calls backend directly (consistent with sendChatMessage pattern). Proxy unnecessary.
- [x] T013 [US3] Add "Use websearch" checkbox to `next-frontend/components/chat/chat-window.tsx` — default checked, state passed to `sendChatMessage`. On page load, call `getChatConfig`; if `web_search_available` is false, disable checkbox and show tooltip "Web search not configured".

**Checkpoint**: Full frontend toggle works. Users can control web search availability per-conversation. Toggle disables gracefully when API key missing.

---

## Phase 5: User Story 4 — Web Search Rate Limiting (Priority: P2)

**Goal**: Integrate per-user rate limiting into the web search tool so users who exhaust their quota gracefully fall back to KB + general knowledge.

**Independent Test**: Set `WEB_SEARCH_RATE_LIMIT=3` and `WEB_SEARCH_RATE_WINDOW=60`. Ask 4 web-search-triggering questions rapidly. First 3 get web results, 4th falls back to general knowledge. Wait 60 seconds, ask again — web search works.

### Implementation

- [x] T014 [US4] Wire rate limiter into `AgentChatService` in `backend/app/services/chat.py` — before creating the web search tool, check `web_search_limiter.is_allowed(user_id)`. If not allowed, exclude web search tool from agent tools list (agent only gets KB tool). Log rate limit hit server-side.

**Checkpoint**: Web search costs are bounded. Rate-limited users still get KB + general knowledge responses.

---

## Phase 6: User Story 5 — Confidence-Based Fast Path (Priority: P3)

**Goal**: Skip agent loop when KB returns high-confidence results, preserving current fast response time for the majority of queries.

**Independent Test**: Ask a question with high KB relevance — response arrives faster (no agent reasoning overhead). Ask a question with low KB relevance — full agent loop runs. Set `RAG_CONFIDENCE_THRESHOLD=1.0` — fast path disabled, all queries go through agent.

### Implementation

- [x] T015 [US5] Add confidence-based fast path to `AgentChatService` in `backend/app/services/chat.py` — before creating the agent, perform a quick `similarity_search` with k=1. If top result score ≥ `RAG_CONFIDENCE_THRESHOLD` (from config), use the existing non-agentic pipeline (direct LLM call with KB context, no agent loop). Otherwise, proceed with full agent. Fast path responses use the same streaming format and include KB source URLs.

**Checkpoint**: High-confidence KB queries bypass agent loop. Response latency matches pre-feature performance for these queries.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cleanup across all stories

- [x] T016 [P] Run `ruff check` on backend and fix any linting issues
- [x] T017 [P] Run `yarn build` on frontend and fix any build errors
- [ ] T018 Run quickstart.md scenarios 1–8 for end-to-end validation (manual — requires running services)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (dependencies installed, config vars available)
- **US1+US2 (Phase 3)**: Depends on Phase 2 (agent tools, rate limiter, model changes)
- **US3 (Phase 4)**: Depends on Phase 3 (backend chat/config endpoints must exist for frontend to consume)
- **US4 (Phase 5)**: Depends on Phase 3 (AgentChatService must exist to wire rate limiter into)
- **US5 (Phase 6)**: Depends on Phase 3 (AgentChatService must exist to add fast path)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1+US2 (P1)**: Can start after Phase 2 — core agent implementation
- **US3 (P1)**: Depends on US1+US2 — frontend consumes backend endpoints created in Phase 3
- **US4 (P2)**: Can start after Phase 3 — independent of US3 (only modifies backend)
- **US5 (P3)**: Can start after Phase 3 — independent of US3 and US4 (only modifies backend)

### Within Each User Story

- Models/config before services
- Services before endpoints/routes
- Backend before frontend (for US3)
- Core implementation before integration

### Parallel Opportunities

**Phase 2** (all three tasks are independent files):
```
T003: agent_tools.py
T004: web_search_limiter.py
T005: models/chat.py
```

**Phase 3** (T008 is independent of T006/T007):
```
T008: GET /chat/config endpoint (independent)
T006 → T007: service rewrite → router update (sequential)
```

**Phase 4** (types, API functions, and proxy route are independent files):
```
T009: types/chat.ts
T010: api/chat.ts
T011: api/chat.ts (same file as T010 — run after T010)
T012: app/api/chat/config/route.ts
T013: chat-window.tsx (depends on T009–T012)
```

**Phases 5 and 6** can run in parallel (both modify backend/app/services/chat.py but different sections — or run sequentially if conflict risk is high):
```
T014: rate limiter wiring into AgentChatService
T015: fast path into AgentChatService
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T005)
3. Complete Phase 3: US1+US2 (T006–T008)
4. **STOP and VALIDATE**: Test via quickstart scenarios 1–2 and 7–8
5. Backend-only MVP is functional — agent search with source labels works

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1+US2 → Agent search works end-to-end (MVP!)
3. US3 → Frontend toggle adds user control
4. US4 → Rate limiting adds cost protection
5. US5 → Fast path adds performance optimization
6. Polish → Lint, build, full quickstart validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are combined because source labeling is implemented in the agent system prompt (same code path)
- T010 and T011 both modify `next-frontend/lib/api/chat.ts` — run sequentially
- T014 and T015 both modify `backend/app/services/chat.py` — run sequentially
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
