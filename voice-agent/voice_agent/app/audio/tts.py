"""Text-to-speech synthesis using Gemini TTS."""

from __future__ import annotations

import base64
import logging
import re
from typing import Any

from voice_agent.app.config import Settings

logger = logging.getLogger(__name__)

TTS_MODEL = "gemini-3.8-flash-tts"
ARABIC_TEXT_PATTERN = re.compile(r"[\u0600-\u06FF]")
LATIN_TEXT_PATTERN = re.compile(r"[a-zA-Z]")
API_KEY_PATTERN = re.compile(r"AIza[0-9A-Za-z_-]{20,}")
SENSITIVE_VALUE_PATTERN = re.compile(
    r"(?i)(api[_ -]?key|authorization)\s*[:=]\s*[^\s,;]+"
)


class TTSGenerationError(RuntimeError):
    """A safe-to-report failure while configuring or calling the TTS provider."""


def _speech_style(text: str) -> tuple[str, str]:
    if len(ARABIC_TEXT_PATTERN.findall(text)) > len(LATIN_TEXT_PATTERN.findall(text)):
        return (
            "Egyptian Arabic (ar-EG), spoken naturally with a warm conversational "
            "Egyptian accent. Recite the transcript verbatim; do not translate or "
            "paraphrase it.",
            "arabic",
        )
    return (
        "English (en-US), spoken naturally. Recite the transcript verbatim; "
        "do not translate or paraphrase it.",
        "english",
    )


async def _synthesize_with_edge_tts(
    text: str,
    voice_preference: str | None = None,
) -> tuple[bytes, str] | None:
    try:
        import os
        import edge_tts
        import tempfile
        is_arabic = len(ARABIC_TEXT_PATTERN.findall(text)) > len(LATIN_TEXT_PATTERN.findall(text))
        if is_arabic:
            cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
            cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
            cleaned = re.sub(r"^[•\-\*]\s*", "", cleaned, flags=re.MULTILINE)
            cleaned = re.sub(r"\bCareOS\b", "كير أو إس", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"#REF_CODE", "كود الحجز", cleaned)
            cleaned = re.sub(r"REF_CODE", "كود الحجز", cleaned)
            cleaned = re.sub(r"[:؛]", "،", cleaned)
            cleaned = re.sub(r"\bنحن هنا لمساعدتك\b", "أنا هنا علشان أساعد حضرتك", cleaned)
            cleaned = re.sub(r"\bيمكنك الاعتماد علينا في الآتي\b", "وتقدر تعتمد عليا في الآتي", cleaned)
            cleaned = re.sub(r"\bكيف يمكننا مساعدتك اليوم\b", "تحب أساعد حضرتك بإيه النهاردة؟", cleaned)
            text = cleaned
            is_female = any(name in (voice_preference or "").lower() for name in ("mariam", "female", "مريم", "مريومة", "نسائي"))
            voice = "ar-EG-SalmaNeural" if is_female else "ar-EG-ShakirNeural"
            rate = "+14%"
        else:
            voice = "en-US-GuyNeural"
            rate = "+6%"

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tf:
            tmp_path = tf.name
        communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
        await communicate.save(tmp_path)
        with open(tmp_path, "rb") as f:
            data = f.read()
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        if data:
            return data, "audio/mpeg"
    except Exception as exc:
        logger.warning("TTS fallback failed: %s", exc)
    return None


async def generate_speech_audio(
    text: str,
    settings: Settings,
    *,
    client_factory: Any | None = None,
    voice_preference: str | None = None,
) -> tuple[bytes, str] | None:
    """Generate spoken audio (WAV) from text using Gemini TTS."""
    if not text.strip():
        return None

    if settings.llm_provider.casefold() != "gemini" or not settings.llm_api_key:
        logger.info("tts.fallback provider=edge-tts language=ar-EG speaker=%s", voice_preference)
        fallback_audio = await _synthesize_with_edge_tts(text, voice_preference=voice_preference)
        if fallback_audio is not None:
            return fallback_audio
        raise TTSGenerationError(
            "Gemini TTS is not configured; set LLM_PROVIDER=gemini and LLM_API_KEY."
        )

    try:
        if client_factory is not None:
            client = client_factory(api_key=settings.llm_api_key)
        else:
            from google import genai

            client = genai.Client(api_key=settings.llm_api_key)

        style, language = _speech_style(text)
        voice = (
            settings.gemini_tts_arabic_voice
            if language == "arabic"
            else settings.gemini_tts_english_voice
        )
        logger.info(
            "tts.request.started provider=gemini model=%s language=%s voice=%s",
            TTS_MODEL,
            "ar-EG" if language == "arabic" else "en-US",
            voice,
        )
        response = await client.aio.interactions.create(
            model=TTS_MODEL,
            input=[
                {
                    "type": "user_input",
                    "content": [
                        {
                            "type": "text",
                            "text": text,
                            "annotations": [
                                {"type": "speech_metadata", "style": style}
                            ],
                        }
                    ],
                }
            ],
            response_format={"type": "audio"},
            generation_config={"speech_config": [{"voice": voice}]},
        )
        audio = getattr(response, "output_audio", None)
        if audio is None:
            audio = next(
                (
                    output
                    for output in getattr(response, "outputs", None) or []
                    if getattr(output, "type", None) == "audio"
                ),
                None,
            )
        encoded_audio = getattr(audio, "data", None)
        if not encoded_audio:
            logger.warning(
                "tts.request.failed provider=gemini model=%s reason=no_audio_content, attempting edge-tts",
                TTS_MODEL,
            )
            fallback = await _synthesize_with_edge_tts(text)
            if fallback is not None:
                return fallback
            raise TTSGenerationError(
                "Gemini TTS returned no audio content; check model access and the TTS response."
            )

        audio_bytes = base64.b64decode(encoded_audio, validate=True)
        mime_type = getattr(audio, "mime_type", None) or "audio/wav"
        logger.info(
            "tts.request.succeeded provider=gemini model=%s content_type=%s audio_bytes=%d",
            TTS_MODEL,
            mime_type,
            len(audio_bytes),
        )
        return audio_bytes, mime_type
    except Exception as exc:
        logger.warning(
            "tts.request.failed provider=gemini model=%s error_type=%s, attempting edge-tts fallback: %s",
            TTS_MODEL,
            type(exc).__name__,
            exc,
        )
        fallback_audio = await _synthesize_with_edge_tts(text)
        if fallback_audio is not None:
            return fallback_audio

        if isinstance(exc, TTSGenerationError):
            raise
        status_code = getattr(exc, "code", None) or getattr(
            getattr(exc, "response", None), "status_code", None
        )
        provider_message = getattr(exc, "message", None) or str(exc)
        safe_message = API_KEY_PATTERN.sub("[REDACTED]", str(provider_message))
        safe_message = SENSITIVE_VALUE_PATTERN.sub(r"\1=[REDACTED]", safe_message)
        safe_message = " ".join(safe_message.split())[:240]
        if not safe_message:
            safe_message = "No provider error details were supplied."
        logger.warning(
            "tts.request.failed provider=gemini model=%s error_type=%s status=%s detail=%s",
            TTS_MODEL,
            type(exc).__name__,
            status_code or "unknown",
            safe_message,
        )
        raise TTSGenerationError(
            f"Gemini TTS failed ({type(exc).__name__}, HTTP {status_code or 'unknown'}): "
            f"{safe_message}"
        ) from None
