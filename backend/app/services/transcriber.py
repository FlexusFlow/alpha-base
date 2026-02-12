from urllib.request import HTTPCookieProcessor
import http.cookiejar
import json
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

    cookie = ""

    jar = http.cookiejar.CookieJar()
    if cookie:
        for c in json.loads(cookie):
            expires = c.get("expires")
            discard = expires is None or expires == -1
            if discard:
                expires = None
            domain = c.get("domain", "")
            jar.set_cookie(http.cookiejar.Cookie(
                version=0,
                name=c["name"],
                value=c["value"],
                port=None,
                port_specified=False,
                domain=domain,
                domain_specified=bool(domain),
                domain_initial_dot=domain.startswith("."),
                path=c.get("path", "/"),
                path_specified=True,
                secure=c.get("secure", False),
                expires=int(expires) if expires else None,
                discard=discard,
                comment=None,
                comment_url=None,
                rest={"HttpOnly": ""} if c.get("httpOnly") else {},
                rfc2109=False,
            ))

    ydl_opts = {
        "writeautomaticsub": True,
        "subtitleslangs": ["en"],
        "skip_download": True,
        "subtitlesformat": "vtt",
        "quiet": True,
        "no_warnings": True,

        "nocheckcertificate": True,
        # "extractor_args": {
        #     "youtube": {
        #         "player_client": ["web"]
        #     }
        # },
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
    }


    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            if jar:
                ydl.cookiejar = jar
                ydl._opener.add_handler(HTTPCookieProcessor(jar))
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

    # print(video_id, title)
    # text = get_transcript_via_api(video_id)
    # if text:
    #     return text

    text = get_transcript_via_ytdlp(video_id)
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
