import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from supabase import Client

logger = logging.getLogger(__name__)

from app.config import Settings
from app.dependencies import get_current_user, get_job_manager, get_settings, get_supabase
from app.models.knowledge import (
    BulkDeleteItemFailure,
    BulkDeleteItemSuccess,
    BulkDeleteRequest,
    BulkDeleteResponse,
    ChannelDeleteResponse,
    JobStatus,
    JobStatusResponse,
    KnowledgeAddRequest,
    KnowledgeAddResponse,
)
from app.services.cookie_service import get_cookies_for_domain
from app.services.job_manager import JobManager
from app.services.transcriber import delete_transcripts, get_transcript, save_transcript_md
from app.services.vectorstore import get_user_vectorstore

router = APIRouter(prefix="/v1/api/knowledge", tags=["knowledge"])


async def process_knowledge_job(
    job_id: str,
    videos: list,
    channel_title: str,
    job_manager: JobManager,
    settings: Settings,
    supabase: Client,
    user_id: str = "",
) -> None:
    """Background task: transcribe videos and vectorize them."""
    job_manager.update_job(job_id, status=JobStatus.IN_PROGRESS)
    transcripts: list[str] = []
    metadatas: list[dict] = []

    for i, video in enumerate(videos):
        try:
            cookie_str = None
            if user_id:
                youtube_url = f"https://www.youtube.com/watch?v={video.video_id}"
                cookie_str = await get_cookies_for_domain(user_id, youtube_url, supabase)

            text = await asyncio.to_thread(
                get_transcript, video.video_id, video.title, cookie_str
            )
            save_transcript_md(
                video.video_id, video.title, text,
                Path(settings.transcripts_dir),
            )
            transcripts.append(text)
            metadatas.append({
                "video_id": video.video_id,
                "title": video.title,
                "channel": channel_title,
                "source": f"https://youtube.com/watch?v={video.video_id}",
            })
            # Mark video as transcribed in Supabase
            try:
                supabase.table("videos").update(
                    {"is_transcribed": True}
                ).eq("video_id", video.video_id).execute()
            except Exception as db_err:
                logger.error("Failed to mark video %s as transcribed: %s", video.video_id, db_err)
            # Track successful transcription
            job = job_manager.get_job(job_id)
            succeeded = list(job.succeeded_videos) if job else []
            succeeded.append(video.video_id)
            job_manager.update_job(job_id, succeeded_videos=succeeded)
        except Exception as e:
            logger.error("Failed to transcribe video %s: %s", video.video_id, e)
            job = job_manager.get_job(job_id)
            failed = list(job.failed_videos) if job else []
            failed.append(video.video_id)
            job_manager.update_job(job_id, failed_videos=failed)

        job_manager.update_job(
            job_id,
            processed_videos=i + 1,
            message=f"Processed {i + 1}/{len(videos)}: {video.title[:50]}",
        )

        # Delay between requests to avoid YouTube rate limiting
        if i < len(videos) - 1:
            await asyncio.sleep(2)

    # Batch vectorize all successful transcripts
    if transcripts:
        try:
            vectorstore = get_user_vectorstore(user_id, settings)
            await asyncio.to_thread(
                vectorstore.add_documents, transcripts, metadatas
            )
        except Exception as e:
            job_manager.update_job(
                job_id,
                status=JobStatus.FAILED,
                message=f"Vectorization failed: {e}",
            )
            return

    job = job_manager.get_job(job_id)
    num_failed = len(job.failed_videos) if job else 0
    num_succeeded = len(videos) - num_failed

    if num_succeeded == 0:
        job_manager.update_job(
            job_id,
            status=JobStatus.FAILED,
            message=f"All {len(videos)} video(s) failed to transcribe",
        )
    elif num_failed > 0:
        job_manager.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            message=f"{num_succeeded} video(s) added, {num_failed} failed",
        )
    else:
        job_manager.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            message=f"All {num_succeeded} video(s) added successfully",
        )


@router.post("/youtube/add", response_model=KnowledgeAddResponse)
async def add_youtube_to_knowledge(
    request: KnowledgeAddRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
    job_manager: JobManager = Depends(get_job_manager),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    if not request.videos:
        raise HTTPException(status_code=400, detail="No videos selected")

    job = job_manager.create_job(total_videos=len(request.videos))
    job.channel_id = request.channel_id
    background_tasks.add_task(
        process_knowledge_job,
        job_id=job.id,
        videos=request.videos,
        channel_title=request.channel_title,
        job_manager=job_manager,
        settings=settings,
        supabase=supabase,
        user_id=user_id,
    )
    return KnowledgeAddResponse(
        job_id=job.id,
        message="Knowledge base update started",
        total_videos=len(request.videos),
    )


async def _delete_single_channel(
    channel_id: str,
    user_id: str,
    job_manager: JobManager,
    settings: Settings,
    supabase: Client,
) -> ChannelDeleteResponse:
    """Shared logic for deleting a single channel with full cleanup.

    Raises HTTPException on failure (404, 409, 500).
    """
    # 1. Fetch channel from Supabase
    result = supabase.table("channels").select("*").eq("id", channel_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Channel not found")
    channel = result.data[0]

    # 2. Check for active transcription jobs
    active_job = job_manager.has_active_job_for_channel(channel_id)
    if active_job:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: transcription job in progress",
        )

    # 3. Fetch all videos for this channel
    videos_result = supabase.table("videos").select("video_id, title, is_transcribed").eq("channel_id", channel_id).execute()
    videos = videos_result.data or []
    transcribed_videos = [v for v in videos if v.get("is_transcribed")]

    vectors_deleted = 0
    files_deleted = 0

    # 4. Cleanup-first: vector store, then files, then DB
    if transcribed_videos:
        video_ids = [v["video_id"] for v in transcribed_videos]

        # 4a. Delete vector store entries
        try:
            vectorstore = get_user_vectorstore(user_id, settings)
            vectors_deleted = await asyncio.to_thread(vectorstore.delete_by_video_ids, video_ids)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Vector store cleanup failed: {e}",
            )

        # 4b. Delete transcript files
        try:
            files_deleted = await asyncio.to_thread(
                delete_transcripts, transcribed_videos, settings.transcripts_dir
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Transcript file cleanup failed: {e}",
            )

    # 5. Delete channel from Supabase (cascade deletes videos)
    supabase.table("channels").delete().eq("id", channel_id).eq("user_id", user_id).execute()

    return ChannelDeleteResponse(
        channel_id=channel_id,
        channel_title=channel["channel_title"],
        videos_deleted=len(videos),
        vectors_deleted=vectors_deleted,
        files_deleted=files_deleted,
        message=f"Deleted '{channel['channel_title']}' with {len(videos)} videos",
    )


@router.delete("/channels/{channel_id}", response_model=ChannelDeleteResponse)
async def delete_channel(
    channel_id: str,
    user_id: str = Depends(get_current_user),
    job_manager: JobManager = Depends(get_job_manager),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    return await _delete_single_channel(channel_id, user_id, job_manager, settings, supabase)


@router.post("/channels/delete-bulk", response_model=BulkDeleteResponse)
async def delete_channels_bulk(
    request: BulkDeleteRequest,
    user_id: str = Depends(get_current_user),
    job_manager: JobManager = Depends(get_job_manager),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    succeeded: list[BulkDeleteItemSuccess] = []
    failed: list[BulkDeleteItemFailure] = []

    for channel_id in request.channel_ids:
        try:
            result = await _delete_single_channel(
                channel_id, user_id, job_manager, settings, supabase,
            )
            succeeded.append(BulkDeleteItemSuccess(
                channel_id=result.channel_id,
                channel_title=result.channel_title,
                videos_deleted=result.videos_deleted,
                vectors_deleted=result.vectors_deleted,
                files_deleted=result.files_deleted,
            ))
        except HTTPException as e:
            # Look up channel title for error reporting
            ch_result = supabase.table("channels").select("channel_title").eq("id", channel_id).execute()
            title = ch_result.data[0]["channel_title"] if ch_result.data else channel_id
            failed.append(BulkDeleteItemFailure(
                channel_id=channel_id,
                channel_title=title,
                error=e.detail,
            ))

    total = len(request.channel_ids)
    message = f"{len(succeeded)} of {total} channels deleted"
    return BulkDeleteResponse(succeeded=succeeded, failed=failed, message=message)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    user_id: str = Depends(get_current_user),
    job_manager: JobManager = Depends(get_job_manager),
):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        total_videos=job.total_videos,
        processed_videos=job.processed_videos,
        failed_videos=job.failed_videos,
        succeeded_videos=job.succeeded_videos,
        message=job.message,
    )
