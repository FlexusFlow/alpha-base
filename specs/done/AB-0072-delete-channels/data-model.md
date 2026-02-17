# Data Model: Delete Scraped Channels

**Feature**: AB-0072-delete-channels
**Date**: 2026-02-11

## Existing Entities (No Schema Changes)

### Channel
| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | Auto-generated |
| user_id | UUID (FK → auth.users) | ON DELETE CASCADE |
| channel_title | TEXT | Not null |
| channel_url | TEXT | Not null |
| total_videos | INT | Default 0 |
| last_scraped_at | TIMESTAMPTZ | Nullable |
| created_at | TIMESTAMPTZ | Default NOW() |
| updated_at | TIMESTAMPTZ | Default NOW() |

**Unique constraint**: (user_id, channel_url)

### Video
| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | Auto-generated |
| channel_id | UUID (FK → channels) | ON DELETE CASCADE |
| user_id | UUID (FK → auth.users) | ON DELETE CASCADE |
| video_id | TEXT | YouTube video ID |
| title | TEXT | Used to derive transcript filename |
| url | TEXT | YouTube URL |
| views | INT | Default 0 |
| category_id | INT (FK → categories) | Nullable |
| is_transcribed | BOOLEAN | Default FALSE — key field for cleanup decision |
| created_at | TIMESTAMPTZ | Default NOW() |
| updated_at | TIMESTAMPTZ | Default NOW() |

**Unique constraint**: (user_id, channel_id, video_id)

### Cascade Behavior
- Deleting a **channel** automatically deletes all its **videos** (FK ON DELETE CASCADE)
- Deleting a **user** automatically deletes all their **channels** (FK ON DELETE CASCADE)
- No schema migration needed — cascade rules already exist

## Vector Store Entries (DeepLake)

### Chunk Metadata
| Field | Type | Notes |
|-------|------|-------|
| video_id | string | YouTube video ID — **primary key for deletion queries** |
| title | string | Video title |
| channel | string | Channel title (string, not FK) |
| source | string | `https://youtube.com/watch?v={video_id}` |

**Deletion query**: `SELECT ids FROM (SELECT * WHERE metadata['video_id'] IN ({video_ids}))`

### Deletion Behavior
- Multiple chunks per video (split by RecursiveCharacterTextSplitter at 1000 chars, 200 overlap)
- All chunks sharing the same `video_id` metadata are deleted together
- No referential integrity with Supabase — cleanup is best-effort before DB deletion

## Transcript Files (Filesystem)

### File Pattern
| Attribute | Value |
|-----------|-------|
| Location | `{settings.transcripts_dir}/` (default: `./knowledge_base/transcripts`) |
| Naming | `sanitize_filename(video.title) + ".md"` |
| Sanitization | Remove special chars → replace spaces with hyphens → collapse multi-hyphens |
| Example | `"5 Stocks Congress Is Buying Fast"` → `5-Stocks-Congress-Is-Buying-Fast.md` |

**Deletion**: Derive filename from video title (available in Supabase before DB deletion), delete file if exists.

## Modified Entity: Job (In-Memory)

### Current Job Dataclass
| Field | Type | Notes |
|-------|------|-------|
| id | str | UUID |
| status | JobStatus | PENDING / IN_PROGRESS / COMPLETED / FAILED |
| total_videos | int | |
| processed_videos | int | |
| failed_videos | list[str] | Video IDs |
| succeeded_videos | list[str] | Video IDs |
| message | str | |

### Addition
| Field | Type | Notes |
|-------|------|-------|
| channel_id | str | **NEW** — UUID of the channel being processed. Used for deletion guard. |

## Deletion Data Flow

```
1. Frontend: User clicks delete on channel card
   → Sends DELETE /api/channels/{channelId} (Next.js API route)

2. Next.js API route: Auth check + proxy
   → Forwards to DELETE /v1/api/knowledge/channels/{channelId}

3. Backend endpoint:
   a. Fetch channel + videos from Supabase (service role)
   b. Check no active jobs for this channel (JobManager)
   c. Filter transcribed videos (is_transcribed = true)
   d. If transcribed videos exist:
      i.  Delete vector store entries by video_id metadata
      ii. Delete transcript files from disk (derived from title)
   e. Delete channel from Supabase (cascade deletes videos)
   f. Return success with cleanup summary

4. Frontend: Remove card from state, show toast
```
