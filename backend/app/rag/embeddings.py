"""Embedding wrapper for CareOS Clinical RAG.

Uses a local SentenceTransformer model (`all-MiniLM-L6-v2`, 384 dimensions)
with lazy singleton initialization and offline cache preference so no external
API key or network call is required when the model is cached locally.
"""

from __future__ import annotations

import logging
import math
from typing import List, Sequence

import numpy as np

from app.config import get_settings

logger = logging.getLogger(__name__)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

_model = None


def validate_embedding_vector(vec: Sequence[float], expected_dim: int = EMBEDDING_DIM) -> List[float]:
    """Validate that ``vec`` is a finite float vector of length ``expected_dim``."""
    if not isinstance(vec, (list, tuple, np.ndarray)):
        raise ValueError(f"Embedding must be a sequence of floats, got {type(vec).__name__}")
    if len(vec) != expected_dim:
        raise ValueError(f"Expected embedding dimension {expected_dim}, got {len(vec)}")
    out: List[float] = []
    for idx, val in enumerate(vec):
        fval = float(val)
        if math.isnan(fval) or math.isinf(fval):
            raise ValueError(f"Embedding contains NaN or Inf at index {idx}")
        out.append(fval)
    return out


def get_embedding_model():
    """Lazy-load the SentenceTransformer model (singleton), preferring the local cache."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        cfg = get_settings()
        configured_model = getattr(cfg, "rag_embedding_model", MODEL_NAME) or MODEL_NAME
        allow_download = bool(getattr(cfg, "rag_allow_model_download", False))
        logger.info("Loading embedding model '%s' ...", configured_model)
        try:
            _model = SentenceTransformer(configured_model, local_files_only=True)
        except Exception as local_err:
            if allow_download:
                logger.info("Local cache miss for '%s'; falling back to standard SentenceTransformer load.", configured_model)
                _model = SentenceTransformer(configured_model)
            else:
                raise RuntimeError(
                    f"Local embedding model '{configured_model}' is not available in the local HuggingFace cache "
                    "and network model downloads are disabled (RAG_ALLOW_MODEL_DOWNLOAD=false). "
                    "On a new machine, set RAG_ALLOW_MODEL_DOWNLOAD=true in .env for the first run or run "
                    "`powershell -ExecutionPolicy Bypass -File scripts/setup.ps1` to pre-cache the model."
                ) from local_err
        logger.info("Embedding model loaded (dim=%d).", EMBEDDING_DIM)
    return _model


def embed_texts(texts: List[str], batch_size: int = 64) -> np.ndarray:
    """Compute L2-normalized embeddings for a list of strings.

    Returns
    -------
    np.ndarray
        Array of shape ``(len(texts), 384)`` with float32 values.
    """
    if not texts:
        return np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    model = get_embedding_model()
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    arr = np.asarray(embeddings, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[1] != EMBEDDING_DIM:
        raise ValueError(f"Model produced unexpected embedding shape {arr.shape}; expected (*, {EMBEDDING_DIM})")
    return arr


def embed_query(query: str) -> List[float]:
    """Compute a single 384-dim normalized embedding vector for a search query."""
    if not query or not query.strip():
        raise ValueError("Query text for embedding must not be empty")
    vec = embed_texts([query.strip()])[0]
    return validate_embedding_vector(vec.tolist(), expected_dim=EMBEDDING_DIM)

