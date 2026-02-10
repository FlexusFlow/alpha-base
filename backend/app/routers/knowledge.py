import asyncio
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.config import Settings
from app.dependencies import get_job_manager, get_settings
from app.models.knowledge import (
    JobStatus,
    JobStatusResponse,
    KnowledgeAddRequest,
    KnowledgeAddResponse,
)
from app.services.job_manager import JobManager
from app.services.transcriber import get_transcript, save_transcript_md

router = APIRouter(prefix="/v1/api/knowledge", tags=["knowledge"])


async def process_knowledge_job(
    job_id: str,
    videos: list,
    channel_title: str,
    job_manager: JobManager,
    settings: Settings,
) -> None:
    """Background task: transcribe videos and vectorize them."""
    job_manager.update_job(job_id, status=JobStatus.IN_PROGRESS)
    transcripts: list[str] = []
    metadatas: list[dict] = []

    for i, video in enumerate(videos):
        try:
            text = await asyncio.to_thread(
                get_transcript, video.video_id, video.title
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
        except Exception as e:
            print("EXCEPTION")
            print(e)
            job = job_manager.get_job(job_id)
            failed = list(job.failed_videos) if job else []
            failed.append(video.video_id)
            job_manager.update_job(job_id, failed_videos=failed)

        job_manager.update_job(
            job_id,
            processed_videos=i + 1,
            message=f"Processed {i + 1}/{len(videos)}: {video.title[:50]}",
        )

    # Batch vectorize all successful transcripts
    if transcripts:
        try:
            from app.services.vectorstore import VectorStoreService
            vectorstore = VectorStoreService(settings)
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

    job_manager.update_job(
        job_id,
        status=JobStatus.COMPLETED,
        message="Knowledge base updated successfully",
    )


@router.post("/youtube/add", response_model=KnowledgeAddResponse)
async def add_youtube_to_knowledge(
    request: KnowledgeAddRequest,
    background_tasks: BackgroundTasks,
    job_manager: JobManager = Depends(get_job_manager),
    settings: Settings = Depends(get_settings),
):
    if not request.videos:
        raise HTTPException(status_code=400, detail="No videos selected")

    job = job_manager.create_job(total_videos=len(request.videos))
    background_tasks.add_task(
        process_knowledge_job,
        job_id=job.id,
        videos=request.videos,
        channel_title=request.channel_title,
        job_manager=job_manager,
        settings=settings,
    )
    return KnowledgeAddResponse(
        job_id=job.id,
        message="Knowledge base update started",
        total_videos=len(request.videos),
    )


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
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
        message=job.message,
    )
