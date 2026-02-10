import re

import yt_dlp

from app.models.youtube import YTChannelPreview, YTVideo
from app.services.categorizer import categorize_video


def normalize_channel_url(url: str) -> str:
    """Normalize various YouTube channel URL formats to the /videos page."""
    url = url.strip().rstrip("/")
    # Already ends with /videos
    if url.endswith("/videos"):
        return url
    # Match common channel URL patterns
    patterns = [
        r'youtube\.com/@[\w.-]+',
        r'youtube\.com/channel/[\w-]+',
        r'youtube\.com/c/[\w.-]+',
        r'youtube\.com/user/[\w.-]+',
    ]
    for pattern in patterns:
        if re.search(pattern, url):
            return url + "/videos"
    # If it's just a channel URL without a recognized pattern, append /videos
    if "youtube.com" in url:
        return url + "/videos"
    return url


def scrape_channel(channel_url: str, category: str= "", max_count: int = 500, limit: int = 0, skip: int = 0) -> YTChannelPreview:
    print( """
        Use yt-dlp Python API to extract channel video metadata.
        extract_flat="in_playlist" gets metadata without downloading.
        """
    )
    videos_url = normalize_channel_url(channel_url)

    ydl_opts = {
        "extract_flat": "in_playlist",
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "playlistend": max_count,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(videos_url, download=False)

    if not info:
        raise ValueError(f"Could not extract info from: {channel_url}")

    channel_title = info.get("channel", info.get("uploader", "Unknown"))
    entries = info.get("entries", [])

    videos = []
    print("limit", limit)
    print("skip", skip)
    print("max_count", max_count)
    print(len(entries)) 
    for index, entry in enumerate(entries):
        if entry is None:
            continue
        video_id = entry.get("id", "")
        title = entry.get("title", "")
        if not video_id or not title:
            continue

        # print("processing video", index)
        video = YTVideo(
            video_id=video_id,
            title=title,
            url=f"https://youtube.com/watch?v={video_id}",
            views=entry.get("view_count", 0) or 0,
            category=categorize_video(title),
        )

        if category == None or video.category == category:
            videos.append(video)

    # Sort by views descending
    videos.sort(key=lambda v: v.views, reverse=True)
    idx_from = skip
    idx_to = skip + limit if len(videos) > (skip + limit) else len(videos)
    print(category, idx_from, idx_to)
    paginated_videos = videos[idx_from: idx_to] if limit else videos

    # Build category counts
    categories: dict[str, int] = {}
    for v in videos:
        categories[v.category] = categories.get(v.category, 0) + 1

    return YTChannelPreview(
        channel_title=channel_title,
        channel_url=channel_url,
        total_videos=len(videos),
        categories=categories,
        videos=paginated_videos,
        all_videos=videos,
    )
