import json
from dataclasses import dataclass

from pydantic import BaseModel

from app.models.knowledge import JobStatus


class ArticleScrapeRequest(BaseModel):
    url: str
    user_id: str
    use_cookies: bool = True


class ArticleScrapeResponse(BaseModel):
    job_id: str
    article_id: str
    message: str


@dataclass
class ArticleJob:
    """Lightweight job for article scraping SSE dispatch.

    Separate from the YouTube Job dataclass (Option A per plan).
    """

    id: str
    status: JobStatus = JobStatus.PENDING
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "status": self.status.value,
            "message": self.message,
            "progress": 100 if self.status in (JobStatus.COMPLETED, JobStatus.FAILED) else 0,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict())
