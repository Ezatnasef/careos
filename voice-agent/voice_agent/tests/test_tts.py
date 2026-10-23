import asyncio
import base64
from types import SimpleNamespace

from voice_agent.app.audio.tts import TTSGenerationError, generate_speech_audio
from voice_agent.app.config import Settings


class FakeTTSClient:
    def __init__(self, data: bytes = b"fake-wav-bytes", mime_type: str = "audio/wav") -> None:
        self.request: dict[str, object] = {}
        response = SimpleNamespace(
            outputs=[
                SimpleNamespace(
                    type="audio",
                    data=base64.b64encode(data).decode("ascii"),
                    mime_type=mime_type,
                )
            ]
        )

        async def create_interaction(**kwargs: object) -> SimpleNamespace:
            self.request = kwargs
            return response

        self.aio = SimpleNamespace(
            interactions=SimpleNamespace(create=create_interaction)
        )


def test_generate_speech_audio_reports_missing_api_key_without_fallback() -> None:
    settings = Settings(_env_file=None, app_env="development", llm_provider="gemini", llm_api_key=None)
    try:
        asyncio.run(generate_speech_audio("Hello", settings))
    except TTSGenerationError as exc:
        assert "LLM_API_KEY" in str(exc)
    else:
        raise AssertionError("Missing Gemini credentials must not return a fallback result")


def test_generate_speech_audio_skips_empty_text() -> None:
    settings = Settings(_env_file=None, app_env="development", llm_provider="gemini", llm_api_key="key")
    result = asyncio.run(generate_speech_audio("   ", settings))
    assert result is None


def test_generate_speech_audio_synthesizes_wav() -> None:
    settings = Settings(_env_file=None, app_env="development", llm_provider="gemini", llm_api_key="key")
    fake_client = FakeTTSClient(b"sample-audio-data")

    result = asyncio.run(
        generate_speech_audio(
            "Hello world",
            settings,
            client_factory=lambda **kwargs: fake_client,
        )
    )
    assert result is not None
    data, mime = result
    assert data == b"sample-audio-data"
    assert mime == "audio/wav"
    assert fake_client.request["model"] == "gemini-3.8-flash-tts"
    assert fake_client.request["generation_config"] == {"speech_config": [{"voice": "Kore"}]}
    assert fake_client.request["input"][0]["content"][0]["text"] == "Hello world"
    assert "English (en-US)" in fake_client.request["input"][0]["content"][0]["annotations"][0]["style"]


def test_generate_speech_audio_preserves_arabic_and_requests_egyptian_voice() -> None:
    text = "أهلاً بيك، أنا مساعد كير أوس، أقدر أساعدك في حجز المواعيد."
    settings = Settings(
        _env_file=None,
        app_env="development",
        llm_provider="gemini",
        llm_api_key="key",
        gemini_tts_arabic_voice="Puck",
    )
    fake_client = FakeTTSClient()

    result = asyncio.run(
        generate_speech_audio(
            text,
            settings,
            client_factory=lambda **kwargs: fake_client,
        )
    )

    assert result is not None
    assert fake_client.request["input"][0]["content"][0]["text"] == text
    assert fake_client.request["generation_config"] == {"speech_config": [{"voice": "Puck"}]}
    style = fake_client.request["input"][0]["content"][0]["annotations"][0]["style"]
    assert "Egyptian Arabic (ar-EG)" in style


def test_generate_speech_audio_uses_configured_english_voice_for_english() -> None:
    settings = Settings(
        _env_file=None,
        app_env="development",
        llm_provider="gemini",
        llm_api_key="key",
        gemini_tts_english_voice="Zephyr",
    )
    fake_client = FakeTTSClient()

    result = asyncio.run(
        generate_speech_audio(
            "Your appointment for سارة is confirmed.",
            settings,
            client_factory=lambda **kwargs: fake_client,
        )
    )

    assert result is not None
    assert fake_client.request["generation_config"] == {
        "speech_config": [{"voice": "Zephyr"}]
    }
    assert fake_client.request["input"][0]["content"][0]["text"] == (
        "Your appointment for سارة is confirmed."
    )
    style = fake_client.request["input"][0]["content"][0]["annotations"][0]["style"]
    assert "English (en-US)" in style


def test_generate_speech_audio_reports_provider_error_and_redacts_api_key(caplog) -> None:
    settings = Settings(
        _env_file=None,
        app_env="development",
        llm_provider="gemini",
        llm_api_key="secret-test-value",
    )

    class FailingClient:
        def __init__(self) -> None:
            async def create_interaction(**kwargs: object) -> None:
                del kwargs
                raise RuntimeError(
                    "API key not valid: AIza123456789012345678901234567890"
                )

            self.aio = SimpleNamespace(
                interactions=SimpleNamespace(create=create_interaction)
            )

    try:
        asyncio.run(
            generate_speech_audio(
                "أهلاً بيك",
                settings,
                client_factory=lambda **kwargs: FailingClient(),
            )
        )
    except TTSGenerationError as exc:
        assert "API key not valid" in str(exc)
        assert "AIza123456789012345678901234567890" not in str(exc)
    else:
        raise AssertionError("Gemini provider errors must be surfaced")

    assert "AIza123456789012345678901234567890" not in caplog.text
