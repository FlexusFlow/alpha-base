import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from supabase import Client

from app.config import Settings
from app.dependencies import get_job_manager, get_settings, get_supabase
from app.models.documentation import (
    DocScrapeJob,
    DocumentationDeleteResponse,
    DocumentationDiscoverRequest,
    DocumentationDiscoverResponse,
    DocumentationPageModel,
    DocumentationPagesResponse,
    DocumentationRetryResponse,
    DocumentationScrapeRequest,
    DocumentationScrapeResponse,
    DiscoveredPage,
)
from app.models.knowledge import JobStatus
from app.services.cookie_service import get_cookies_for_domain
from app.services.doc_crawler import discover_pages
from app.services.doc_scraper import scrape_collection
from app.services.job_manager import JobManager
from app.services.url_validator import validate_url
from app.services.vectorstore import get_user_vectorstore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/api/documentation", tags=["documentation"])


@router.post("/discover", response_model=DocumentationDiscoverResponse)
async def discover_documentation(
    request: DocumentationDiscoverRequest,
    supabase: Client = Depends(get_supabase),
):
    """Discover documentation pages from an entry URL. Synchronous response."""
    try:
        validate_url(request.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not request.user_id:
        raise HTTPException(status_code=401, detail="Missing user_id")

    # Fetch cookies if requested
    cookies_json = None
    has_cookies = False
    if request.use_cookies:
        cookies_json = await get_cookies_for_domain(
            request.user_id, request.url, supabase
        )
        has_cookies = cookies_json is not None

    result = await discover_pages(request.url, cookies_json=cookies_json)

    if not result["pages"]:
        raise HTTPException(
            status_code=422, detail="No documentation pages found at this URL"
        )

    return DocumentationDiscoverResponse(
        entry_url=result["entry_url"],
        scope_path=result["scope_path"],
        site_name=result["site_name"],
        pages=[DiscoveredPage(url=p["url"], title=p["title"]) for p in result["pages"]],
        total_count=result["total_count"],
        truncated=result["truncated"],
        original_count=result.get("original_count"),
        has_cookies=has_cookies,
    )


@router.post("/scrape", response_model=DocumentationScrapeResponse, status_code=202)
async def scrape_documentation(
    request: DocumentationScrapeRequest,
    background_tasks: BackgroundTasks,
    job_manager: JobManager = Depends(get_job_manager),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    """Start bulk scraping of discovered pages. Returns immediately with job_id."""
    if not request.user_id:
        raise HTTPException(status_code=401, detail="Missing user_id")

    if not request.pages:
        raise HTTPException(status_code=400, detail="No pages to scrape")

    # Create collection record
    collection_result = supabase.table("doc_collections").insert({
        "user_id": request.user_id,
        "entry_url": request.entry_url,
        "site_name": request.site_name,
        "scope_path": request.scope_path,
        "total_pages": len(request.pages),
        "status": "scraping",
    }).execute()
    collection_id = collection_result.data[0]["id"]

    # Create page records
    page_records = []
    for i, page in enumerate(request.pages):
        page_records.append({
            "collection_id": collection_id,
            "user_id": request.user_id,
            "page_url": page.url,
            "title": page.title,
            "status": "pending",
            "display_order": i,
        })

    pages_result = supabase.table("doc_pages").insert(page_records).execute()

    # Build page list with IDs for the background task
    pages_with_ids = [
        {"id": p["id"], "url": p["page_url"], "title": p["title"]}
        for p in pages_result.data
    ]

    # Create job for SSE tracking
    job_id = str(uuid.uuid4())
    doc_job = DocScrapeJob(id=job_id, total_pages=len(request.pages))
    job_manager._jobs[job_id] = doc_job

    # Launch background task
    background_tasks.add_task(
        scrape_collection,
        job_id=job_id,
        collection_id=collection_id,
        pages=pages_with_ids,
        user_id=request.user_id,
        use_cookies=request.use_cookies,
        job_manager=job_manager,
        supabase=supabase,
        settings=settings,
    )

    return DocumentationScrapeResponse(
        job_id=job_id,
        collection_id=collection_id,
        message=f"Scraping {len(request.pages)} documentation pages...",
    )


@router.post("/{collection_id}/retry", response_model=DocumentationRetryResponse, status_code=202)
async def retry_failed_pages(
    collection_id: str,
    request: dict,
    background_tasks: BackgroundTasks,
    job_manager: JobManager = Depends(get_job_manager),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    """Retry scraping failed pages in a collection."""
    user_id = request.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user_id")

    # Verify collection exists and belongs to user
    collection = supabase.table("doc_collections").select("*").eq(
        "id", collection_id
    ).eq("user_id", user_id).execute()

    if not collection.data:
        raise HTTPException(status_code=404, detail="Collection not found")

    if collection.data[0]["status"] != "partial":
        raise HTTPException(status_code=400, detail="No failed pages to retry")

    # Get failed pages
    failed_pages = supabase.table("doc_pages").select("id, page_url, title").eq(
        "collection_id", collection_id
    ).eq("status", "failed").execute()

    if not failed_pages.data:
        raise HTTPException(status_code=400, detail="No failed pages to retry")

    # Reset failed pages to pending
    for page in failed_pages.data:
        supabase.table("doc_pages").update({
            "status": "pending",
            "error_message": None,
        }).eq("id", page["id"]).execute()

    # Update collection status
    supabase.table("doc_collections").update(
        {"status": "scraping"}
    ).eq("id", collection_id).execute()

    # Build page list for background task
    pages_with_ids = [
        {"id": p["id"], "url": p["page_url"], "title": p["title"]}
        for p in failed_pages.data
    ]

    # Create job
    job_id = str(uuid.uuid4())
    doc_job = DocScrapeJob(id=job_id, total_pages=len(pages_with_ids))
    job_manager._jobs[job_id] = doc_job

    background_tasks.add_task(
        scrape_collection,
        job_id=job_id,
        collection_id=collection_id,
        pages=pages_with_ids,
        user_id=user_id,
        use_cookies=True,
        job_manager=job_manager,
        supabase=supabase,
        settings=settings,
    )

    return DocumentationRetryResponse(
        job_id=job_id,
        collection_id=collection_id,
        retry_count=len(pages_with_ids),
        message=f"Retrying {len(pages_with_ids)} failed pages...",
    )


@router.delete("/{collection_id}", response_model=DocumentationDeleteResponse)
async def delete_collection(
    collection_id: str,
    request: dict,
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    """Delete a documentation collection and all associated data."""
    user_id = request.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user_id")

    # Verify collection exists and belongs to user
    collection = supabase.table("doc_collections").select("*").eq(
        "id", collection_id
    ).eq("user_id", user_id).execute()

    if not collection.data:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Count pages before deletion
    pages_count = supabase.table("doc_pages").select(
        "id", count="exact"
    ).eq("collection_id", collection_id).execute()
    pages_deleted = pages_count.count or 0

    # Delete from vector store
    vectors_deleted = False
    try:
        vs = get_user_vectorstore(user_id, settings)
        deleted_count = vs.delete_by_collection_id(collection_id)
        vectors_deleted = deleted_count > 0
        logger.info("Deleted %d vector chunks for collection %s", deleted_count, collection_id)
    except Exception as e:
        logger.warning("Failed to delete vectors for collection %s: %s", collection_id, e)

    # Delete collection (CASCADE deletes pages)
    supabase.table("doc_collections").delete().eq(
        "id", collection_id
    ).eq("user_id", user_id).execute()

    return DocumentationDeleteResponse(
        message="Collection deleted",
        pages_deleted=pages_deleted,
        vectors_deleted=vectors_deleted,
    )


@router.get("/{collection_id}/pages", response_model=DocumentationPagesResponse)
async def list_collection_pages(
    collection_id: str,
    supabase: Client = Depends(get_supabase),
):
    """List pages in a collection."""
    pages = supabase.table("doc_pages").select(
        "id, page_url, title, status, is_truncated, display_order"
    ).eq("collection_id", collection_id).order("display_order").execute()

    return DocumentationPagesResponse(
        collection_id=collection_id,
        pages=[
            DocumentationPageModel(
                id=p["id"],
                page_url=p["page_url"],
                title=p["title"],
                status=p["status"],
                is_truncated=p["is_truncated"],
                display_order=p["display_order"],
            )
            for p in pages.data
        ],
    )
