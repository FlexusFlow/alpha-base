import io
from pathlib import Path

import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi

from app.utils.text import parse_vtt, sanitize_filename


class TranscriptionError(Exception):
    pass


def get_transcript_via_api(video_id: str) -> str | None:
    """Attempt to get transcript via youtube-transcript-api (fast, free)."""
    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
        return " ".join(entry["text"] for entry in transcript_list)
    except Exception:
        return None


def get_transcript_via_ytdlp(video_id: str) -> str | None:
    """Fallback: download auto-generated subtitles via yt-dlp Python API."""
    url = f"https://www.youtube.com/watch?v={video_id}"

    ydl_opts = {
        "writeautomaticsub": True,
        "subtitleslangs": ["en"],
        "skip_download": True,
        "subtitlesformat": "vtt",
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        # Get auto-generated subtitles
        auto_subs = info.get("automatic_captions", {})
        en_subs = auto_subs.get("en", [])

        # Find VTT format URL
        vtt_url = None
        for sub in en_subs:
            if sub.get("ext") == "vtt":
                vtt_url = sub.get("url")
                break

        if not vtt_url:
            return None

        # Download the VTT content
        import urllib.request
        with urllib.request.urlopen(vtt_url) as response:
            vtt_content = response.read().decode("utf-8")

        return parse_vtt(vtt_content)

    except Exception:
        return None


def get_transcript(video_id: str, title: str) -> str:
    """Get transcript, trying youtube-transcript-api first, then yt-dlp."""

    print(video_id, title)
    text = get_transcript_via_api(video_id)
    if text:
        return text

    text = get_transcript_via_ytdlp(video_id)
    if text:
        return text

    raise TranscriptionError(f"No transcript available for {video_id}: {title}")


def save_transcript_md(video_id: str, title: str, text: str, output_dir: Path) -> Path:
    """Save transcript as markdown file in the PoC format."""

    output_dir.mkdir(parents=True, exist_ok=True)
    filename = sanitize_filename(title)
    output_path = output_dir / f"{filename}.md"
    content = f"# {title}\n\n**Video:** https://youtube.com/watch?v={video_id}\n\n---\n\n{text}"
    output_path.write_text(content, encoding="utf-8")
    return output_path
