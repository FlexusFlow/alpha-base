# Data Model: View Video Transcript

## Entities

### Video (existing — no changes)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| video_id | string | YouTube video ID |
| title | string | Video title — used to derive transcript filename |
| url | string | YouTube URL |
| is_transcribed | boolean | Gates transcript viewing availability |
| user_id | UUID | Owner — enforces per-user isolation |
| channel_id | UUID | Parent channel reference |

### Transcript (derived — file-based, not a DB table)

| Attribute | Source | Notes |
|-----------|--------|-------|
| filename | `sanitize_filename(video.title) + ".md"` | Derived from video title |
| file_path | `settings.transcripts_dir / filename` | Filesystem location |
| content | File body after `---` separator | Raw transcript text |
| title | File header / video.title | Redundant — use video record |
| video_url | File header / video.url | Redundant — use video record |

### Relationships

```
Video (1) ──── (0..1) Transcript file
  │
  └─ is_transcribed=true implies transcript file should exist
     (but file may be missing — handle as error)
```

## No Schema Changes Required

This feature reads existing data only. No new database tables, columns, or migrations needed.
