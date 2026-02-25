# Research: Cookie Management (ZIP-001)

**Date**: 2026-02-17
**Branch**: `feature/ZIP-001-cookie-management`

## Decision 1: Cookie Expiration Detection Strategy

**Decision**: Parse uploaded cookie JSON files client-side to extract the earliest `expires` timestamp from cookie entries. Compare against current time to determine if cookies are expired. Display status as a Badge in the table.

**Rationale**: Cookie JSON files (Netscape/browser export format) contain an `expires` field (Unix timestamp) per entry. By reading the file content during upload and extracting the minimum expiration date, we can store this as metadata and check it on display. This avoids re-reading storage files on every page load.

**Alternatives considered**:
- Server-side parsing on every GET request — rejected (unnecessary storage reads, slower page loads)
- Store nothing, always show "unknown" — rejected (spec requires expiration indicators)
- Parse on upload + store `earliest_expiry` in `user_cookies` table — **chosen** (one-time cost, fast reads)

## Decision 2: Architecture — Frontend-Only vs Backend Involvement

**Decision**: Cookie management is frontend-only (Next.js API routes + Supabase). No Python backend involvement.

**Rationale**: The source project implements all cookie CRUD through Next.js API routes talking directly to Supabase (auth, storage, database). Cookie management doesn't involve any business logic that requires the Python backend (no transcription, no vectorization, no background jobs). This aligns with Constitution Principle II: "Direct Supabase queries from the frontend browser client are permitted ONLY for user-scoped reads. All writes that involve business logic MUST go through the backend or Next.js API routes." Cookie writes go through Next.js API routes, which satisfies this requirement.

**Alternatives considered**:
- Add Python backend endpoints — rejected (unnecessary complexity, no backend-specific logic needed)
- Direct browser-to-Supabase writes — rejected (upload + DB insert need atomicity, better as API route)

## Decision 3: Domain Normalization Approach

**Decision**: Use the existing `normalizeDomain()` utility from the source project, which lowercases and strips `www.` prefix. Apply normalization at upload time before storing in the database.

**Rationale**: Simple, deterministic, handles the most common subdomain variant. The `extractDomainFromFilename` function extracts from `<domain>.cookies.json` pattern, then `normalizeDomain` standardizes it.

**Alternatives considered**:
- Full public suffix list normalization — rejected (over-engineering for this use case)
- No normalization — rejected (user clarification explicitly requires www. stripping)

## Decision 4: Cookie Warning Modal — Dialog vs AlertDialog

**Decision**: Convert source's `Dialog` component to `AlertDialog` since AlphaBase has `alert-dialog.tsx` in its UI components but not `dialog.tsx`.

**Rationale**: AlertDialog provides the same modal UX with built-in accessibility for warning/confirmation patterns. The component maps cleanly: Dialog → AlertDialog, DialogContent → AlertDialogContent, etc.

**Alternatives considered**:
- Add `dialog.tsx` shadcn component to project — rejected (unnecessary when AlertDialog works)
- Skip the modal entirely — rejected (spec requires it for future scraping flow)

## Decision 5: 50-Cookie Limit Enforcement

**Decision**: Check cookie count server-side in the POST API route before accepting upload. Return 409 Conflict with descriptive message when limit reached.

**Rationale**: Server-side enforcement is authoritative and cannot be bypassed. Frontend can also check count for immediate UX feedback, but the API route is the enforcement boundary.

**Alternatives considered**:
- Client-side only check — rejected (can be bypassed, not reliable)
- Database constraint — rejected (PostgreSQL doesn't natively support per-user row count limits; would need a trigger, which is over-engineering)

## Decision 6: Expiration Display Logic

**Decision**: Store `earliest_expiry` (Unix timestamp) in the `user_cookies` table. On the frontend, compare against `Date.now()` and show a Badge: green "Active" if future, red "Expired" if past, gray "Unknown" if no expiry data found.

**Rationale**: One-time computation at upload, zero cost at read time. Users can immediately see which cookies need replacement.

**Alternatives considered**:
- Show exact expiration date — could add alongside badge but primary need is active/expired binary
- Re-parse file on each load — rejected (unnecessary storage reads)
