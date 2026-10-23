from fastapi.testclient import TestClient

from app import api
from app.main import app


def test_guest_chat_falls_back_to_verified_local_knowledge(monkeypatch) -> None:
    async def unavailable_provider(*args, **kwargs):
        raise RuntimeError("GEMINI_CALL_FAILED")

    monkeypatch.setattr(api.rag_provider, "answer_general", unavailable_provider)

    response = TestClient(app).post(
        "/api/v1/assistant/guest-chat",
        json={"message": "What services does CareOS provide to patients?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "careos-local-fallback"
    assert "مساعد الذكاء الاصطناعي غير متاح مؤقتًا" in body["answer"]
    assert body["sources"]


def test_guest_chat_fallback_reports_when_knowledge_has_no_match(monkeypatch) -> None:
    async def unavailable_provider(*args, **kwargs):
        raise RuntimeError("GEMINI_CALL_FAILED")

    monkeypatch.setattr(api.rag_provider, "answer_general", unavailable_provider)

    response = TestClient(app).post(
        "/api/v1/assistant/guest-chat",
        json={"message": "xylophonic nebulae"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "careos-local-fallback"
    assert "couldn't find a verified answer" in body["answer"]
    assert body["sources"] == []
