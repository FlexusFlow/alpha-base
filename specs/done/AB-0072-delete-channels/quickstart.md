# Quickstart: Delete Scraped Channels

**Feature**: AB-0072-delete-channels

## Prerequisites

- Backend running: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
- Frontend running: `cd next-frontend && npm run dev`
- Supabase project with channels/videos tables and RLS enabled
- At least one scraped channel with some transcribed videos (for full-path testing)

## What This Feature Does

Adds the ability to delete scraped YouTube channels from the Knowledge Base page. Deletion removes:
1. Vector store entries (DeepLake chunks matched by video_id)
2. Transcript markdown files from disk
3. Channel and video records from Supabase (cascade)

Cleanup order is strict: vectors → files → database. If cleanup fails, deletion aborts.

## Key Files to Modify

### Backend (Python)
| File | Change |
|------|--------|
| `backend/app/services/vectorstore.py` | Add `delete_by_video_ids()` method |
| `backend/app/services/transcriber.py` | Add `delete_transcripts()` function |
| `backend/app/services/job_manager.py` | Add `channel_id` field to Job, add `has_active_job_for_channel()` |
| `backend/app/routers/knowledge.py` | Add DELETE endpoint + bulk delete endpoint |
| `backend/app/models/knowledge.py` | Add response models for deletion |

### Frontend (Next.js)
| File | Change |
|------|--------|
| `next-frontend/app/api/channels/[channelId]/route.ts` | New — BFF proxy for single delete |
| `next-frontend/app/api/channels/delete-bulk/route.ts` | New — BFF proxy for bulk delete |
| `next-frontend/components/youtube/channel-card.tsx` | Add delete button with stopPropagation |
| `next-frontend/app/dashboard/knowledge/page.tsx` | Add delete handler, selection mode, bulk delete UI |
| `next-frontend/lib/supabase/channels.ts` | Add `getTranscribedCount()` helper |
| `next-frontend/components/ui/alert-dialog.tsx` | New — install shadcn/ui AlertDialog |

## Testing Checklist

1. **Single delete (no transcriptions)**: Scrape a channel, don't transcribe, delete it → channel card removed, no errors
2. **Single delete (with transcriptions)**: Scrape + transcribe some videos, delete → card removed, vector entries gone, .md files gone
3. **Cancel delete**: Click delete, cancel confirmation → nothing changes
4. **Active job guard**: Start transcription, try to delete same channel → blocked with message
5. **Bulk delete**: Select multiple channels, delete → all removed, summary toast shown
6. **Bulk partial failure**: Simulate one channel with active job in bulk → others deleted, failure reported
7. **RAG verification**: After deleting a transcribed channel, search in chat → no results from deleted content

## Architecture Decision: Why Backend Orchestration

The deletion endpoint lives in the Python backend (not as a Supabase direct call from frontend) because:
- Vector store (DeepLake) and transcript files are server-side resources
- Constitution Principle II: "All writes that involve business logic MUST go through the backend"
- Cleanup-first ordering requires atomic orchestration in a single process
