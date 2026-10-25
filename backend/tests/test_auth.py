from uuid import uuid4
import base64
import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import api
from app.main import app
from app.rbac import ROLE_PERMISSIONS, can_access_patient_scope
from app.auth import totp_code


def test_production_ai_requires_configured_provider(monkeypatch) -> None:
    from app.config import get_settings
    from app.integrations import ClinicalSummaryProvider

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "production-test-secret")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://careos:test@localhost/careos")
    monkeypatch.setenv("AI_PROVIDER", "unconfigured")
    get_settings.cache_clear()
    try:
        try:
            asyncio.run(ClinicalSummaryProvider().summarize("clinical note"))
            raise AssertionError("production must not use the sandbox AI provider")
        except RuntimeError as error:
            assert "not configured" in str(error)
    finally:
        get_settings.cache_clear()


def test_clinical_summary_provider_uses_gemini_chat_configuration(monkeypatch) -> None:
    from app import integrations

    settings = SimpleNamespace(
        is_production=False,
        ai_provider="gemini",
        ai_api_key="",
        gemini_api_key="test-gemini-key",
        openai_api_key="",
        llm_api_key="",
        ai_api_url="https://example.invalid/chat/completions",
        ai_model="gemini-test-model",
    )
    calls: list[tuple[str, dict[str, object]]] = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": "Clinician-reviewed draft"}}]}

    class FakeClient:
        def __init__(self, *, timeout: int) -> None:
            assert timeout == 60

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, url: str, **kwargs: object) -> FakeResponse:
            calls.append((url, kwargs))
            return FakeResponse()

    monkeypatch.setattr(integrations, "get_settings", lambda: settings)
    monkeypatch.setattr(integrations.httpx, "AsyncClient", FakeClient)
    result = asyncio.run(integrations.ClinicalSummaryProvider().summarize("Visit transcript"))

    assert result.draft == "Clinician-reviewed draft"
    assert result.provider == "gemini"
    assert calls[0][0] == settings.ai_api_url
    request = calls[0][1]
    assert request["headers"] == {"Authorization": "Bearer test-gemini-key"}
    payload = request["json"]
    assert isinstance(payload, dict)
    messages = payload["messages"]
    assert isinstance(messages, list)
    user_message = messages[1]
    assert isinstance(user_message, dict)
    assert user_message.get("content") == "Visit transcript"


def test_openai_speech_provider_transcribes_arabic_audio(monkeypatch) -> None:
    from app.config import get_settings
    from app.integrations import get_speech_to_text_provider

    monkeypatch.setenv("SPEECH_TO_TEXT_PROVIDER", "openai")
    monkeypatch.setenv("SPEECH_TO_TEXT_API_URL", "")
    monkeypatch.setenv("SPEECH_TO_TEXT_API_KEY", "unit-test-token")
    monkeypatch.setenv("SPEECH_TO_TEXT_MODEL", "gpt-4o-mini-transcribe")
    get_settings.cache_clear()
    requests: list[dict[str, object]] = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, str]:
            return {"text": "تم تفريغ التسجيل"}

    class FakeAsyncClient:
        def __init__(self, *, timeout: int) -> None:
            assert timeout == 120

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args) -> None:
            return None

        async def post(self, url: str, **kwargs):
            requests.append({"url": url, **kwargs})
            return FakeResponse()

    monkeypatch.setattr("app.integrations.httpx.AsyncClient", FakeAsyncClient)
    try:
        provider = get_speech_to_text_provider()
        result = asyncio.run(provider.transcribe(b"fake-webm", language="ar-EG"))
    finally:
        get_settings.cache_clear()

    assert result["text"] == "تم تفريغ التسجيل"
    assert result["provider"] == "openai"
    assert requests[0]["url"] == "https://api.openai.com/v1/audio/transcriptions"
    assert requests[0]["headers"] == {"Authorization": "Bearer unit-test-token"}
    assert requests[0]["data"] == {"model": "gpt-4o-mini-transcribe", "language": "ar"}
    assert requests[0]["files"]["file"] == ("recording.webm", b"fake-webm", "audio/webm")


def test_groq_speech_provider_uses_compatible_transcription_endpoint(monkeypatch) -> None:
    from app.config import get_settings
    from app.integrations import get_speech_to_text_provider

    monkeypatch.setenv("AI_PROVIDER", "groq")
    monkeypatch.setenv("SPEECH_TO_TEXT_PROVIDER", "groq")
    monkeypatch.setenv(
        "SPEECH_TO_TEXT_API_URL",
        "https://api.groq.com/openai/v1/audio/transcriptions",
    )
    monkeypatch.setenv("SPEECH_TO_TEXT_API_KEY", "unit-test-token")
    monkeypatch.setenv("SPEECH_TO_TEXT_MODEL", "whisper-large-v3-turbo")
    get_settings.cache_clear()
    requests: list[dict[str, object]] = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, str]:
            return {"text": "تفريغ تجريبي"}

    class FakeAsyncClient:
        def __init__(self, *, timeout: int) -> None:
            assert timeout == 120

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args) -> None:
            return None

        async def post(self, url: str, **kwargs):
            requests.append({"url": url, **kwargs})
            return FakeResponse()

    monkeypatch.setattr("app.integrations.httpx.AsyncClient", FakeAsyncClient)
    try:
        result = asyncio.run(
            get_speech_to_text_provider().transcribe(b"fake-webm", language="ar-EG")
        )
    finally:
        get_settings.cache_clear()

    assert result == {"text": "تفريغ تجريبي", "confidence": None, "provider": "groq"}
    assert requests[0]["url"] == "https://api.groq.com/openai/v1/audio/transcriptions"
    assert requests[0]["data"] == {
        "model": "whisper-large-v3-turbo",
        "language": "ar",
    }


def test_voicetut_uses_gradio_client_with_configured_token(monkeypatch, tmp_path) -> None:
    from app.config import get_settings
    from app.integrations import get_text_to_speech_provider

    monkeypatch.setenv("TEXT_TO_SPEECH_PROVIDER", "voicetut")
    monkeypatch.setenv("TEXT_TO_SPEECH_API_URL", "https://voice.example")
    monkeypatch.setenv("TEXT_TO_SPEECH_API_KEY", "unit-test-token")
    get_settings.cache_clear()
    audio_path = tmp_path / "voice.wav"
    audio_path.write_bytes(b"RIFFfake-wav")
    client_args: list[dict[str, object]] = []
    prediction_args: list[dict[str, object]] = []

    class FakeClient:
        def __init__(self, src: str, **kwargs: object) -> None:
            client_args.append({"src": src, **kwargs})

        def predict(self, *args: object, **kwargs: object) -> tuple[str, dict[str, object]]:
            prediction_args.append({"args": args, **kwargs})
            return str(audio_path), {}

        def close(self) -> None:
            return None

    monkeypatch.setattr("gradio_client.Client", FakeClient)
    try:
        provider = get_text_to_speech_provider()
        audio = asyncio.run(provider.synthesize("Test", speaker="Mariam", language="en-US"))
    finally:
        get_settings.cache_clear()

    assert audio.startswith(b"RIFF")
    assert provider.audio_content_type == "audio/wav"
    assert client_args == [{
        "src": "https://voice.example",
        "hf_token": "unit-test-token",
        "verbose": False,
        "analytics_enabled": False,
        "httpx_kwargs": {"timeout": 120.0},
    }]
    assert prediction_args == [{
        "args": ("Test", "en", "speaker", "spk_15_female", None, "", 32, 2.0, 1.0, True),
        "api_name": "/synthesize",
    }]


def test_speech_provider_defaults_to_openai_when_ai_provider_is_openai(monkeypatch) -> None:
    from app.config import get_settings
    from app.integrations import OpenAISpeechToTextProvider, get_speech_to_text_provider

    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("SPEECH_TO_TEXT_PROVIDER", "unconfigured")
    get_settings.cache_clear()
    try:
        assert isinstance(get_speech_to_text_provider(), OpenAISpeechToTextProvider)
    finally:
        get_settings.cache_clear()


def test_openai_speech_provider_normalizes_browser_webm_audio(monkeypatch) -> None:
    from app.config import get_settings
    from app.integrations import OpenAISpeechToTextProvider

    monkeypatch.setenv("SPEECH_TO_TEXT_PROVIDER", "openai")
    monkeypatch.setenv("SPEECH_TO_TEXT_API_URL", "")
    monkeypatch.setenv("SPEECH_TO_TEXT_API_KEY", "unit-test-token")
    monkeypatch.setenv("SPEECH_TO_TEXT_MODEL", "whisper-large-v3-turbo")
    get_settings.cache_clear()
    requests: list[dict[str, object]] = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, str]:
            return {"text": "تم التعرف على الصوت"}

    class FakeAsyncClient:
        def __init__(self, *, timeout: int) -> None:
            assert timeout == 120

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args) -> None:
            return None

        async def post(self, url: str, **kwargs):
            requests.append({"url": url, **kwargs})
            return FakeResponse()

    def fake_run(command: list[str], **kwargs: object) -> object:
        assert command[0].endswith("ffmpeg")
        output_path = command[-1]
        with open(output_path, "wb") as fh:
            fh.write(b"converted-wav")
        return object()

    monkeypatch.setattr("app.integrations.httpx.AsyncClient", FakeAsyncClient)
    monkeypatch.setattr("app.integrations.shutil.which", lambda name: "ffmpeg")
    monkeypatch.setattr("app.integrations.subprocess.run", fake_run)
    try:
        provider = OpenAISpeechToTextProvider()
        result = asyncio.run(provider.transcribe(b"\x1aE\xdf\xa3\x9fB\x86\x81\x00webmstub", language="ar-EG"))
    finally:
        get_settings.cache_clear()

    assert result["text"] == "تم التعرف على الصوت"
    assert requests[0]["files"]["file"] == ("recording.wav", b"converted-wav", "audio/wav")
    assert requests[0]["data"] == {"model": "whisper-large-v3-turbo", "language": "ar"}


def test_openai_general_assistant_uses_chat_completions(monkeypatch) -> None:
    from app.config import get_settings
    from app.integrations import RagProvider

    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("AI_API_KEY", "unit-test-token")
    monkeypatch.setenv("AI_API_URL", "")
    monkeypatch.setenv("AI_MODEL", "gpt-test")
    get_settings.cache_clear()
    requests: list[dict[str, object]] = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": "A concise answer"}}]}

    class FakeAsyncClient:
        def __init__(self, *, timeout: int) -> None:
            assert timeout == 60

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args) -> None:
            return None

        async def post(self, url: str, **kwargs):
            requests.append({"url": url, **kwargs})
            return FakeResponse()

    monkeypatch.setattr("app.integrations.httpx.AsyncClient", FakeAsyncClient)
    try:
        result = asyncio.run(RagProvider().answer_general("Hello"))
    finally:
        get_settings.cache_clear()

    assert result["answer"] == "A concise answer"
    assert result["provider"] == "openai"
    assert requests[0]["url"] == "https://api.openai.com/v1/chat/completions"
    assert requests[0]["headers"] == {"Authorization": "Bearer unit-test-token"}
    assert requests[0]["json"]["messages"][1] == {"role": "user", "content": "Hello"}


def test_groq_general_assistant_reuses_speech_key(monkeypatch) -> None:
    from app.config import get_settings
    from app.integrations import RagProvider

    monkeypatch.setenv("AI_PROVIDER", "groq")
    monkeypatch.setenv("AI_API_KEY", "")
    monkeypatch.setenv("AI_API_URL", "")
    monkeypatch.setenv("AI_MODEL", "openai/gpt-oss-20b")
    monkeypatch.setenv("SPEECH_TO_TEXT_API_KEY", "groq-test-token")
    get_settings.cache_clear()
    requests: list[dict[str, object]] = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": "مرحبا"}}]}

    class FakeAsyncClient:
        def __init__(self, *, timeout: int) -> None:
            assert timeout == 60

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args) -> None:
            return None

        async def post(self, url: str, **kwargs):
            requests.append({"url": url, **kwargs})
            return FakeResponse()

    monkeypatch.setattr("app.integrations.httpx.AsyncClient", FakeAsyncClient)
    try:
        result = asyncio.run(RagProvider().answer_general("قل مرحبا"))
    finally:
        get_settings.cache_clear()

    assert result["answer"] == "مرحبا"
    assert result["provider"] == "groq"
    assert result["sources"]
    assert requests[0]["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert requests[0]["headers"] == {"Authorization": "Bearer groq-test-token"}
    assert requests[0]["json"]["model"] == "openai/gpt-oss-20b"


def register_invited_user_with_owner(client: TestClient, role: str) -> tuple[dict, object]:
    owner_email = f"owner-{uuid4().hex[:8]}@example.org"
    member_email = f"member-{role}-{uuid4().hex[:8]}@example.org"
    owner = client.post("/api/v1/auth/register", json={"email": owner_email, "password": "strong-password", "full_name": "Workspace Owner", "organization_name": "Role Care"})
    assert owner.status_code == 201
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}
    invite = client.post("/api/v1/team/invites", headers=owner_headers, json={"email": member_email, "role": role})
    assert invite.status_code == 201
    accepted = client.post("/api/v1/auth/invitations/accept", json={"token": invite.json()["development_token"], "full_name": f"Invited {role}", "password": "strong-password"})
    assert accepted.status_code == 200
    return accepted.json(), owner


class RegisteredUserResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = payload
        self.status_code = 201

    def json(self) -> dict:
        return self._payload


def register_invited_user(client: TestClient, role: str) -> dict:
    invited, _ = register_invited_user_with_owner(client, role)
    return invited


def register_clinician(client: TestClient) -> tuple[RegisteredUserResponse, object]:
    clinician, owner = register_invited_user_with_owner(client, "physician")
    return RegisteredUserResponse(clinician), owner


def test_recording_transcription_is_queued_for_worker() -> None:
    client = TestClient(app)
    register, _ = register_clinician(client)
    assert register.status_code == 201
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    patient = client.post("/api/v1/patients", headers=headers, json={"medical_record_number": f"WRK-{uuid4().hex[:6]}", "given_name": "Worker", "family_name": "Patient", "date_of_birth": "1990-01-01"})
    assert patient.status_code == 201
    encounter = client.post("/api/v1/encounters", headers=headers, json={"patient_id": patient.json()["id"]})
    assert encounter.status_code == 201
    recording = client.post(f"/api/v1/encounters/{encounter.json()['id']}/recordings", headers=headers, json={"filename": "worker.webm", "content_type": "audio/webm", "content": base64.b64encode(b"audio").decode()})
    assert recording.status_code == 201
    queued = client.post(f"/api/v1/recordings/{recording.json()['id']}/transcribe", headers=headers)
    assert queued.status_code == 202
    assert queued.json()["status"] == "QUEUED"


def test_general_assistant_chat_is_available_without_patient_context(monkeypatch) -> None:
    from app import api

    async def answer_general(message: str) -> dict[str, object]:
        return {"answer": f"Sandbox reply: {message}", "sources": [], "provider": "sandbox"}

    monkeypatch.setattr(api.rag_provider, "answer_general", answer_general)
    client = TestClient(app)
    receptionist = register_invited_user(client, "receptionist")
    headers = {"Authorization": f"Bearer {receptionist['access_token']}"}
    response = client.post("/api/v1/assistant/chat", headers=headers, json={"message": "Hello"})

    assert response.status_code == 200
    assert response.json()["provider"] == "sandbox"
    assert "Hello" in response.json()["answer"]
    assert response.json()["sources"] == []


def test_rag_search_returns_service_unavailable_without_embedding_dependency(monkeypatch) -> None:
    import importlib.util

    original_find_spec = importlib.util.find_spec
    monkeypatch.setattr(
        importlib.util,
        "find_spec",
        lambda name, *args, **kwargs: (
            None if name == "sentence_transformers" else original_find_spec(name, *args, **kwargs)
        ),
    )

    client = TestClient(app)
    clinician = register_invited_user(client, "physician")
    headers = {"Authorization": f"Bearer {clinician['access_token']}"}
    response = client.post(
        "/api/v1/rag/search",
        headers=headers,
        json={"query": "hypertension treatment"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Clinical assistant is unavailable because its embedding service is not installed."
    )


def test_guest_assistant_chat_is_available_without_authentication(monkeypatch) -> None:
    from app import api

    async def answer_general(message: str) -> dict[str, object]:
        return {"answer": f"Sandbox reply: {message}", "sources": [], "provider": "sandbox"}

    monkeypatch.setattr(api.rag_provider, "answer_general", answer_general)
    client = TestClient(app)
    response = client.post("/api/v1/assistant/guest-chat", json={"message": "Hello"})

    assert response.status_code == 200
    assert response.json()["provider"] == "sandbox"
    assert "Hello" in response.json()["answer"]
    assert response.json()["sources"] == []


def test_platform_knowledge_retrieval_finds_bilingual_patient_services() -> None:
    from app.platform_knowledge import retrieve_platform_knowledge

    chunks = retrieve_platform_knowledge("خدمات المرضى والمواعيد")

    assert chunks
    assert chunks[0]["id"] == "patient_services_and_portal"


def test_guest_chat_forwards_bounded_conversation_history(monkeypatch) -> None:
    from app import api

    monkeypatch.setattr(api, "_guest_chat_windows", {})
    history = [
        {"role": "user", "content": "What is CareOS?"},
        {"role": "assistant", "content": "A clinical workflow platform."},
    ]

    async def answer_general(
        message: str,
        conversation_history: list[dict[str, str]],
    ) -> dict[str, object]:
        assert message == "What can patients do?"
        assert conversation_history == history
        return {"answer": "Patients can manage appointments.", "sources": [], "provider": "test"}

    monkeypatch.setattr(api.rag_provider, "answer_general", answer_general)
    response = TestClient(app).post(
        "/api/v1/assistant/guest-chat",
        json={"message": "What can patients do?", "conversation_history": history},
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "Patients can manage appointments."


def test_general_assistant_grounds_groq_request_in_platform_knowledge(monkeypatch) -> None:
    from types import SimpleNamespace

    from app import integrations

    captured_request: dict[str, object] = {}
    settings = SimpleNamespace(
        ai_provider="groq",
        ai_api_key="test-token",
        speech_to_text_api_key="",
        ai_api_url="https://example.test/v1/chat/completions",
        ai_model="test-model",
    )
    monkeypatch.setattr(integrations, "get_settings", lambda: settings)

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": "Patients can manage appointments."}}]}

    class FakeAsyncClient:
        def __init__(self, *, timeout: int) -> None:
            assert timeout == 60

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, url: str, *, headers: dict[str, str], json: dict[str, object]) -> FakeResponse:
            captured_request.update(url=url, headers=headers, payload=json)
            return FakeResponse()

    monkeypatch.setattr(integrations.httpx, "AsyncClient", FakeAsyncClient)
    response = asyncio.run(
        integrations.RagProvider().answer_general(
            "What can patients do?",
            conversation_history=[
                {"role": "user", "content": "What is CareOS?"},
                {"role": "assistant", "content": "A clinical workflow platform."},
            ],
        )
    )

    payload = captured_request["payload"]
    assert isinstance(payload, dict)
    messages = payload["messages"]
    assert isinstance(messages, list)
    assert "Patient Portal & Services" in messages[0]["content"]
    assert [message["role"] for message in messages[1:]] == [
        "user",
        "assistant",
        "user",
    ]
    assert response["sources"][0]["id"] == "patient_services_and_portal"


def test_guest_chat_synthesizes_assistant_answer_when_requested(monkeypatch) -> None:
    from app import api

    monkeypatch.setattr(api, "_guest_chat_windows", {})

    async def answer_general(message: str) -> dict[str, object]:
        assert message == "Hello"
        return {"answer": "Hello from CareOS", "sources": [], "provider": "test-ai"}

    class FakeTTSProvider:
        name = "voicetut"

        async def synthesize(self, text: str, *, speaker: str, language: str) -> bytes:
            assert text == "Hello from CareOS"
            assert language == "en-US"
            return b"chat-audio"

    monkeypatch.setattr(api.rag_provider, "answer_general", answer_general)
    monkeypatch.setattr(api, "get_text_to_speech_provider", lambda: FakeTTSProvider())
    response = TestClient(app).post(
        "/api/v1/assistant/guest-chat",
        json={"message": "Hello", "language": "en-US", "synthesize_speech": True},
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "Hello from CareOS"
    assert response.json()["audio_base64"] == base64.b64encode(b"chat-audio").decode()
    assert response.json()["audio_content_type"] == "audio/wav"


def test_guest_assistant_chat_is_rate_limited(monkeypatch) -> None:
    from app import api

    monkeypatch.setattr(api, "_guest_chat_windows", {})

    async def answer_general(message: str) -> dict[str, object]:
        return {"answer": f"Sandbox reply: {message}", "sources": [], "provider": "sandbox"}

    monkeypatch.setattr(api.rag_provider, "answer_general", answer_general)
    client = TestClient(app)
    for _ in range(api._GUEST_CHAT_LIMIT):
        response = client.post("/api/v1/assistant/guest-chat", json={"message": "Hello"})
        assert response.status_code == 200

    limited = client.post("/api/v1/assistant/guest-chat", json={"message": "One too many"})

    assert limited.status_code == 429
    assert limited.headers["retry-after"]


def test_guest_assistant_voice_transcribes_and_answers_without_auth(monkeypatch) -> None:
    from app import api

    monkeypatch.setattr(api, "_guest_chat_windows", {})

    class FakeSpeechProvider:
        async def transcribe(self, audio: bytes, *, language: str) -> dict[str, str]:
            assert audio == b"fake-webm-audio"
            assert language == "ar-EG"
            return {"text": "مرحبا", "provider": "test-speech"}

    async def answer_general(message: str) -> dict[str, object]:
        assert message == "مرحبا"
        return {"answer": "أهلا بك", "sources": [], "provider": "test-ai"}

    class FakeTTSProvider:
        name = "voicetut"

        async def synthesize(self, text: str, *, speaker: str, language: str) -> bytes:
            assert text in {"أهلا بك", "أهلاً بحضرتك يا فندم"}
            assert speaker == "Mohamed"
            assert language == "ar-EG"
            return b"assistant-reply-audio"

    monkeypatch.setattr(api, "get_speech_to_text_provider", FakeSpeechProvider)
    monkeypatch.setattr(api.rag_provider, "answer_general", answer_general)
    monkeypatch.setattr(api, "get_text_to_speech_provider", lambda: FakeTTSProvider())
    client = TestClient(app)
    response = client.post(
        "/api/v1/assistant/guest-voice",
        json={
            "audio_base64": base64.b64encode(b"fake-webm-audio").decode(),
            "content_type": "audio/webm",
            "language": "ar-EG",
        },
    )

    assert response.status_code == 200
    assert response.json()["transcript"] == "مرحبا"
    assert response.json()["answer"] == "أهلا بك"
    assert response.json()["speech_provider"] == "test-speech"
    assert response.json()["audio_base64"] == base64.b64encode(b"assistant-reply-audio").decode()


def test_patient_code_is_generated_and_searchable() -> None:
    client = TestClient(app)
    owner, _ = register_clinician(client)
    assert owner.status_code == 201
    headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}
    patient = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "medical_record_number": f"CODE-{uuid4().hex[:6]}",
            "given_name": "Code",
            "family_name": "Patient",
            "date_of_birth": "1990-01-01",
        },
    )
    assert patient.status_code == 201
    patient_data = patient.json()
    assert patient_data["patient_code"].startswith("CARE-")
    assert len(patient_data["patient_code"]) == 16
    results = client.get(
        f"/api/v1/patients?q={patient_data['patient_code']}",
        headers=headers,
    )
    assert results.status_code == 200
    assert any(item["id"] == patient_data["id"] for item in results.json())
    registered = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "given_name": "New",
            "family_name": "Registration",
            "date_of_birth": "1988-03-12",
            "preferred_name": "Noura",
            "preferred_language": "en",
            "gender": "female",
            "phone": "+201000000000",
            "email": f"patient-{uuid4().hex[:8]}@example.org",
        },
    )
    assert registered.status_code == 201
    registration_data = registered.json()
    assert registration_data["medical_record_number"].startswith("MRN-")
    profile = client.get(
        f"/api/v1/patients/{registration_data['id']}/profile",
        headers=headers,
    )
    assert profile.status_code == 200
    assert profile.json()["phone"] == "+201000000000"
    assert profile.json()["email"].startswith("patient-")
    assert profile.json()["preferred_name"] == "Noura"
    assert profile.json()["preferred_language"] == "en"


def test_legacy_patient_code_has_pretty_code_and_round_trips() -> None:
    from app.api import legacy_patient_code, public_patient_code

    legacy_code = "PAT-000123456789"
    pretty_code = public_patient_code(legacy_code)
    assert pretty_code.startswith("CARE-")
    assert len(pretty_code) == 16
    assert legacy_patient_code(pretty_code) == legacy_code


def test_tts_provider_requires_voicetut(monkeypatch) -> None:
    from app.config import get_settings
    from app.integrations import get_text_to_speech_provider

    monkeypatch.setenv("TEXT_TO_SPEECH_PROVIDER", "gtts")
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="VoiceTut is the only supported"):
            get_text_to_speech_provider()
    finally:
        get_settings.cache_clear()


def test_huggingface_tts_provider_alias_uses_voicetut_backend(monkeypatch) -> None:
    from app.config import get_settings
    from app.integrations import get_text_to_speech_provider

    monkeypatch.setenv("TEXT_TO_SPEECH_PROVIDER", "huggingface")
    monkeypatch.setenv("TEXT_TO_SPEECH_API_URL", "https://tts.example")
    get_settings.cache_clear()
    try:
        provider = get_text_to_speech_provider()
        assert provider.name == "voicetut"
    finally:
        get_settings.cache_clear()


async def test_voice_tut_tts_provider_generates_wav_bytes(monkeypatch, tmp_path) -> None:
    from app.config import get_settings
    from app.integrations import get_text_to_speech_provider

    monkeypatch.setenv("TEXT_TO_SPEECH_PROVIDER", "voicetut")
    monkeypatch.setenv("TEXT_TO_SPEECH_API_URL", "https://tts.example")
    monkeypatch.setenv("TEXT_TO_SPEECH_API_KEY", "hf_test_token")
    get_settings.cache_clear()
    audio_path = tmp_path / "tts.wav"
    audio_path.write_bytes(b"RIFF-test-WAVE")
    client_options: dict[str, object] = {}
    prediction: dict[str, object] = {}

    class FakeClient:
        def __init__(self, src: str, **kwargs: object) -> None:
            client_options.update(src=src, **kwargs)

        def predict(self, *args: object, **kwargs: object) -> tuple[str, dict[str, object]]:
            prediction.update(args=args, **kwargs)
            return str(audio_path), {}

        def close(self) -> None:
            return None

    monkeypatch.setattr("gradio_client.Client", FakeClient)
    try:
        provider = get_text_to_speech_provider()
        result = await provider.synthesize("ازيك عامل ايه النهاردة؟", speaker="Mohamed")
        assert result == b"RIFF-test-WAVE"
        assert provider.name == "voicetut"
        assert client_options["hf_token"] == "hf_test_token"
        assert prediction == {
            "args": ("ازيك عامل ايه النهاردة؟", "arz", "speaker", "spk_06_male", None, "", 32, 2.0, 1.0, True),
            "api_name": "/synthesize",
        }
    finally:
        get_settings.cache_clear()


async def test_voice_tut_tts_provider_raises_when_space_reports_error(monkeypatch) -> None:
    from app.config import get_settings
    from app.integrations import get_text_to_speech_provider

    monkeypatch.setenv("TEXT_TO_SPEECH_PROVIDER", "voicetut")
    monkeypatch.setenv("TEXT_TO_SPEECH_API_URL", "https://tts.example")
    monkeypatch.setenv("TEXT_TO_SPEECH_API_KEY", "hf_test_token")
    get_settings.cache_clear()

    from gradio_client.exceptions import AppError

    class FakeClient:
        def __init__(self, src: str, **kwargs: object) -> None:
            pass

        def predict(self, *args: object, **kwargs: object) -> object:
            raise AppError("You have exceeded your ZeroGPU runs limit.")

        def close(self) -> None:
            return None

    monkeypatch.setattr("gradio_client.Client", FakeClient)
    try:
        provider = get_text_to_speech_provider()
        with pytest.raises(RuntimeError, match="VoiceTut ZeroGPU quota exceeded"):
            await provider.synthesize("السلام عليكم، ده اختبار للصوت.", speaker="Mohamed")
    finally:
        get_settings.cache_clear()


async def test_edge_tts_provider_selects_matching_neural_voice(monkeypatch) -> None:
    from app.integrations import EdgeTTSProvider

    calls: list[tuple[str, str]] = []

    class FakeCommunicate:
        def __init__(self, text: str, voice: str) -> None:
            calls.append((text, voice))

        async def save(self, path: str) -> None:
            Path(path).write_bytes(b"ID3-edge-audio")

    monkeypatch.setattr("edge_tts.Communicate", FakeCommunicate)
    provider = EdgeTTSProvider()

    male_audio = await provider.synthesize("Hello", speaker="Mohammed", language="en-US")
    female_audio = await provider.synthesize("مرحبا", speaker="Mariam", language="ar-EG")

    assert male_audio == b"ID3-edge-audio"
    assert female_audio == b"ID3-edge-audio"
    assert provider.audio_content_type == "audio/mpeg"
    assert calls == [
        ("Hello", "en-US-GuyNeural"),
        ("مرحبا", "ar-EG-SalmaNeural"),
    ]


async def test_google_tts_provider_only_accepts_arabic() -> None:
    from app.integrations import GoogleArabicTTSProvider

    provider = GoogleArabicTTSProvider()
    provider._synthesize_sync = lambda text: b"ID3-google-audio"

    audio = await provider.synthesize("مرحبا", language="ar-EG")

    assert audio == b"ID3-google-audio"
    assert provider.audio_content_type == "audio/mpeg"
    with pytest.raises(ValueError, match="only supports Arabic"):
        await provider.synthesize("Hello", language="en-US")


async def test_guest_voice_keeps_non_wav_audio_mime(monkeypatch) -> None:
    from app import api

    monkeypatch.setattr(api, "_guest_chat_windows", {})

    class FakeSpeechProvider:
        async def transcribe(self, audio: bytes, *, language: str) -> dict[str, str]:
            return {"text": "مرحبا", "provider": "fake-speech"}

    async def answer_general(message: str) -> dict[str, object]:
        assert message == "مرحبا"
        return {"answer": "إجابة المساعد", "sources": [], "provider": "test-ai"}

    class FakeTTSProvider:
        name = "voicetut"
        audio_content_type = "audio/mpeg"

        async def synthesize(self, text: str, *, speaker: str = "Mohamed", language: str = "ar-EG") -> bytes:
            assert text == "إجابة المساعد"
            assert speaker == "Mohamed"
            assert language == "ar-EG"
            return b"fake-mp3-bytes"

    monkeypatch.setattr(api, "get_speech_to_text_provider", lambda: FakeSpeechProvider())
    monkeypatch.setattr(api, "get_text_to_speech_provider", lambda: FakeTTSProvider())
    monkeypatch.setattr(api.rag_provider, "answer_general", answer_general)
    client = TestClient(app)
    response = client.post(
        "/api/v1/assistant/guest-voice",
        json={
            "audio_base64": base64.b64encode(b"fake-webm-audio").decode(),
            "content_type": "audio/webm",
            "language": "ar-EG",
        },
    )

    assert response.status_code == 200
    assert response.json()["audio_content_type"] == "audio/mpeg"
    assert response.json()["audio_base64"] == base64.b64encode(b"fake-mp3-bytes").decode()


def test_guest_voice_returns_audio_when_tts_is_configured(monkeypatch) -> None:
    from app import api

    monkeypatch.setattr(api, "_guest_chat_windows", {})

    class FakeSpeechProvider:
        async def transcribe(self, audio: bytes, *, language: str) -> dict[str, str]:
            return {"text": "مرحبا", "provider": "fake-speech"}

    async def answer_general(message: str) -> dict[str, object]:
        assert message == "مرحبا"
        return {"answer": "إجابة المساعد", "sources": [], "provider": "test-ai"}

    class FakeTTSProvider:
        name = "voicetut"

        async def synthesize(self, text: str, *, speaker: str = "Mohamed", language: str = "ar-EG") -> bytes:
            assert text == "إجابة المساعد"
            assert speaker == "Mohamed"
            assert language == "ar-EG"
            return b"fake-audio-bytes"

    monkeypatch.setattr(api, "get_speech_to_text_provider", lambda: FakeSpeechProvider())
    monkeypatch.setattr(api, "get_text_to_speech_provider", lambda: FakeTTSProvider())
    monkeypatch.setattr(api.rag_provider, "answer_general", answer_general)
    client = TestClient(app)
    response = client.post(
        "/api/v1/assistant/guest-voice",
        json={
            "audio_base64": base64.b64encode(b"fake-webm-audio").decode(),
            "content_type": "audio/webm",
            "language": "ar-EG",
        },
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "إجابة المساعد"
    assert response.json()["audio_base64"] == base64.b64encode(b"fake-audio-bytes").decode()
    assert response.json()["audio_content_type"] == "audio/wav"


def test_approved_note_generates_versioned_pdf_and_audits_download(monkeypatch) -> None:
    client = TestClient(app)
    register, owner = register_clinician(client)
    assert register.status_code == 201
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    patient = client.post("/api/v1/patients", headers=headers, json={"medical_record_number": f"PDF-{uuid4().hex[:6]}", "given_name": "PDF", "family_name": "Patient", "date_of_birth": "1990-01-01"})
    assert patient.status_code == 201
    encounter = client.post("/api/v1/encounters", headers=headers, json={"patient_id": patient.json()["id"]})
    assert encounter.status_code == 201
    note = client.post(
        "/api/v1/clinical-notes",
        headers=headers,
        json={
            "patient_id": patient.json()["id"],
            "encounter_id": encounter.json()["id"],
            "body": "Original encounter transcript",
        },
    )
    assert note.status_code == 201

    async def summarize_transcript(_: str):
        return SimpleNamespace(
            draft="AI-generated patient-facing clinical summary",
            provider="test",
        )

    monkeypatch.setattr(api.summary_provider, "summarize", summarize_transcript)
    generated = client.post(
        f"/api/v1/clinical-notes/{note.json()['id']}/summary",
        headers=headers,
    )
    assert generated.status_code == 200
    assert generated.json()["ai_draft"] == "AI-generated patient-facing clinical summary"
    versions = client.get(f"/api/v1/clinical-notes/{note.json()['id']}/versions", headers=headers)
    assert versions.status_code == 200
    assert versions.json()[0]["version"] == 1
    approved = client.post(f"/api/v1/clinical-notes/{note.json()['id']}/approve", headers=headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "signed"
    assert approved.json()["ai_draft"] == "AI-generated patient-facing clinical summary"
    regenerate = client.post(
        f"/api/v1/clinical-notes/{note.json()['id']}/summary",
        headers=headers,
    )
    assert regenerate.status_code == 409
    document = client.post(f"/api/v1/clinical-notes/{note.json()['id']}/document", headers=headers)
    assert document.status_code == 201
    assert document.json()["review_status"] == "approved"
    downloaded = client.get(f"/api/v1/patients/{patient.json()['id']}/documents/{document.json()['id']}/download", headers=headers)
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"] == "application/pdf"
    portal_email = f"clinical-note-{uuid4().hex[:8]}@example.com"
    portal_registration = client.post(
        "/api/v1/patient-portal/register",
        json={
            "patient_id": str(patient.json()["id"]),
            "email": portal_email,
            "password": "PortalPass123!",
        },
    )
    assert portal_registration.status_code == 201
    portal_login = client.post(
        "/api/v1/patient-portal/login",
        json={"email": portal_email, "password": "PortalPass123!"},
    )
    assert portal_login.status_code == 200
    portal_headers = {"Authorization": f"Bearer {portal_login.json()['access_token']}"}
    portal_overview = client.get(
        "/api/v1/patient-portal/overview",
        headers=portal_headers,
    )
    assert portal_overview.status_code == 200
    assert any(
        item["filename"] == document.json()["filename"]
        for item in portal_overview.json()["documents"]
    )

    uploaded = client.post(
        f"/api/v1/patients/{patient.json()['id']}/documents",
        headers=headers,
        json={
            "filename": "patient-upload.pdf",
            "content": base64.b64encode(b"%PDF-1.4 uploaded document").decode(),
            "content_type": "application/pdf",
        },
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["ocr_status"] == "not_configured"
    assert uploaded.json()["extracted_text"] is None
    uploaded_download = client.get(
        f"/api/v1/patients/{patient.json()['id']}/documents/{uploaded.json()['id']}/download",
        headers=headers,
    )
    assert uploaded_download.status_code == 200
    assert uploaded_download.content == b"%PDF-1.4 uploaded document"

    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}
    audit = client.get("/api/v1/audit-events", headers=owner_headers)
    assert any(event["action"] == "document.downloaded" for event in audit.json())


def test_register_login_and_audit_flow() -> None:
    client = TestClient(app)
    email = f"owner-{uuid4().hex[:8]}@example.org"
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "strong-password",
            "full_name": "Workspace Owner",
            "organization_name": "CityCare",
        },
    )

    assert register.status_code == 201
    token = register.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/me", headers=headers).status_code == 200
    assert client.get("/api/v1/team", headers=headers).status_code == 200
    patients = client.get("/api/v1/patients", headers=headers)
    assert patients.status_code == 403

    login = client.post("/api/v1/auth/login", json={"email": email, "password": "strong-password"})
    assert login.status_code == 200
    assert client.post(
        "/api/v1/team/invites",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
        json={"email": "clinician@example.org", "role": "physician"},
    ).status_code == 201
    audit = client.get("/api/v1/audit-events", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert audit.status_code == 200
    assert any(event["action"] == "team.invited" for event in audit.json())


def test_appointments_reject_conflicts_and_cancelled_reopening() -> None:
    client = TestClient(app)
    register, _ = register_clinician(client)
    assert register.status_code == 201
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    patient = client.post("/api/v1/patients", headers=headers, json={"medical_record_number": f"SCH-{uuid4().hex[:6]}", "given_name": "Hana", "family_name": "Ali", "date_of_birth": "1990-01-01", "gender": "female", "condition": "Review", "care_status": "stable"})
    assert patient.status_code == 201
    starts_at = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0).isoformat()
    payload = {"patient_id": patient.json()["id"], "starts_at": starts_at, "reason": "Follow-up", "status": "confirmed"}
    created = client.post("/api/v1/appointments", headers=headers, json=payload)
    assert created.status_code == 201
    conflict = client.post("/api/v1/appointments", headers=headers, json=payload)
    assert conflict.status_code == 409
    cancelled = client.patch(f"/api/v1/appointments/{created.json()['id']}/status?status=cancelled", headers=headers)
    assert cancelled.status_code == 200
    reopened = client.patch(f"/api/v1/appointments/{created.json()['id']}/status?status=confirmed", headers=headers)
    assert reopened.status_code == 409


def test_admin_role_is_accepted_with_alias_and_normalized_permission_checks() -> None:
    client = TestClient(app)
    email = f"admin-{uuid4().hex[:8]}@example.org"
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "strong-password",
            "full_name": "Admin Alias",
            "organization_name": "CityCare Admin",
            "role": "administrator",
        },
    )

    assert register.status_code == 201
    body = register.json()
    assert body["user"]["role"] == "admin"

    auth_headers = {"Authorization": f"Bearer {body['access_token']}"}
    workspace = client.get("/api/v1/workspace", headers=auth_headers)
    assert workspace.status_code == 200
    assert client.get("/api/v1/audit-events", headers=auth_headers).status_code == 200


def test_login_role_cannot_escalate_an_existing_user() -> None:
    client = TestClient(app)
    email = f"member-doctor-{uuid4().hex[:8]}@example.org"
    accepted = register_invited_user(client, "doctor")
    email = accepted["user"]["email"]
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "strong-password", "role": "administrator"},
    )

    assert login.status_code == 200
    assert login.json()["user"]["role"] == "doctor"


def test_it_admin_has_no_clinical_write_access() -> None:
    client = TestClient(app)
    register = register_invited_user(client, "it_admin")
    headers = {"Authorization": f"Bearer {register['access_token']}"}
    patient = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "medical_record_number": "SEC-001",
            "given_name": "Test",
            "family_name": "Patient",
            "date_of_birth": "1990-01-01",
        },
    )

    assert patient.status_code == 403


def test_password_reset_is_one_time_and_revokes_sessions() -> None:
    client = TestClient(app)
    email = f"reset-{uuid4().hex[:8]}@example.org"
    register = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "strong-password", "full_name": "Reset User", "organization_name": "Reset Care"},
    )
    assert register.status_code == 201
    reset_request = client.post("/api/v1/auth/password-reset/request", json={"email": email})
    assert reset_request.status_code == 200
    reset_token = reset_request.json()["development_token"]
    reset = client.post("/api/v1/auth/password-reset/confirm", json={"token": reset_token, "password": "new-strong-password"})
    assert reset.status_code == 200
    assert client.post("/api/v1/auth/password-reset/confirm", json={"token": reset_token, "password": "another-password"}).status_code == 400
    assert client.post("/api/v1/auth/login", json={"email": email, "password": "new-strong-password"}).status_code == 200


def test_mfa_enrollment_and_login_challenge() -> None:
    client = TestClient(app)
    register = client.post(
        "/api/v1/auth/register",
        json={"email": f"mfa-{uuid4().hex[:8]}@example.org", "password": "strong-password", "full_name": "MFA User", "organization_name": "MFA Care"},
    )
    assert register.status_code == 201
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    enrollment = client.post("/api/v1/auth/mfa/enroll", headers=headers)
    assert enrollment.status_code == 200
    secret = enrollment.json()["secret"]
    verify = client.post("/api/v1/auth/mfa/verify", headers=headers, json={"code": totp_code(secret)})
    assert verify.status_code == 200
    blocked = client.post("/api/v1/auth/login", json={"email": register.json()["user"]["email"], "password": "strong-password"})
    assert blocked.status_code == 401
    allowed = client.post("/api/v1/auth/login", json={"email": register.json()["user"]["email"], "password": "strong-password", "mfa_code": totp_code(secret)})
    assert allowed.status_code == 200


def test_invitation_acceptance_creates_account_in_same_organization() -> None:
    client = TestClient(app)
    owner = client.post(
        "/api/v1/auth/register",
        json={"email": f"invite-owner-{uuid4().hex[:8]}@example.org", "password": "strong-password", "full_name": "Invite Owner", "organization_name": "Invite Care"},
    )
    assert owner.status_code == 201
    headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}
    invite = client.post("/api/v1/team/invites", headers=headers, json={"email": f"invited-{uuid4().hex[:8]}@example.org", "role": "physician"})
    assert invite.status_code == 201
    accepted = client.post("/api/v1/auth/invitations/accept", json={"token": invite.json()["development_token"], "full_name": "Invited Doctor", "password": "strong-password"})
    assert accepted.status_code == 200
    assert accepted.json()["user"]["organization_id"] == owner.json()["user"]["organization_id"]


def test_role_and_permission_management_is_organization_scoped() -> None:
    client = TestClient(app)
    owner = client.post(
        "/api/v1/auth/register",
        json={"email": f"rbac-owner-{uuid4().hex[:8]}@example.org", "password": "strong-password", "full_name": "RBAC Owner", "organization_name": "RBAC Care"},
    )
    assert owner.status_code == 201
    headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}
    roles = client.get("/api/v1/roles", headers=headers)
    permissions = client.get("/api/v1/permissions", headers=headers)
    assert roles.status_code == 200
    assert permissions.status_code == 200
    assert any(item["key"] == "admin" for item in roles.json())
    assert permissions.json()
    created = client.post("/api/v1/roles", headers=headers, json={"key": "auditor", "name": "Auditor"})
    assert created.status_code == 201
    assert created.json()["key"] == "auditor"


def test_encounter_recording_and_transcript_remain_patient_linked(monkeypatch) -> None:
    client = TestClient(app)
    register, _ = register_clinician(client)
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    patient = client.post(
        "/api/v1/patients",
        headers=headers,
        json={"medical_record_number": f"ENC-{uuid4().hex[:6]}", "given_name": "Amal", "family_name": "Hassan", "date_of_birth": "1988-01-01"},
    )
    assert patient.status_code == 201
    encounter = client.post("/api/v1/encounters", headers=headers, json={"patient_id": patient.json()["id"]})
    assert encounter.status_code == 201
    encounter_id = encounter.json()["id"]
    latest_encounter = client.get(
        f"/api/v1/patients/{patient.json()['id']}/encounters/latest",
        headers=headers,
    )
    assert latest_encounter.status_code == 200
    assert latest_encounter.json()["id"] == encounter_id
    note = client.post("/api/v1/clinical-notes", headers=headers, json={"patient_id": patient.json()["id"], "encounter_id": encounter_id, "body": "Encounter-linked draft"})
    assert note.status_code == 201
    assert note.json()["encounter_id"] == encounter_id
    recording = client.post(
        f"/api/v1/encounters/{encounter_id}/recordings",
        headers=headers,
        json={"filename": "consultation.webm", "content_type": "audio/webm;codecs=opus", "content": base64.b64encode(b"audio-bytes").decode()},
    )
    assert recording.status_code == 201
    assert recording.json()["content_type"] == "audio/webm"
    transcript = client.get(f"/api/v1/transcripts/{recording.json()['transcript_id']}", headers=headers)
    assert transcript.status_code == 200
    assert transcript.json()["encounter_id"] == encounter_id
    review = client.patch(f"/api/v1/transcripts/{recording.json()['transcript_id']}/review", headers=headers, json={"transcript_text": "Clinician-reviewed transcript"})
    assert review.status_code == 200
    assert review.json()["version"] == 1
    queued = client.post(f"/api/v1/recordings/{recording.json()['id']}/transcribe", headers=headers)
    assert queued.status_code == 202
    assert queued.json()["status"] == "QUEUED"
    from app.config import get_settings

    monkeypatch.setattr(
        api,
        "get_settings",
        lambda: get_settings().model_copy(update={"max_upload_bytes": 5}),
    )
    oversized = client.post(
        f"/api/v1/encounters/{encounter_id}/recordings",
        headers=headers,
        json={
            "filename": "too-large.webm",
            "content_type": "audio/webm",
            "content": base64.b64encode(b"123456").decode(),
        },
    )
    assert oversized.status_code == 413


def test_patient_and_encounter_are_isolated_between_organizations() -> None:
    client = TestClient(app)
    first, _ = register_clinician(client)
    second, _ = register_clinician(client)
    first_headers = {"Authorization": f"Bearer {first.json()['access_token']}"}
    second_headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
    patient = client.post(
        "/api/v1/patients",
        headers=first_headers,
        json={"medical_record_number": "TENANT-A-1", "given_name": "Private", "family_name": "Patient", "date_of_birth": "1990-01-01"},
    )
    assert patient.status_code == 201
    patient_id = patient.json()["id"]
    assert client.get(f"/api/v1/patients/{patient_id}", headers=second_headers).status_code == 404
    assert client.post("/api/v1/encounters", headers=second_headers, json={"patient_id": patient_id}).status_code == 404


def test_real_patient_scope_policy_for_role_and_organization() -> None:
    assert can_access_patient_scope("doctor", "read", same_organization=True)
    assert can_access_patient_scope("doctor", "notes", same_organization=True)
    assert not can_access_patient_scope("patient", "write", same_organization=True)
    assert not can_access_patient_scope("receptionist", "notes", same_organization=True)
    assert not can_access_patient_scope("doctor", "read", same_organization=False)
    assert not can_access_patient_scope("patient", "read", same_organization=False)


def test_role_permission_matrix_keeps_clinical_and_it_boundaries() -> None:
    assert "clinical_notes.approve" in ROLE_PERMISSIONS["doctor"]
    assert "clinical_notes.approve" not in ROLE_PERMISSIONS["it_admin"]
    assert "patients.view" not in ROLE_PERMISSIONS["it_admin"]
    assert "patients.search" in ROLE_PERMISSIONS["administrative_staff"]
    assert "documents.download" not in ROLE_PERMISSIONS["receptionist"]


def test_all_supported_roles_have_explicit_permission_boundaries() -> None:
    expected = {
        "admin": {"dashboard.read", "users.view", "hospital.settings.manage"},
        "doctor": {"dashboard.read", "patients.view", "encounters.create", "clinical_notes.approve"},
        "nurse": {"dashboard.read", "patients.view", "encounters.view", "clinical_notes.create"},
        "receptionist": {"dashboard.read", "patients.view", "appointments.view", "appointments.create"},
        "hospital_director": {"dashboard.read", "users.view", "analytics.view", "audit_logs.view"},
        "it_admin": {"dashboard.read", "users.view", "sso.manage", "audit_logs.view"},
        "administrative_staff": {"dashboard.read", "patients.search", "patients.view", "patients.demographics.view", "checkin.create"},
    }
    for role, permissions in expected.items():
        assert permissions.issubset(ROLE_PERMISSIONS[role])
    assert not ROLE_PERMISSIONS["admin"].intersection({"patients.view", "patient.read", "clinical_notes.create", "appointments.view"})
    assert not ROLE_PERMISSIONS["hospital_director"].intersection({"patients.view", "patient.read"})
    assert not ROLE_PERMISSIONS["it_admin"].intersection({"patients.view", "clinical_notes.create", "clinical_notes.approve", "recordings.view"})
    assert "clinical_notes.approve" not in ROLE_PERMISSIONS["nurse"]


def test_settings_and_director_patient_permissions_match_route_policy() -> None:
    client = TestClient(app)
    owner = client.post(
        "/api/v1/auth/register",
        json={"email": f"policy-owner-{uuid4().hex[:8]}@example.org", "password": "strong-password", "full_name": "Policy Owner", "organization_name": "Policy Care"},
    )
    assert owner.status_code == 201
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}

    director_invite = client.post("/api/v1/team/invites", headers=owner_headers, json={"email": f"director-{uuid4().hex[:8]}@example.org", "role": "hospital_director"})
    assert director_invite.status_code == 201
    director = client.post("/api/v1/auth/invitations/accept", json={"token": director_invite.json()["development_token"], "full_name": "Policy Director", "password": "strong-password"})
    assert director.status_code == 200
    director_headers = {"Authorization": f"Bearer {director.json()['access_token']}"}
    assert client.get("/api/v1/patients", headers=director_headers).status_code == 403
    assert client.get("/api/v1/organization", headers=director_headers).status_code == 200

    doctor_invite = client.post("/api/v1/team/invites", headers=owner_headers, json={"email": f"doctor-{uuid4().hex[:8]}@example.org", "role": "doctor"})
    assert doctor_invite.status_code == 201
    doctor = client.post("/api/v1/auth/invitations/accept", json={"token": doctor_invite.json()["development_token"], "full_name": "Policy Doctor", "password": "strong-password"})
    assert doctor.status_code == 200
    doctor_headers = {"Authorization": f"Bearer {doctor.json()['access_token']}"}
    assert client.get("/api/v1/organization", headers=doctor_headers).status_code == 403


def test_department_and_project_scope_must_match() -> None:
    assert can_access_patient_scope("doctor", "read", same_organization=True, same_department=True, same_project=True)
    assert not can_access_patient_scope("doctor", "read", same_organization=True, same_department=False, same_project=True)
    assert not can_access_patient_scope("doctor", "read", same_organization=True, same_department=True, same_project=False)


def test_patient_scope_matches_department_and_project() -> None:
    from types import SimpleNamespace

    from app.api import patient_scope_matches

    user = SimpleNamespace(department="Cardiology", project="Heart Clinic")
    same = SimpleNamespace(department="Cardiology", project="Heart Clinic")
    bad_department = SimpleNamespace(department="Neurology", project="Heart Clinic")
    bad_project = SimpleNamespace(department="Cardiology", project="ICU")

    assert patient_scope_matches(user, same) is True
    assert patient_scope_matches(user, bad_department) is False
    assert patient_scope_matches(user, bad_project) is False


def test_hospital_sso_start_and_callback_flow() -> None:
    client = TestClient(app)
    start = client.post(
        "/api/v1/auth/sso/start",
        json={"provider": "hospital_sso", "email": "dr.rana@citycare.org"},
    )

    assert start.status_code == 200
    body = start.json()
    assert "redirect_url" in body
    assert body["state"]
    assert body["nonce"]

    callback = client.post(
        "/api/v1/auth/sso/callback",
        json={"provider": "hospital_sso", "code": "demo-sso-code", "state": body["state"]},
    )

    assert callback.status_code == 401
    assert "External identity verification failed" in callback.json()["detail"]


def test_hospital_sso_start_respects_redirect_uri() -> None:
    client = TestClient(app)
    redirect_uri = "https://app.careos.example.com/auth/callback"
    start = client.post(
        "/api/v1/auth/sso/start",
        json={"provider": "hospital_sso", "email": "dr.rana@citycare.org", "redirect_uri": redirect_uri},
    )

    assert start.status_code == 200
    assert redirect_uri in start.json()["redirect_url"]


def test_unknown_credentials_are_rejected_without_development_seed() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "dr.rana@citycare.org", "password": "password123"},
    )

    assert response.status_code == 401


def test_production_demo_login_is_flagged_and_returns_a_valid_scoped_token(monkeypatch) -> None:
    client = TestClient(app)
    monkeypatch.setattr(
        api,
        "get_settings",
        lambda: SimpleNamespace(is_production=True, demo_login_enabled=False),
    )
    credentials = {"role": "doctor", "username": "doctor.demo", "password": "Doctor@123"}
    disabled = client.post("/api/v1/auth/demo-login", json=credentials)
    assert disabled.status_code == 404

    monkeypatch.setattr(
        api,
        "get_settings",
        lambda: SimpleNamespace(is_production=True, demo_login_enabled=True),
    )
    enabled = client.post("/api/v1/auth/demo-login", json=credentials)
    assert enabled.status_code == 200
    body = enabled.json()
    assert body["user"]["role"] == "doctor"
    assert "patients.create" in body["user"]["permissions"]
    assert "documents.create" in body["user"]["permissions"]
    assert "users.delete" not in body["user"]["permissions"]
    assert client.get(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    ).status_code == 200


def test_messages_portal_and_analytics_endpoints_are_real_and_scoped() -> None:
    client = TestClient(app)
    register, owner = register_clinician(client)
    assert register.status_code == 201
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}

    patient = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "medical_record_number": "OPS-101",
            "given_name": "Sara",
            "family_name": "Ali",
            "department": "Cardiology",
            "project": "Heart Clinic",
            "date_of_birth": "1988-02-29",
            "gender": "female",
            "condition": "Heart failure follow-up",
            "care_status": "follow_up_due",
        },
    )
    assert patient.status_code == 201
    patient_id = patient.json()["id"]

    message = client.post(
        "/api/v1/messages",
        headers=headers,
        json={
            "patient_id": patient_id,
            "subject": "Medication check-in",
            "body": "Please confirm the updated daily blood pressure schedule.",
            "sender_type": "care_team",
            "direction": "outbound",
        },
    )
    assert message.status_code == 201
    assert message.json()["subject"] == "Medication check-in"
    assert message.json()["sender_name"] == register.json()["user"]["full_name"]
    assert message.json()["recipient_name"] == "Sara Ali"

    portal = client.get(f"/api/v1/portal/patients/{patient_id}", headers=headers)
    assert portal.status_code == 200
    assert portal.json()["patient"]["medical_record_number"] == "OPS-101"
    assert len(portal.json()["messages"]) >= 1

    portal_account = client.post(
        "/api/v1/patient-portal/register",
        json={
            "patient_id": patient_id,
            "email": "sara.portal@example.org",
            "password": "strong-password",
            "full_name": "Sara Ali",
        },
    )
    assert portal_account.status_code == 201, portal_account.text
    portal_login = client.post(
        "/api/v1/patient-portal/login",
        json={"email": "sara.portal@example.org", "password": "strong-password"},
    )
    assert portal_login.status_code == 200, portal_login.text
    portal_headers = {
        "Authorization": f"Bearer {portal_login.json()['access_token']}"
    }
    inbound_message = client.post(
        "/api/v1/patient-portal/messages",
        headers=portal_headers,
        json={"subject": "Question", "body": "When is my appointment?"},
    )
    assert inbound_message.status_code == 201, inbound_message.text
    assert inbound_message.json()["sender_name"] == "Sara Ali"
    assert inbound_message.json()["recipient_name"] == "Care team"
    notifications = client.get("/api/v1/notifications", headers=headers)
    assert notifications.status_code == 200, notifications.text
    assert any(
        item["kind"] == "patient_message"
        for item in notifications.json()
    )

    inbound_portal_message = next(
        item
        for item in client.get(
            "/api/v1/patient-portal/overview",
            headers=portal_headers,
        ).json()["messages"]
        if item["id"] == inbound_message.json()["id"]
    )
    assert inbound_portal_message["sender_name"] == "Sara Ali"
    assert inbound_portal_message["recipient_name"] == "Care team"

    inbox = client.get("/api/v1/messages", headers=headers)
    assert inbox.status_code == 200, inbox.text
    inbound_inbox_message = next(
        item for item in inbox.json() if item["id"] == inbound_message.json()["id"]
    )
    assert inbound_inbox_message["sender_name"] == "Sara Ali"
    assert inbound_inbox_message["patient_name"] == "Sara Ali"
    assert inbound_inbox_message["recipient_name"] == "Care team"

    portal_overview = client.get(
        "/api/v1/patient-portal/overview",
        headers=portal_headers,
    )
    assert portal_overview.status_code == 200, portal_overview.text
    outbound_portal_message = next(
        item
        for item in portal_overview.json()["messages"]
        if item["id"] == message.json()["id"]
    )
    assert outbound_portal_message["sender_name"] == register.json()["user"]["full_name"]
    assert outbound_portal_message["recipient_name"] == "Sara Ali"

    staff_reply = client.post(
        "/api/v1/messages",
        headers=headers,
        json={
            "patient_id": patient_id,
            "subject": inbound_message.json()["subject"],
            "body": "We will confirm your appointment shortly.",
        },
    )
    assert staff_reply.status_code == 201, staff_reply.text
    refreshed_portal_messages = client.get(
        "/api/v1/patient-portal/overview",
        headers=portal_headers,
    )
    assert refreshed_portal_messages.status_code == 200, refreshed_portal_messages.text
    assert any(
        item["id"] == staff_reply.json()["id"]
        and item["body"] == "We will confirm your appointment shortly."
        and item["direction"] == "outbound"
        for item in refreshed_portal_messages.json()["messages"]
    )
    patient_delete = client.delete(
        f"/api/v1/patient-portal/messages/{inbound_message.json()['id']}",
        headers=portal_headers,
    )
    assert patient_delete.status_code == 200, patient_delete.text
    assert patient_delete.json()["deleted"] is True
    assert client.delete(
        f"/api/v1/patient-portal/messages/{staff_reply.json()['id']}",
        headers=portal_headers,
    ).status_code == 404
    remaining_portal_messages = client.get(
        "/api/v1/patient-portal/overview",
        headers=portal_headers,
    ).json()["messages"]
    assert all(item["id"] != inbound_message.json()["id"] for item in remaining_portal_messages)
    assert any(item["id"] == staff_reply.json()["id"] for item in remaining_portal_messages)

    second_patient = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "medical_record_number": "OPS-102",
            "given_name": "Lina",
            "family_name": "Nabil",
            "date_of_birth": "1990-06-15",
            "gender": "female",
        },
    )
    assert second_patient.status_code == 201
    second_portal_account = client.post(
        "/api/v1/patient-portal/register",
        json={
            "patient_id": second_patient.json()["id"],
            "email": "lina.portal@example.org",
            "password": "strong-password",
            "full_name": "Lina Nabil",
        },
    )
    assert second_portal_account.status_code == 201, second_portal_account.text
    second_portal_login = client.post(
        "/api/v1/patient-portal/login",
        json={
            "email": "lina.portal@example.org",
            "password": "strong-password",
        },
    )
    assert second_portal_login.status_code == 200, second_portal_login.text
    second_portal_token = second_portal_login.json()["access_token"]
    second_portal_headers = {
        "Authorization": f"Bearer {second_portal_token}"
    }
    second_portal_messages = client.get(
        "/api/v1/patient-portal/overview",
        headers=second_portal_headers,
    )
    assert second_portal_messages.status_code == 200, second_portal_messages.text
    assert all(
        item["id"] != message.json()["id"]
        for item in second_portal_messages.json()["messages"]
    )

    delete_message = client.delete(f"/api/v1/messages/{message.json()['id']}", headers=headers)
    assert delete_message.status_code == 200, delete_message.text
    assert delete_message.json()["deleted"] is True
    assert delete_message.json()["deleted_at"]
    assert all(
        item["id"] != message.json()["id"]
        for item in client.get("/api/v1/messages", headers=headers).json()
    )
    assert all(
        item["id"] != message.json()["id"]
        for item in client.get(
            "/api/v1/patient-portal/overview",
            headers=portal_headers,
        ).json()["messages"]
    )
    assert client.delete(
        f"/api/v1/messages/{message.json()['id']}",
        headers=headers,
    ).status_code == 404

    delete_thread = client.delete(
        f"/api/v1/messages/patient/{patient_id}",
        headers=headers,
    )
    assert delete_thread.status_code == 200, delete_thread.text
    assert delete_thread.json()["deleted_count"] == 1
    assert all(
        item["patient_id"] != patient_id
        for item in client.get("/api/v1/messages", headers=headers).json()
    )
    assert client.get(
        "/api/v1/patient-portal/overview",
        headers=portal_headers,
    ).json()["messages"] == []

    analytics = client.get("/api/v1/analytics", headers=headers)
    assert analytics.status_code == 200
    payload = analytics.json()
    assert "overview" in payload
    assert payload["overview"]["patients"] >= 1

    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}
    reports = client.get("/api/v1/reports", headers=owner_headers)
    assert reports.status_code == 200
    assert isinstance(reports.json(), list)
    assert len(reports.json()) >= 1


def test_tasks_care_plans_and_department_metrics_are_real_and_scoped() -> None:
    client = TestClient(app)
    register, _ = register_clinician(client)
    assert register.status_code == 201
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}

    patient = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "medical_record_number": "TASK-201",
            "given_name": "Layla",
            "family_name": "Hassan",
            "department": "Cardiology",
            "project": "Heart Clinic",
            "date_of_birth": "1990-04-13",
            "gender": "female",
            "condition": "Heart failure follow-up",
            "care_status": "follow_up_due",
        },
    )
    assert patient.status_code == 201
    patient_id = patient.json()["id"]

    care_plan = client.post(
        "/api/v1/care-plans",
        headers=headers,
        json={
            "patient_id": patient_id,
            "title": "Cardiac rehab and monitoring",
            "summary": "Monitor blood pressure and med adherence.",
            "status": "active",
            "goals": ["Track blood pressure", "Review medication adherence"],
        },
    )
    assert care_plan.status_code == 201
    assert care_plan.json()["title"] == "Cardiac rehab and monitoring"

    task = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "patient_id": patient_id,
            "title": "Check home BP readings",
            "description": "Review last 7 days of home blood pressure log.",
            "assignee": "Dr. Rana Samir",
            "priority": "high",
            "status": "pending",
            "due_at": "2026-09-20T09:00:00Z",
        },
    )
    assert task.status_code == 201
    assert task.json()["title"] == "Check home BP readings"

    tasks = client.get("/api/v1/tasks", headers=headers)
    assert tasks.status_code == 200
    assert len(tasks.json()) >= 1

    plans = client.get("/api/v1/care-plans", headers=headers)
    assert plans.status_code == 200
    assert len(plans.json()) >= 1

    metrics = client.get("/api/v1/department-metrics", headers=headers)
    assert metrics.status_code == 200
    payload = metrics.json()
    assert "departments" in payload
    assert any(item["department"] == "Cardiology" for item in payload["departments"])


def test_patient_portal_auth_and_storage_contract_are_secure() -> None:
    client = TestClient(app)
    register, _ = register_clinician(client)
    assert register.status_code == 201
    staff_headers = {"Authorization": f"Bearer {register.json()['access_token']}"}

    patient = client.post(
        "/api/v1/patients",
        headers=staff_headers,
        json={
            "medical_record_number": f"PORTAL-{uuid4().hex[:6].upper()}",
            "given_name": "Nadia",
            "family_name": "Youssef",
            "department": "General Medicine",
            "project": "Outpatient",
            "date_of_birth": "1992-09-13",
            "gender": "female",
            "condition": "Follow-up review",
            "care_status": "stable",
        },
    )
    assert patient.status_code == 201
    patient_id = patient.json()["id"]
    portal_email = f"nadia-{uuid4().hex[:8]}@example.com"

    portal_account = client.post(
        "/api/v1/patient-portal/register",
        json={
            "patient_id": str(patient_id),
            "email": portal_email,
            "password": "PortalPass123!",
        },
    )
    assert portal_account.status_code == 201
    portal_token = client.post(
        "/api/v1/patient-portal/login",
        json={"email": portal_email, "password": "PortalPass123!"},
    )
    assert portal_token.status_code == 200
    portal_headers = {"Authorization": f"Bearer {portal_token.json()['access_token']}"}
    me = client.get("/api/v1/patient-portal/me", headers=portal_headers)
    assert me.status_code == 200
    assert me.json()["patient_id"] == str(patient_id)

    appointment_starts_at = datetime.now(timezone.utc) + timedelta(days=3)
    appointment = client.post(
        "/api/v1/appointments",
        headers=staff_headers,
        json={
            "patient_id": str(patient_id),
            "clinician_id": register.json()["user"]["id"],
            "starts_at": appointment_starts_at.isoformat(),
            "reason": "Follow-up consultation",
            "status": "confirmed",
        },
    )
    assert appointment.status_code == 201, appointment.text

    overview = client.get("/api/v1/patient-portal/overview", headers=portal_headers)
    assert overview.status_code == 200
    assert overview.json()["patient"]["id"] == str(patient_id)
    assert overview.json()["documents"] == []
    assert overview.json()["appointments"] == [
        {
            **appointment.json(),
            "clinician_name": register.json()["user"]["full_name"],
        }
    ]

    message = client.post(
        "/api/v1/patient-portal/messages",
        headers=portal_headers,
        json={"subject": "Question about follow-up", "body": "Please confirm the next visit."},
    )
    assert message.status_code == 201
    assert message.json()["patient_id"] == str(patient_id)

    storage = client.post(
        "/api/v1/patient-portal/documents",
        headers=portal_headers,
        json={"filename": "lab_report.pdf", "content": "Zm9v", "content_type": "application/pdf"},
    )
    assert storage.status_code == 201
    body = storage.json()
    assert body["storage_key"]
    assert body["download_url"]


def test_patient_portal_can_book_cancel_and_share_appointments_with_clinic() -> None:
    client = TestClient(app)
    clinician, _ = register_clinician(client)
    staff_headers = {"Authorization": f"Bearer {clinician.json()['access_token']}"}
    clinician_id = clinician.json()["user"]["id"]

    patient = client.post(
        "/api/v1/patients",
        headers=staff_headers,
        json={
            "medical_record_number": f"BOOK-{uuid4().hex[:6].upper()}",
            "given_name": "Salma",
            "family_name": "Khaled",
            "date_of_birth": "1990-02-12",
        },
    )
    assert patient.status_code == 201, patient.text
    patient_id = patient.json()["id"]

    portal_email = f"salma-{uuid4().hex[:8]}@example.com"
    registered_portal = client.post(
        "/api/v1/patient-portal/register",
        json={
            "patient_id": patient_id,
            "email": portal_email,
            "password": "PortalPass123!",
        },
    )
    assert registered_portal.status_code == 201, registered_portal.text
    portal_login = client.post(
        "/api/v1/patient-portal/login",
        json={"email": portal_email, "password": "PortalPass123!"},
    )
    assert portal_login.status_code == 200, portal_login.text
    portal_headers = {
        "Authorization": f"Bearer {portal_login.json()['access_token']}"
    }

    appointment_date = (datetime.now(timezone.utc) + timedelta(days=7)).date()
    schedule = client.post(
        f"/api/v1/clinicians/{clinician_id}/schedules",
        headers=staff_headers,
        json={
            "day_of_week": appointment_date.weekday(),
            "start_time": "09:00",
            "end_time": "10:00",
            "slot_duration_minutes": 30,
        },
    )
    assert schedule.status_code == 201, schedule.text

    directory = client.get(
        "/api/v1/patient-portal/clinicians",
        headers=portal_headers,
    )
    assert directory.status_code == 200, directory.text
    assert directory.json()["timezone"] == "UTC"
    assert any(
        item["id"] == clinician_id for item in directory.json()["clinicians"]
    )

    availability = client.get(
        f"/api/v1/patient-portal/clinicians/{clinician_id}/availability",
        headers=portal_headers,
        params={
            "from_date": appointment_date.isoformat(),
            "to_date": appointment_date.isoformat(),
        },
    )
    assert availability.status_code == 200, availability.text
    slot = next(
        item for item in availability.json() if item["start_time"] == "09:00"
    )

    booking = client.post(
        "/api/v1/patient-portal/appointments",
        headers=portal_headers,
        json={
            "clinician_id": clinician_id,
            "starts_at": slot["starts_at"],
            "reason": "Follow-up consultation",
        },
    )
    assert booking.status_code == 201, booking.text
    assert booking.json()["status"] == "pending"
    assert booking.json()["clinician_name"] == clinician.json()["user"]["full_name"]

    clinic_appointments = client.get(
        "/api/v1/appointments",
        headers=staff_headers,
    )
    assert clinic_appointments.status_code == 200, clinic_appointments.text
    assert any(
        item["id"] == booking.json()["id"]
        and item["patient_id"] == patient_id
        for item in clinic_appointments.json()
    )

    cancelled = client.post(
        f"/api/v1/patient-portal/appointments/{booking.json()['id']}/cancel",
        headers=portal_headers,
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert client.get(
        "/api/v1/patient-portal/overview",
        headers=portal_headers,
    ).json()["appointments"][0]["status"] == "cancelled"


def test_email_verification_and_retention_cleanup_are_supported() -> None:
    client = TestClient(app)
    email = f"verify-{uuid4().hex[:8]}@example.org"
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "strong-password",
            "full_name": "Verification User",
            "organization_name": "VerifyCare",
        },
    )
    assert register.status_code == 201
    token = register.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/v1/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email_verified"] is False

    verify = client.post("/api/v1/auth/verify-email", headers=headers, json={"email": email})
    assert verify.status_code == 200
    assert verify.json()["email_verified"] is True

    audit_cleanup = client.post("/api/v1/system/audit/cleanup", headers=headers)
    assert audit_cleanup.status_code == 200
    assert "deleted" in audit_cleanup.json()


def test_s3_storage_backend_uses_object_storage(monkeypatch) -> None:
    from app.config import get_settings
    from app.storage import StorageService

    get_settings.cache_clear()
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_BUCKET", "careos-prod-docs")
    monkeypatch.setenv("S3_REGION", "eu-west-1")
    monkeypatch.setenv("APP_URL", "https://careos.example.com")
    monkeypatch.setenv("STORAGE_PREFIX", "careos")

    calls = {}

    class FakeS3Client:
        def put_object(self, **kwargs):
            calls["bucket"] = kwargs["Bucket"]
            calls["key"] = kwargs["Key"]
            calls["content_type"] = kwargs["ContentType"]
            calls["body_len"] = len(kwargs["Body"])

    fake_boto3 = type("FakeBoto3", (), {"client": staticmethod(lambda *args, **kwargs: FakeS3Client())})
    monkeypatch.setitem(__import__("sys").modules, "boto3", fake_boto3)

    service = StorageService()
    key, url = service.save_document(
        organization_id="a0f2c9be-1111-4da0-9db4-8a7f2a396aaf",
        patient_id="762bce2a-2222-4d37-b45d-f4d93fc6b7aa",
        filename="lab_report.pdf",
        content=b"hello-doc",
        content_type="application/pdf",
    )

    assert key.startswith("careos/")
    assert calls["bucket"] == "careos-prod-docs"
    assert calls["content_type"] == "application/pdf"
    assert url.startswith("https://careos-prod-docs.s3.eu-west-1.amazonaws.com/")


def test_storage_service_rejects_path_traversal_and_missing_bucket_settings(monkeypatch) -> None:
    from app.config import get_settings
    from app.storage import StorageService

    get_settings.cache_clear()
    monkeypatch.setenv("APP_URL", "https://careos.example.com")
    monkeypatch.setenv("STORAGE_BACKEND", "filesystem")

    service = StorageService()
    try:
        service.save_document(
            organization_id="a0f2c9be-1111-4da0-9db4-8a7f2a396aaf",
            patient_id="762bce2a-2222-4d37-b45d-f4d93fc6b7aa",
            filename="../../etc/passwd",
            content=b"hello-doc",
            content_type="application/pdf",
        )
        raise AssertionError("unsafe filename should have been rejected")
    except ValueError as exc:
        assert "unsafe" in str(exc).lower()

    get_settings.cache_clear()
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_BUCKET", "")
    monkeypatch.setenv("S3_REGION", "eu-west-1")

    try:
        StorageService().save_document(
            organization_id="a0f2c9be-1111-4da0-9db4-8a7f2a396aaf",
            patient_id="762bce2a-2222-4d37-b45d-f4d93fc6b7aa",
            filename="lab_report.pdf",
            content=b"hello-doc",
            content_type="application/pdf",
        )
        raise AssertionError("missing S3 bucket should have been rejected")
    except ValueError as exc:
        assert "bucket" in str(exc).lower()


def test_sso_redirect_rejects_unsafe_callback_hosts(monkeypatch) -> None:
    from app.config import get_settings
    from app.sso import HospitalSSOAdapter

    get_settings.cache_clear()
    monkeypatch.setenv("APP_URL", "https://careos.example.com")
    monkeypatch.setenv("OIDC_ISSUER_URL", "https://issuer.example.com")
    monkeypatch.setenv("SSO_ALLOWED_REDIRECT_HOSTS", "careos.example.com,localhost")

    adapter = HospitalSSOAdapter()
    try:
        adapter.build_redirect_url(state="state-123", nonce="nonce-9", redirect_uri="https://evil.example.com/callback")
        raise AssertionError("unsafe redirect host should have been rejected")
    except ValueError as exc:
        assert "redirect" in str(exc).lower() and "host" in str(exc).lower()


def test_portal_tokens_are_rejected_when_org_or_patient_claims_do_not_match(monkeypatch) -> None:
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    from app.config import get_settings
    from app.main import app
    from app.models import PatientPortalAccount

    get_settings.cache_clear()
    monkeypatch.setenv("SECRET_KEY", "unit-test-secret-key-123456")
    get_settings.cache_clear()

    client = TestClient(app)
    org_admin, _ = register_clinician(client)
    assert org_admin.status_code == 201
    staff_headers = {"Authorization": f"Bearer {org_admin.json()['access_token']}"}

    patient = client.post(
        "/api/v1/patients",
        headers=staff_headers,
        json={
            "medical_record_number": "TENANT-001",
            "given_name": "Mina",
            "family_name": "Saleh",
            "department": "General Medicine",
            "project": "Outpatient",
            "date_of_birth": "1980-09-09",
            "gender": "female",
            "condition": "Follow-up",
            "care_status": "stable",
        },
    )
    patient_id = patient.json()["id"]

    portal = client.post(
        "/api/v1/patient-portal/register",
        json={
            "patient_id": str(patient_id),
            "email": f"mina-{uuid4().hex[:8]}@example.com",
            "password": "PortalPass123!",
        },
    )
    assert portal.status_code == 201
    account_id = portal.json()["id"]

    wrong_claims = {
        "sub": str(account_id),
        "patient_id": "00000000-0000-0000-0000-000000000000",
        "organization_id": "00000000-0000-0000-0000-000000000001",
        "role": "patient",
        "jti": "bad-token",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
    }
    token = jwt.encode(wrong_claims, "unit-test-secret-key-123456", algorithm="HS256")
    response = client.get("/api/v1/patient-portal/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_oidc_adapter_reuses_discovery_and_userinfo_when_provider_is_configured(monkeypatch) -> None:
    import base64
    import json
    from jose import jwt

    from app.config import get_settings
    from app.sso import HospitalSSOAdapter

    get_settings.cache_clear()
    monkeypatch.setenv("OIDC_ISSUER_URL", "https://issuer.example.com")
    monkeypatch.setenv("OIDC_CLIENT_ID", "careos-client")
    monkeypatch.setenv("OIDC_CLIENT_SECRET", "careos-secret")
    monkeypatch.setenv("APP_URL", "https://careos.example.com")

    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def json(self):
            return self.payload

        def raise_for_status(self):
            return None

    state = jwt.encode({"nonce": "test-nonce", "exp": datetime.now(timezone.utc) + timedelta(minutes=10)}, get_settings().secret_key, algorithm=get_settings().jwt_algorithm)
    id_payload = base64.urlsafe_b64encode(json.dumps({"email": "dr.rana@citycare.org", "name": "Dr. Rana Samir", "role": "physician", "hd": "citycare.org", "nonce": "test-nonce"}).encode()).decode().rstrip("=")

    class FakeHTTP:
        @staticmethod
        def get(url, timeout):
            if url.endswith("/.well-known/openid-configuration"):
                return FakeResponse({
                    "userinfo_endpoint": "https://issuer.example.com/userinfo",
                    "token_endpoint": "https://issuer.example.com/token",
                })
            return FakeResponse({})

        @staticmethod
        def post(url, data=None, headers=None, timeout=None):
            class Reply:
                def json(self):
                    return {"id_token": f"header.{id_payload}.signature", "access_token": "abc"}

                def raise_for_status(self):
                    return None
            return Reply()

    monkeypatch.setattr("app.sso.httpx", type("X", (), {"get": staticmethod(FakeHTTP.get), "post": staticmethod(FakeHTTP.post)}))
    adapter = HospitalSSOAdapter(provider_name="hospital_sso")
    claims = adapter.exchange_code_for_claims(code="live-code", state=state)
    assert claims.email == "dr.rana@citycare.org"
    assert claims.role == "physician"
    assert claims.organization_domain == "citycare.org"
