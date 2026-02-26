import asyncio
import logging
import time
import traceback
from datetime import datetime, timezone

from supabase import Client

from app.config import Settings
from app.models.knowledge import JobStatus
from app.services.job_manager import JobManager
from app.services.vectorstore import get_user_vectorstore

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
        completed_run_ids = [r["id"] for r in (completed_runs.data or [])]

        historical_pairs = []
        if completed_run_ids:
            hist_result = supabase.table("deep_memory_training_pairs").select(
                "question_text, chunk_id, relevance_score"
            ).in_("training_run_id", completed_run_ids).execute()
            historical_pairs = hist_result.data or []

        pairs = current_pairs + historical_pairs

        # Format for Deep Memory API
        all_queries = [p["question_text"] for p in pairs]
        all_relevance = [[(p["chunk_id"], p["relevance_score"])] for p in pairs]

        # Split held-out test set BEFORE training (10%, min 20 total to split)
        if len(all_queries) >= 20:
            test_size = max(1, len(all_queries) // 10)
            test_queries = all_queries[:test_size]
            test_relevance = all_relevance[:test_size]
            train_queries = all_queries[test_size:]
            train_relevance = all_relevance[test_size:]
        else:
            # Too few pairs for meaningful evaluation — train on all, skip eval
            train_queries = all_queries
            train_relevance = all_relevance
            test_queries = []
            test_relevance = []

        # Update pair_count to reflect merged total
        supabase.table("deep_memory_training_runs").update({
            "pair_count": len(all_queries),
        }).eq("id", training_run_id).execute()

        job_manager.update_job(
            job_id,
            extra={
                "status": "training",
                "message": f"Starting Deep Memory training with {len(train_queries)} pairs ({len(current_pairs)} new + {len(historical_pairs)} historical, {len(test_queries)} held out for eval)...",
                "progress": 10,
            },
        )

        # Get Deep Memory API (scoped to user's dataset)
        vectorstore = get_user_vectorstore(user_id, settings)
        deep_memory_api = await asyncio.to_thread(vectorstore.get_deep_memory_api)

        # Start training (only on train split, excludes held-out test set)
        deeplake_job_id = await asyncio.to_thread(
            deep_memory_api.train, queries=train_queries, relevance=train_relevance
        )

        # Store deeplake job ID
        supabase.table("deep_memory_training_runs").update({
            "deeplake_job_id": str(deeplake_job_id),
        }).eq("id", training_run_id).execute()

        # Poll status with exponential backoff and overall timeout
        backoff = 5
        max_backoff = 60
        max_total_seconds = 7200  # 2 hours
        progress = 20
        poll_start = time.monotonic()

        while True:
            elapsed = time.monotonic() - poll_start
            if elapsed > max_total_seconds:
                raise RuntimeError(
                    f"Training timed out after {max_total_seconds // 3600} hours"
                )

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

        # Evaluate with held-out test set (split before training)
        metrics = {}
        if test_queries:
            job_manager.update_job(
                job_id,
                extra={
                    "status": "training",
                    "message": f"Evaluating Deep Memory on {len(test_queries)} held-out pairs...",
                    "progress": 92,
                },
            )

            eval_result = await asyncio.to_thread(
                deep_memory_api.evaluate,
                queries=test_queries,
                relevance=test_relevance,
                top_k=[1, 3, 5, 10],
            )

            if isinstance(eval_result, dict):
                metrics = eval_result
            else:
                metrics = {"raw_result": str(eval_result)}
        else:
            logger.info("Skipping evaluation: too few pairs for meaningful held-out split")

        # Update training run as completed
        supabase.table("deep_memory_training_runs").update({
            "status": "completed",
            "metrics": metrics,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", training_run_id).execute()

        # Get user_id for settings update
        run_result = supabase.table("deep_memory_training_runs").select(
            "user_id"
        ).eq("id", training_run_id).execute()
        user_id = run_result.data[0]["user_id"]

        # Upsert deep_memory_settings
        supabase.table("deep_memory_settings").upsert({
            "user_id": user_id,
            "last_trained_at": datetime.now(timezone.utc).isoformat(),
            "last_training_run_id": training_run_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
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
            "status": "training_failed",
            "error_message": str(e)[:500],
        }).eq("id", training_run_id).execute()

        job_manager.update_job(
            job_id,
            status=JobStatus.FAILED,
            message=f"Training failed: {e}",
            extra={"status": "training_failed", "error_message": str(e)[:500]},
        )
