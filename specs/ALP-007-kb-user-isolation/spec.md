# Feature Specification: Per-User Knowledge Base Isolation

**Feature ID**: ALP-007
**Branch**: `feature/ALP-007-kb-user-isolation`
**Status**: Draft
**Created**: 2026-02-26

## Overview

AlphaBase's DeepLake vector store is a single shared instance. Every user who adds YouTube channels or articles contributes content to the same knowledge base, and every user's RAG queries search across all content regardless of ownership. Supabase metadata (channels, videos, articles) is already user-scoped via RLS, but the vectorized content in DeepLake is not.

This feature introduces per-user isolation so each user has their own knowledge base partition. A user's RAG queries only return results from their own content, and adding or removing content affects only their partition.

## Problem Statement

The current shared vector store creates several issues:

- **Privacy leakage**: User A's proprietary research (YouTube channels, articles) is searchable by User B through RAG chat
- **Noisy results**: Queries return content from other users' domains, reducing relevance and accuracy
- **Unsafe deletion**: Removing a user's channel requires careful filtering to avoid deleting another user's overlapping content
- **Deep Memory contamination**: Training data generated from one user's content influences another user's retrieval quality
- **Scaling barrier**: A single monolithic vector store becomes harder to manage as user count grows

## User Scenarios & Testing

### Scenario 1: New User Gets Empty Knowledge Base

**Given** a newly registered user with no channels or articles
**When** the user opens the RAG chat and asks a question
**Then** the system responds that no knowledge base content is available yet

**Acceptance Criteria**:
- New users do not see or search content from other users
- The system provides a clear message guiding the user to add channels or articles
- No errors occur when searching an empty user partition

### Scenario 2: User Adds Content to Their Own Knowledge Base

**Given** an authenticated user who adds a YouTube channel and transcribes videos
**When** the transcription and vectorization completes
**Then** the vectorized content is stored in the user's own partition, not a shared store

**Acceptance Criteria**:
- Vectorized chunks are associated exclusively with the adding user
- Other users cannot retrieve these chunks through their RAG queries
- The user can immediately query their newly added content

### Scenario 3: User Queries Only Their Own Content

**Given** two users (Alice and Bob) who have each added different YouTube channels
**When** Alice asks a question in RAG chat
**Then** only Alice's channels and articles appear in the retrieved context and source citations

**Acceptance Criteria**:
- Search results contain only content owned by the querying user
- Source citations reference only the querying user's channels/videos
- Deep Memory enhancement (if enabled) applies only to the user's own content

### Scenario 4: User Deletes Content Without Affecting Others

**Given** Alice and Bob have both added the same YouTube channel independently
**When** Alice deletes her copy of the channel
**Then** only Alice's vectorized content for that channel is removed; Bob's content remains intact

**Acceptance Criteria**:
- Deleting a channel removes only the requesting user's vector chunks
- Bob's queries continue to return results from his copy of the same channel
- Supabase metadata deletion (already user-scoped) remains consistent with vector store deletion

### Scenario 5: Public API Queries User-Scoped Content

**Given** a user with an API key (from ZIP-006) querying via the public RAG endpoint
**When** the API request is authenticated and processed
**Then** the query searches only the content belonging to the API key's owner

**Acceptance Criteria**:
- Public API queries respect the same user isolation as dashboard queries
- The `user_id` derived from the API key determines which partition is searched
- No additional configuration is needed for API key users

### Scenario 6: Deep Memory Training Uses Only User's Content

**Given** a user triggers Deep Memory training from the dashboard
**When** the training pipeline generates question-answer pairs and trains the model
**Then** training data is generated exclusively from the user's own vector store content

**Acceptance Criteria**:
- Chunk enumeration for training pair generation is scoped to the user's partition
- The trained Deep Memory model improves retrieval only for the user's content
- Training status and metrics reflect only the user's data volume

## Functional Requirements

### FR-1: User-Scoped Vector Store Partitioning

The system must ensure each user's vectorized content is isolated from other users:

1. Each user's content must be stored in a dedicated partition or dataset within DeepLake
2. The partitioning strategy must work on both local filesystem (development) and DeepLake Cloud (dev/production environments), driven by configuration only
3. Creating a user's partition must happen automatically when their first content is vectorized
4. The partition must be identifiable by the user's unique identifier
5. No shared or global vector store is used for user content

### FR-2: User-Scoped Vector Search

All RAG queries must be restricted to the querying user's content:

1. Dashboard chat queries must search only the authenticated user's partition
2. Public API queries (ZIP-006) must search only the API key owner's partition
3. The similarity search interface must accept a user identifier to determine which partition to query
4. Search parameters (top-k, score threshold, Deep Memory toggle) continue to work as before within the user's partition

### FR-3: User-Scoped Content Ingestion

Adding content must write to the correct user's partition:

1. Video transcription vectorization must store chunks in the submitting user's partition
2. Article vectorization (if applicable) must store chunks in the submitting user's partition
3. Chunk metadata must continue to include `video_id`, `title`, `channel`, and `source` fields
4. The ingestion pipeline must create the user's partition if it does not yet exist

### FR-4: User-Scoped Content Deletion

Removing content must affect only the requesting user's partition:

1. Deleting a channel must remove vector chunks only from the requesting user's partition
2. Deleting individual videos must remove vector chunks only from the requesting user's partition
3. Deletion must not require cross-partition coordination or locking

### FR-5: Partition Cleanup on Account Deletion

When a user account is deleted, their vector store partition must be automatically purged:

1. Deleting a user account must trigger removal of the user's entire vector store partition
2. Cleanup must not affect other users' partitions
3. Cleanup must be complete — no orphaned chunks remain after account deletion

### FR-6: User-Scoped Deep Memory Training

Deep Memory workflows must operate within user boundaries:

1. Chunk enumeration for training data generation must pull only from the user's partition
2. Deep Memory training must produce a model scoped to the user's content
3. Deep Memory evaluation metrics must reflect the user's content only
4. The Deep Memory enabled/disabled toggle continues to be per-user (already implemented)
5. If the user's partition contains fewer than 50 chunks, the system must display a warning that training results may be poor but still allow the user to proceed

## Key Entities

### User Vector Store Partition
- **user_id**: UUID (maps to auth.users)
- **partition_identifier**: Derived from user_id (e.g., dataset path or namespace)
- **created_at**: Timestamp (when first content was vectorized)
- **chunk_count**: Integer (total vectorized chunks in partition)

### Vector Chunk (existing, unchanged)
- **video_id**: Text (YouTube video ID)
- **title**: Text (video or article title)
- **channel**: Text (source channel name)
- **source**: Text (URL to original content)

## Success Criteria

- **SC-1**: Users can only retrieve content they personally added — zero cross-user information leakage in RAG responses
- **SC-2**: Adding or removing content for one user has no observable effect on another user's knowledge base or query results
- **SC-3**: RAG query response times remain under 3 seconds per query after isolation is implemented
- **SC-4**: Deep Memory training operates correctly within user-scoped partitions, with training quality equivalent to or better than the shared model
- **SC-5**: The public API (ZIP-006) respects user isolation without any changes to the API key authentication flow

## Assumptions

1. DeepLake supports per-user isolation via separate datasets on both local filesystem and Cloud (Managed Tensor DB) — local uses directory-per-user, cloud uses dataset-per-user, controlled by a single configuration value
2. No existing user data requires migration — the shared vector store can be decommissioned without data transfer
3. The user base is small enough that per-user datasets (if that strategy is chosen) do not create prohibitive overhead in DeepLake Cloud
4. Deep Memory training per user is viable — DeepLake's Deep Memory API supports training on individual user-scoped datasets

## Dependencies

- **ZIP-004 Deep Memory Training**: Deep Memory workflows must be adapted to user-scoped partitions
- **ZIP-006 Public RAG API**: Public query endpoint must respect user isolation
- **Supabase user-scoped metadata**: Existing RLS policies on channels/videos/articles tables (already implemented)

## Out of Scope

- Shared or team-based knowledge bases (multiple users sharing a partition)
- Cross-user content discovery or search
- Admin-level access to all users' content
- Vector store provider migration (staying on DeepLake Cloud)
- Changes to the Supabase schema for channels, videos, or articles (already user-scoped)
- Per-user storage quotas or limits
- Real-time sync between Supabase metadata and vector store state
- Migration of existing shared vector store content (no active users with data)

## Clarifications

### Session 2026-02-26

- Q: Should migration from shared to per-user vector store happen with zero downtime or maintenance window? → A: No migration needed — there are no active users with existing data. The shared vector store can be replaced directly.
- Q: When a user account is deleted, should their vector store partition be automatically purged? → A: Yes, auto-purge partition on account deletion.
- Q: Should there be a minimum chunk count before Deep Memory training is allowed on a per-user partition? → A: Minimum threshold of 50 chunks — show a warning below threshold but still allow training.
- Q: Can local filesystem be used for development and DeepLake Cloud for dev/prod? → A: Yes. The storage backend (local vs. cloud) is controlled by the `deeplake_path` config value. Local uses `./knowledge_base`, cloud uses `hub://<org>`. Per-user path derivation works identically on both.
