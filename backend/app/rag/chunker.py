"""Text chunking utilities for the CareOS Clinical RAG pipeline.

Splits extracted document pages into overlapping chunks while preserving
source, page number, OCR metadata, and optional tenant/patient scoping.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Union
from uuid import UUID

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.rag.loader import normalize_clinical_text
from app.rag.parsers.unified_document import UnifiedDocument

logger = logging.getLogger(__name__)

DEFAULT_CHUNK_SIZE = 600
DEFAULT_CHUNK_OVERLAP = 100


def chunk_pages(
    pages: Sequence[Union[Dict[str, Any], UnifiedDocument]],
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    *,
    chunk_id_prefix: Optional[str] = None,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
    document_id: Optional[UUID] = None,
    source_type: str = "guideline",
) -> List[Dict[str, Any]]:
    """Split a list of page dicts or UnifiedDocument objects into smaller overlapping chunks.

    Parameters
    ----------
    pages : Sequence[dict | UnifiedDocument]
        Items as returned by ``loader.load_pdf`` or ``loader.load_unified_documents``.
    chunk_size : int
        Maximum character length per chunk.
    chunk_overlap : int
        Character overlap between consecutive chunks from the same page.
    chunk_id_prefix : str, optional
        Optional prefix prepended to ``chunk_id`` (e.g. ``str(document_id)``) to
        prevent cross-tenant or cross-document collisions.
    organization_id, patient_id, document_id : UUID, optional
        Optional tenant/patient/document foreign keys attached to each chunk dict.
    source_type : str
        ``"guideline"`` for shared clinical reference guidelines or ``"patient_document"``
        for tenant/patient-scoped documents.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if chunk_overlap < 0 or chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be >= 0 and < chunk_size")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    normalized_pages = normalize_clinical_text(pages)["normalized_pages"]

    chunks: List[Dict[str, Any]] = []
    for page_obj in normalized_pages:
        raw_text = str(page_obj.get("text") or "").strip()
        source = str(page_obj.get("source") or "unknown")
        page_num = int(page_obj.get("page") or 1)
        ocr_applied = bool(page_obj.get("ocr_applied", False))
        ocr_engine = page_obj.get("ocr_engine")

        if not raw_text:
            continue

        splits = splitter.split_text(raw_text)
        for idx, text in enumerate(splits):
            cleaned = text.strip()
            if not cleaned:
                continue
            base_chunk_id = f"{source}::p{page_num}::c{idx}"
            chunk_id = f"{chunk_id_prefix}::{base_chunk_id}" if chunk_id_prefix else base_chunk_id
            chunk_dict: Dict[str, Any] = {
                "chunk_id": chunk_id,
                "source": source,
                "page": page_num,
                "chunk_index": idx,
                "text": cleaned,
                "source_type": source_type,
                "ocr_applied": ocr_applied,
                "ocr_engine": ocr_engine,
            }
            if organization_id is not None:
                chunk_dict["organization_id"] = organization_id
            if patient_id is not None:
                chunk_dict["patient_id"] = patient_id
            if document_id is not None:
                chunk_dict["document_id"] = document_id
            chunks.append(chunk_dict)

    logger.info("Created %d chunks from %d page(s).", len(chunks), len(pages))
    return chunks

