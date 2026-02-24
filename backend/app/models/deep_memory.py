from datetime import datetime

from pydantic import BaseModel


class GenerateRequest(BaseModel):
    user_id: str


class GenerateResponse(BaseModel):
    job_id: str
    training_run_id: str
    total_chunks: int
    message: str


class TrainRequest(BaseModel):
    training_run_id: str
    user_id: str


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


class UpdateSettingsRequest(BaseModel):
    enabled: bool
    user_id: str
