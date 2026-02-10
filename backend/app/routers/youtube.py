import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import Settings
from app.dependencies import get_settings
from app.models.youtube import YTChannelPreview
from app.services.youtube_scraper import scrape_channel

router = APIRouter(prefix="/v1/api/youtube", tags=["youtube"])


@router.get("/preview", response_model=YTChannelPreview, response_model_exclude={"all_videos"})
async def preview_channel(
    url: str = Query(..., description="YouTube channel URL"),
    category: str = Query(None, description="Category filter"),
    limit: int = Query(None, description="Max videos to return"),
    skip: int = Query(None, description="Skip videos count"),
    settings: Settings = Depends(get_settings),
):
    max_count = settings.preview_video_limit
    try:
        result = await asyncio.to_thread(scrape_channel, url, category, max_count, limit, skip)
       # TODO Save scrapping result to Supabase 
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))



