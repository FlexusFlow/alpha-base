# Research: View Video Transcript

## R-001: Transcript File Lookup Strategy

**Decision**: Look up transcript files by reconstructing the filename from the video title stored in Supabase.

**Rationale**: Transcript files are saved using `sanitize_filename(title) + ".md"` (see `transcriber.py:save_transcript_md()`). The `video_id` is not part of the filename. Therefore, retrieving a transcript requires:
1. Query Supabase for the video record by `video_id` (scoped to `user_id`)
2. Extract the `title` field
3. Apply `sanitize_filename(title)` to reconstruct the filename
4. Read from `settings.transcripts_dir / f"{filename}.md"`

**Alternatives considered**:
- Store transcript content in Supabase: Rejected — transcripts can be very large, and the filesystem approach is already established and working.
- Rename files to use video_id: Rejected — would break existing transcripts and require a migration. The title-based naming is an established pattern used by both `save_transcript_md()` and `delete_transcripts()`.

## R-002: Transcript Content Parsing

**Decision**: Return the raw transcript text (body only), stripping the markdown header (title + video URL) since those are already available from the video record.

**Rationale**: The transcript file format is:
```
# {title}

**Video:** https://youtube.com/watch?v={video_id}

---

{transcript text}
```

The title and URL are redundant with the video metadata already available in the frontend. The endpoint should parse the file and return just the transcript body (everything after the `---` separator), along with the title and URL from the database record.

**Alternatives considered**:
- Return raw file content: Would require frontend parsing and duplicate title/URL data.
- Return both parsed and raw: Over-engineering for the current need.

## R-003: Side Panel Component Pattern

**Decision**: Use the existing shadcn/ui `Sheet` component (already installed) with `side="right"` and increased width.

**Rationale**: The Sheet component is already in the project at `next-frontend/components/ui/sheet.tsx`. It supports right-side sliding panels with overlay. Default width (`sm:max-w-sm`) is too narrow for transcript text — override to `sm:max-w-2xl` for comfortable reading.

**Alternatives considered**:
- Custom slide-over component: Rejected — Sheet already provides the exact UX pattern needed.
- Resizable panel (e.g., react-resizable-panels): Rejected — adds dependency for no clear benefit; fixed width is sufficient.

## R-004: Error Handling for Missing/Corrupt Files

**Decision**: Return HTTP 404 with descriptive message when transcript file is missing or empty. Frontend displays inline error in the panel.

**Rationale**: The `is_transcribed` flag can be true while the file is missing (e.g., manual deletion). A 404 is semantically correct and the frontend can display a helpful message suggesting re-transcription.

**Alternatives considered**:
- Reset `is_transcribed` flag automatically: Rejected — side effects on a read operation violate least surprise principle.
- Return empty content with 200: Rejected — hides the error from the user.
