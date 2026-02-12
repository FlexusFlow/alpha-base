import asyncio

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse

from app.dependencies import get_job_manager
from app.models.knowledge import JobStatus
from app.services.job_manager import JobManager

router = APIRouter(prefix="/v1/api/events", tags=["events"])


@router.get("/stream/{job_id}")
async def event_stream(
    job_id: str,
    job_manager: JobManager = Depends(get_job_manager),
):
    job = job_manager.get_job(job_id)
    if not job:
        return EventSourceResponse(iter([]))

    queue = job_manager.subscribe(job_id)

    async def generate():
        # Send current state immediately (handles race if job finished before subscribe)
        current = job_manager.get_job(job_id)
        if current:
            yield {
                "event": "job_update",
                "data": current.to_json(),
            }
            if current.status in (JobStatus.COMPLETED, JobStatus.FAILED):
                return

        while True:
            try:
                job = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield {
                    "event": "job_update",
                    "data": job.to_json(),
                }
                if job.status in (JobStatus.COMPLETED, JobStatus.FAILED):
                    break
            except asyncio.TimeoutError:
                # Send keepalive
                yield {"event": "keepalive", "data": ""}

    return EventSourceResponse(generate())
