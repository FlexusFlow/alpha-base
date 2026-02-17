# Implementation Plan: Cookie Management

**Branch**: `feature/ZIP-001-cookie-management` | **Date**: 2026-02-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/ZIP-001-cookie-management/spec.md`

## Summary

Migrate the cookie management system from medium-legal-scrapper to ZipTrader. This is a frontend-only feature (Next.js API routes + Supabase) enabling users to upload, view, and delete browser cookie JSON files. Key additions beyond the source: domain normalization (www. stripping), cookie expiration detection with visual indicators, and a 50-cookie-per-user limit with cleanup guidance.

## Technical Context

**Language/Version**: TypeScript (Next.js 15, React 19)
**Primary Dependencies**: Next.js App Router, shadcn/ui, Supabase JS client, lucide-react
**Storage**: Supabase (PostgreSQL for metadata, Storage for files)
**Testing**: Manual verification (frontend feature, no backend changes)
**Target Platform**: Web (Next.js)
**Project Type**: Web application (frontend-only changes)
**Performance Goals**: Page load < 2s, upload feedback < 3s, delete feedback < 2s (from SC-001/002/003)
**Constraints**: Max 50 cookies per user, max 1 MB per file, one cookie per domain per user
**Scale/Scope**: Single-user feature, ~50 rows max per user, 7 files created + 1 modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript-First Frontend, Python Backend | PASS | All new code is TypeScript frontend. No backend changes needed. |
| II. API-Boundary Separation | PASS | Writes go through Next.js API routes (not direct browser-to-Supabase). Reads could go through API routes too for consistency. |
| III. Supabase as Source of Truth | PASS | All state in Supabase (user_cookies table + cookie-files bucket). RLS enforced. |
| IV. Background Jobs with Real-Time Feedback | N/A | No long-running operations. Cookie upload/delete are synchronous. |
| V. Simplicity and Pragmatism | PASS | Migrating proven code from source project. No new abstractions. Minimal additions (expiry, limit). |

**Post-Design Re-check**: All gates still pass. No backend involvement means Principle II is satisfied via Next.js API routes as the write boundary.

## Project Structure

### Documentation (this feature)

```text
specs/ZIP-001-cookie-management/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: setup & verification guide
├── contracts/
│   └── cookies-api.yaml # Phase 1: OpenAPI contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (next step)
```

### Source Code (new/modified files)

```text
next-frontend/
├── lib/
│   ├── types/
│   │   └── cookies.ts           # NEW: UserCookie, CookieEntry interfaces
│   └── cookies.ts               # NEW: extractDomainFromFilename, normalizeDomain utilities
├── app/
│   ├── api/
│   │   └── cookies/
│   │       └── route.ts         # NEW: POST (upload), GET (list), DELETE endpoints
│   └── dashboard/
│       └── cookies/
│           └── page.tsx         # NEW: Cookies dashboard page
├── components/
│   ├── cookie-management.tsx    # NEW: Upload form + cookies table component
│   ├── cookie-warning-modal.tsx # NEW: Security warning AlertDialog (future use)
│   └── app-sidebar.tsx          # MODIFIED: Add "Cookies" nav item
└── (no new dependencies)
```

**Structure Decision**: Frontend-only changes within the existing `next-frontend/` directory. Follows established patterns: types in `lib/types/`, utilities in `lib/`, API routes in `app/api/`, components in `components/`, pages in `app/dashboard/`. No backend changes.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
