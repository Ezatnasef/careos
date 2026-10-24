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


def test_guest_chat_keeps_text_reply_when_voicetut_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(api, "_guest_chat_windows", {})

    async def answer_general(message: str) -> dict[str, object]:
        return {"answer": f"Text reply to: {message}", "sources": [], "provider": "test"}

    class FailedVoiceTutProvider:
        name = "voicetut"

        async def synthesize(self, *_args, **_kwargs):
            raise RuntimeError("VoiceTut unavailable")

    monkeypatch.setattr(api.rag_provider, "answer_general", answer_general)
    monkeypatch.setattr(
        api,
        "get_text_to_speech_provider",
        lambda: FailedVoiceTutProvider(),
    )
    monkeypatch.setattr(
        api,
        "get_edge_tts_provider",
        lambda: FailedVoiceTutProvider(),
    )

    response = TestClient(app).post(
        "/api/v1/assistant/guest-chat",
        json={
            "message": "Hello",
            "language": "en-US",
            "synthesize_speech": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "Text reply to: Hello"
    assert response.json()["speech_unavailable"] is True
    assert "audio_base64" not in response.json()


def test_assistant_tts_uses_edge_when_voicetut_fails(monkeypatch) -> None:
    monkeypatch.setattr(api, "_guest_chat_windows", {})

    class FailedVoiceTutProvider:
        name = "voicetut"

        async def synthesize(self, *_args, **_kwargs):
            raise RuntimeError("VoiceTut unavailable")

    class EdgeTTSProvider:
        name = "edge_tts"
        audio_content_type = "audio/mpeg"

        async def synthesize(self, text, *, speaker, language):
            assert text == "Hello"
            assert speaker == "Mohammed"
            assert language == "en-US"
            return b"ID3-edge-audio"

    monkeypatch.setattr(
        api,
        "get_text_to_speech_provider",
        lambda: FailedVoiceTutProvider(),
    )
    monkeypatch.setattr(api, "get_edge_tts_provider", EdgeTTSProvider)

    response = TestClient(app).post(
        "/api/v1/assistant/tts",
        json={"text": "Hello", "language": "en-US"},
    )

    assert response.status_code == 200
    assert response.json()["audio_base64"]
    assert response.json()["audio_content_type"] == "audio/mpeg"
    assert response.json()["voice"] == "EdgeTTS-Mohammed"


def test_assistant_tts_uses_google_for_arabic_after_edge_fails(monkeypatch) -> None:
    monkeypatch.setattr(api, "_guest_chat_windows", {})
    calls: list[str] = []

    class FailedProvider:
        name = "unavailable"

        async def synthesize(self, *_args, **_kwargs):
            calls.append("failed")
            raise RuntimeError("Provider unavailable")

    class GoogleTTSProvider:
        name = "google_tts"
        audio_content_type = "audio/mpeg"

        async def synthesize(self, text, *, speaker, language):
            calls.append("google")
            assert text
            assert speaker == "Mariam"
            assert language == "ar-EG"
            return b"ID3-google-audio"

    monkeypatch.setattr(api, "get_text_to_speech_provider", FailedProvider)
    monkeypatch.setattr(api, "get_edge_tts_provider", FailedProvider)
    monkeypatch.setattr(api, "get_google_arabic_tts_provider", GoogleTTSProvider)

    response = TestClient(app).post(
        "/api/v1/assistant/tts",
        json={"text": "مرحبا", "language": "ar-EG", "voice": "Mariam"},
    )

    assert response.status_code == 200
    assert response.json()["audio_content_type"] == "audio/mpeg"
    assert response.json()["speech_provider"] == "google_tts"
    assert response.json()["voice"] == "GoogleTTS-Arabic"
    assert calls == ["failed", "failed", "google"]


def test_assistant_tts_reports_unavailable_when_both_providers_fail(monkeypatch) -> None:
    monkeypatch.setattr(api, "_guest_chat_windows", {})

    class FailedProvider:
        name = "failed"

        async def synthesize(self, *_args, **_kwargs):
            raise RuntimeError("Provider unavailable")

    monkeypatch.setattr(api, "get_text_to_speech_provider", FailedProvider)
    monkeypatch.setattr(api, "get_edge_tts_provider", FailedProvider)

    response = TestClient(app).post(
        "/api/v1/assistant/tts",
        json={"text": "Hello", "language": "en-US"},
    )

    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"]


def test_assistant_tts_explains_exhausted_zerogpu_quota(monkeypatch) -> None:
    class QuotaLimitedVoiceTutProvider:
        name = "voicetut"

        async def synthesize(self, *_args, **_kwargs):
            raise RuntimeError("VoiceTut ZeroGPU quota exceeded")

    monkeypatch.setattr(
        api,
        "get_text_to_speech_provider",
        lambda: QuotaLimitedVoiceTutProvider(),
    )
    monkeypatch.setattr(
        api,
        "get_edge_tts_provider",
        lambda: QuotaLimitedVoiceTutProvider(),
    )

    response = TestClient(app).post(
        "/api/v1/assistant/tts",
        json={"text": "Hello", "language": "en-US"},
    )

    assert response.status_code == 503
    assert "daily ZeroGPU quota is exhausted" in response.json()["detail"]
