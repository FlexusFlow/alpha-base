# Research: ZIP-006 Public RAG API

## R-1: API Key Format and Generation

**Decision**: Use `zt_` prefix + `secrets.token_urlsafe(32)` → 44+ character keys

**Rationale**:
- `secrets.token_urlsafe` provides cryptographically secure random bytes encoded in URL-safe base64
- 32 bytes → 43 characters after base64 encoding + 3 characters for `zt_` prefix = 46 total
- The `zt_` prefix makes keys immediately recognizable as ZipTrader keys (useful for support, debugging, and preventing accidental leakage of other service keys)
- URL-safe encoding prevents issues with keys being used in URLs or query parameters (though we use headers)
- Python's `secrets` module is the recommended way to generate tokens for security-sensitive applications

**Alternatives Considered**:
1. *UUID-based keys* — Shorter (36 chars) but lower entropy. UUIDs are not designed for cryptographic security.
2. *Plain random hex* — Requires manual encoding. `secrets.token_urlsafe` is simpler and designed for this use case.
3. *No prefix* — Makes keys less recognizable. Rejected because the prefix aids support and debugging.

**Reference**: [Python secrets documentation](https://docs.python.org/3/library/secrets.html)

---

## R-2: Synchronous vs Streaming Responses

**Decision**: Use synchronous JSON responses, not SSE streaming

**Rationale**:
- The dashboard chat uses SSE for real-time streaming UX — essential for human users watching a response appear word-by-word
- External integrations (AI assistants, cURL scripts, automation tools) prefer full responses — they buffer anyway before processing
- Synchronous responses are simpler to consume: standard JSON libraries, no special SSE client needed
- The public API is designed for programmatic access, not human interactive chat
- LangChain's `astream()` can be consumed and accumulated server-side, then returned as a complete response

**Alternatives Considered**:
1. *SSE streaming (same as dashboard)* — Requires all consumers to implement SSE client logic. Rejected for simplicity.
2. *WebSocket* — Overkill for request-response pattern. Adds connection management complexity.

**Implementation Note**: The endpoint still uses `llm.astream()` internally for consistency with ChatService, but accumulates chunks before returning.

---

## R-3: Rate Limiting Strategy

**Decision**: In-memory defaultdict with timestamp tracking per key_id. 60 requests/minute limit.

**Rationale**:
- MVP requires simple, working rate limiting — distributed Redis is premature optimization
- In-memory solution works fine for single-instance deployments (current state)
- `defaultdict(list)` with timestamp pruning is a standard pattern for sliding window rate limiting
- 60 requests/minute is generous for MVP usage patterns (external AI assistants typically query once per user interaction)
- When scaling to multi-instance deployment, migrating to Redis is straightforward

**Alternatives Considered**:
1. *Redis-based rate limiting* — Production-grade but requires additional infrastructure. Deferred to future work.
2. *Token bucket algorithm* — More complex than needed for MVP. Sliding window (timestamp tracking) is sufficient.
3. *No rate limiting* — Unacceptable. Even MVP must prevent abuse.

**Migration Path**: The rate limiter is isolated in `services/rate_limiter.py`. When migrating to Redis, only this file needs to change — no endpoint modifications required.

---

## R-4: API Key Storage and Verification

**Decision**: Store SHA-256 hash, verify by hashing incoming key and comparing

**Rationale**:
- Never store plaintext secrets — standard security practice
- SHA-256 is fast, deterministic, and collision-resistant for this use case
- Verification is simple: hash the incoming key, look up the hash in the database
- The hash is indexed for O(1) lookups
- Key prefixes (first 12 chars) are stored separately for UI display without compromising security

**Alternatives Considered**:
1. *Store plaintext keys* — Unacceptable security risk. Rejected.
2. *bcrypt/argon2 hashing* — Overkill. These are designed to be slow (password hashing). API key verification should be fast. SHA-256 is sufficient because keys are high-entropy random tokens, not user-chosen passwords.
3. *Store encrypted keys* — Requires key management for the encryption key. SHA-256 hash is simpler and equally secure for this use case.

**Security Note**: The full key is shown to the user ONCE at creation time. After the modal is closed, it cannot be recovered — only revoked and replaced.

---

## R-5: Usage Logging Scope

**Decision**: Minimal logging for MVP — only api_key_id, user_id, endpoint, status_code, timestamp

**Rationale**:
- Sufficient for auditing and basic usage analytics
- No PII or sensitive data in logs (question/answer content is NOT logged)
- No token counting or cost tracking for MVP — can be added later if billing is implemented
- No IP address tracking — simplifies privacy compliance for MVP
- Lightweight logging minimizes database write overhead

**Alternatives Considered**:
1. *Log request/response bodies* — Privacy concern and unnecessary storage. Rejected.
2. *Log IP addresses* — Useful for abuse detection but adds privacy complexity. Deferred.
3. *Track token counts* — Requires integration with LLM response metadata. Deferred to billing work.

**Future Work**: If paid tiers are implemented, extend the schema with `tokens_used` and `cost` columns.

---

## R-6: Public Endpoint Architecture — Reuse ChatService or Separate?

**Decision**: Reuse existing ChatService for RAG retrieval, skip chat history persistence

**Rationale**:
- ChatService already implements the full RAG pipeline: `_retrieve_context`, `_build_messages`, LLM streaming
- Deep Memory integration is already wired into ChatService's retrieval
- No need to duplicate this logic — pass `user_id` from the API key to ChatService and it "just works"
- The only difference is NOT calling `_save_message` (public queries have no `project_id` context)
- Code reuse reduces bugs and maintenance burden

**Alternatives Considered**:
1. *Create a separate PublicRAGService* — Duplicates ChatService logic. Rejected for DRY principle.
2. *Add a flag to ChatService to skip persistence* — Clean separation of concerns. This is the chosen approach (implicit — just don't call save methods).

**Implementation Detail**: The public query endpoint instantiates ChatService, calls retrieval and generation methods, but does NOT call `_save_message`.

---

## R-7: ClawHub Skill File Format

**Decision**: Simple markdown file (~30-40 lines) with description, usage, API contract, and AI instructions

**Rationale**:
- ClawHub skills are markdown-based documentation files consumed by AI assistants
- The AI reads the skill file to understand WHEN and HOW to use the tool
- Format mirrors existing ClawHub skills: brief description, when to trigger, API contract (endpoint, auth, request/response), error handling, AI-specific guidance
- Markdown is human-readable and AI-friendly
- No executable code — purely declarative

**Content Requirements**:
- **Description**: What the skill does (query ZipTrader's YouTube knowledge base)
- **Trigger conditions**: When to use (trading questions, user explicitly asks for ZipTrader)
- **API contract**: Endpoint URL, authentication (Bearer token), request body schema, response schema
- **Error handling**: How to handle 401, 429, 500 errors
- **AI instructions**: Cite sources in responses, prompt user for API key if missing

**Reference**: Example ClawHub skills follow this pattern. The skill file is consumed by Claude's tool-use capability.

---

## R-8: JWT Middleware Deferral

**Decision**: Do NOT implement JWT middleware for internal endpoints in this feature

**Rationale**:
- The scope of this feature is PUBLIC API access, not securing internal endpoints
- Internal endpoints currently use a simple `user_id` in request body pattern (inherited from legacy architecture)
- Adding JWT middleware would require:
  - Supabase JWT verification
  - Updating ALL existing routers to use the new middleware
  - Updating ALL frontend API proxies to pass JWTs
  - Testing across the entire app
- This is a large refactor orthogonal to the public API feature
- The public API uses a SEPARATE authentication mechanism (API keys), so it doesn't depend on JWT work

**Backlog Item**: "FastAPI Auth Middleware" — separate ticket to migrate internal endpoints from `user_id` param to JWT-based auth.

**Relationship**: The two authentication systems coexist:
- **Internal endpoints** (dashboard): Eventually JWT middleware (future work)
- **Public endpoints** (external integrations): API key Bearer tokens (this feature)
