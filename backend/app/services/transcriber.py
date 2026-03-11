import json
import logging
import tempfile
from pathlib import Path

import yt_dlp
from yt_dlp.utils import DownloadError
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig

from fastapi import HTTPException
from supabase import Client

from app.config import Settings
from app.models.errors import AuthenticationError
from app.services.auth_detection import is_auth_error
from app.utils.text import parse_vtt, sanitize_filename

logger = logging.getLogger(__name__)


class TranscriptionError(Exception):
    pass


def get_transcript_content(
    video_id: str, user_id: str, settings: Settings, supabase: Client
) -> dict:
    """Retrieve transcript file content for a video owned by the user.

    Returns dict with video_id, title, url, and content (transcript body).
    Raises HTTPException 404 if video not found, not transcribed, or file missing.
    """
    # Look up video record scoped to user
    result = (
        supabase.table("videos")
        .select("video_id, title, url, is_transcribed")
        .eq("video_id", video_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Video not found")

    video = result.data[0]
    if not video.get("is_transcribed"):
        raise HTTPException(status_code=404, detail="Video has not been transcribed")

    # Reconstruct filename from title
    filename = sanitize_filename(video["title"]) + ".md"
    file_path = Path(settings.transcripts_dir) / filename

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Transcript file not found. Try re-transcribing the video.",
        )

    raw_content = file_path.read_text(encoding="utf-8")
    if not raw_content.strip():
        raise HTTPException(
            status_code=404,
            detail="Transcript file is empty. Try re-transcribing the video.",
        )

    # Parse content: extract body after "---" separator
    separator = "\n---\n"
    if separator in raw_content:
        content = raw_content.split(separator, 1)[1].strip()
    else:
        # Fallback: return entire content if no separator found
        content = raw_content.strip()

    return {
        "video_id": video["video_id"],
        "title": video["title"],
        "url": video["url"],
        "content": content,
    }


def get_transcript_via_api(video_id: str, settings: Settings) -> str | None:
    """Attempt to get transcript via youtube-transcript-api (fast, free)."""
    try:
        if settings.proxy_user and settings.proxy_pass:
            api = YouTubeTranscriptApi(
                proxy_config=WebshareProxyConfig(
                    proxy_username=settings.proxy_user,
                    proxy_password=settings.proxy_pass,
                )
            )
        else:
            api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id, languages=["en"])
        return " ".join(snippet.text for snippet in transcript.snippets)
    except Exception as e:
        logger.warning("youtube-transcript-api failed for %s: %s", video_id, e)
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

    except DownloadError as e:
        if is_auth_error(e):
            raise AuthenticationError(
                message=str(e),
                domain="youtube.com",
                error_type="login_required",
            ) from e
        logger.warning("yt-dlp non-auth error for %s: %s", video_id, e)
        return None
    except Exception:
        return None
    finally:
        if cookie_file_path:
            Path(cookie_file_path).unlink(missing_ok=True)


def get_transcript(video_id: str, title: str, cookie: str | None = None, settings: Settings | None = None) -> str:
    """Get transcript, trying youtube-transcript-api first, then yt-dlp."""
    if settings is None:
        from app.config import settings as default_settings
        settings = default_settings

    text = get_transcript_via_api(video_id, settings)
    if text:
        return text

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
