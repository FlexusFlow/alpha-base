from enum import Enum

from pydantic import BaseModel


class JobStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class VideoSelection(BaseModel):
    video_id: str
    title: str


class KnowledgeAddRequest(BaseModel):
    channel_title: str
    videos: list[VideoSelection]


class KnowledgeAddResponse(BaseModel):
    job_id: str
    message: str
    total_videos: int


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: int
    total_videos: int
    processed_videos: int
    failed_videos: list[str]
    succeeded_videos: list[str]
    message: str
