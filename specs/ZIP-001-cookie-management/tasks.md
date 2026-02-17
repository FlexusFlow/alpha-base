# Tasks: Cookie Management (ZIP-001)

**Branch**: `feature/ZIP-001-cookie-management`
**Generated**: 2026-02-17
**Source**: [spec.md](./spec.md) | [plan.md](./plan.md) | [data-model.md](./data-model.md) | [contracts/cookies-api.yaml](./contracts/cookies-api.yaml)

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 12 |
| Setup phase | 2 tasks |
| Foundational phase | 2 tasks |
| US1 (Upload) | 3 tasks |
| US2 (View) | 1 task |
| US3 (Delete) | 1 task |
| US4 (Sidebar Nav) | 1 task |
| Polish phase | 2 tasks |
| Parallel opportunities | 4 tasks marked [P] |

---

## Phase 1: Setup

- [ ] T001 Create TypeScript type definitions for UserCookie and CookieEntry in `next-frontend/lib/types/cookies.ts`
  - `UserCookie` interface: id (string), user_id (string), domain (string), filename (string), file_path (string), earliest_expiry (string | null), created_at (string)
  - `CookieEntry` interface: name, value, domain, path (all string), expires (number, optional), httpOnly (boolean, optional), secure (boolean, optional), sameSite ('Strict' | 'Lax' | 'None', optional)
  - Reference: [data-model.md](./data-model.md)

- [ ] T002 Create cookie utility functions in `next-frontend/lib/cookies.ts`
  - `extractDomainFromFilename(filename: string): string | null` — extracts domain from `<domain>.cookies.json` pattern, returns null if no match
  - `normalizeDomain(domain: string): string` — lowercases and strips `www.` prefix
  - `getEarliestExpiry(cookies: CookieEntry[]): string | null` — finds minimum `expires` timestamp from cookie entries, returns ISO string or null
  - Reference: [research.md](./research.md) Decision 1 & 3

---

## Phase 2: Foundational

- [ ] T003 Create Supabase `user_cookies` table and RLS policies
  - Run the SQL from [quickstart.md](./quickstart.md) "Database Setup" section in Supabase SQL Editor
  - Table: `user_cookies` with columns: id (UUID PK), user_id (UUID FK), domain (TEXT), filename (TEXT), file_path (TEXT), earliest_expiry (TIMESTAMPTZ nullable), created_at (TIMESTAMPTZ)
  - UNIQUE constraint on (user_id, domain)
  - RLS policies for SELECT, INSERT, DELETE scoped to `auth.uid() = user_id`

- [ ] T004 Create Supabase Storage bucket `cookie-files` with access policies
  - Create private bucket `cookie-files` in Supabase Dashboard > Storage
  - Run storage policies SQL from [quickstart.md](./quickstart.md) "Storage Setup" section
  - Policies for INSERT, SELECT, DELETE scoped to user's folder `auth.uid()::text = (storage.foldername(name))[1]`

---

## Phase 3: User Story 1 — Upload a Cookie File (P1)

**Goal**: Users can upload a `<domain>.cookies.json` file, which is stored in Supabase Storage with metadata in the database. Same-domain re-upload replaces the existing cookie. 50-cookie limit enforced.

**Independent test**: Upload a valid `.cookies.json` file → verify row appears in `user_cookies` table and file exists in `cookie-files` bucket. Upload for same domain → verify old entry replaced. Upload 51st cookie → verify 409 error.

- [ ] T005 [US1] Create the cookie API route handler in `next-frontend/app/api/cookies/route.ts`
  - Implement `POST` handler (multipart/form-data):
    1. Authenticate user via `createClient()` from `@/lib/supabase/server`
    2. Extract file from `request.formData()`
    3. Validate file size ≤ 1 MB — return 400 with "File too large. Maximum size is 1 MB." if exceeded
    4. Validate filename matches `<domain>.cookies.json` pattern using `extractDomainFromFilename()`
    5. Normalize domain via `normalizeDomain()`
    6. Check user's cookie count — if >= 50 and no existing cookie for this domain, return 409 with limit message
    7. Parse file content as JSON, extract `CookieEntry[]`, compute `getEarliestExpiry()`
    8. If cookie exists for same domain: delete old file from storage, delete old DB row
    9. Upload file to `cookie-files` bucket at path `{user_id}/{filename}`
    10. Insert row into `user_cookies` (user_id, domain, filename, file_path, earliest_expiry)
    11. Return the created cookie record
  - Implement `GET` handler: query `user_cookies` where user_id matches, order by created_at desc, return `{ cookies: UserCookie[] }`
  - Implement `DELETE` handler: read `id` from query params, verify ownership, delete file from storage, delete DB row, return `{ success: true }`
  - Error responses per [contracts/cookies-api.yaml](./contracts/cookies-api.yaml): 400, 401, 404, 409, 500
  - Reference: [contracts/cookies-api.yaml](./contracts/cookies-api.yaml), [research.md](./research.md) Decision 2 & 5

- [ ] T006 [P] [US1] Create the cookie management component in `next-frontend/components/cookie-management.tsx`
  - **Upload form section**:
    - File input (`<input type="file" accept=".json">`) with a styled button (shadcn `Button`)
    - On file select: POST to `/api/cookies` with FormData
    - Show loading state on button during upload
    - On success: refresh cookie list, show success toast
    - On error: show error toast with message from API response
  - **Cookies table section**:
    - Columns: Domain, Filename, Uploaded (formatted date), Status (expiry badge), Actions (delete button)
    - Status badge logic: compare `earliest_expiry` to `Date.now()`:
      - `null` → gray "Unknown" badge
      - Future → green "Active" badge
      - Past → red "Expired" badge (destructive variant)
    - Delete button per row: calls DELETE `/api/cookies?id={id}`, removes row from state, shows toast
    - Empty state when no cookies
  - Use `'use client'` directive (hooks, interactivity)
  - Use `useState` for cookies list, `useEffect` to fetch on mount via GET `/api/cookies`
  - Reference: [research.md](./research.md) Decision 6, [spec.md](./spec.md) US1/US2/US3 acceptance scenarios

- [ ] T007 [P] [US1] Create the cookies dashboard page in `next-frontend/app/dashboard/cookies/page.tsx`
  - Import and render `CookieManagement` component
  - Page title/heading: "Cookies" or "Cookie Management"
  - Follow existing dashboard page patterns (check other pages in `app/dashboard/` for layout conventions)

---

## Phase 4: User Story 2 — View Uploaded Cookies (P1)

**Goal**: Users see all their cookies in a table with domain, filename, date, and expiration status.

**Independent test**: With pre-existing cookies in the database, navigate to `/dashboard/cookies` → verify table shows all entries with correct data.

- [ ] T008 [US2] Verify cookie list display and empty state in `next-frontend/components/cookie-management.tsx`
  - This is covered by T006 implementation. Verify:
    - GET `/api/cookies` is called on mount and populates the table
    - All columns render correctly (domain, filename, formatted date, status badge)
    - Empty state shows when no cookies exist
    - Table updates after upload (US1) and delete (US3) without page reload
  - This task is a verification/integration check — adjust T006 if any gaps found

---

## Phase 5: User Story 3 — Delete a Cookie (P2)

**Goal**: Users can delete a cookie with immediate feedback (no confirmation dialog).

**Independent test**: Upload a cookie, click delete → verify row disappears, success toast shown, file removed from storage, DB row deleted.

- [ ] T009 [US3] Verify delete flow end-to-end in `next-frontend/components/cookie-management.tsx` and `next-frontend/app/api/cookies/route.ts`
  - This is covered by T005 (DELETE handler) and T006 (delete button). Verify:
    - Delete button calls DELETE `/api/cookies?id={id}`
    - On success: row removed from state immediately, success toast shown
    - On error: error toast shown, row remains in table
    - No confirmation dialog (per spec clarification)
  - This task is a verification/integration check — adjust T005/T006 if any gaps found

---

## Phase 6: User Story 4 — Sidebar Navigation (P2)

**Goal**: "Cookies" link appears in the dashboard sidebar and navigates to the cookies page.

**Independent test**: Click "Cookies" in sidebar → navigated to `/dashboard/cookies`. Active state highlighted when on that page.

- [ ] T010 [US4] Add "Cookies" navigation item to `next-frontend/components/app-sidebar.tsx`
  - Add a new nav item with:
    - Icon: `Cookie` from `lucide-react`
    - Label: "Cookies"
    - URL: `/dashboard/cookies`
  - Place it logically in the nav (after Knowledge Base or similar)
  - Follow existing nav item patterns in the file
  - Verify active state highlighting works (should be automatic if following existing pattern)

---

## Phase 7: Polish & Cross-Cutting

- [ ] T011 [P] Create cookie warning modal component in `next-frontend/components/cookie-warning-modal.tsx`
  - Use shadcn `AlertDialog` (not Dialog — see [research.md](./research.md) Decision 4)
  - Content: Security warning that cookie files contain sensitive authentication tokens
  - Props: `open`, `onOpenChange`, `onConfirm`
  - Not wired to any consumer in this feature (per spec assumptions) — ready for future scraping flow
  - Reference: [spec.md](./spec.md) Assumptions

- [ ] T012 Verify build and full integration
  - Run `cd next-frontend && yarn build` — must pass with no errors
  - Walk through all [quickstart.md](./quickstart.md) verification steps:
    1. Page loads at `/dashboard/cookies` with upload form and empty table
    2. Upload `test.com.cookies.json` → appears in table with correct data
    3. Upload for same domain → replaces existing entry
    4. Delete cookie → row removed, success toast
    5. Sidebar "Cookies" link navigates correctly
    6. Upload until limit → 51st upload shows limit message

---

## Dependencies

```text
T001, T002 (Setup) ─── can run in parallel
      │
      ▼
T003, T004 (Supabase setup) ─── can run in parallel, but manual steps
      │
      ▼
T005 (API route) ◄──── T006, T007 can run in parallel with T005
      │                    │
      ▼                    ▼
T008 (Verify view) ◄── depends on T005 + T006
T009 (Verify delete) ◄── depends on T005 + T006
T010 (Sidebar) ◄── independent, needs T007 page to exist
T011 (Warning modal) ◄── fully independent, can run anytime
T012 (Final verify) ◄── depends on all above
```

## Parallel Execution Opportunities

**Within Phase 1**: T001 and T002 can be developed in parallel (no shared files).

**Within Phase 3**: T006 (component) and T007 (page) can be developed in parallel with T005 (API route) since they target different files. T006 can use mock data initially.

**Across Phases**: T011 (warning modal) is fully independent and can be developed at any time.

## Implementation Strategy

**MVP (minimum shippable)**: Complete Phases 1–3 (Setup + Foundational + US1). This gives users the ability to upload cookies and see them listed — the core value proposition.

**Incremental delivery**:
1. MVP: Upload + View (US1 covers both since T006 includes the table)
2. Add delete capability (US3 — already in T005/T006, just verify)
3. Add sidebar nav (US4 — single file change)
4. Add warning modal (polish — future use only)
