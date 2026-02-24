import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from supabase import Client

from app.config import Settings
from app.dependencies import get_job_manager, get_settings, get_supabase
from app.models.deep_memory import (
    DeepMemorySettingsResponse,
    GenerateRequest,
    GenerateResponse,
    SamplePair,
    TrainRequest,
    TrainResponse,
    TrainingRunDetail,
    TrainingRunListResponse,
    TrainingRunSummary,
    UpdateSettingsRequest,
)
from app.services.job_manager import JobManager
from app.services.training_generator import generate_training_data
from app.services.vectorstore import VectorStoreService

router = APIRouter(prefix="/v1/api/deep-memory", tags=["deep-memory"])


@router.post("/generate", response_model=GenerateResponse, status_code=202)
async def start_generation(
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
    job_manager: JobManager = Depends(get_job_manager),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    """Start training data generation from existing transcript chunks."""
    vectorstore = VectorStoreService(settings)
    chunks = await asyncio.to_thread(vectorstore.get_all_chunk_ids_and_texts)
    total_chunks = len(chunks)

    if total_chunks == 0:
        raise HTTPException(status_code=400, detail="No chunks in vector store")

    # Create training run record
    run_result = supabase.table("deep_memory_training_runs").insert({
        "user_id": request.user_id,
        "status": "generating",
        "total_chunks": total_chunks,
    }).execute()

    training_run_id = run_result.data[0]["id"]

    # Create job for SSE tracking
    job = job_manager.create_job(total_videos=0)

    background_tasks.add_task(
        generate_training_data,
        training_run_id=training_run_id,
        job_id=job.id,
        job_manager=job_manager,
        settings=settings,
        supabase=supabase,
    )

    return GenerateResponse(
        job_id=job.id,
        training_run_id=training_run_id,
        total_chunks=total_chunks,
        message="Training data generation started",
    )


@router.post("/train", response_model=TrainResponse, status_code=202)
async def start_training(
    request: TrainRequest,
    background_tasks: BackgroundTasks,
    job_manager: JobManager = Depends(get_job_manager),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    """Start Deep Memory training with approved training data."""
    # Verify run exists and belongs to user
    run_result = supabase.table("deep_memory_training_runs").select("*").eq(
        "id", request.training_run_id
    ).eq("user_id", request.user_id).execute()

    if not run_result.data:
        raise HTTPException(status_code=404, detail="Training run not found")

    run = run_result.data[0]
    if run["status"] != "generated":
        raise HTTPException(
            status_code=400,
            detail=f"Training run must be in 'generated' status, currently '{run['status']}'",
        )

    # Create job for SSE tracking
    job = job_manager.create_job(total_videos=0)

    from app.services.deep_memory_service import train_deep_memory

    background_tasks.add_task(
        train_deep_memory,
        training_run_id=request.training_run_id,
        job_id=job.id,
        job_manager=job_manager,
        settings=settings,
        supabase=supabase,
    )

    return TrainResponse(
        job_id=job.id,
        training_run_id=request.training_run_id,
        message="Deep Memory training started",
    )


@router.get("/runs", response_model=TrainingRunListResponse)
async def list_training_runs(
    user_id: str,
    supabase: Client = Depends(get_supabase),
):
    """List training runs for the user."""
    result = supabase.table("deep_memory_training_runs").select("*").eq(
        "user_id", user_id
    ).order("created_at", desc=True).execute()

    runs = [
        TrainingRunSummary(
            id=r["id"],
            status=r["status"],
            pair_count=r["pair_count"],
            metrics=r.get("metrics") or {},
            started_at=r["started_at"],
            completed_at=r.get("completed_at"),
        )
        for r in (result.data or [])
    ]

    return TrainingRunListResponse(runs=runs)


@router.get("/runs/{run_id}", response_model=TrainingRunDetail)
async def get_training_run(
    run_id: str,
    user_id: str,
    supabase: Client = Depends(get_supabase),
):
    """Get details for a specific training run including sample pairs."""
    run_result = supabase.table("deep_memory_training_runs").select("*").eq(
        "id", run_id
    ).eq("user_id", user_id).execute()

    if not run_result.data:
        raise HTTPException(status_code=404, detail="Training run not found")

    r = run_result.data[0]

    # Fetch sample pairs
    pairs_result = supabase.table("deep_memory_training_pairs").select(
        "question_text, chunk_preview, relevance_score"
    ).eq("training_run_id", run_id).limit(10).execute()

    sample_pairs = [
        SamplePair(
            question_text=p["question_text"],
            chunk_preview=p.get("chunk_preview") or "",
            relevance_score=p["relevance_score"],
        )
        for p in (pairs_result.data or [])
    ]

    # Compute statistics
    processed = r["processed_chunks"] or 0
    pair_count = r["pair_count"] or 0
    total_chunks = r["total_chunks"] or 0

    statistics = {
        "avg_questions_per_chunk": round(pair_count / processed, 1) if processed > 0 else 0,
        "chunk_coverage_pct": round((processed / total_chunks) * 100, 1) if total_chunks > 0 else 0,
    }

    return TrainingRunDetail(
        id=r["id"],
        status=r["status"],
        pair_count=pair_count,
        metrics=r.get("metrics") or {},
        started_at=r["started_at"],
        completed_at=r.get("completed_at"),
        total_chunks=total_chunks,
        processed_chunks=processed,
        deeplake_job_id=r.get("deeplake_job_id"),
        error_message=r.get("error_message"),
        sample_pairs=sample_pairs,
        statistics=statistics,
    )


@router.get("/settings", response_model=DeepMemorySettingsResponse)
async def get_settings_endpoint(
    user_id: str,
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase),
):
    """Get Deep Memory settings for the user."""
    settings_result = supabase.table("deep_memory_settings").select("*").eq(
        "user_id", user_id
    ).execute()

    # Check if any completed training run exists
    completed_result = supabase.table("deep_memory_training_runs").select(
        "id", count="exact"
    ).eq("user_id", user_id).eq("status", "completed").execute()
    can_enable = (completed_result.count or 0) > 0

    # Get total chunks from vector store
    vectorstore = VectorStoreService(settings)
    chunks = await asyncio.to_thread(vectorstore.get_all_chunk_ids_and_texts)
    total_chunks = len(chunks)

    # Get trained chunk count from last completed run
    trained_chunk_count = 0
    if settings_result.data:
        s = settings_result.data[0]
        last_run_id = s.get("last_training_run_id")
        if last_run_id:
            pairs_result = supabase.rpc(
                "get_unique_chunk_count",
                {"run_id": last_run_id},
            ).execute()
            # Fallback: count distinct chunk_ids from pairs
            if not pairs_result.data:
                chunk_result = supabase.table("deep_memory_training_pairs").select(
                    "chunk_id"
                ).eq("training_run_id", last_run_id).execute()
                trained_chunk_count = len({r["chunk_id"] for r in (chunk_result.data or [])})
            else:
                trained_chunk_count = pairs_result.data[0].get("count", 0) if pairs_result.data else 0

        return DeepMemorySettingsResponse(
            enabled=s["enabled"],
            last_trained_at=s.get("last_trained_at"),
            last_training_run_id=s.get("last_training_run_id"),
            can_enable=can_enable,
            total_chunks=total_chunks,
            trained_chunk_count=trained_chunk_count,
        )

    return DeepMemorySettingsResponse(
        enabled=False,
        last_trained_at=None,
        last_training_run_id=None,
        can_enable=can_enable,
        total_chunks=total_chunks,
        trained_chunk_count=0,
    )


@router.put("/settings")
async def update_settings_endpoint(
    request: UpdateSettingsRequest,
    supabase: Client = Depends(get_supabase),
):
    """Toggle Deep Memory on/off."""
    if request.enabled:
        # Validate at least one completed training run exists
        completed_result = supabase.table("deep_memory_training_runs").select(
            "id", count="exact"
        ).eq("user_id", request.user_id).eq("status", "completed").execute()

        if (completed_result.count or 0) == 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot enable Deep Memory: no completed training run exists",
            )

    # Upsert settings
    supabase.table("deep_memory_settings").upsert({
        "user_id": request.user_id,
        "enabled": request.enabled,
        "updated_at": "now()",
    }, on_conflict="user_id").execute()

    return {
        "enabled": request.enabled,
        "message": f"Deep Memory search {'enabled' if request.enabled else 'disabled'}",
    }
