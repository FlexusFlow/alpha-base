# Quickstart: Cookie Management (ZIP-001)

**Branch**: `feature/ZIP-001-cookie-management`

## Prerequisites

1. ZipTrader dev environment running (`next-frontend` + Supabase)
2. Supabase project with auth configured

## Database Setup (One-time)

Run in Supabase SQL Editor:

```sql
CREATE TABLE public.user_cookies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  domain TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  earliest_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, domain)
);

ALTER TABLE public.user_cookies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cookies" ON public.user_cookies
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cookies" ON public.user_cookies
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own cookies" ON public.user_cookies
  FOR DELETE USING (auth.uid() = user_id);
```

## Storage Setup (One-time)

1. Go to Supabase Dashboard > Storage
2. Create bucket: `cookie-files` (private, not public)
3. Run in SQL Editor:

```sql
CREATE POLICY "Users can upload cookie files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'cookie-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own cookie files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'cookie-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own cookie files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'cookie-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

## Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `next-frontend/lib/types/cookies.ts` | UserCookie and CookieEntry type definitions |
| 2 | `next-frontend/lib/cookies.ts` | Utility functions (extractDomainFromFilename, normalizeDomain) |
| 3 | `next-frontend/app/api/cookies/route.ts` | API route: POST (upload), GET (list), DELETE |
| 4 | `next-frontend/components/cookie-management.tsx` | Main UI: upload form + cookies table |
| 5 | `next-frontend/components/cookie-warning-modal.tsx` | Security warning AlertDialog (future use) |
| 6 | `next-frontend/app/dashboard/cookies/page.tsx` | Dashboard page rendering CookieManagement |

## File to Modify

| # | File | Change |
|---|------|--------|
| 7 | `next-frontend/components/app-sidebar.tsx` | Add Cookie icon + "Cookies" nav item |

## Verification

1. `cd next-frontend && yarn dev` — no build errors
2. Navigate to `/dashboard/cookies` — page loads with upload form and empty table
3. Upload `test.com.cookies.json` — appears in table with domain, filename, date, status badge
4. Upload another for same domain — replaces the existing entry
5. Delete the cookie — row removed, success toast shown
6. Sidebar shows "Cookies" link and navigates correctly
7. Upload cookies until limit — 51st upload shows limit message

## Key Differences from Source Project

- No `next-intl` — all strings hardcoded in English
- Uses `AlertDialog` instead of `Dialog` for warning modal
- Types in `lib/types/cookies.ts` (not `lib/types.ts`)
- Added `earliest_expiry` field for expiration detection
- Added 50-cookie limit with UX guidance
- Domain normalization (www. stripping) applied at upload time
- Toast notifications for delete feedback (source used inline error)
