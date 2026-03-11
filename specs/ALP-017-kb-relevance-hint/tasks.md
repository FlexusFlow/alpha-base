# Tasks: KB Relevance Hint

**Input**: Design documents from `/specs/ALP-017-kb-relevance-hint/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks grouped by user story. US1 (backend) must complete before US2 (frontend) since the frontend depends on the new `kb_relevant` SSE field.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add configuration for the new relevance threshold

- [x] T001 Add `kb_relevance_threshold` setting (default 0.5) to `backend/app/config.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update shared type definitions that both stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Add `kbRelevant?: boolean` and `extendedSearch?: boolean` fields to `ChatMessage` interface in `next-frontend/lib/types/chat.ts`
- [x] T003 [P] Update `onDone` callback in `next-frontend/lib/api/chat.ts` to parse `kb_relevant` from SSE done event and pass it to the callback (update callback signature to include `kbRelevant` parameter)

**Checkpoint**: Types and API parsing ready — story implementation can begin

---

## Phase 3: User Story 1 - Always Show KB Sources and Best-Effort Answer (Priority: P1) 🎯 MVP

**Goal**: Replace the canned "I don't have information" refusal with best-effort answers using KB context. Compute relevance from vectorstore scores and pass `kb_relevant` flag through SSE.

**Independent Test**: Ask a question where KB has loosely related content. Verify the LLM attempts an answer (not a refusal) and sources are always displayed.

### Implementation for User Story 1

- [x] T004 [US1] Replace `KB_ONLY_SYSTEM_PROMPT` in `backend/app/services/chat.py` with two prompt variants: (1) high-relevance prompt that instructs answering from context without canned refusal, (2) low-relevance prompt that instructs best-effort answer if tangentially related or graceful fallback if completely unrelated — never the canned "I don't have information" message
- [x] T005 [US1] Update `_stream_kb_only()` in `backend/app/services/chat.py` to compute `kb_relevant` boolean from top vectorstore score vs `kb_relevance_threshold` setting, select the appropriate prompt variant based on relevance, and yield `kb_relevant` in the done event dict. Handle zero-results case (`kb_relevant=False`, no context in prompt)
- [x] T006 [US1] Update `event_generator()` in `backend/app/routers/chat.py` to pass `kb_relevant` field from the service done chunk through to the SSE done event JSON. Omit field (or set null) when `extended_search=True`

**Checkpoint**: Backend returns `kb_relevant` in SSE. LLM always attempts best-effort answers in KB-only mode. Sources always present when KB has results.

---

## Phase 4: User Story 2 - Extended Search Hint on Low Relevance (Priority: P1)

**Goal**: Display a static "For more relevant information, try using Extended search" hint below sources when `kb_relevant` is false and the user is in KB-only mode.

**Independent Test**: Ask a tangentially related question with Extended search unchecked. Verify hint appears below sources. Check Extended search, repeat — hint should not appear.

### Implementation for User Story 2

- [x] T007 [US2] Update `onDone` handler in `next-frontend/components/chat/chat-window.tsx` to store `kbRelevant` from the callback and the current `extendedSearch` state into the assistant message object
- [x] T008 [US2] Add extended search hint rendering to `next-frontend/components/chat/chat-message.tsx` — below the sources list, show muted static text "For more relevant information, try using Extended search" when `message.kbRelevant === false` and `message.extendedSearch !== true`. Use `text-xs text-muted-foreground` styling consistent with existing source display

**Checkpoint**: Full feature functional — hint appears only when KB-only mode + low relevance, never in extended search mode.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validate end-to-end behavior

- [ ] T009 Run E2E validation per `specs/ALP-017-kb-relevance-hint/quickstart.md` — test all 4 scenarios (relevant KB, low-relevance KB, zero results, extended search mode)
- [x] T010 Verify no TypeScript build errors: `cd next-frontend && yarn build`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Can run in parallel with Phase 1 (different files)
- **US1 (Phase 3)**: Depends on Phase 1 (config setting)
- **US2 (Phase 4)**: Depends on Phase 2 (types) and Phase 3 (backend produces `kb_relevant`)
- **Polish (Phase 5)**: Depends on all phases complete

### User Story Dependencies

- **User Story 1 (P1)**: Backend-only — can start after Phase 1 config setting is added
- **User Story 2 (P1)**: Frontend — depends on US1 completing (needs `kb_relevant` in SSE) and Phase 2 types

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T001 can run in parallel with T002/T003 (backend config vs frontend types)
- T009 and T010 can run in parallel

---

## Parallel Example: Setup + Foundational

```bash
# These can all launch together (different files, no dependencies):
Task: "T001 — Add kb_relevance_threshold to backend/app/config.py"
Task: "T002 — Update ChatMessage type in next-frontend/lib/types/chat.ts"
Task: "T003 — Update SSE parsing in next-frontend/lib/api/chat.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Add config setting
2. Complete Phase 2: Update frontend types
3. Complete Phase 3: Backend always answers + sends `kb_relevant`
4. **STOP and VALIDATE**: Test backend via direct SSE inspection — LLM no longer refuses, `kb_relevant` field present
5. Deploy backend independently if ready

### Full Delivery

1. Setup + Foundational → Foundation ready
2. US1 (backend) → Test: LLM behavior corrected, `kb_relevant` in SSE
3. US2 (frontend) → Test: Hint appears/hides correctly
4. Polish → E2E validation + build check

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Total: 10 tasks across 5 phases
- No new files created — all modifications to existing files
- Commit after each phase completion
