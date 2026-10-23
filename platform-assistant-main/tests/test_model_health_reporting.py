import asyncio

import httpx
from fastapi.testclient import TestClient

import backend.config as config
import backend.main as main
from backend.llm_client import LLMClient


def _configure_gemini(monkeypatch) -> None:
    monkeypatch.setattr(config, "API_KEY", "test-key")
    monkeypatch.setattr(
        config,
        "BASE_URL",
        "https://generativelanguage.googleapis.com/v1beta/openai",
    )
    monkeypatch.setattr(config, "MODEL", "gemini-2.5-flash")


def test_health_does_not_claim_a_model_before_a_successful_request(monkeypatch) -> None:
    _configure_gemini(monkeypatch)
    monkeypatch.setattr(main, "llm_client", LLMClient())

    response = TestClient(main.app).get("/api/health")

    assert response.status_code == 200
    assert response.json()["configured"] is True
    assert response.json()["model"] == "gemini-2.5-flash"
    assert response.json()["configured_model"] == "gemini-2.5-flash"
    assert response.json()["active_model"] is None


def test_health_reports_model_used_by_fallback(monkeypatch) -> None:
    _configure_gemini(monkeypatch)
    client = LLMClient()
    monkeypatch.setattr(main, "llm_client", client)
    posted_models: list[str] = []

    class FakeAsyncClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, url: str, *, headers: dict[str, str], json: dict[str, object]):
            model = str(json["model"])
            posted_models.append(model)
            if model == "gemini-2.5-flash":
                return httpx.Response(
                    404,
                    text="model not found",
                    request=httpx.Request("POST", url),
                )
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": "Fallback answer"}}]},
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)
    answer = asyncio.run(
        client.generate_response(
            [{"role": "user", "content": "Test question"}],
            knowledge_chunks=[],
        )
    )

    assert answer == "Fallback answer"
    assert posted_models == ["gemini-2.5-flash", "gemini-3.8-flash"]

    response = TestClient(main.app).get("/api/health")

    assert response.status_code == 200
    assert response.json()["configured_model"] == "gemini-2.5-flash"
    assert response.json()["active_model"] == "gemini-3.8-flash"

    monkeypatch.setattr(config, "MODEL", "gemini-3.8-flash")
    reconfigured_response = TestClient(main.app).get("/api/health")
    assert reconfigured_response.json()["configured_model"] == "gemini-3.8-flash"
    assert reconfigured_response.json()["active_model"] is None
