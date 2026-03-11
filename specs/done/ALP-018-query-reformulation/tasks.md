# Tasks: Query Reformulation

**Input**: Design documents from `/specs/ALP-018-query-reformulation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not requested — no test tasks included.

**Organization**: US1 (typo correction) and US2 (abbreviation expansion) are both handled by the same reformulation function — they differ only in test scenarios, not implementation. Tasks are structured so US1 delivers the core function and US2 verifies it covers abbreviations.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add configuration for query reformulation model

- [x] T001 Add `query_reformulation_model` setting (default "gpt-4o-mini") to `backend/app/config.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the core reformulation service used by both user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create `backend/app/services/query_reformulation.py` with an async `reformulate_query(query: str, settings: Settings) -> str` function that: (1) creates a ChatOpenAI instance using `settings.query_reformulation_model` and `settings.openai_api_key`, (2) sends a prompt instructing the model to correct typos, fix misspelled names, and expand common abbreviations while preserving the original intent, (3) returns the corrected query as a plain string, (4) wraps the entire call in try/except with a 5-second timeout so any failure returns the original query unchanged, (5) logs when the reformulated query differs from the original (INFO level: "Query reformulated: '{original}' → '{corrected}'")

**Checkpoint**: Reformulation function ready — story integration can begin

---

## Phase 3: User Story 1 - Typo Correction in Proper Nouns (Priority: P1) 🎯 MVP

**Goal**: Integrate query reformulation into KB-only mode so misspelled proper nouns (e.g., "nenci pilossi") are corrected before vectorstore search.

**Independent Test**: Add content about "Nancy Pelosi" to KB, ask "nenci pilossi". Verify the system finds and uses Nancy Pelosi content.

### Implementation for User Story 1

- [x] T003 [US1] Import and call `reformulate_query()` in `_stream_kb_only()` in `backend/app/services/chat.py` — call it with the user's message before the `vectorstore.similarity_search()` call, use the reformulated query for search while keeping the original message for chat history and display

**Checkpoint**: KB-only mode handles typos. "nenci pilossi" should find Nancy Pelosi content.

---

## Phase 4: User Story 2 - Abbreviation Expansion + Extended Search (Priority: P2)

**Goal**: Apply reformulation to the `search_knowledge_base` agent tool so extended search mode also benefits. This also covers abbreviation expansion (same function, different test scenario).

**Independent Test**: Enable Extended search, ask "fed interest rates" when KB has "Federal Reserve" content. Verify retrieval works.

### Implementation for User Story 2

- [x] T004 [US2] Import and call `reformulate_query()` in the `search_knowledge_base` tool in `backend/app/services/agent_tools.py` — call it with the query parameter before `vectorstore.similarity_search()`, pass settings through the tool closure. This requires updating `make_kb_search_tool` to accept `settings` parameter alongside `vectorstore` and `deep_memory`
- [x] T005 [US2] Update the `make_kb_search_tool` call site in `backend/app/services/chat.py` (in the `stream()` method, around line 235) to pass `self.settings` to `make_kb_search_tool`

**Checkpoint**: Both KB-only and extended search modes use reformulation. Abbreviations like "fed" expand to "Federal Reserve" for better retrieval.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validate end-to-end behavior and build

- [x] T006 Run E2E validation per `specs/ALP-018-query-reformulation/quickstart.md` — test typo correction, abbreviation expansion, clean query passthrough, and failure resilience
- [x] T007 Run backend linter: `cd backend && uv run ruff check .`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (config setting)
- **US1 (Phase 3)**: Depends on Phase 2 (reformulation function)
- **US2 (Phase 4)**: Depends on Phase 2 (reformulation function). Independent of US1 (different files)
- **Polish (Phase 5)**: Depends on all phases complete

### User Story Dependencies

- **User Story 1 (P1)**: Modifies `chat.py` — integrates reformulation in KB-only mode
- **User Story 2 (P2)**: Modifies `agent_tools.py` + `chat.py` (different section) — integrates reformulation in extended search. T005 depends on T004.

### Parallel Opportunities

- T003 and T004 can run in parallel (different files: chat.py KB-only section vs agent_tools.py)
- T006 and T007 can run in parallel

---

## Parallel Example: User Stories 1 + 2

```bash
# After Phase 2 completes, these can launch in parallel:
Task: "T003 — Integrate reformulation in _stream_kb_only() in chat.py"
Task: "T004 — Integrate reformulation in search_knowledge_base tool in agent_tools.py"
# Then T005 sequentially after T004
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Add config setting
2. Complete Phase 2: Create reformulation function
3. Complete Phase 3: Integrate in KB-only mode
4. **STOP and VALIDATE**: Test "nenci pilossi" → should find Nancy Pelosi
5. Deploy if ready

### Full Delivery

1. Setup + Foundational → Reformulation function ready
2. US1 (KB-only) → Test: typo correction works
3. US2 (extended search + abbreviations) → Test: abbreviation expansion works in both modes
4. Polish → Linter + E2E validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Total: 7 tasks across 5 phases
- 1 new file created (`query_reformulation.py`), 3 existing files modified
- Commit after each phase completion
