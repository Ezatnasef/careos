import json

from fastapi.testclient import TestClient

from backend import main
from backend.rag_engine import CareOSRAGEngine


def test_retrieve_can_return_no_match_instead_of_default_chunks(tmp_path):
    knowledge_path = tmp_path / "knowledge.json"
    knowledge_path.write_text(
        json.dumps(
            [
                {
                    "id": "overview",
                    "title": "CareOS Overview",
                    "category": "overview",
                    "keywords": ["careos", "overview"],
                    "content": "Verified CareOS platform overview.",
                }
            ]
        ),
        encoding="utf-8",
    )
    engine = CareOSRAGEngine(knowledge_path)

    assert engine.retrieve("xylophonic nebulae", include_fallback=False) == []
    assert engine.retrieve("xylophonic nebulae")


def test_prompt_allows_general_fallback_without_inventing_platform_features():
    engine = CareOSRAGEngine()

    prompt = engine.build_system_prompt(
        "unrelated astronomy question",
        relevant_chunks=[],
    )

    assert "general knowledge" in prompt
    assert "instead of guessing or inventing features" in prompt


def test_chat_uses_llm_fallback_when_retrieval_has_no_match(monkeypatch):
    llm_called = {}

    async def generate_response(**kwargs):
        llm_called.update(kwargs)
        return "General fallback answer"

    monkeypatch.setattr(
        main.rag_engine,
        "retrieve",
        lambda query, top_k=4, include_fallback=True: [],
    )
    monkeypatch.setattr(main.llm_client, "generate_response", generate_response)
    monkeypatch.setattr(main.llm_client, "is_configured", lambda: True)

    with TestClient(main.app) as client:
        response = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "unrelated astronomy question"}]},
        )

    assert response.status_code == 200
    assert response.json()["reply"] == "General fallback answer"
    assert response.json()["sources"] == []
    assert llm_called["knowledge_chunks"] == []


def test_chat_passes_retrieved_knowledge_to_llm(monkeypatch):
    chunk = {
        "id": "careos_overview",
        "title": "CareOS Overview",
        "category": "overview",
        "links": {},
        "content": "Verified platform information.",
    }
    llm_called = {}

    async def generate_response(**kwargs):
        llm_called.update(kwargs)
        return "Grounded answer"

    monkeypatch.setattr(
        main.rag_engine,
        "retrieve",
        lambda query, top_k=4, include_fallback=True: [chunk],
    )
    monkeypatch.setattr(main.llm_client, "generate_response", generate_response)
    monkeypatch.setattr(main.llm_client, "is_configured", lambda: True)

    with TestClient(main.app) as client:
        response = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "What is CareOS?"}]},
        )

    assert response.status_code == 200
    assert response.json()["sources"][0]["id"] == "careos_overview"
    assert llm_called["knowledge_chunks"] == [chunk]
