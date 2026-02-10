# Tech task
Please investigate whether next refactoring makes sense

I think we need some new backend layer, that will orchestrate our flows in more efficient way

I want to separate working with AI features (RAG, ChatOpenAI) and working with the infrustructure data (projects, videos, channels data etc)

UseCase:

service#1 - new service - should it be new nodejs express service or we can satisfy requirements using current nextjs project (/next-frontent) features. It is very critical architecture decision, so make deep investigation for best approach
service#2 - existing Python FastAPI service in /backend folder

- user presses Review button on Frontend: 
  - service#1 checks if this channel was already scraped today, 
  - if yes - it returns scraped data and page 1 of videos
  - if no 
    - service#1 calls scraping functionality (exists in service#2) and receives all the data scraped from the channel - metadata and 500 videos
    - service#1 saves this data to the supabase and returns only first page of the video (20 videos now)
- user  selects Next page
  - service#1 doesn't call service#2 (current behavior is it scrapes the channel again and again for getting data for each page)
  - service#2 

It will improve performance, as getting data from the supabase is more efficient than scraping it every time

Now we save only partial videos, because frontend receives only paginated list of videos and save request send from UI, not from scraping backend

It means that we will remove Save button from UI, as all scraped data will be saved implicitly


# Claude Plan

Here is Claude's plan:                                                                                                                        
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Stage 5: Scrape-Once Orchestration Layer via Next.js API Routes                                                                               
                                                                                                                                               
 Context                                                                                                                                       
                                                                                                                                               
 Problem: Every time the user paginates through YouTube channel videos, the Python FastAPI backend re-scrapes the entire channel from YouTube  
 (~500 videos via yt-dlp). This is slow (~20-60s per page) and wasteful.

 Goal: Scrape once per day, cache in Supabase, serve paginated data from the database. Remove the manual "Save Results" button (saving happens
  implicitly).

 Architecture Decision: Next.js API Routes (not separate Express service)

 Recommendation: Use Next.js API Routes as the orchestration layer (BFF pattern).

 Why NOT a separate Express service:
 - The orchestration logic is simple (cache check + forward + save)
 - next-frontend already has full Supabase integration (auth, types, client, DB functions)
 - No new service to deploy/maintain/monitor
 - Shared TypeScript types between frontend and API layer
 - Auth middleware already in place

 A separate Express service would only be justified if multiple frontends consumed the API, or if orchestration logic were complex (queues,
 long-running tasks). Neither applies here.

 New Data Flow

                           FIRST VISIT (cache miss)
 Frontend → Next.js API Route → Supabase: scraped today? NO
                              → Python Backend: scrape ALL 500 videos
                              → Save ALL to Supabase + set last_scraped_at
                              → Return page 1 (20 videos) from Supabase

                           SUBSEQUENT PAGES (cache hit)
 Frontend → Next.js API Route → Supabase: scraped today? YES
                              → Query Supabase with LIMIT/OFFSET
                              → Return requested page (~instant)

 Implementation Steps

 Step 1: Database Schema — Add last_scraped_at to channels

 SQL (Supabase Dashboard or migration):
 ALTER TABLE channels ADD COLUMN last_scraped_at TIMESTAMPTZ DEFAULT NULL;

 Edit next-frontend/lib/types/database.ts — add last_scraped_at: string | null to DbChannel.

 ---
 Step 2: Refactor lib/supabase/channels.ts — Accept Supabase Client Parameter

 Currently functions call createClient() internally (browser client). The new API route runs server-side and needs the server client. Fix:
 accept client as parameter.

 Changes:
 - saveChannelWithVideos(supabase, userId, preview, videos, updateLastScraped?) — accept client + userId; when updateLastScraped=true, include
  last_scraped_at: new Date().toISOString() in channel upsert
 - getCategoryMap(supabase) — accept client; remove module-level cache (unsafe for server-side)
 - getTranscribedVideoIds(supabase, videoIds) — accept client
 - markVideosTranscribed(supabase, videoIds) — accept client

 ---
 Step 3: Create Next.js API Route (core new file)

 New file: next-frontend/app/api/youtube/preview/route.ts

 GET handler logic:
 1. Parse query params: url (required), page (default 1), pageSize (default 20), category (optional)
 2. Auth check via server-side Supabase client
 3. Normalize channel URL (strip trailing /videos, standardize format)
 4. Cache check: query channels WHERE channel_url = normalized AND last_scraped_at >= today_start_UTC
 5. Cache MISS: Call Python backend GET /v1/api/youtube/preview?url=... (no limit/skip → returns all 500 videos). Save ALL via
 saveChannelWithVideos(supabase, userId, result, result.videos, true). Compute category counts from response.
 6. Cache HIT: Use existing channel data. Compute category counts by aggregating from videos table.
 7. Query videos from Supabase with: ORDER BY views DESC, RANGE(offset, offset+pageSize-1), optional category filter, count: 'exact'
 8. Join categories(name) to map category_id → category name
 9. Return YTChannelPreview-compatible JSON (same shape as current API response)

 ---
 Step 4: Update Frontend API Client

 Edit next-frontend/lib/api/youtube.ts:
 - Change endpoint from ${API_BASE_URL}/v1/api/youtube/preview to /api/youtube/preview
 - Change params from skip/limit to page/pageSize
 - page is 1-indexed (frontend's pageIndex + 1)

 ---
 Step 5: Update Page Component

 Edit next-frontend/app/dashboard/knowledge/youtube/add/page.tsx:
 - Remove "Save Results" button + saveStatus state + handleSaveResults function
 - Update fetchPage/handlePreview to pass page: pagination.pageIndex + 1, pageSize: pagination.pageSize
 - Remove the non-blocking saveChannelWithVideos() call from handleAddToKnowledge (saving now handled by API route)
 - Keep getTranscribedVideoIds and markVideosTranscribed calls (pass browser client)

 ---
 Step 6: Python Backend — No Changes Needed

 The existing /v1/api/youtube/preview endpoint with default limit=0 already returns ALL videos. The Next.js API route calls it as an internal
 service. No modifications required.

 ---
 File Change Summary
 ┌────────────────────────────────────────────────────────────┬─────────────┬───────────────────────────────────────────────────────────┐
 │                            File                            │   Action    │                           What                            │
 ├────────────────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────────────────────┤
 │ Supabase DB                                                │ ALTER TABLE │ Add last_scraped_at to channels                           │
 ├────────────────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────────────────────┤
 │ next-frontend/lib/types/database.ts                        │ Edit        │ Add last_scraped_at to DbChannel                          │
 ├────────────────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────────────────────┤
 │ next-frontend/lib/supabase/channels.ts                     │ Refactor    │ Accept SupabaseClient + userId params                     │
 ├────────────────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────────────────────┤
 │ next-frontend/app/api/youtube/preview/route.ts             │ Create      │ New orchestration API route                               │
 ├────────────────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────────────────────┤
 │ next-frontend/lib/api/youtube.ts                           │ Edit        │ Point to Next.js route; change skip/limit → page/pageSize │
 ├────────────────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────────────────────┤
 │ next-frontend/app/dashboard/knowledge/youtube/add/page.tsx │ Edit        │ Remove Save button; update pagination params              │
 └────────────────────────────────────────────────────────────┴─────────────┴───────────────────────────────────────────────────────────┘
 Edge Cases

 - Concurrent scrapes (two tabs): Safe — upsert semantics on both channels and videos tables
 - URL normalization: Normalize before Supabase lookup to avoid cache misses for URL variants (/@channel vs /@channel/videos)
 - Force re-scrape: Can add force=true param later to bypass cache check
 - First-scrape UX: First scrape is slow (~20-60s, same as current). All subsequent navigations are instant. Existing loading spinner handles
 this.

 Verification

 1. Start Python backend: cd backend && uv run uvicorn app.main:app --reload --port 8000
 2. Start Next.js: cd next-frontend && npm run dev
 3. Test first scrape: Enter a channel URL, click Preview → should see loading, then videos appear. Check Supabase: channels.last_scraped_at
 is set, videos table has all 500 rows.
 4. Test pagination: Click Next Page → should load instantly from Supabase (no Python backend call in terminal).
 5. Test category filter: Click a category badge → should filter and paginate correctly.
 6. Test same-day re-scrape: Refresh page, enter same URL, click Preview → should load from cache (no Python backend call).
 7. Verify "Save Results" button is gone from the UI.


