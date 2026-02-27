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
    channel_id: str = ""
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


class ChannelDeleteResponse(BaseModel):
    channel_id: str
    channel_title: str
    videos_deleted: int
    vectors_deleted: int
    files_deleted: int
    message: str


class BulkDeleteRequest(BaseModel):
    channel_ids: list[str]


class BulkDeleteItemSuccess(BaseModel):
    channel_id: str
    channel_title: str
    videos_deleted: int
    vectors_deleted: int
    files_deleted: int


class BulkDeleteItemFailure(BaseModel):
    channel_id: str
    channel_title: str
    error: str


class BulkDeleteResponse(BaseModel):
    succeeded: list[BulkDeleteItemSuccess]
    failed: list[BulkDeleteItemFailure]
    message: str
