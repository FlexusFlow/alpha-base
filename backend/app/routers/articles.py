import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from supabase import Client

from app.config import Settings
from app.dependencies import get_current_user, get_job_manager, get_settings, get_supabase
from app.models.articles import ArticleJob, ArticleScrapeRequest, ArticleScrapeResponse
from app.models.knowledge import JobStatus
from app.services.article_scraper import scrape_article
from app.services.cookie_service import get_cookies_for_domain
from app.services.job_manager import JobManager
from app.services.url_validator import validate_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/api/articles", tags=["articles"])


@router.post("/scrape", response_model=ArticleScrapeResponse, status_code=202)
async def scrape_article_endpoint(
    request: ArticleScrapeRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
    job_manager: JobManager = Depends(get_job_manager),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    # Validate URL (SSRF protection)
    try:
        validate_url(request.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Create article record with pending status
    article_result = (
        supabase.table("articles")
        .insert(
            {
                "url": request.url,
                "user_id": user_id,
                "status": "pending",
            }
        )
        .execute()
    )
    article_id = article_result.data[0]["id"]

    # Create lightweight ArticleJob for SSE dispatch
    job_id = str(uuid.uuid4())
    article_job = ArticleJob(id=job_id)
    job_manager._jobs[job_id] = article_job

    # Launch background task
    background_tasks.add_task(
        process_article_scrape,
        job_id=job_id,
        article_id=article_id,
        url=request.url,
        user_id=user_id,
        use_cookies=request.use_cookies,
        job_manager=job_manager,
        supabase=supabase,
    )

    return ArticleScrapeResponse(
        job_id=job_id,
        article_id=article_id,
        message="Article scraping started",
    )


async def process_article_scrape(
    job_id: str,
    article_id: str,
    url: str,
    user_id: str,
    use_cookies: bool,
    job_manager: JobManager,
    supabase: Client,
) -> None:
    """Background task that scrapes an article and updates status."""
    try:
        # Update status to scraping
        article_job = job_manager._jobs[job_id]
        article_job.status = JobStatus.IN_PROGRESS
        article_job.message = "Scraping article..."
        job_manager._notify(job_id, article_job)

        supabase.table("articles").update({"status": "scraping"}).eq(
            "id", article_id
        ).execute()

        # Fetch cookies if requested
        cookies_json = None
        if use_cookies:
            cookies_json = await get_cookies_for_domain(user_id, url, supabase)

        # Scrape the article
        result = await scrape_article(url, cookies_json=cookies_json)

        # Update article record with content
        supabase.table("articles").update(
            {
                "title": result["title"],
                "content_markdown": result["content_markdown"],
                "is_truncated": result["is_truncated"],
                "status": "completed",
            }
        ).eq("id", article_id).execute()

        # Update job status
        article_job.status = JobStatus.COMPLETED
        article_job.message = f"Article scraped: {result['title'] or url}"
        job_manager._notify(job_id, article_job)

    except Exception as e:
        logger.exception("Article scraping failed for %s: %s", url, e)

        # Update article to failed status
        error_msg = str(e)[:500]
        supabase.table("articles").update(
            {
                "status": "failed",
                "error_message": error_msg,
            }
        ).eq("id", article_id).execute()

        # Update job status
        article_job = job_manager._jobs.get(job_id)
        if article_job:
            article_job.status = JobStatus.FAILED
            article_job.message = f"Failed to scrape article: {error_msg}"
            job_manager._notify(job_id, article_job)
