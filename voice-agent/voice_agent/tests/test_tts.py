import asyncio
import base64

import httpx
import pytest

from voice_agent.app.audio.tts import TTSGenerationError, generate_speech_audio
from voice_agent.app.config import Settings


def test_generate_speech_audio_uses_careos_voicetut_endpoint() -> None:
    settings = Settings(
        _env_file=None,
        app_env="development",
        careos_api_url="http://careos.test/api/v1",
    )
    requests: list[tuple[str, dict[str, str]]] = []

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url: str, *, json: dict[str, str]):
            requests.append((url, json))
            return httpx.Response(
                200,
                request=httpx.Request("POST", url),
                json={
                    "audio_base64": base64.b64encode(b"voicetut-audio").decode(),
                    "audio_mime_type": "audio/wav",
                },
            )

    result = asyncio.run(
        generate_speech_audio(
            "أهلاً بيك",
            settings,
            client_factory=lambda **_kwargs: FakeClient(),
            voice_preference="Mariam",
        )
    )

    assert result == (b"voicetut-audio", "audio/wav")
    assert requests == [
        (
            "http://careos.test/api/v1/assistant/tts",
            {"text": "أهلاً بيك", "language": "ar-EG", "voice": "Mariam"},
        )
    ]


def test_generate_speech_audio_requires_careos_endpoint() -> None:
    settings = Settings(_env_file=None, app_env="development", careos_api_url=None)

    with pytest.raises(TTSGenerationError, match="CAREOS_API_URL"):
        asyncio.run(generate_speech_audio("Hello", settings))


def test_generate_speech_audio_does_not_fallback_when_voicetut_fails() -> None:
    settings = Settings(
        _env_file=None,
        app_env="development",
        careos_api_url="http://careos.test/api/v1",
    )

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            return httpx.Response(
                503,
                request=httpx.Request("POST", "http://careos.test/api/v1/assistant/tts"),
                json={"detail": "VoiceTut is unavailable"},
            )

    with pytest.raises(TTSGenerationError, match="temporarily unavailable"):
        asyncio.run(
            generate_speech_audio(
                "Hello",
                settings,
                client_factory=lambda **_kwargs: FakeClient(),
            )
        )


def test_generate_speech_audio_skips_empty_text() -> None:
    settings = Settings(_env_file=None, app_env="development", careos_api_url=None)
    assert asyncio.run(generate_speech_audio("   ", settings)) is None
