import asyncio
import json
import logging
import traceback
from datetime import datetime, timezone

from openai import AsyncOpenAI
from supabase import Client

from app.config import Settings
from app.models.knowledge import JobStatus
from app.services.job_manager import JobManager
from app.services.vectorstore import VectorStoreService

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a training data generator for a financial/trading knowledge base search system. "
    "Your job is to generate diverse search questions that a user might ask when looking for "
    "the information contained in the given text chunk."
)

USER_PROMPT_TEMPLATE = """Given this text chunk from a trading/investing knowledge base, generate {target_questions} diverse questions that a user might search for to find this information.

Requirements:
- Include factual questions (e.g., "What is...?", "How does...work?")
- Include conceptual questions (e.g., "Why would...?", "When should...?")
- Include terminology-based questions using specific terms from the chunk
- If the chunk mentions ticker symbols, strategy names, or financial terms, include them in questions
- Questions should be natural search queries, not overly formal

Text chunk:
---
{chunk_text}
---

Return a JSON object with a single key "questions" containing an array of question strings.
Example: {{"questions": ["What is an iron condor?", "How do you profit from an iron condor strategy?"]}}"""


async def generate_training_data(
    training_run_id: str,
    job_id: str,
    job_manager: JobManager,
    settings: Settings,
    supabase: Client,
) -> None:
    """Background task: generate question-chunk training pairs using LLM."""
    openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    vectorstore = VectorStoreService(settings)

    try:
        # Fetch all chunks from the vector store
        chunks = await asyncio.to_thread(vectorstore.get_all_chunk_ids_and_texts)

        # Check for already-processed chunks in THIS run (resumability)
        existing_result = supabase.table("deep_memory_training_pairs").select(
            "chunk_id"
        ).eq("training_run_id", training_run_id).execute()
        current_run_chunk_ids = {row["chunk_id"] for row in (existing_result.data or [])}

        # Also get chunk_ids from ALL previous completed runs for this user (incremental)
        run_result = supabase.table("deep_memory_training_runs").select(
            "user_id"
        ).eq("id", training_run_id).execute()
        user_id = run_result.data[0]["user_id"]

        completed_runs = supabase.table("deep_memory_training_runs").select(
            "id"
        ).eq("user_id", user_id).eq("status", "completed").execute()
        completed_run_ids = [r["id"] for r in (completed_runs.data or [])]

        previously_trained_chunk_ids: set[str] = set()
        if completed_run_ids:
            hist_pairs = supabase.table("deep_memory_training_pairs").select(
                "chunk_id"
            ).in_("training_run_id", completed_run_ids).execute()
            previously_trained_chunk_ids = {
                row["chunk_id"] for row in (hist_pairs.data or [])
            }

        # Skip chunks already in this run OR from previous completed runs
        skip_ids = current_run_chunk_ids | previously_trained_chunk_ids
        unprocessed = [c for c in chunks if c["id"] not in skip_ids]

        total_chunks = len(unprocessed)  # Only count new chunks
        already_processed = len(current_run_chunk_ids)

        # Update run with total count
        supabase.table("deep_memory_training_runs").update({
            "total_chunks": total_chunks,
            "processed_chunks": already_processed,
        }).eq("id", training_run_id).execute()

        # Get current pair count
        pair_count_result = supabase.table("deep_memory_training_pairs").select(
            "id", count="exact"
        ).eq("training_run_id", training_run_id).execute()
        pair_count = pair_count_result.count or 0

        job_manager.update_job(
            job_id,
            status=JobStatus.IN_PROGRESS,
            extra={
                "status": "generating",
                "processed_chunks": already_processed,
                "total_chunks": total_chunks,
                "pair_count": pair_count,
                "progress": int((already_processed / total_chunks) * 100) if total_chunks > 0 else 0,
            },
        )

        for i, chunk in enumerate(unprocessed):
            # Check pair cap
            if pair_count >= settings.deep_memory_max_pairs:
                logger.info(f"Reached max pairs cap ({settings.deep_memory_max_pairs}), stopping generation")
                break

            try:
                questions = await _generate_questions(
                    openai_client,
                    chunk["text"],
                    settings.deep_memory_generation_model,
                    settings.deep_memory_target_questions_per_chunk,
                )

                # Insert pairs
                rows = [
                    {
                        "training_run_id": training_run_id,
                        "question_text": q,
                        "chunk_id": chunk["id"],
                        "chunk_preview": chunk["text"][:200],
                        "relevance_score": 1.0,
                    }
                    for q in questions
                ]
                if rows:
                    supabase.table("deep_memory_training_pairs").insert(rows).execute()
                    pair_count += len(rows)

            except Exception as e:
                logger.warning(f"Failed to generate questions for chunk {chunk['id']}: {e}")
                # Skip bad chunks, don't kill the whole run

            processed = already_processed + i + 1
            progress = int((processed / total_chunks) * 100) if total_chunks > 0 else 0

            supabase.table("deep_memory_training_runs").update({
                "processed_chunks": processed,
                "pair_count": pair_count,
            }).eq("id", training_run_id).execute()

            job_manager.update_job(
                job_id,
                extra={
                    "status": "generating",
                    "processed_chunks": processed,
                    "total_chunks": total_chunks,
                    "pair_count": pair_count,
                    "progress": progress,
                },
            )

            # Rate limiting
            if i < len(unprocessed) - 1:
                await asyncio.sleep(settings.deep_memory_generation_delay)

        # Complete
        supabase.table("deep_memory_training_runs").update({
            "status": "generated",
            "pair_count": pair_count,
            "processed_chunks": total_chunks,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", training_run_id).execute()

        job_manager.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            extra={
                "status": "generated",
                "processed_chunks": total_chunks,
                "total_chunks": total_chunks,
                "pair_count": pair_count,
                "progress": 100,
            },
        )

    except Exception as e:
        logger.error(f"Training data generation failed: {traceback.format_exc()}")
        supabase.table("deep_memory_training_runs").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", training_run_id).execute()

        job_manager.update_job(
            job_id,
            status=JobStatus.FAILED,
            message=f"Generation failed: {e}",
            extra={"status": "failed", "error_message": str(e)[:500]},
        )


async def _generate_questions(
    client: AsyncOpenAI,
    chunk_text: str,
    model: str,
    target_questions: int,
) -> list[str]:
    """Call OpenAI to generate questions for a chunk."""
    response = await client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(
                target_questions=target_questions,
                chunk_text=chunk_text[:2000],
            )},
        ],
        temperature=0.7,
    )

    content = response.choices[0].message.content
    parsed = json.loads(content)
    questions = parsed.get("questions", [])
    return [q for q in questions if isinstance(q, str) and q.strip()]
