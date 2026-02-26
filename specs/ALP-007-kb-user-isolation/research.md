# ALP-007 Research: Per-User Knowledge Base Isolation

## R1: DeepLake Partitioning Strategy

**Decision**: Separate datasets per user (`hub://<org>/user-<user_id>`)

**Rationale**:
- True access isolation — each dataset is its own security boundary. Metadata filtering (`WHERE user_id = 'X'`) is query-time only and does not prevent cross-tenant access if the shared token leaks or code has a bug.
- Deep Memory trains per-dataset. With separate datasets, each user automatically gets their own trained retrieval model. A shared dataset with metadata filtering would produce a single global model trained on all users' data.
- Deletion is clean — `deeplake.delete()` or `overwrite=True` removes all user data atomically. No need to enumerate and delete individual chunks.
- Writer locking is simpler — DeepLake is single-writer. Per-user datasets mean users' ingestion jobs don't contend on the same write lock.

**Alternatives considered**:
- **Shared dataset + metadata filter**: Lower complexity but no true isolation, no per-user Deep Memory, write contention on shared dataset. Rejected.
- **Hybrid (shared dataset now, migrate later)**: Deferred complexity without a benefit — the project has no existing user data to migrate, so starting with separate datasets costs nothing extra.

## R2: Dataset Naming and Lifecycle

**Decision**: Use path format `hub://<org>/user-<user_id>` where `<user_id>` is the Supabase UUID.

**Rationale**:
- UUIDs are unique and stable. No collision risk between users.
- Hyphens are valid in DeepLake dataset names.
- The `user-` prefix makes datasets identifiable in the Activeloop dashboard.

**Key constraint**: Once a DeepLake Cloud dataset is deleted via `deeplake.delete()`, the name **cannot be reused**. For account deletion cleanup, use `overwrite=True` to clear all data while retaining the dataset shell, rather than hard-deleting the dataset. This preserves the name in case the user re-registers or the deletion is triggered erroneously.

**Alternatives considered**:
- Suffixed names (`user-<user_id>-v1`): Unnecessary versioning complexity. `overwrite=True` avoids the name reuse problem.
- Hash-based names: Less debuggable in the Activeloop dashboard. UUIDs are already unique.

## R3: VectorStoreService Refactoring Pattern

**Decision**: Make `VectorStoreService` accept `user_id` at instantiation time. A factory function constructs the service with the per-user dataset path.

**Rationale**:
- The current `VectorStoreService.__init__` reads `settings.deeplake_path` once. Changing it to accept a dynamic path (derived from `user_id`) is the minimal refactor needed.
- A factory function (`get_user_vectorstore(user_id, settings)`) keeps the caller interface simple and centralizes the path-building logic.
- `settings.deeplake_path` becomes a base/prefix (e.g., `hub://org/`) rather than a full dataset path.

**Alternatives considered**:
- Passing `user_id` to each method call: More invasive, requires changing every method signature and re-opening the dataset per call.
- Subclassing VectorStoreService: No behavioral difference per user — only the path changes. A factory is simpler.

## R4: Deep Memory Per-User Viability

**Decision**: Proceed with per-user Deep Memory training. Each user's dataset has its own Deep Memory model.

**Rationale**:
- Deep Memory's `.train()` method operates on the dataset it's called from. Per-user datasets automatically scope the trained model.
- The 50-chunk minimum warning (from clarification) addresses the thin-data scenario.
- The existing `training_generator.py` uses `get_all_chunk_ids_and_texts()` which will naturally return only the user's chunks when called on a per-user dataset — no filtering logic needed.

**Risk**: Users with very small knowledge bases (<50 chunks) may see degraded Deep Memory performance. Mitigated by the warning UI.

## R5: Account Deletion Cleanup Strategy

**Decision**: Use `overwrite=True` to clear the dataset on account deletion, not `deeplake.delete()`.

**Rationale**:
- `deeplake.delete()` permanently burns the dataset name — it can never be reused on DeepLake Cloud.
- `overwrite=True` re-initializes the dataset as empty, preserving the name.
- Supabase `ON DELETE CASCADE` already handles metadata tables. The vector store cleanup must be triggered separately (Supabase webhook or application-level hook).

**Alternatives considered**:
- Hard delete with `deeplake.delete()`: Risk of name exhaustion if users repeatedly create/delete accounts. Rejected.
- No cleanup (leave orphaned datasets): Violates privacy requirements and wastes storage. Rejected.
