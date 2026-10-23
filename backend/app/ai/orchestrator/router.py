import json
import logging
import re
from openai import AsyncOpenAI, OpenAIError
from pydantic import ValidationError

from app.ai.orchestrator.contracts import IntentResult, IntentType
from app.config import get_settings

logger = logging.getLogger(__name__)

ROUTER_SYSTEM_PROMPT = (
    "Classify the user's request into exactly one intent: booking, followup, unknown.\n"
    "booking = appointment booking, rescheduling, cancellation, availability.\n"
    "followup = patient follow-up creation, retrieval, modification, cancellation, completion.\n"
    "unknown = anything else.\n"
    "Return JSON only: {\"intent\":\"booking|followup|unknown\"}"
)


class IntentRouter:
    """Classifies user messages into intent types (booking, followup, unknown) using LLM with heuristic fallback."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        settings = get_settings()
        self.api_key = api_key or settings.ai_api_key or settings.openai_api_key or ""
        self.base_url = (
            base_url
            or settings.ai_api_url
            or getattr(settings, "ai_base_url", None)
            or (settings.openai_base_url if settings.openai_api_key else None)
        )
        self.model = model or settings.ai_model or settings.openai_model or "openai/gpt-oss-20b"

        if self.api_key and self.api_key not in {"unconfigured", "placeholder"}:
            kw = {"api_key": self.api_key}
            if self.base_url:
                kw["base_url"] = self.base_url
            try:
                self.client = AsyncOpenAI(**kw)
            except Exception as exc:
                logger.warning(f"Could not initialize AsyncOpenAI in IntentRouter: {exc}")
                self.client = None
        else:
            self.client = None

    def _classify_heuristic(self, text: str) -> IntentResult:
        normalized = text.lower().strip()
        
        # Check follow-up keywords first (often more specific)
        followup_patterns = [
            r"\bfollow[\s\-]?up\b",
            r"\bpost[\s\-]?op\b",
            r"\bcheck[\s\-]?up\b",
            r"متابعة",
            r"متابعه",
            r"فحص دوري",
            r"استشارة بعد",
        ]
        for pat in followup_patterns:
            if re.search(pat, normalized):
                return IntentResult(intent=IntentType.FOLLOWUP)

        # Check booking keywords
        booking_patterns = [
            r"\bbook\b",
            r"\bbooking\b",
            r"\bappointment\b",
            r"\breschedule\b",
            r"\bschedule\b",
            r"\breserve\b",
            r"\bcancel\s+appointment\b",
            r"\bslot\b",
            r"حجز",
            r"احجز",
            r"موعد",
            r"ميعاد",
            r"تعديل الموعد",
            r"إلغاء الموعد",
            r"الغاء الموعد",
        ]
        for pat in booking_patterns:
            if re.search(pat, normalized):
                return IntentResult(intent=IntentType.BOOKING)

        return IntentResult(intent=IntentType.UNKNOWN)

    async def classify(self, text: str) -> IntentResult:
        """Classify user text into IntentResult using LLM, or fallback to heuristics."""
        if not self.client:
            return self._classify_heuristic(text)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
            )
            content = response.choices[0].message.content or "{}"
            data = json.loads(content)

            raw_intent = data.get("intent", "").lower().strip() if isinstance(data, dict) else ""
            if raw_intent in {IntentType.BOOKING.value, IntentType.FOLLOWUP.value, IntentType.UNKNOWN.value}:
                return IntentResult(intent=IntentType(raw_intent))

            return self._classify_heuristic(text)

        except (OpenAIError, json.JSONDecodeError, ValidationError, Exception) as exc:
            logger.warning(f"LLM classification failed in IntentRouter ({exc}), using heuristic fallback.")
            return self._classify_heuristic(text)
