# Tech task
I want to migrate frontend pages and logic from /frontend subproject to the existing /next-frontend subproject 
  The structure and tech stack of the /next-frontend subproject remains the same

## /next-frontend subproject
- Projects/Project pages
  Rename Invoices page to Projects
  Project Page design presented in plans/project-page-design.png file
  User can view existing projects and create new project
  Project symantically means Project scoped work with users DeepLake database
  This will be implemented later

- Knowledge base page contains all previous activities on extending our knowlege base
  We have "Add article", "Add youtube channel" buttons
  If Add youtube channel pressed we see the page that is currently exist in /frontend subprojects as HomePage.tsx
  Migrate the whole existing logic to the new 

# Claude's plan
Migration Plan: YouTube Channel Management from /frontend to /next-frontend                                                                

 Context

 The user wants to migrate the YouTube channel management functionality from the existing Vite/React/MUI-based /frontend subproject to the
 Next.js 15/shadcn/ui-based /next-frontend subproject. The migration involves:

 1. Renaming the Invoices page to Projects (for future project-scoped work with DeepLake databases)
 2. Creating a Knowledge Base page with "Add Article" and "Add YouTube Channel" buttons
 3. Migrating HomePage.tsx functionality - the complete YouTube channel preview, video selection, and knowledge base addition workflow

 This migration maintains the existing business logic while adapting to Next.js App Router patterns and the shadcn/ui component library.

 Key Architectural Decisions

 1. DataGrid: TanStack Table + shadcn/ui (NOT MUI DataGrid)

 - Next-frontend uses shadcn/ui ecosystem exclusively
 - TanStack Table provides checkbox selection, sorting, pagination
 - Smaller bundle size (~30KB vs ~500KB for MUI DataGrid)
 - Requires manual implementation but provides better control and consistency

 2. API Integration: Direct fetch from Client Components

 - No Next.js API proxy routes needed (backend handles CORS)
 - Simpler architecture, fewer layers
 - SSE (Server-Sent Events) works natively in browser via EventSource

 3. Navigation Structure

 /dashboard/projects         # Renamed from /invoices
 /dashboard/knowledge        # Landing page with action buttons
 /dashboard/knowledge/youtube/add  # Full-page YouTube channel addition form

 Implementation Steps

 Phase 1: Environment & Dependencies

 Add to .env.local:
 NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

 Install dependencies:
 cd /Users/stanislav/personal/AI/projects/ziptrader/next-frontend
 npm install @tanstack/react-table
 npx shadcn@latest add alert
 npx shadcn@latest add toast
 npx shadcn@latest add progress
 npx shadcn@latest add pagination

 Phase 2: Rename Invoices → Projects

 Rename directory:
 - /app/dashboard/invoices/ → /app/dashboard/projects/

 Update files:
 - app/dashboard/projects/page.tsx - Change title from "Invoices" to "Projects"
 - components/app-sidebar.tsx - Update navigation item:
 import { FolderKanban, Database } from "lucide-react"

 const items = [
   {
     title: "Projects",
     url: "/dashboard/projects",
     icon: FolderKanban,
   },
   {
     title: "Knowledge Base",
     url: "/dashboard/knowledge",
     icon: Database,
   },
 ]

 Phase 3: Type Definitions

 Create /lib/types/youtube.ts:
 export interface YTVideo {
   video_id: string;
   title: string;
   url: string;
   views: number;
   category: string;
 }

 export interface YTChannelPreview {
   channel_title: string;
   channel_url: string;
   total_videos: number;
   categories: Record<string, number>;
   videos: YTVideo[];
 }

 Create /lib/types/knowledge.ts:
 export interface KnowledgeAddRequest {
   channel_title: string;
   videos: { video_id: string; title: string }[];
 }

 export interface KnowledgeAddResponse {
   job_id: string;
   message: string;
   total_videos: number;
 }

 export type JobStatus = "pending" | "in_progress" | "completed" | "failed";

 export interface JobStatusUpdate {
   id: string;
   status: JobStatus;
   progress: number;
   total_videos: number;
   processed_videos: number;
   failed_videos: string[];
   message: string;
 }

 Phase 4: API Client Layer

 Create /lib/api/youtube.ts:
 import { YTChannelPreview } from '../types/youtube';

 const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

 export interface PreviewChannelOptions {
   url: string;
   start?: number;
   limit?: number;
   category?: string;
 }

 export async function previewChannel(options: PreviewChannelOptions): Promise<YTChannelPreview> {
   const { url, start, limit, category } = options;
   const params = new URLSearchParams({ url });

   if (start !== undefined) params.append('start', start.toString());
   if (limit !== undefined) params.append('limit', limit.toString());
   if (category) params.append('category', category);

   const response = await fetch(`${API_BASE_URL}/v1/api/youtube/preview?${params}`);
   if (!response.ok) {
     throw new Error(`Failed to preview channel: ${response.statusText}`);
   }
   return response.json();
 }

 Note: Backend doesn't implement pagination (start, limit) or filtering (category) yet, but frontend is prepared for future backend support.
 Currently these parameters will be ignored by the backend.

 Create /lib/api/knowledge.ts:
 import { KnowledgeAddRequest, KnowledgeAddResponse } from '../types/knowledge';

 const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

 export async function addToKnowledge(request: KnowledgeAddRequest): Promise<KnowledgeAddResponse> {
   const response = await fetch(`${API_BASE_URL}/v1/api/knowledge/youtube/add`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(request),
   });
   if (!response.ok) {
     throw new Error(`Failed to add to knowledge: ${response.statusText}`);
   }
   return response.json();
 }

 Create /lib/api/events.ts:
 import { JobStatusUpdate } from '../types/knowledge';

 const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

 export function subscribeToJob(
   jobId: string,
   onUpdate: (data: JobStatusUpdate) => void,
   onError?: (error: Event) => void
 ): EventSource {
   const eventSource = new EventSource(`${API_BASE_URL}/v1/api/events/stream/${jobId}`);

   eventSource.addEventListener('job_update', (event: MessageEvent) => {
     const data: JobStatusUpdate = JSON.parse(event.data);
     onUpdate(data);
     if (data.status === 'completed' || data.status === 'failed') {
       eventSource.close();
     }
   });

   if (onError) {
     eventSource.onerror = onError;
   }

   return eventSource;
 }

 Phase 5: Video Table Component (TanStack Table)

 Create /components/youtube/video-table.tsx:

 This component replaces MUI DataGrid with TanStack Table. Key features:
 - Checkbox selection for rows
 - Sorting and pagination (client-side for now, ready for server-side)
 - External link to YouTube videos
 - Syncs selection state with parent component

 Uses: @tanstack/react-table, shadcn/ui Table, Checkbox, Button components

 Implementation note: Store row selection as Record<string, boolean> (TanStack format), convert to Set<string> of video_ids for parent via
 useEffect.

 Pagination approach: Use TanStack Table's built-in getPaginationRowModel() for client-side pagination currently. When backend implements
 pagination, we'll pass pageIndex and pageSize to the parent component to trigger API calls with start and limit parameters.

 Phase 6: Supporting Components

 Create /components/youtube/channel-info.tsx:
 - Displays channel metadata (title, URL, total videos, category chips)
 - Uses shadcn/ui Badge for categories
 - Category badges are clickable - clicking a badge calls onCategoryClick(category) callback to filter videos
 - Props: preview: YTChannelPreview, onCategoryClick?: (category: string) => void, selectedCategory?: string
 - Highlight selected category badge with different variant

 Create /components/youtube/job-notification.tsx:
 - Manages EventSource subscription for job progress
 - Shows toast notifications for status updates
 - Uses shadcn/ui useToast hook and Progress component
 - Cleans up EventSource on unmount

 Phase 7: Main YouTube Channel Addition Page

 Create /app/dashboard/knowledge/youtube/add/page.tsx:

 This is the primary migration target - HomePage.tsx logic adapted to Next.js.

 State management:
 - url: YouTube channel URL input
 - preview: Channel preview data
 - selectedIds: Set of selected video IDs
 - jobId: Background job tracking
 - phase: UI phase ("idle" | "loading" | "ready" | "submitting" | "processing")
 - error: Error messages
 - selectedCategory: Currently selected category filter (null = show all)
 - pagination: Page state (pageIndex, pageSize) for future backend pagination

 User flow:
 1. Enter YouTube channel URL → Preview button (calls API with initial pagination params)
 2. Display channel info + video table with selection
 3. [NEW] Click category badge → Re-fetch videos filtered by category
 4. [NEW] Change page → Re-fetch with new start/limit (when backend supports it)
 5. Select videos → "Add to My Knowledge" button
 6. Submit → Background job processing with SSE progress
 7. Show completion notification

 Category filtering:
 - When user clicks a category badge in ChannelInfo component, call previewChannel({ url, category: selectedCategory })
 - If same category clicked again, clear filter (show all videos)
 - Show visual indicator on selected category badge

 Must use 'use client' directive (Next.js client component)

 Phase 8: Knowledge Base Landing Page

 Create /app/dashboard/knowledge/page.tsx:

 Landing page with two cards:
 1. YouTube Channel - Button links to /dashboard/knowledge/youtube/add
 2. Article - Disabled button (future functionality)

 Uses shadcn/ui Card, Button, and lucide-react icons (Youtube, FileText)

 Phase 9: Update Sidebar Navigation

 Already covered in Phase 2 - add Knowledge Base menu item with Database icon

 Phase 10: Pagination Component

 Create /components/ui/pagination.tsx (if not already added via shadcn):
 npx shadcn@latest add pagination

 This component will be used in the video table for navigation between pages. Currently handles client-side pagination, but structured to
 support server-side pagination when backend is ready.

 Integration: The pagination component should pass onPageChange(pageIndex) events to the parent, which will eventually trigger API calls with
  updated start and limit parameters.

 Phase 11: Testing & Validation

 Prerequisites:
 - Backend running: cd backend && uv run uvicorn app.main:app --reload --port 8000
 - Frontend running: cd next-frontend && npm run dev

 Test scenarios:
 1. ✅ Navigate to /dashboard/projects (renamed page)
 2. ✅ Navigate to /dashboard/knowledge (landing page with two cards)
 3. ✅ Click "Add YouTube Channel" → navigates to /dashboard/knowledge/youtube/add
 4. ✅ Enter valid YouTube channel URL (e.g., https://www.youtube.com/@ZipTrader) → click Preview
 5. ✅ Channel info displays with video count and categories
 6. ✅ [NEW] Click a category badge → videos filter by category (category parameter sent to API)
 7. ✅ [NEW] Click same category badge again → filter clears, show all videos
 8. ✅ Video table shows with checkboxes - select multiple videos
 9. ✅ [NEW] Use pagination controls → navigate between pages (client-side for now)
 10. ✅ Click "Add to My Knowledge (N videos)" button
 11. ✅ Toast notification shows job processing with progress
 12. ✅ Job completes with success/error toast notification
 13. ✅ Backend logs show transcription processing

 Error cases to test:
 - Invalid URL → error message displays
 - No videos selected → button disabled
 - Backend offline → fetch error displayed
 - SSE connection issues → EventSource auto-reconnects

 Critical Files to Implement

 Essential (must implement):
 1. /app/dashboard/knowledge/youtube/add/page.tsx - Main page (HomePage.tsx logic)
 2. /components/youtube/video-table.tsx - Video selection table (replaces MUI DataGrid)
 3. /lib/api/youtube.ts - YouTube preview endpoint
 4. /lib/api/knowledge.ts - Add to knowledge endpoint
 5. /lib/api/events.ts - SSE job tracking

 Supporting:
 6. /components/youtube/channel-info.tsx - Channel metadata display
 7. /components/youtube/job-notification.tsx - Job progress notifications
 8. /app/dashboard/knowledge/page.tsx - Landing page
 9. /lib/types/youtube.ts - Type definitions
 10. /lib/types/knowledge.ts - Type definitions

 Modifications:
 11. /components/app-sidebar.tsx - Update navigation
 12. Rename /app/dashboard/invoices/ → /app/dashboard/projects/

 Reusable Utilities from /frontend

 API patterns (from /frontend/src/api/):
 - youtube.ts → previewChannel function
 - knowledge.ts → addToKnowledge function
 - events.ts → subscribeToJob with EventSource

 Component patterns (from /frontend/src/components/):
 - ChannelInfo.tsx → Display channel metadata
 - VideoTable.tsx → Video selection (adapt to TanStack Table)
 - JobNotification.tsx → SSE progress tracking

 State management pattern:
 - Phase-based UI state (idle, loading, ready, submitting, processing)
 - Local component state only (no Context/Redux needed)

 Key Differences from Original /frontend
 ┌─────────────┬────────────────────────┬─────────────────────────────┐
 │   Aspect    │       /frontend        │       /next-frontend        │
 ├─────────────┼────────────────────────┼─────────────────────────────┤
 │ Framework   │ Vite                   │ Next.js 15 App Router       │
 ├─────────────┼────────────────────────┼─────────────────────────────┤
 │ UI Library  │ MUI v7                 │ shadcn/ui + Radix           │
 ├─────────────┼────────────────────────┼─────────────────────────────┤
 │ Data Grid   │ MUI DataGrid v8        │ TanStack Table              │
 ├─────────────┼────────────────────────┼─────────────────────────────┤
 │ HTTP Client │ Axios                  │ fetch API                   │
 ├─────────────┼────────────────────────┼─────────────────────────────┤
 │ Env Vars    │ import.meta.env.VITE_* │ process.env.NEXT_PUBLIC_*   │
 ├─────────────┼────────────────────────┼─────────────────────────────┤
 │ Components  │ Auto client-side       │ Need 'use client' directive │
 ├─────────────┼────────────────────────┼─────────────────────────────┤
 │ Tailwind    │ v4                     │ v3                          │
 └─────────────┴────────────────────────┴─────────────────────────────┘
 Notes

 - MUI DataGrid v8 selection model: Original uses { type: 'include', ids: Set<GridRowId> }. TanStack Table uses different format - maintain
 Set<string> of video_ids for compatibility with backend.
 - SSE EventSource cleanup: Critical to close EventSource on component unmount to prevent memory leaks.
 - Toast vs Snackbar: Original uses MUI Snackbar for job progress. Next-frontend uses shadcn/ui Toast. Consider showing persistent
 notification for in-progress jobs.
 - Backend endpoints: No changes needed - frontend consumes existing FastAPI endpoints.
 - Backend pagination (future): Backend doesn't implement start, limit, or category parameters yet. Frontend sends these parameters to be
 ready for future backend implementation. Currently, backend returns all videos and frontend does client-side pagination/filtering.
 - Category filtering: When category badge clicked, frontend sends category parameter to API. Backend will eventually filter server-side, but
  for now frontend receives all videos and can filter client-side if needed.