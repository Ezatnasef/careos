"""Database-backed vector store for CareOS Clinical RAG.

Supports both asynchronous SQLAlchemy ``AsyncSession`` (used by the canonical
CareOS FastAPI application) and synchronous ``Session`` (used by unit tests
and CLI/import utilities) across SQLite and PostgreSQL.

Enforces:
- 384-dimensional finite float vector validation on upsert
- Strict multi-tenant (`organization_id`) and patient (`patient_id`) isolation:
  - Shared clinical guidelines have `organization_id=None, patient_id=None, source_type="guideline"`.
  - Patient-specific clinical documents have `organization_id=<UUID>, patient_id=<UUID>, document_id=<UUID>, source_type="patient_document"`.
  - Queries never leak chunks across organizations or across patients.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Sequence
from uuid import UUID

import numpy as np
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.config import settings
from app.models import DocumentChunk, PatientDocument
from app.rag.embeddings import EMBEDDING_DIM, embed_query, embed_texts, validate_embedding_vector

logger = logging.getLogger(__name__)


def _active_patient_document_clause():
    """Defense-in-depth filter excluding chunks linked to soft-deleted, rejected, or pending PatientDocuments."""
    inactive_doc_ids = select(PatientDocument.id).where(
        or_(
            PatientDocument.deleted_at.is_not(None),
            PatientDocument.review_status != "approved",
        )
    )
    return or_(
        DocumentChunk.document_id.is_(None),
        ~DocumentChunk.document_id.in_(inactive_doc_ids),
    )


def _coerce_embedding(raw: Any) -> Optional[List[float]]:
    """Parse a stored JSON/list embedding and validate its dimension."""
    if raw is None:
        return None
    vec = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(vec, (list, tuple)) or len(vec) != EMBEDDING_DIM:
        return None
    return [float(x) for x in vec]


def _score_rows(
    rows: Sequence[DocumentChunk],
    query_vec: List[float],
    top_k: int,
) -> List[Dict[str, Any]]:
    """Compute vectorized cosine similarity between ``query_vec`` and ``rows``."""
    if not rows:
        return []

    q = np.asarray(validate_embedding_vector(query_vec), dtype=np.float32)
    q_norm = float(np.linalg.norm(q))
    if q_norm > 0:
        q = q / q_norm

    valid_rows: List[DocumentChunk] = []
    vectors: List[List[float]] = []
    for row in rows:
        vec = _coerce_embedding(row.embedding)
        if vec is None:
            continue
        valid_rows.append(row)
        vectors.append(vec)

    if not valid_rows:
        return []

    mat = np.asarray(vectors, dtype=np.float32)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    mat_normalized = mat / norms
    scores = mat_normalized @ q

    top_indices = np.argsort(scores)[::-1][:top_k]
    results: List[Dict[str, Any]] = []
    for idx in top_indices:
        row = valid_rows[int(idx)]
        results.append(
            {
                "chunk_id": row.chunk_id,
                "source": row.source,
                "page": row.page,
                "text": row.text,
                "score": round(float(scores[int(idx)]), 4),
                "source_type": getattr(row, "source_type", "guideline") or "guideline",
                "document_id": str(row.document_id) if getattr(row, "document_id", None) else None,
                "organization_id": str(row.organization_id) if getattr(row, "organization_id", None) else None,
                "patient_id": str(row.patient_id) if getattr(row, "patient_id", None) else None,
            }
        )
    return results


def _build_scope_filter(
    *,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
    include_guidelines: bool = True,
    only_patient_documents: bool = False,
):
    """Build SQLAlchemy WHERE clause enforcing strict tenant and patient isolation."""
    guideline_clause = (
        DocumentChunk.organization_id.is_(None)
        & DocumentChunk.patient_id.is_(None)
        & (DocumentChunk.source_type == "guideline")
    )
    active_doc_clause = _active_patient_document_clause()

    if only_patient_documents:
        if organization_id is None or patient_id is None:
            # Fail closed: never return patient documents without explicit org + patient scope
            return DocumentChunk.id.is_(None)
        return (
            (DocumentChunk.organization_id == organization_id)
            & (DocumentChunk.patient_id == patient_id)
            & (DocumentChunk.source_type == "patient_document")
            & active_doc_clause
        )

    if organization_id is not None and patient_id is not None:
        patient_clause = (
            (DocumentChunk.organization_id == organization_id)
            & (DocumentChunk.patient_id == patient_id)
            & active_doc_clause
        )
        if include_guidelines:
            return or_(guideline_clause, patient_clause)
        return patient_clause

    # Default when no patient_id is targeted: strictly shared guidelines only (never any patient's private chunks)
    if include_guidelines:
        return guideline_clause
    return DocumentChunk.id.is_(None)


# ---------------------------------------------------------------------------
# Asynchronous API (for FastAPI AsyncSession routes)
# ---------------------------------------------------------------------------

async def async_upsert_chunks(
    db: AsyncSession,
    chunks: List[Dict[str, Any]],
    *,
    precomputed_embeddings: Optional[Sequence[Sequence[float]]] = None,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
    document_id: Optional[UUID] = None,
    source_type: str = "guideline",
) -> int:
    """Embed and upsert a batch of chunk dicts into ``document_chunks`` using ``AsyncSession``."""
    if not chunks:
        return 0

    if precomputed_embeddings is not None:
        if len(precomputed_embeddings) != len(chunks):
            raise ValueError("precomputed_embeddings length must match chunks length")
        validated_vectors = [validate_embedding_vector(v) for v in precomputed_embeddings]
    else:
        texts = [c["text"] for c in chunks]
        raw_embeddings = embed_texts(texts)
        validated_vectors = [validate_embedding_vector(v.tolist()) for v in raw_embeddings]

    chunk_ids = [c["chunk_id"] for c in chunks]
    existing_result = await db.execute(
        select(DocumentChunk).where(DocumentChunk.chunk_id.in_(chunk_ids))
    )
    existing_by_id = {row.chunk_id: row for row in existing_result.scalars().all()}

    upserted = 0
    for chunk, vec in zip(chunks, validated_vectors):
        cid = chunk["chunk_id"]
        org_id = chunk.get("organization_id", organization_id)
        pat_id = chunk.get("patient_id", patient_id)
        doc_id = chunk.get("document_id", document_id)
        stype = chunk.get("source_type", source_type) or "guideline"
        ocr_applied = bool(chunk.get("ocr_applied", False))
        ocr_engine = chunk.get("ocr_engine")

        existing = existing_by_id.get(cid)
        if existing is not None:
            existing.text = chunk["text"]
            existing.embedding = vec
            existing.source = chunk["source"]
            existing.page = int(chunk["page"])
            existing.organization_id = org_id
            existing.patient_id = pat_id
            existing.document_id = doc_id
            existing.source_type = stype
            existing.ocr_applied = ocr_applied
            existing.ocr_engine = ocr_engine
        else:
            db.add(
                DocumentChunk(
                    chunk_id=cid,
                    source=chunk["source"],
                    page=int(chunk["page"]),
                    text=chunk["text"],
                    embedding=vec,
                    organization_id=org_id,
                    patient_id=pat_id,
                    document_id=doc_id,
                    source_type=stype,
                    ocr_applied=ocr_applied,
                    ocr_engine=ocr_engine,
                )
            )
        upserted += 1

    await db.commit()
    logger.info("Async upserted %d chunks into document_chunks.", upserted)
    return upserted


async def async_similarity_search(
    db: AsyncSession,
    query: str,
    top_k: Optional[int] = None,
    *,
    query_embedding: Optional[List[float]] = None,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
    include_guidelines: bool = True,
    only_patient_documents: bool = False,
) -> List[Dict[str, Any]]:
    """Retrieve top-k relevant chunks with strict tenant/patient scoping via ``AsyncSession``."""
    if top_k is None:
        top_k = settings.VECTOR_TOP_K

    q_vec = validate_embedding_vector(query_embedding) if query_embedding is not None else embed_query(query)
    where_clause = _build_scope_filter(
        organization_id=organization_id,
        patient_id=patient_id,
        include_guidelines=include_guidelines,
        only_patient_documents=only_patient_documents,
    )
    stmt = select(DocumentChunk).where(where_clause)
    rows = (await db.execute(stmt)).scalars().all()
    return _score_rows(rows, q_vec, top_k=top_k)


async def async_count_chunks(
    db: AsyncSession,
    *,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
    source_type: Optional[str] = None,
) -> int:
    """Return count of stored chunks matching the optional scope filter."""
    stmt = select(func.count(DocumentChunk.id))
    if source_type == "guideline":
        stmt = stmt.where(
            DocumentChunk.organization_id.is_(None)
            & DocumentChunk.patient_id.is_(None)
            & (DocumentChunk.source_type == "guideline")
        )
    elif source_type == "patient_document":
        if organization_id is None:
            return 0
        stmt = stmt.where(
            (DocumentChunk.organization_id == organization_id)
            & (DocumentChunk.source_type == "patient_document")
            & _active_patient_document_clause()
        )
        if patient_id is not None:
            stmt = stmt.where(DocumentChunk.patient_id == patient_id)
    else:
        stmt = stmt.where(
            _build_scope_filter(
                organization_id=organization_id,
                patient_id=patient_id,
                include_guidelines=True,
            )
        )
    result = await db.execute(stmt)
    return int(result.scalar() or 0)


async def async_list_sources(
    db: AsyncSession,
    *,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
) -> List[str]:
    """Return distinct source filenames visible within the caller's scope."""
    where_clause = _build_scope_filter(
        organization_id=organization_id,
        patient_id=patient_id,
        include_guidelines=True,
    )
    stmt = select(DocumentChunk.source).where(where_clause).distinct().order_by(DocumentChunk.source)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def async_delete_document_chunks(
    db: AsyncSession,
    *,
    organization_id: UUID,
    document_id: UUID,
    commit: bool = True,
) -> int:
    """Delete all indexed chunks belonging to a specific tenant's PatientDocument."""
    stmt = delete(DocumentChunk).where(
        (DocumentChunk.organization_id == organization_id)
        & (DocumentChunk.document_id == document_id)
    )
    result = await db.execute(stmt)
    if commit:
        await db.commit()
    return int(result.rowcount or 0)


# ---------------------------------------------------------------------------
# Synchronous API (for sync SQLAlchemy Session in unit tests / scripts)
# ---------------------------------------------------------------------------

def upsert_chunks(
    db: Session,
    chunks: List[Dict[str, Any]],
    *,
    precomputed_embeddings: Optional[Sequence[Sequence[float]]] = None,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
    document_id: Optional[UUID] = None,
    source_type: str = "guideline",
) -> int:
    """Embed and upsert a batch of chunk dicts into ``document_chunks`` using sync ``Session``."""
    if not chunks:
        return 0

    if precomputed_embeddings is not None:
        if len(precomputed_embeddings) != len(chunks):
            raise ValueError("precomputed_embeddings length must match chunks length")
        validated_vectors = [validate_embedding_vector(v) for v in precomputed_embeddings]
    else:
        texts = [c["text"] for c in chunks]
        raw_embeddings = embed_texts(texts)
        validated_vectors = [validate_embedding_vector(v.tolist()) for v in raw_embeddings]

    upserted = 0
    for chunk, vec in zip(chunks, validated_vectors):
        cid = chunk["chunk_id"]
        org_id = chunk.get("organization_id", organization_id)
        pat_id = chunk.get("patient_id", patient_id)
        doc_id = chunk.get("document_id", document_id)
        stype = chunk.get("source_type", source_type) or "guideline"
        ocr_applied = bool(chunk.get("ocr_applied", False))
        ocr_engine = chunk.get("ocr_engine")

        existing = db.execute(
            select(DocumentChunk).where(DocumentChunk.chunk_id == cid)
        ).scalar_one_or_none()

        if existing is not None:
            existing.text = chunk["text"]
            existing.embedding = vec
            existing.source = chunk["source"]
            existing.page = int(chunk["page"])
            existing.organization_id = org_id
            existing.patient_id = pat_id
            existing.document_id = doc_id
            existing.source_type = stype
            existing.ocr_applied = ocr_applied
            existing.ocr_engine = ocr_engine
        else:
            db.add(
                DocumentChunk(
                    chunk_id=cid,
                    source=chunk["source"],
                    page=int(chunk["page"]),
                    text=chunk["text"],
                    embedding=vec,
                    organization_id=org_id,
                    patient_id=pat_id,
                    document_id=doc_id,
                    source_type=stype,
                    ocr_applied=ocr_applied,
                    ocr_engine=ocr_engine,
                )
            )
        upserted += 1

    db.commit()
    logger.info("Upserted %d chunks into document_chunks.", upserted)
    return upserted


def similarity_search(
    db: Session,
    query: str,
    top_k: Optional[int] = None,
    *,
    query_embedding: Optional[List[float]] = None,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
    include_guidelines: bool = True,
    only_patient_documents: bool = False,
) -> List[Dict[str, Any]]:
    """Retrieve top-k relevant chunks with strict tenant/patient scoping via sync ``Session``."""
    if top_k is None:
        top_k = settings.VECTOR_TOP_K

    q_vec = validate_embedding_vector(query_embedding) if query_embedding is not None else embed_query(query)
    where_clause = _build_scope_filter(
        organization_id=organization_id,
        patient_id=patient_id,
        include_guidelines=include_guidelines,
        only_patient_documents=only_patient_documents,
    )
    rows = db.execute(select(DocumentChunk).where(where_clause)).scalars().all()
    return _score_rows(rows, q_vec, top_k=top_k)


def count_chunks(
    db: Session,
    *,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
) -> int:
    """Return total number of visible chunks in ``document_chunks``."""
    where_clause = _build_scope_filter(
        organization_id=organization_id,
        patient_id=patient_id,
        include_guidelines=True,
    )
    return int(db.execute(select(func.count(DocumentChunk.id)).where(where_clause)).scalar() or 0)


def list_sources(
    db: Session,
    *,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
) -> List[str]:
    """Return distinct source filenames in ``document_chunks``."""
    where_clause = _build_scope_filter(
        organization_id=organization_id,
        patient_id=patient_id,
        include_guidelines=True,
    )
    rows = db.execute(
        select(DocumentChunk.source).where(where_clause).distinct().order_by(DocumentChunk.source)
    ).scalars().all()
    return list(rows)

