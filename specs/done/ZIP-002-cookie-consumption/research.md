# Research: ZIP-002 Cookie Consumption

## R-1: User ID Propagation Strategy

**Decision**: Pass `user_id` as a field in `KnowledgeAddRequest` body, following the existing pattern used by bulk delete.

**Rationale**: The backend has no auth middleware — it trusts the Next.js BFF layer to authenticate users. The existing `BulkDeleteRequest` already includes `user_id: str` in the request body, and the frontend extracts it via `supabase.auth.getUser()`. This is the established pattern.

**Alternatives considered**:
- Authorization header with Supabase JWT → Would require new middleware; over-engineering for current needs
- Extract user_id from channel/video ownership in DB → Adds extra query; fragile if channel not yet persisted

## R-2: Cookie Data Flow (Netscape Temp File)

**Decision**: Download cookie file JSON from Supabase Storage into memory, convert to Netscape cookie file format, write to a short-lived temp file, pass to yt-dlp via `cookiefile` option, delete temp file in `finally` block.

**Rationale**: yt-dlp's officially supported cookie mechanism is the `cookiefile` option, which expects a Netscape-format file path. The previous approach of constructing `http.cookiejar.CookieJar` objects and injecting them via `ydl._opener.add_handler(HTTPCookieProcessor(jar))` was **unreliable** — `_opener` is a private yt-dlp internal that may not be initialized when the `with` block starts, causing silent failures. The temp file approach uses yt-dlp's public API.

**Alternatives considered**:
- In-memory CookieJar + `ydl._opener` injection → **Failed in practice**: relies on private yt-dlp internals not guaranteed to be initialized
- In-memory CookieJar + `ydl.cookiejar` assignment only → Insufficient: yt-dlp doesn't use the jar without also configuring the HTTP handler
- Stream from storage → Unnecessary for small files

**Implementation note**: Temp files are created via `tempfile.NamedTemporaryFile(delete=False)` with unique random names, so concurrent requests from different users are fully isolated. Files are deleted in a `finally` block regardless of success/failure. Persistent local storage of cookie files remains prohibited.

## R-3: Domain Matching Strategy

**Decision**: Two-step lookup: exact match first, then parent domain fallback by stripping one subdomain level at a time.

**Rationale**: The `user_cookies` table has a UNIQUE constraint on `(user_id, domain)`. Exact match is a single indexed query. For fallback, strip the leftmost subdomain and retry (e.g., `music.youtube.com` → `youtube.com`). Stop at TLD+1 (don't query bare `.com`).

**Alternatives considered**:
- SQL LIKE/pattern matching → Less predictable, harder to index
- Store wildcard domains → Adds complexity to upload flow (ZIP-001 already complete)

## R-4: Supabase Python Client for Storage Download

**Decision**: Use `supabase.storage.from_('cookie-files').download(file_path)` with the service role client.

**Rationale**: The service role client bypasses RLS, so it can read any user's cookie files. The `file_path` column in `user_cookies` stores the full storage path (e.g., `{user_id}/{filename}`). The download method returns `bytes`.

**Alternatives considered**:
- Create signed URLs → Extra round-trip, unnecessary for server-side access
- Direct PostgreSQL bytea storage → Cookies are already in Supabase Storage (ZIP-001 decision)

## R-5: Where to Inject Cookie String

**Decision**: Pass parsed cookie JSON string into `get_transcript_via_ytdlp()` as a new `cookie` parameter, replacing the hardcoded `cookie = ""`. Inside the function, convert JSON to Netscape format, write to temp file, and pass via `ydl_opts["cookiefile"]`.

**Rationale**: The cookie parameter interface remains clean (JSON string in, yt-dlp handles it internally). The conversion from JSON → Netscape format and temp file lifecycle are encapsulated within `get_transcript_via_ytdlp()`. The old `http.cookiejar.CookieJar` + `_opener` injection code has been replaced entirely.

**Alternatives considered**:
- Pass pre-built CookieJar → Doesn't work: yt-dlp needs a file path via `cookiefile` option
- Convert to Netscape format in cookie_service → Leaks transcription tool concerns into the generic cookie service
- New wrapper function → Unnecessary indirection
