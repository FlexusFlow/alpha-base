# Feature Specification: Deep Memory Training for RAG Accuracy

**Feature ID**: ZIP-004
**Branch**: `feature/ZIP-004-deep-memory-training`
**Status**: Draft
**Created**: 2026-02-23

## Overview

Train Deep Lake's Deep Memory feature on AlphaBase's existing YouTube transcript dataset to significantly improve retrieval accuracy for the Knowledge Base RAG chat. Deep Memory learns a lightweight transformation layer on top of existing embeddings, adapting the vector space to the financial/trading domain without changing the underlying embedding model.

This is especially valuable for trading-specific terminology (ticker symbols like AAPL, TSLA), financial jargon ("put spread", "iron condor", "RSI divergence"), and domain-specific concepts that generic embeddings handle poorly — leading to irrelevant chunks being retrieved and lower-quality AI responses.

## Problem Statement

AlphaBase's Knowledge Base RAG chat uses generic OpenAI embeddings (text-embedding-3-small) that are not optimized for the financial/trading domain. This causes:

- **Retrieval misses**: When users ask about specific trading strategies, tickers, or financial concepts, the system retrieves tangentially related chunks instead of the most relevant ones
- **Domain vocabulary gaps**: Generic embeddings treat "iron condor" as two unrelated words rather than a specific options strategy, and cannot distinguish between "AAPL earnings call" and "apple fruit discussion"
- **Wasted LLM context**: Irrelevant retrieved chunks consume the LLM context window, reducing answer quality and increasing costs
- **User frustration**: Users asking precise trading questions get generic or off-topic answers, undermining trust in the Knowledge Base

## User Scenarios & Testing

### Scenario 1: Administrator Triggers Training Data Generation

**Given** an administrator wants to improve RAG accuracy
**When** they initiate the training data generation process
**Then** the system generates question-chunk pairs from all existing transcripts using an LLM

**Acceptance Criteria**:
- The system processes each stored transcript chunk and generates 3-5 relevant questions per chunk
- Questions are diverse in style (factual, conceptual, terminology-based)
- Progress is reported as the generation proceeds (e.g., "Processing chunk 45/1200")
- The generated training pairs are stored for review before training begins
- Generation can be resumed if interrupted (does not restart from scratch)

### Scenario 2: Administrator Reviews and Approves Training Data

**Given** training data has been generated
**When** the administrator reviews the generated question-chunk pairs
**Then** they can see a sample of the data, approve it, and initiate training

**Acceptance Criteria**:
- A summary is shown: total pairs generated, sample questions, coverage statistics
- The administrator can approve and proceed to training
- Basic statistics are provided (total questions, average questions per chunk, chunk coverage percentage)

### Scenario 3: Administrator Trains Deep Memory

**Given** training data has been approved
**When** the administrator initiates Deep Memory training
**Then** the system trains the transformation layer and reports results

**Acceptance Criteria**:
- Training runs in the background with progress reporting
- Upon completion, the system reports training metrics (recall improvement estimate)
- The administrator receives a notification when training completes
- Training does not interrupt ongoing user searches during the process

### Scenario 4: User Searches with Improved Retrieval

**Given** Deep Memory has been trained and enabled
**When** a user asks a trading-specific question in the RAG chat
**Then** the system retrieves more relevant chunks using the trained transformation layer

**Acceptance Criteria**:
- Search queries automatically use the Deep Memory transformation when enabled
- Retrieval accuracy improves for domain-specific queries (e.g., "What did the channel say about iron condor strategies?" retrieves options strategy content, not metallurgy content)
- Search latency remains acceptable (no significant degradation compared to standard search)
- Users do not need to take any action — the improvement is transparent

### Scenario 5: Administrator Toggles Deep Memory On/Off

**Given** Deep Memory has been trained
**When** the administrator toggles the Deep Memory feature
**Then** searches switch between standard embedding search and Deep Memory-enhanced search

**Acceptance Criteria**:
- A toggle is available to enable/disable Deep Memory
- When disabled, the system falls back to standard vector search
- Switching is immediate (no retraining required)
- The current state (enabled/disabled) is clearly displayed

### Scenario 6: Administrator Retrains After New Content

**Given** new YouTube channels/transcripts have been added since the last training
**When** the administrator initiates retraining
**Then** the system generates new training data for the new content and retrains the model

**Acceptance Criteria**:
- The system identifies which chunks are new since the last training run
- New training pairs are generated only for new chunks (incremental, not full regeneration)
- Retraining incorporates both existing and new training pairs
- If retraining produces poor results, the user can disable Deep Memory via the toggle to fall back to standard search, then retrain with adjusted data

## Functional Requirements

### FR-1: Training Data Generation Pipeline

The system must generate question-chunk pairs from existing transcript data:

1. Iterate through all stored transcript chunks in the vector store
2. For each chunk, send the content to an LLM with a prompt to generate 3-5 diverse questions that the chunk answers
3. Store the generated pairs as structured data: `{ question_text, chunk_id, chunk_content_preview }`
4. Track generation progress (chunks processed vs total)
5. Support resumable generation — if interrupted, continue from the last unprocessed chunk
6. Enforce a maximum of 5,000 training pairs per training run to stay within reasonable cost and time bounds

### FR-2: Training Data Storage and Review

The system must store and present training data for review:

1. Persist generated question-chunk pairs with metadata (generation timestamp, source chunk ID, LLM model used)
2. Provide a summary view: total pairs, sample questions, chunk coverage
3. Allow the administrator to approve the dataset for training

### FR-3: Deep Memory Training Execution

The system must execute the Deep Memory training process:

1. Accept the approved training dataset
2. Call the Deep Lake Deep Memory training API with the question-chunk pairs
3. Execute training as a background job with progress reporting via SSE
4. Store training results (metrics, timestamps, dataset size)
5. Handle training failures gracefully with clear error messages

### FR-4: Search Integration

The system must integrate Deep Memory into the existing RAG search pipeline:

1. When Deep Memory is enabled, pass `deep_memory=True` to all similarity search calls
2. When Deep Memory is disabled, use standard similarity search (existing behavior)
3. Persist the enabled/disabled state across application restarts
4. Ensure the toggle does not require restarting the application

### FR-5: Deep Memory Toggle

The system must provide control over Deep Memory via a dedicated page in the Next.js frontend:

1. Provide a toggle to enable/disable Deep Memory-enhanced search
2. Display the current status (enabled/disabled, last trained date, training data size)
3. Only allow enabling if training has been completed at least once
4. Accessible to all authenticated users (role-based restrictions deferred to future user roles feature)

### FR-6: Incremental Retraining

The system must support retraining when new content is added:

1. Track which chunks were included in the last training run
2. Identify new chunks added since the last run
3. Generate training pairs only for new chunks
4. Combine new pairs with existing pairs for retraining
5. Store training history to support comparison between runs

## Key Entities

### Training Pair
- A question-chunk association used to train Deep Memory
- Contains: question text, chunk ID, generation timestamp, source model
- Linked to: training run
- Persisted in Supabase with RLS scoping

### Training Run
- A record of a Deep Memory training execution
- Contains: start time, end time, status, pair count, metrics, enabled flag
- Linked to: training pairs, user who initiated
- Persisted in Supabase with RLS scoping

## Success Criteria

- **SC-1**: Retrieval accuracy for trading-specific queries (ticker symbols, strategy names, financial terminology) improves measurably after training — validated by comparing search results on a test set of 50 domain-specific questions before and after training
- **SC-2**: Training data generation processes the entire existing transcript library within 30 minutes
- **SC-3**: Deep Memory training completes within 15 minutes for up to 5,000 training pairs
- **SC-4**: Search latency with Deep Memory enabled remains under 3 seconds per query (comparable to current performance)
- **SC-5**: Users report improved answer relevance for domain-specific questions in the RAG chat
- **SC-6**: The administrator can complete the full training workflow (generate → review → train → enable) in under 1 hour
- **SC-7**: Retraining after adding new content takes proportionally less time than initial training (incremental, not full regeneration)

## Assumptions

1. The project will migrate to Cloud DeepLake before this feature is implemented — Deep Memory is a Cloud DeepLake feature not available in the open-source/local version
2. The Activeloop Cloud subscription will be active and the Deep Memory API available
3. Existing transcript chunks are of sufficient quality and granularity for meaningful training data generation — no re-chunking is needed
4. OpenAI API access is available for training data generation (using GPT-4o to generate questions from chunks)
5. All authenticated users can access the training workflow. Role-based access control (Admin/User/Superadmin) is a planned future feature and out of scope for ZIP-004
6. Training pair generation cost is acceptable (~$5-15 in LLM API costs for a few thousand chunks)

## Dependencies

- **Cloud DeepLake Migration** (backlog item): Deep Memory requires Cloud DeepLake — this must be completed first. The local DeepLake instance must be migrated to Activeloop Cloud before training can begin.
- **Existing vector store data**: Requires populated transcript chunks in DeepLake from the YouTube ingestion pipeline.

## Clarifications

### Session 2026-02-23

- Q: How should the administrator interact with the training workflow? → A: Full admin page in Next.js frontend, accessible to all authenticated users. Role-based access restrictions (Admin/User/Superadmin) will be added in a future feature.
- Q: Where should training pairs and training run records be stored? → A: Supabase (new tables), consistent with Constitution Principle III (Supabase as source of truth).
- Q: If training degrades retrieval quality, should the system support rollback? → A: Simple fallback — disable Deep Memory via toggle to revert to standard search, then retrain with adjusted data. No versioned rollback needed for v1.

## Out of Scope

- Cloud DeepLake migration itself (separate backlog item / feature)
- Re-chunking or modifying existing transcript data
- Fine-tuning the underlying embedding model (text-embedding-3-small)
- Role-based access control for training features (future user roles feature)
- A/B testing framework for comparing Deep Memory vs standard search in production
- Automatic scheduled retraining (manual trigger only)
- Multi-model training (training against different embedding models simultaneously)
- Custom question templates per channel or content type
