"""Background workers for queued CareOS jobs."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .db import get_session, init_db
from .email_service import process_email_jobs
from .integrations import get_speech_to_text_provider
from .models import AudioFile, Transcript, TranscriptionJob
from .storage import StorageService

logger = logging.getLogger(__name__)
TRANSCRIPTION_PROCESSING_TIMEOUT = timedelta(minutes=3)


def _lock_query_if_supported(query, session):
    try:
        bind = session.get_bind()
        if bind and getattr(bind.dialect, "name", "") == "postgresql":
            return query.with_for_update(skip_locked=True)
    except Exception:
        pass
    return query


async def process_transcription_jobs(session) -> int:
    now = datetime.now(timezone.utc)
    stale_job = await session.scalar(
        select(TranscriptionJob)
        .where(
            TranscriptionJob.status == "PROCESSING",
            TranscriptionJob.available_at <= now - TRANSCRIPTION_PROCESSING_TIMEOUT,
        )
        .order_by(TranscriptionJob.available_at)
        .limit(1)
    )
    if stale_job is not None:
        transcript = await session.get(Transcript, stale_job.transcript_id)
        stale_job.last_error = "TRANSCRIPTION_WORKER_TIMEOUT"
        if stale_job.attempts >= stale_job.max_attempts:
            stale_job.status = "FAILED"
            if transcript is not None:
                transcript.status = "FAILED"
                transcript.error_code = stale_job.last_error
        else:
            stale_job.status = "RETRY"
            stale_job.available_at = now
            if transcript is not None:
                transcript.status = "TRANSCRIBING"
                transcript.error_code = None
        await session.commit()
        return 1

    job_stmt = select(TranscriptionJob).where(TranscriptionJob.status.in_(["QUEUED", "RETRY"]), TranscriptionJob.available_at <= now).order_by(TranscriptionJob.created_at).limit(1)
    job_stmt = _lock_query_if_supported(job_stmt, session)
    job = await session.scalar(job_stmt)
    if job is None:
        return 0
    transcript = await session.get(Transcript, job.transcript_id)
    audio = await session.get(AudioFile, job.audio_file_id)
    if transcript is None or audio is None:
        job.status = "FAILED"
        job.last_error = "RECORDING_OR_TRANSCRIPT_NOT_FOUND"
        await session.commit()
        return 1
    job.status = "PROCESSING"
    job.available_at = now
    job.attempts += 1
    transcript.status = "TRANSCRIBING"
    await session.commit()
    try:
        result = await get_speech_to_text_provider().transcribe(StorageService().read_document(audio.storage_key), language=transcript.language)
        transcript.status = "COMPLETED"
        transcript.transcript_text = str(result.get("text") or "")
        transcript.confidence = result.get("confidence") if isinstance(result.get("confidence"), (int, float)) else None
        transcript.completed_at = datetime.now(timezone.utc)
        job.status = "COMPLETED"
        job.completed_at = datetime.now(timezone.utc)
        job.last_error = None
    except Exception as error:
        transcript.status = "FAILED" if job.attempts >= job.max_attempts else "TRANSCRIBING"
        transcript.error_code = "SPEECH_TO_TEXT_NOT_CONFIGURED" if "not configured" in str(error).lower() else "SPEECH_TO_TEXT_PROVIDER_ERROR"
        job.status = "FAILED" if job.attempts >= job.max_attempts else "RETRY"
        job.last_error = transcript.error_code
        job.available_at = datetime.now(timezone.utc) + timedelta(seconds=min(300, 2 ** job.attempts))
        logger.warning(
            "Transcription job %s failed on attempt %s/%s: %s",
            job.id,
            job.attempts,
            job.max_attempts,
            job.last_error,
        )
    await session.commit()
    return 1


async def run_email_worker(interval_seconds: float = 2.0) -> None:
    await init_db()
    while True:
        async for session in get_session():
            await process_email_jobs(session)
            await process_transcription_jobs(session)
        await asyncio.sleep(interval_seconds)


if __name__ == "__main__":
    asyncio.run(run_email_worker())
