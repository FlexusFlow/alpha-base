import asyncio
import logging

from supabase import Client

from app.config import Settings
from app.models.documentation import DocScrapeJob
from app.models.knowledge import JobStatus
from app.services.article_scraper import scrape_article
from app.services.cookie_service import get_cookies_for_domain
from app.services.job_manager import JobManager
from app.services.vectorstore import get_user_vectorstore

logger = logging.getLogger(__name__)

MAX_CONCURRENT = 3
DELAY_BETWEEN_PAGES = 0.5  # seconds


async def scrape_collection(
    job_id: str,
    collection_id: str,
    pages: list[dict],
    user_id: str,
    use_cookies: bool,
    job_manager: JobManager,
    supabase: Client,
    settings: Settings,
) -> None:
    """Background task that scrapes all pages in a documentation collection.

    Args:
        pages: List of dicts with keys: id (page UUID), url, title
    """
    doc_job: DocScrapeJob = job_manager._jobs[job_id]
    doc_job.status = JobStatus.IN_PROGRESS
    doc_job.total_pages = len(pages)
    doc_job.message = f"Scraping {len(pages)} documentation pages..."
    job_manager._notify(job_id, doc_job)

    # Update collection status to scraping
    supabase.table("doc_collections").update(
        {"status": "scraping"}
    ).eq("id", collection_id).execute()

    # Fetch cookies once for all pages
    cookies_json = None
    if use_cookies:
        entry_url = pages[0]["url"] if pages else ""
        cookies_json = await get_cookies_for_domain(user_id, entry_url, supabase)

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    successful_pages_data: list[dict] = []

    async def scrape_page(page_info: dict) -> None:
        page_id = page_info["id"]
        page_url = page_info["url"]

        async with semaphore:
            # Update page status to scraping
            supabase.table("doc_pages").update(
                {"status": "scraping"}
            ).eq("id", page_id).execute()

            try:
                result = await scrape_article(page_url, cookies_json=cookies_json)

                # Update page with scraped content
                supabase.table("doc_pages").update({
                    "title": result["title"] or page_info.get("title"),
                    "content_markdown": result["content_markdown"],
                    "is_truncated": result["is_truncated"],
                    "status": "completed",
                }).eq("id", page_id).execute()

                doc_job.succeeded_pages.append(page_id)
                successful_pages_data.append({
                    "page_url": page_url,
                    "title": result["title"] or page_info.get("title", ""),
                    "content_markdown": result["content_markdown"],
                })

            except Exception as e:
                error_msg = str(e)[:500]
                logger.warning("Failed to scrape page %s: %s", page_url, error_msg)

                supabase.table("doc_pages").update({
                    "status": "failed",
                    "error_message": error_msg,
                }).eq("id", page_id).execute()

                doc_job.failed_pages.append(page_id)

            finally:
                doc_job.processed_pages += 1
                doc_job.message = f"Scraping page {doc_job.processed_pages} of {doc_job.total_pages}..."
                job_manager._notify(job_id, doc_job)

            # Brief delay between pages to be polite
            await asyncio.sleep(DELAY_BETWEEN_PAGES)

    # Run all pages with concurrency limit
    try:
        tasks = [scrape_page(p) for p in pages]
        await asyncio.gather(*tasks)

        # Determine final status
        total = len(pages)
        succeeded = len(doc_job.succeeded_pages)
        failed = len(doc_job.failed_pages)

        if failed == total:
            final_status = "failed"
            doc_job.status = JobStatus.FAILED
            doc_job.message = f"Failed: all {total} pages failed to scrape"
        elif failed > 0:
            final_status = "partial"
            doc_job.status = JobStatus.COMPLETED
            doc_job.message = f"Completed: {succeeded} of {total} pages scraped successfully"
        else:
            final_status = "completed"
            doc_job.status = JobStatus.COMPLETED
            doc_job.message = f"Completed: all {total} pages scraped successfully"

        # Update collection status and counts
        supabase.table("doc_collections").update({
            "status": final_status,
            "successful_pages": succeeded,
        }).eq("id", collection_id).execute()

        # Index successful pages in vector store
        if successful_pages_data:
            try:
                site_name_result = supabase.table("doc_collections").select(
                    "site_name"
                ).eq("id", collection_id).execute()
                site_name = site_name_result.data[0]["site_name"] if site_name_result.data else "Documentation"

                vs = get_user_vectorstore(user_id, settings)
                vs.add_documentation_pages(
                    pages=successful_pages_data,
                    collection_id=collection_id,
                    site_name=site_name,
                    user_id=user_id,
                )
                logger.info(
                    "Indexed %d documentation pages for collection %s",
                    len(successful_pages_data),
                    collection_id,
                )
            except Exception as e:
                logger.exception(
                    "Failed to index documentation pages for collection %s: %s",
                    collection_id, e,
                )

        job_manager._notify(job_id, doc_job)

    except Exception as e:
        logger.exception("Documentation scraping failed for collection %s: %s", collection_id, e)
        doc_job.status = JobStatus.FAILED
        doc_job.message = f"Scraping failed: {str(e)[:500]}"
        job_manager._notify(job_id, doc_job)

        supabase.table("doc_collections").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", collection_id).execute()
