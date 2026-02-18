import json
import tempfile
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


def get_transcript_via_ytdlp(video_id: str, cookie: str | None = None) -> str | None:
    """Fallback: download auto-generated subtitles via yt-dlp Python API."""
    url = f"https://www.youtube.com/watch?v={video_id}"

    cookie = cookie or ""

    # Write cookies to a Netscape-format temp file for yt-dlp
    cookie_file_path = None
    if cookie:
        cookies_list = json.loads(cookie)
        if cookies_list:
            cookie_file = tempfile.NamedTemporaryFile(
                mode="w", suffix=".txt", delete=False
            )
            cookie_file_path = cookie_file.name
            cookie_file.write("# Netscape HTTP Cookie File\n")
            for c in cookies_list:
                domain = c.get("domain", "")
                flag = "TRUE" if domain.startswith(".") else "FALSE"
                path = c.get("path", "/")
                secure = "TRUE" if c.get("secure", False) else "FALSE"
                expires = c.get("expires")
                expires_str = str(int(expires)) if expires and expires != -1 else "0"
                name = c["name"]
                value = c["value"]
                cookie_file.write(
                    f"{domain}\t{flag}\t{path}\t{secure}\t{expires_str}\t{name}\t{value}\n"
                )
            cookie_file.close()

    ydl_opts = {
        "writeautomaticsub": True,
        "subtitleslangs": ["en"],
        "skip_download": True,
        "subtitlesformat": "vtt",
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
    }

    if cookie_file_path:
        ydl_opts["cookiefile"] = cookie_file_path

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
    finally:
        if cookie_file_path:
            Path(cookie_file_path).unlink(missing_ok=True)


def get_transcript(video_id: str, title: str, cookie: str | None = None) -> str:
    """Get transcript, trying youtube-transcript-api first, then yt-dlp."""

    # print(video_id, title)
    # text = get_transcript_via_api(video_id)
    # if text:
    #     return text

    text = get_transcript_via_ytdlp(video_id, cookie=cookie)
    if text:
        return text

    raise TranscriptionError(f"No transcript available for {video_id}: {title}")


def delete_transcripts(videos: list[dict], transcripts_dir: str) -> int:
    """Delete transcript markdown files for the given videos.

    Args:
        videos: List of dicts with 'title' and 'is_transcribed' keys.
        transcripts_dir: Path to the transcripts directory.

    Returns:
        Number of files actually deleted.
    """
    deleted = 0
    dir_path = Path(transcripts_dir)
    for video in videos:
        if not video.get("is_transcribed"):
            continue
        filename = sanitize_filename(video["title"]) + ".md"
        file_path = dir_path / filename
        if file_path.exists():
            file_path.unlink()
            deleted += 1
    return deleted


def save_transcript_md(video_id: str, title: str, text: str, output_dir: Path) -> Path:
    """Save transcript as markdown file in the PoC format."""

    output_dir.mkdir(parents=True, exist_ok=True)
    filename = sanitize_filename(title)
    output_path = output_dir / f"{filename}.md"
    content = f"# {title}\n\n**Video:** https://youtube.com/watch?v={video_id}\n\n---\n\n{text}"
    output_path.write_text(content, encoding="utf-8")
    return output_path
