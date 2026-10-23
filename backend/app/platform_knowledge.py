"""Local retrieval for public CareOS platform information."""

import json
import re
from pathlib import Path
from typing import Any


_KNOWLEDGE_PATH = Path(__file__).resolve().parent / "knowledge" / "platform_knowledge.json"
with _KNOWLEDGE_PATH.open(encoding="utf-8") as knowledge_file:
    _KNOWLEDGE_CHUNKS: list[dict[str, Any]] = json.load(knowledge_file)


def _normalize(text: str) -> str:
    text = re.sub(r"[\u064b-\u0652]", "", text)
    text = re.sub(r"[إأآا]", "ا", text)
    text = text.replace("ة", "ه").replace("ى", "ي").replace("ـ", "")
    return text.lower()


def retrieve_platform_knowledge(
    query: str,
    top_k: int = 4,
    include_fallback: bool = True,
) -> list[dict[str, Any]]:
    """Return the most relevant curated platform-information chunks."""
    normalized_query = _normalize(query)
    tokens = set(re.findall(r"[\w-]+", normalized_query))
    scored_chunks: list[tuple[float, dict[str, Any]]] = []

    for chunk in _KNOWLEDGE_CHUNKS:
        title = _normalize(str(chunk.get("title", "")))
        content = _normalize(str(chunk.get("content", "")))
        keywords = [_normalize(str(keyword)) for keyword in chunk.get("keywords", [])]
        score = 15.0 if normalized_query and normalized_query in title else 0.0
        for keyword in keywords:
            if keyword and keyword in normalized_query:
                score += 8.0
            score += sum(3.0 for token in tokens if len(token) > 2 and token in keyword)
        for token in tokens:
            if len(token) > 2:
                score += 4.0 if token in title else 0.0
                score += 1.0 if token in content else 0.0
        if score > 0:
            scored_chunks.append((score, chunk))

    scored_chunks.sort(key=lambda item: item[0], reverse=True)
    if scored_chunks:
        return [chunk for _, chunk in scored_chunks[:top_k]]

    if not include_fallback:
        return []

    defaults = [
        chunk
        for chunk in _KNOWLEDGE_CHUNKS
        if chunk.get("category") in {"overview", "patient_services", "navigation"}
    ]
    return defaults[:top_k]


def platform_knowledge_sources(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": chunk.get("id"),
            "title": chunk.get("title"),
            "category": chunk.get("category"),
            "links": chunk.get("links", {}),
        }
        for chunk in chunks
    ]
