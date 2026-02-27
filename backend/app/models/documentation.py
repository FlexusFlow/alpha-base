import json
from dataclasses import dataclass, field

from pydantic import BaseModel

from app.models.knowledge import JobStatus


class DiscoveredPage(BaseModel):
    url: str
    title: str


class DocumentationDiscoverRequest(BaseModel):
    url: str
    user_id: str
    use_cookies: bool = True


class DocumentationDiscoverResponse(BaseModel):
    entry_url: str
    scope_path: str
    site_name: str
    pages: list[DiscoveredPage]
    total_count: int
    truncated: bool
    original_count: int | None = None
    has_cookies: bool


class DocumentationScrapeRequest(BaseModel):
    user_id: str
    entry_url: str
    site_name: str
    scope_path: str
    pages: list[DiscoveredPage]
    use_cookies: bool = True


class DocumentationScrapeResponse(BaseModel):
    job_id: str
    collection_id: str
    message: str


class DocumentationRetryResponse(BaseModel):
    job_id: str
    collection_id: str
    retry_count: int
    message: str


class DocumentationPageModel(BaseModel):
    id: str
    page_url: str
    title: str | None
    status: str
    is_truncated: bool
    display_order: int


class DocumentationPagesResponse(BaseModel):
    collection_id: str
    pages: list[DocumentationPageModel]


class DocumentationDeleteResponse(BaseModel):
    message: str
    pages_deleted: int
    vectors_deleted: bool


@dataclass
class DocScrapeJob:
    """Job tracker for documentation scraping SSE dispatch."""

    id: str
    status: JobStatus = JobStatus.PENDING
    total_pages: int = 0
    processed_pages: int = 0
    failed_pages: list[str] = field(default_factory=list)
    succeeded_pages: list[str] = field(default_factory=list)
    message: str = ""

    @property
    def progress(self) -> int:
        if self.total_pages == 0:
            return 0
        return int((self.processed_pages / self.total_pages) * 100)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "status": self.status.value,
            "progress": self.progress,
            "total_pages": self.total_pages,
            "processed_pages": self.processed_pages,
            "failed_pages": self.failed_pages,
            "succeeded_pages": self.succeeded_pages,
            "message": self.message,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict())
