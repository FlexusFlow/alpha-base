from datetime import datetime

from pydantic import BaseModel


class GenerateRequest(BaseModel):
    pass


class GenerateResponse(BaseModel):
    job_id: str
    training_run_id: str
    total_chunks: int
    message: str


class TrainRequest(BaseModel):
    training_run_id: str


class TrainResponse(BaseModel):
    job_id: str
    training_run_id: str
    message: str


class SamplePair(BaseModel):
    question_text: str
    chunk_preview: str
    relevance_score: float


class TrainingRunSummary(BaseModel):
    id: str
    status: str
    pair_count: int
    processed_chunks: int
    total_chunks: int
    error_message: str | None = None
    metrics: dict
    started_at: datetime
    completed_at: datetime | None


class TrainingRunDetail(TrainingRunSummary):
    total_chunks: int
    processed_chunks: int
    deeplake_job_id: str | None
    error_message: str | None
    sample_pairs: list[SamplePair]
    statistics: dict


class TrainingRunListResponse(BaseModel):
    runs: list[TrainingRunSummary]


class DeepMemorySettingsResponse(BaseModel):
    enabled: bool
    last_trained_at: datetime | None
    last_training_run_id: str | None
    can_enable: bool
    total_chunks: int
    trained_chunk_count: int
    has_blocking_run: bool = False
    blocking_run_id: str | None = None
    blocking_run_status: str | None = None
    is_cloud: bool = True


class ProceedRequest(BaseModel):
    training_run_id: str


class ProceedResponse(BaseModel):
    job_id: str
    training_run_id: str
    message: str


class UpdateSettingsRequest(BaseModel):
    enabled: bool
