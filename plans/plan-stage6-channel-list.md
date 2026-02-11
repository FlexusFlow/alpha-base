# Tech task

On the frontend Knowledge Base page, below the "Add YouTube Channel" and "Add Article" cards, display all scraped channels.

The app already saves scraped channels to the Supabase `channels` table.

Each channel card should show:
- Channel title
- Channel URL
- Total videos
- Last scraped date

When a channel card is clicked:
- Navigate to `/dashboard/knowledge/youtube/add`
- Auto-populate the YouTube Channel URL input with the channel URL
- Auto-populate the ChannelInfo component with channel data
- Auto-populate the video data table with the first page of data

Videos with `is_transcribed = true` in Supabase should not be selectable via row checkbox or "Select all" checkbox, preventing duplicate transcription.


# Claude Plan

## Stage 6: Display Scraped Channels + Transcription Guard

### Context

The Knowledge Base page (`next-frontend/app/dashboard/knowledge/page.tsx`) currently shows two action cards (YouTube Channel, Article) and a placeholder comment for future content. Channels are already persisted in Supabase via the `/api/youtube/preview` route (stage 5). This stage surfaces that data.

Additionally, the video table currently allows selecting any video, including ones already transcribed. The `is_transcribed` field exists in the `videos` table but is not surfaced to the frontend.

### Approach

**Channel list:** Fetch channels from Supabase on the Knowledge Base page and render as cards. No new API routes — the browser Supabase client queries `channels` directly (RLS already scoped to the authenticated user).

**Click-through:** Navigate to add page with `?url={channel_url}`. The add page reads the query param, auto-triggers `handlePreview()`, and the stage 5 cache serves data instantly.

**Transcription guard:** Add `is_transcribed` to the `YTVideo` type and include it in the API route's Supabase query. The VideoTable uses TanStack Table's `enableRowSelection` option to disable selection for transcribed rows. This also makes "Select all" skip them automatically.

---

### Step 1: Create a `getChannels` helper

**File:** `next-frontend/lib/supabase/channels.ts` (existing)

Add a new exported function:

```ts
export async function getChannels(
  supabase: SupabaseClient,
): Promise<DbChannel[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('id, channel_title, channel_url, total_videos, last_scraped_at, created_at')
    .order('last_scraped_at', { ascending: false, nullsFirst: false });

  if (error) throw new Error(`Failed to fetch channels: ${error.message}`);
  return (data ?? []) as DbChannel[];
}
```

Also add it to the `createBrowserChannelHelpers()` wrapper:

```ts
async getChannels() {
  return getChannels(supabase);
},
```

---

### Step 2: Create `ChannelCard` component

**New file:** `next-frontend/components/youtube/channel-card.tsx`

A small presentational component using existing shadcn Card:

- **Title row:** Channel title (bold) + external link icon linking to channel URL
- **Stats row:** Total videos count + last scraped date (formatted with `toLocaleDateString`)
- Clicking the card navigates to `/dashboard/knowledge/youtube/add?url={channel_url}`

Use existing patterns: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` from shadcn, `ExternalLink` icon from lucide-react.

---

### Step 3: Update Knowledge Base page

**File:** `next-frontend/app/dashboard/knowledge/page.tsx`

Changes:
1. Import `createBrowserChannelHelpers` and `DbChannel` type
2. Add state: `channels` (DbChannel[]) and `loading` (boolean)
3. Fetch channels on mount via `useEffect` + `channelHelpers.getChannels()`
4. Below the existing grid of action cards, render a new section:
   - Section heading: "Scraped Channels"
   - If loading: show a spinner or skeleton
   - If no channels: show a muted text ("No channels scraped yet")
   - Otherwise: render a responsive grid of `ChannelCard` components

---

### Step 4: Auto-populate add page from URL query param

**File:** `next-frontend/app/dashboard/knowledge/youtube/add/page.tsx`

Changes:
1. Import `useSearchParams` from `next/navigation`
2. Read `url` query param on mount: `const searchParams = useSearchParams(); const urlParam = searchParams.get('url');`
3. Add a `useEffect` that runs once when the component mounts:
   - If `urlParam` is present and `url` state is empty (first load):
     - Set `url` state to `urlParam`
     - Call `handlePreview()` with the param value to auto-fetch channel data
   - This populates the URL input, triggers the API call, and on response fills ChannelInfo + VideoTable automatically (existing `setPreview(result)` already handles this)

Since the channel was scraped before, the `/api/youtube/preview` route returns cached data from Supabase instantly (cache hit path from stage 5). The user sees the channel info and first page of videos without waiting for a re-scrape.

---

### Step 5: Surface `is_transcribed` and disable selection for transcribed videos

This requires changes across 3 layers:

**5a. Add `is_transcribed` to `YTVideo` type**

**File:** `next-frontend/lib/types/youtube.ts`

```ts
export interface YTVideo {
  video_id: string;
  title: string;
  url: string;
  views: number;
  category: string;
  is_transcribed: boolean;  // new
}
```

**5b. Include `is_transcribed` in the API route query**

**File:** `next-frontend/app/api/youtube/preview/route.ts`

- Add `is_transcribed` to the Supabase `.select()` call (line 122):
  ```ts
  .select('video_id, title, url, views, is_transcribed, category_id, categories(name)', { count: 'exact' })
  ```
- Include it in the mapping (line 149):
  ```ts
  is_transcribed: v.is_transcribed,
  ```
- For cache-miss (freshly scraped videos), all videos are new so set `is_transcribed: false` — but since we save then re-query from Supabase, the field comes from DB naturally.

**5c. Disable row selection for transcribed videos in VideoTable**

**File:** `next-frontend/components/youtube/video-table.tsx`

TanStack Table supports `enableRowSelection` as a function on the table options:

```ts
enableRowSelection: (row) => !row.original.is_transcribed,
```

This automatically:
- Prevents individual row checkbox from toggling for transcribed videos
- Makes "Select all" skip transcribed rows (`toggleAllPageRowsSelected` respects `enableRowSelection`)

Update the checkbox cells to reflect the disabled state:

- **Header checkbox:** use `table.getIsAllPageRowsSelected()` — already works correctly with `enableRowSelection`
- **Row checkbox:** add `disabled={!row.getCanSelect()}` to the Checkbox component

Optionally add a visual indicator (e.g., muted row opacity or a small "Transcribed" badge) so users understand why a row is not selectable.

**5d. Remove redundant `getTranscribedVideoIds` check from add page**

**File:** `next-frontend/app/dashboard/knowledge/youtube/add/page.tsx`

The `handleAddToKnowledge` function currently calls `channelHelpers.getTranscribedVideoIds()` to filter out already-transcribed videos before submitting. Since transcribed videos can no longer be selected in the table, this check becomes redundant. Remove it to simplify the flow.

---

### File Change Summary

| File | Action | What |
|------|--------|------|
| `next-frontend/lib/supabase/channels.ts` | Edit | Add `getChannels()` function + browser helper |
| `next-frontend/components/youtube/channel-card.tsx` | Create | Channel card presentational component |
| `next-frontend/app/dashboard/knowledge/page.tsx` | Edit | Fetch and display channel list |
| `next-frontend/app/dashboard/knowledge/youtube/add/page.tsx` | Edit | Read `?url=` param, auto-trigger preview, remove redundant transcribed check |
| `next-frontend/lib/types/youtube.ts` | Edit | Add `is_transcribed` to `YTVideo` |
| `next-frontend/app/api/youtube/preview/route.ts` | Edit | Include `is_transcribed` in query + mapping |
| `next-frontend/components/youtube/video-table.tsx` | Edit | Disable selection for transcribed rows |

### No backend changes required.

---

### Verification

1. Start Next.js: `cd next-frontend && npm run dev`
2. Navigate to Knowledge Base page
3. If channels exist in Supabase — cards appear below the action cards with title, URL, total videos, last scraped date
4. If no channels — "No channels scraped yet" message shown
5. Click a channel card — navigates to add page
6. URL input is pre-filled with channel URL
7. ChannelInfo shows channel title, video count, categories
8. VideoTable shows first page of videos (loaded from Supabase cache, no re-scrape)
9. Videos with `is_transcribed = true` have disabled checkboxes
10. "Select all" only selects non-transcribed videos
11. Transcribed videos cannot be submitted for transcription
