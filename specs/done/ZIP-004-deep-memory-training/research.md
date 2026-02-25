# Research: ZIP-004 Deep Memory Training

## R-1: Deep Memory API Requirements

**Decision**: Deep Memory requires Cloud DeepLake (Managed Tensor Database) — cannot run on local storage.

**Rationale**: The Deep Memory training and inference APIs are cloud-only features of DeepLake. Training executes asynchronously on Activeloop's managed service. The current local storage (`./knowledge_base/deeplake_store`) must be migrated to `hub://org_id/dataset_name` format with `runtime={"tensor_db": True}`.

**Alternatives considered**:
- Fine-tuning the embedding model itself — rejected (expensive, complex, breaks general knowledge)
- Custom re-ranking layer built in-house — rejected (Deep Memory is purpose-built for this, lower effort)

## R-2: Deep Memory Training API Signature

**Decision**: Use `db.vectorstore.deep_memory.train()` with queries list and relevance tuples.

**API**:
```python
job_id = db.vectorstore.deep_memory.train(
    queries: List[str],                           # question strings
    relevance: List[List[Tuple[str, float]]],     # [(chunk_id, score)] per query
    embedding_function: Optional[Callable] = None  # optional, uses init default
)
```

**Key details**:
- `queries` and `relevance` must be same length
- Each relevance entry maps a query to one or more `(document_id, relevance_score)` tuples
- `document_id` is the DeepLake dataset's internal `id` tensor value
- `relevance_score` range: 0.0 (unrelated) to 1.0 (highly related)
- Returns a `job_id` string for tracking async training

**Status check**: `db.vectorstore.deep_memory.status(job_id)`
**Evaluation**: `db.vectorstore.deep_memory.evaluate(queries, relevance, top_k=[1, 3, 5, 10])`

## R-3: Search Integration Pattern

**Decision**: Pass `deep_memory=True` to similarity search calls.

**Options available**:
1. LangChain retriever: `retriever.search_kwargs["deep_memory"] = True`
2. Direct search: `db.similarity_search(query, k=5, deep_memory=True)`
3. Init-time: `DeeplakeVectorStore(..., deep_memory=True)`

**Chosen approach**: Option 2 — modify existing `VectorStoreService.similarity_search()` to accept an optional `deep_memory` parameter. This is the smallest change and keeps the toggle dynamic (no re-initialization needed).

**Alternatives considered**:
- Init-time flag — rejected (would require service restart to toggle)
- LangChain retriever — not used in current codebase (direct search is used)

## R-4: Training Data Generation Strategy

**Decision**: Use OpenAI GPT-4o to generate 3-5 questions per transcript chunk.

**Rationale**: GPT-4o is already in the tech stack (RAG chat uses it). Generating questions from chunks is a well-understood prompt pattern. Each chunk is sent individually with a prompt asking for diverse questions the chunk could answer.

**Prompt strategy**:
- Include the chunk text as context
- Ask for 3-5 diverse questions: factual, conceptual, terminology-based
- Instruct the model to include domain-specific terms (tickers, strategy names)
- Return structured JSON for easy parsing

**Cost estimate**: ~1,000 chunks × ~500 tokens per chunk × ~200 output tokens = ~700K tokens total ≈ $3-5

**Alternatives considered**:
- Anthropic Claude for generation — viable but GPT-4o already in stack, no reason to add dependency
- Manual question curation — rejected (doesn't scale, defeats the automation purpose)

## R-5: Cloud DeepLake Configuration Changes

**Decision**: Update `Settings` to support both local and cloud DeepLake paths.

**Required config changes**:
- `deeplake_path`: Change from `./knowledge_base/deeplake_store` to `hub://org_id/alphabase-kb`
- New: `activeloop_token` — Activeloop API token
- New: `deep_memory_enabled` — boolean flag for search toggle
- `runtime={"tensor_db": True}` must be set when connecting

**Migration path**: The Cloud DeepLake migration is a separate prerequisite feature. ZIP-004 assumes it's already done and the config points to a cloud dataset.

## R-6: Training Pair Storage in Supabase

**Decision**: Store training pairs and runs in new Supabase tables.

**Rationale**: Consistent with Constitution Principle III (Supabase as source of truth). The review UI needs to query this data. Training pairs are application state, not vector data.

**Tables needed**:
- `deep_memory_training_runs` — tracks each training execution
- `deep_memory_training_pairs` — stores question-chunk associations

**RLS**: Both tables scoped to authenticated users (all authed users can access per clarification).

## R-7: Background Job Pattern for Training

**Decision**: Reuse existing `JobManager` + SSE pattern for both data generation and training execution.

**Rationale**: Constitution Principle IV requires long-running operations to use FastAPI BackgroundTasks + SSE. Training data generation (iterating chunks, calling LLM) and Deep Memory training (async cloud job) are both long-running.

**Two job types needed**:
1. **Generation job**: Iterates chunks, calls OpenAI, stores pairs. Progress = chunks processed / total.
2. **Training job**: Calls Deep Memory train API, polls status. Progress = training job status.

**Rate limiting**: OpenAI calls during generation need `asyncio.sleep()` between chunks (similar to transcription pattern with 2s delay).
