import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from supabase import Client

from app.config import Settings
from app.dependencies import get_current_user, get_job_manager, get_settings, get_supabase
from app.models.articles import ArticleDeleteResponse, ArticleJob, ArticleScrapeRequest, ArticleScrapeResponse
from app.models.knowledge import JobStatus
from app.services.article_scraper import scrape_article
from app.models.errors import AuthenticationError
from app.services.cookie_service import clear_cookie_failure, get_cookies_for_domain, mark_cookie_failed
from app.services.job_manager import JobManager
from app.services.chunk_count import update_cached_chunk_count
from app.services.url_validator import validate_url
from app.services.vectorstore import get_user_vectorstore

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

    # Check for duplicate URL
    existing = (
        supabase.table("articles")
        .select("id")
        .eq("url", request.url)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409, detail="Article with this URL already exists"
        )

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
        settings=settings,
    )

    return ArticleScrapeResponse(
        job_id=job_id,
        article_id=article_id,
        message="Article scraping started",
    )


@router.delete("/{article_id}", response_model=ArticleDeleteResponse)
async def delete_article(
    article_id: str,
    user_id: str = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    """Delete an article and its vector store chunks."""
    # Verify article exists and belongs to user
    article = (
        supabase.table("articles")
        .select("id")
        .eq("id", article_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not article.data:
        raise HTTPException(status_code=404, detail="Article not found")

    # Delete from vector store first
    vectors_deleted = False
    try:
        vs = get_user_vectorstore(user_id, settings)
        deleted_count = vs.delete_by_article_ids([article_id])
        vectors_deleted = deleted_count > 0
        if deleted_count > 0:
            update_cached_chunk_count(supabase, user_id, -deleted_count)
        logger.info("Deleted %d vector chunks for article %s", deleted_count, article_id)
    except Exception as e:
        logger.warning("Failed to delete vectors for article %s: %s", article_id, e)

    # Delete article record from Supabase
    supabase.table("articles").delete().eq(
        "id", article_id
    ).eq("user_id", user_id).execute()

    return ArticleDeleteResponse(
        message="Article deleted",
        vectors_deleted=vectors_deleted,
    )


async def process_article_scrape(
    job_id: str,
    article_id: str,
    url: str,
    user_id: str,
    use_cookies: bool,
    job_manager: JobManager,
    supabase: Client,
    settings: Settings,
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
        cookie_result = None
        if use_cookies:
            cookie_result = await get_cookies_for_domain(user_id, url, supabase)

        # Scrape the article
        result = await scrape_article(
            url, cookies_json=cookie_result.cookies_json if cookie_result else None
        )

        # Update article record with content
        supabase.table("articles").update(
            {
                "title": result["title"],
                "content_markdown": result["content_markdown"],
                "is_truncated": result["is_truncated"],
                "status": "completed",
            }
        ).eq("id", article_id).execute()

        # Index article content in vector store
        try:
            if result["content_markdown"]:
                vs = get_user_vectorstore(user_id, settings)
                chunks_added = vs.add_article(
                    article_id=article_id,
                    content_markdown=result["content_markdown"],
                    title=result["title"] or "",
                    url=url,
                )
                if chunks_added > 0:
                    update_cached_chunk_count(supabase, user_id, chunks_added)
                logger.info(
                    "Indexed article %s (%d chunks) for user %s",
                    article_id, chunks_added, user_id,
                )
        except Exception as e:
            logger.error("Failed to index article %s in vector store: %s", article_id, e)

        # Clear cookie failure on successful use
        if cookie_result:
            clear_cookie_failure(cookie_result.cookie_id, supabase)

        # Update job status
        article_job.status = JobStatus.COMPLETED
        article_job.message = f"Article scraped: {result['title'] or url}"
        job_manager._notify(job_id, article_job)

    except AuthenticationError as e:
        logger.error("Auth failure scraping article %s: %s", url, e)

        # Mark cookie as failed
        if cookie_result:
            mark_cookie_failed(cookie_result.cookie_id, str(e)[:200], supabase)

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
