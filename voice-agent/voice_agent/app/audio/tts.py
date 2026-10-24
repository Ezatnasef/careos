"""VoiceTut-backed speech synthesis through the CareOS API."""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from voice_agent.app.config import Settings

logger = logging.getLogger(__name__)


class TTSGenerationError(RuntimeError):
    """A safe-to-report failure while requesting VoiceTut speech synthesis."""


async def generate_speech_audio(
    text: str,
    settings: Settings,
    *,
    client_factory: Any | None = None,
    voice_preference: str | None = None,
) -> tuple[bytes, str] | None:
    """Generate audio using the single VoiceTut provider configured by CareOS."""
    if not text.strip():
        return None
    if not settings.careos_api_url:
        raise TTSGenerationError("CAREOS_API_URL is required for VoiceTut speech.")

    language = (
        "ar-EG"
        if any("\u0600" <= character <= "\u06ff" for character in text)
        else "en-US"
    )
    url = f"{settings.careos_api_url.rstrip('/')}/assistant/tts"
    client_constructor = client_factory or httpx.AsyncClient
    payload = {
        "text": text,
        "language": language,
        "voice": voice_preference or "Mohammed",
    }

    try:
        async with client_constructor(timeout=30, follow_redirects=False) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            result = response.json()
        encoded_audio = result.get("audio_base64")
        if not isinstance(encoded_audio, str) or not encoded_audio:
            raise TTSGenerationError("CareOS did not return VoiceTut audio.")
        audio = base64.b64decode(encoded_audio, validate=True)
        if not audio:
            raise TTSGenerationError("CareOS returned empty VoiceTut audio.")
        return audio, str(result.get("audio_mime_type") or "audio/mpeg")
    except TTSGenerationError:
        raise
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.warning("voice_agent.voicetut_tts_failed error_type=%s", type(exc).__name__)
        raise TTSGenerationError("VoiceTut speech is temporarily unavailable.") from None
