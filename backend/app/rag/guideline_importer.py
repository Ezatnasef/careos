"""Safe, opt-in read-only importer for pre-embedded clinical guideline chunks.

Reads the 612 pre-embedded clinical guideline chunks from the legacy
``careos_rag.db`` SQLite database strictly in read-only URI mode (`?mode=ro`),
validates every chunk's metadata and 384-dimensional finite float vector, and
idempotently upserts them into a target SQLAlchemy session as shared clinical
guidelines (`organization_id=None, patient_id=None, source_type='guideline'`).

SAFETY GUARANTEES:
- Never modifies the legacy ``careos_rag.db`` database.
- Never runs automatically at startup or against existing production databases.
- Must be invoked explicitly with a target session (e.g., an isolated test database).
"""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.config import BACKEND_ROOT, get_settings
from app.rag.embeddings import EMBEDDING_DIM, validate_embedding_vector
from app.rag.store import async_upsert_chunks, upsert_chunks

logger = logging.getLogger(__name__)

DEFAULT_LEGACY_RAG_DB = (
    Path(__file__).resolve().parents[4] / "backend" / "careos_rag.db"
)


def resolve_legacy_rag_db_path(source_db_path: Optional[Path] = None) -> Path:
    """Resolve the read-only clinical guideline SQLite database path."""
    if source_db_path is not None:
        return Path(source_db_path)
    configured = (getattr(get_settings(), "legacy_rag_db_path", "") or "").strip()
    if configured:
        candidate = Path(configured)
        return candidate if candidate.is_absolute() else (BACKEND_ROOT / candidate).resolve()
    local_bundled = (BACKEND_ROOT / "data" / "careos_rag.db").resolve()
    if local_bundled.exists():
        return local_bundled
    return DEFAULT_LEGACY_RAG_DB


def read_legacy_guideline_chunks(
    source_db_path: Optional[Path] = None,
) -> Tuple[List[Dict[str, Any]], List[List[float]]]:
    """Read and validate all guideline chunks and their 384-dim embeddings from ``source_db_path`` in read-only mode."""
    db_path = resolve_legacy_rag_db_path(source_db_path)
    if not db_path.exists():
        raise FileNotFoundError(
            f"Legacy RAG database not found at: {db_path}. "
            "Set LEGACY_RAG_DB_PATH in .env or place careos_rag.db in backend/data/careos_rag.db."
        )

    uri = f"file:{db_path.resolve().as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT chunk_id, source, page, text, embedding FROM document_chunks ORDER BY id ASC"
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    chunks: List[Dict[str, Any]] = []
    vectors: List[List[float]] = []

    for row_idx, (chunk_id, source, page, text, raw_embedding) in enumerate(rows):
        if not chunk_id or not str(chunk_id).strip():
            raise ValueError(f"Row {row_idx} has empty chunk_id")
        if not source or not str(source).strip():
            raise ValueError(f"Row {row_idx} ({chunk_id}) has empty source")
        if not text or not str(text).strip():
            raise ValueError(f"Row {row_idx} ({chunk_id}) has empty text")

        parsed_vec = json.loads(raw_embedding) if isinstance(raw_embedding, str) else raw_embedding
        validated_vec = validate_embedding_vector(parsed_vec, expected_dim=EMBEDDING_DIM)

        chunks.append(
            {
                "chunk_id": str(chunk_id).strip(),
                "source": str(source).strip(),
                "page": int(page or 1),
                "text": str(text).strip(),
                "source_type": "guideline",
                "ocr_applied": False,
                "ocr_engine": None,
            }
        )
        vectors.append(validated_vec)

    logger.info(
        "Read and validated %d clinical guideline chunks from %s (read-only).",
        len(chunks),
        db_path.name,
    )
    return chunks, vectors


def import_guidelines_sync(
    db: Session,
    source_db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Idempotently import legacy clinical guideline chunks into a synchronous ``Session``."""
    db_path = resolve_legacy_rag_db_path(source_db_path)
    chunks, vectors = read_legacy_guideline_chunks(db_path)
    imported = upsert_chunks(
        db,
        chunks,
        precomputed_embeddings=vectors,
        organization_id=None,
        patient_id=None,
        document_id=None,
        source_type="guideline",
    )
    sources = sorted({c["source"] for c in chunks})
    return {
        "source_db": str(db_path),
        "chunks_read": len(chunks),
        "chunks_imported": imported,
        "sources": sources,
    }


async def import_guidelines_async(
    db: AsyncSession,
    source_db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Idempotently import legacy clinical guideline chunks into an asynchronous ``AsyncSession``."""
    db_path = resolve_legacy_rag_db_path(source_db_path)
    chunks, vectors = read_legacy_guideline_chunks(db_path)
    imported = await async_upsert_chunks(
        db,
        chunks,
        precomputed_embeddings=vectors,
        organization_id=None,
        patient_id=None,
        document_id=None,
        source_type="guideline",
    )
    sources = sorted({c["source"] for c in chunks})
    return {
        "source_db": str(db_path),
        "chunks_read": len(chunks),
        "chunks_imported": imported,
        "sources": sources,
    }

