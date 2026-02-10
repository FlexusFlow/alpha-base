from pydantic import BaseModel


class YTVideo(BaseModel):
    video_id: str
    title: str
    url: str
    views: int
    category: str


class YTChannelPreview(BaseModel):
    channel_title: str
    channel_url: str
    total_videos: int
    categories: dict[str, int]
    videos: list[YTVideo]
    all_videos: list[YTVideo]
