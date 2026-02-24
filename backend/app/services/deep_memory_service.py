import asyncio
import logging
import traceback

from supabase import Client

from app.config import Settings
from app.models.knowledge import JobStatus
from app.services.job_manager import JobManager
from app.services.vectorstore import VectorStoreService

logger = logging.getLogger(__name__)


async def train_deep_memory(
    training_run_id: str,
    job_id: str,
    job_manager: JobManager,
    settings: Settings,
    supabase: Client,
) -> None:
    """Background task: train Deep Memory model with generated pairs."""
    try:
        # Update status to training
        supabase.table("deep_memory_training_runs").update({
            "status": "training",
        }).eq("id", training_run_id).execute()

        job_manager.update_job(
            job_id,
            status=JobStatus.IN_PROGRESS,
            extra={"status": "training", "message": "Loading training pairs...", "progress": 5},
        )

        # Load pairs for this run
        pairs_result = supabase.table("deep_memory_training_pairs").select(
            "question_text, chunk_id, relevance_score"
        ).eq("training_run_id", training_run_id).execute()

        current_pairs = pairs_result.data or []
        if not current_pairs:
            raise ValueError("No training pairs found for this run")

        # Also load pairs from ALL previous completed runs (merge for full corpus training)
        run_result = supabase.table("deep_memory_training_runs").select(
            "user_id"
        ).eq("id", training_run_id).execute()
        user_id = run_result.data[0]["user_id"]

        completed_runs = supabase.table("deep_memory_training_runs").select(
            "id"
        ).eq("user_id", user_id).eq("status", "completed").execute()

        historical_pairs = []
        for rid_row in (completed_runs.data or []):
            rid = rid_row["id"]
            hist = supabase.table("deep_memory_training_pairs").select(
                "question_text, chunk_id, relevance_score"
            ).eq("training_run_id", rid).execute()
            historical_pairs.extend(hist.data or [])

        pairs = current_pairs + historical_pairs

        # Format for Deep Memory API
        queries = [p["question_text"] for p in pairs]
        relevance = [[(p["chunk_id"], p["relevance_score"])] for p in pairs]

        # Update pair_count to reflect merged total
        supabase.table("deep_memory_training_runs").update({
            "pair_count": len(pairs),
        }).eq("id", training_run_id).execute()

        job_manager.update_job(
            job_id,
            extra={
                "status": "training",
                "message": f"Starting Deep Memory training with {len(queries)} pairs ({len(current_pairs)} new + {len(historical_pairs)} historical)...",
                "progress": 10,
            },
        )

        # Get Deep Memory API
        vectorstore = VectorStoreService(settings)
        deep_memory_api = await asyncio.to_thread(vectorstore.get_deep_memory_api)

        # Start training
        deeplake_job_id = await asyncio.to_thread(
            deep_memory_api.train, queries=queries, relevance=relevance
        )

        # Store deeplake job ID
        supabase.table("deep_memory_training_runs").update({
            "deeplake_job_id": str(deeplake_job_id),
        }).eq("id", training_run_id).execute()

        # Poll status with exponential backoff
        backoff = 5
        max_backoff = 60
        progress = 20

        while True:
            status = await asyncio.to_thread(deep_memory_api.status, deeplake_job_id)
            logger.info(f"Deep Memory training status: {status}")

            if progress < 90:
                progress = min(progress + 5, 90)

            job_manager.update_job(
                job_id,
                extra={
                    "status": "training",
                    "message": f"Deep Memory training in progress ({status})",
                    "progress": progress,
                },
            )

            if status in ("completed", "success"):
                break
            elif status in ("failed", "error"):
                raise RuntimeError(f"Deep Memory training failed with status: {status}")

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, max_backoff)

        # Evaluate with held-out test set (10%)
        job_manager.update_job(
            job_id,
            extra={
                "status": "training",
                "message": "Evaluating Deep Memory performance...",
                "progress": 92,
            },
        )

        test_size = max(1, len(queries) // 10)
        test_queries = queries[:test_size]
        test_relevance = relevance[:test_size]

        eval_result = await asyncio.to_thread(
            deep_memory_api.evaluate,
            queries=test_queries,
            relevance=test_relevance,
            top_k=[1, 3, 5, 10],
        )

        metrics = {}
        if isinstance(eval_result, dict):
            metrics = eval_result
        else:
            metrics = {"raw_result": str(eval_result)}

        # Update training run as completed
        supabase.table("deep_memory_training_runs").update({
            "status": "completed",
            "metrics": metrics,
            "completed_at": "now()",
        }).eq("id", training_run_id).execute()

        # Get user_id for settings update
        run_result = supabase.table("deep_memory_training_runs").select(
            "user_id"
        ).eq("id", training_run_id).execute()
        user_id = run_result.data[0]["user_id"]

        # Upsert deep_memory_settings
        supabase.table("deep_memory_settings").upsert({
            "user_id": user_id,
            "last_trained_at": "now()",
            "last_training_run_id": training_run_id,
            "updated_at": "now()",
        }, on_conflict="user_id").execute()

        job_manager.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            extra={
                "status": "completed",
                "metrics": metrics,
                "progress": 100,
            },
        )

    except Exception as e:
        logger.error(f"Deep Memory training failed: {traceback.format_exc()}")
        supabase.table("deep_memory_training_runs").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", training_run_id).execute()

        job_manager.update_job(
            job_id,
            status=JobStatus.FAILED,
            message=f"Training failed: {e}",
            extra={"status": "failed", "error_message": str(e)[:500]},
        )
