import asyncio
import json
import uuid
from dataclasses import asdict, dataclass, field

from app.models.knowledge import JobStatus


@dataclass
class Job:
    id: str
    status: JobStatus = JobStatus.PENDING
    total_videos: int = 0
    processed_videos: int = 0
    failed_videos: list[str] = field(default_factory=list)
    succeeded_videos: list[str] = field(default_factory=list)
    message: str = ""
    channel_id: str = ""
    extra: dict = field(default_factory=dict)

    @property
    def progress(self) -> int:
        if self.total_videos == 0:
            return self.extra.get("progress", 0)
        return int((self.processed_videos / self.total_videos) * 100)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["progress"] = self.progress
        d["status"] = self.status.value
        d.update(self.extra)
        return d

    def to_json(self) -> str:
        return json.dumps(self.to_dict())


class JobManager:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._subscribers: dict[str, list[asyncio.Queue]] = {}

    def create_job(self, total_videos: int) -> Job:
        job_id = str(uuid.uuid4())
        job = Job(id=job_id, total_videos=total_videos)
        self._jobs[job_id] = job
        return job

    def update_job(self, job_id: str, **kwargs) -> None:
        job = self._jobs[job_id]
        for k, v in kwargs.items():
            setattr(job, k, v)
        self._notify(job_id, job)

    def get_job(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def subscribe(self, job_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.setdefault(job_id, []).append(queue)
        return queue

    def has_active_job_for_channel(self, channel_id: str) -> Job | None:
        for job in self._jobs.values():
            if job.channel_id == channel_id and job.status == JobStatus.IN_PROGRESS:
                return job
        return None

    def _notify(self, job_id: str, job: Job) -> None:
        for queue in self._subscribers.get(job_id, []):
            queue.put_nowait(job)
