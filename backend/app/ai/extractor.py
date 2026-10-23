import json
import logging
import re
from openai import AsyncOpenAI, OpenAIError
from pydantic import ValidationError
from fastapi import HTTPException

from app.ai.booking.contracts import BookingExtraction
from app.config import get_settings

logger = logging.getLogger(__name__)


class GroqExtractor:
    """Extract structured booking intent from user text using LLM with heuristic fallback."""

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
                logger.warning(f"Could not initialize AsyncOpenAI in BookingExtractor: {exc}")
                self.client = None
        else:
            self.client = None

    def _extract_heuristic(self, text: str) -> BookingExtraction:
        normalized = text.lower().strip()

        # Confirmation extraction
        confirmation = "unknown"
        if re.search(r"\b(confirm|yes|sure|proceed|ok|okay)\b", normalized) or any(
            w in text for w in ["نعم", "تأكيد", "موافق", "تمام", "أكد", "اكد"]
        ):
            confirmation = "confirm"
        elif re.search(r"\b(reject|no|decline|don'?t)\b", normalized) or any(
            w in text for w in ["لا", "ارفض", "أرفض"]
        ):
            confirmation = "reject"

        # Action extraction
        action = "unknown"
        if "cancel" in normalized or "إلغاء" in text or "الغاء" in text:
            action = "cancel"
        elif any(w in normalized for w in ["modify", "reschedule", "change"]) or any(
            w in text for w in ["تعديل", "تغيير", "نقل"]
        ):
            action = "modify"
        elif any(w in normalized for w in ["book", "reserve", "schedule", "new appointment"]) or any(
            w in text for w in ["حجز", "احجز", "موعد", "ميعاد"]
        ):
            action = "book"

        # Date extraction
        extracted_date = None
        iso_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
        if iso_match:
            extracted_date = iso_match.group(1)
        elif "tomorrow" in normalized or "بكرة" in text or "غدا" in text or "غداً" in text:
            extracted_date = "tomorrow"
        elif "today" in normalized or "اليوم" in text or "النهارده" in text or "النهاردة" in text:
            extracted_date = "today"

        # Time extraction
        extracted_time = None
        time_match = re.search(r"\b(\d{1,2}:\d{2})\b", text)
        if time_match:
            extracted_time = time_match.group(1)
        else:
            pm_match = re.search(r"\b(\d{1,2})\s*(?:pm|مساء|مساءً|بالليل)\b", normalized)
            if pm_match:
                hr = int(pm_match.group(1))
                if hr < 12:
                    hr += 12
                extracted_time = f"{hr:02d}:00"
            else:
                am_match = re.search(r"\b(\d{1,2})\s*(?:am|صباحا|صباحاً)\b", normalized)
                if am_match:
                    hr = int(am_match.group(1))
                    extracted_time = f"{hr:02d}:00"
                else:
                    hour_only = re.search(r"(?:at|الساعة)\s*(\d{1,2})", normalized)
                    if hour_only:
                        extracted_time = str(int(hour_only.group(1)))

        # Specialty extraction
        specialty = None
        if "cardiology" in normalized or "قلب" in text:
            specialty = "cardiology"
        elif "dermatology" in normalized or "جلدية" in text:
            specialty = "dermatology"
        elif "cosmetics" in normalized or "تجميل" in text:
            specialty = "cosmetics"
        elif "general" in normalized or "عام" in text:
            specialty = "general"

        # Reason extraction
        reason = None
        reasons_detected = []
        for term in ["botox", "filler", "laser", "hydrafacial", "بوتوكس", "بوتكس", "فيلر", "ليزر", "نضارة", "تنظيف بشرة"]:
            if term in normalized or term in text:
                reasons_detected.append(term)
        if reasons_detected:
            reason = " / ".join(reasons_detected)
        elif specialty:
            reason = f"{specialty} consultation"

        # Appointment ID
        apt_id = None
        id_match = re.search(r"(?:appointment|موعد|id)\s*[:#]?\s*([0-9a-fA-F\-]{8,36})", text, re.I)
        if id_match:
            apt_id = id_match.group(1)

        return BookingExtraction(
            action=action,
            confirmation=confirmation,
            specialty=specialty,
            date=extracted_date,
            time=extracted_time,
            appointment_id=apt_id,
            reason=reason,
        )

    async def extract(self, text: str) -> BookingExtraction:
        if not self.client:
            return self._extract_heuristic(text)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Extract booking intent only. "
                            "Return JSON with exactly these fields: "
                            "action, confirmation, specialty, date, time, "
                            "appointment_id, reason. "
                            "action must be one of: book, modify, cancel, unknown. "
                            "confirmation must be one of: confirm, reject, unknown. "
                            "Set confirmation=confirm when the user clearly accepts "
                            "or wants to proceed with the current operation. "
                            "Set confirmation=reject when the user clearly refuses "
                            "or stops the current operation. "
                            "Otherwise use unknown. "
                            "When confirmation=reject, set action=unknown unless the user explicitly asks to cancel an appointment. "
                            "For specialty, use canonical English values when clearly known: "
                            "dermatology, cardiology, or null. "
                            "Normalize Arabic relative dates: بكرة -> tomorrow, "
                            "اليوم -> today. "
                            "Extract explicit time exactly when possible. "
                            "If the user says الساعة 6 without AM/PM, return time as 6. "
                            "If AM/PM is explicit, normalize to HH:MM. "
                            "Do not infer missing booking data. "
                            "Do not invent specialty, date, time, or appointment_id. "
                            "Do not make business decisions. "
                            "Keep missing values null."
                        ),
                    },
                    {
                        "role": "user",
                        "content": text,
                    },
                ],
            )
            content = response.choices[0].message.content or "{}"
            data = json.loads(content)
            return BookingExtraction.model_validate(data)
        except (OpenAIError, json.JSONDecodeError, ValidationError, Exception) as exc:
            logger.warning(f"LLM extraction failed in BookingExtractor ({exc}); using heuristic extraction.")
            return self._extract_heuristic(text)


BookingExtractor = GroqExtractor

