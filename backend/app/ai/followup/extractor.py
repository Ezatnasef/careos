import json
import logging
import re
from openai import AsyncOpenAI, OpenAIError
from pydantic import ValidationError
from fastapi import HTTPException

from app.ai.followup.contracts import FollowUpExtraction
from app.config import get_settings

logger = logging.getLogger(__name__)


class FollowUpExtractor:
    """Extract structured followup intent from user text using LLM with heuristic fallback."""

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
                logger.warning(f"Could not initialize AsyncOpenAI in FollowUpExtractor: {exc}")
                self.client = None
        else:
            self.client = None

    def _extract_heuristic(self, text: str) -> FollowUpExtraction:
        normalized = text.lower().strip()

        # Confirmation
        confirmation = "unknown"
        if re.search(r"\b(confirm|yes|sure|proceed|ok|okay)\b", normalized) or any(
            w in text for w in ["نعم", "تأكيد", "موافق", "تمام", "أكد", "اكد"]
        ):
            confirmation = "confirm"
        elif re.search(r"\b(reject|no|decline|don'?t)\b", normalized) or any(
            w in text for w in ["لا", "ارفض", "أرفض"]
        ):
            confirmation = "reject"

        # Action
        action = "unknown"
        if "cancel" in normalized or "إلغاء" in text or "الغاء" in text:
            action = "cancel"
        elif any(w in normalized for w in ["complete", "finish", "done", "close"]) or any(
            w in text for w in ["اكتمل", "تمت", "انهاء", "إنهاء"]
        ):
            action = "complete"
        elif any(w in normalized for w in ["modify", "reschedule", "update", "change"]) or any(
            w in text for w in ["تعديل", "تغيير", "تحديث"]
        ):
            action = "modify"
        elif any(w in normalized for w in ["get", "show", "view", "list", "check"]) or any(
            w in text for w in ["عرض", "شوف", "هات", "معرفة"]
        ):
            action = "get"
        elif any(w in normalized for w in ["create", "add", "new", "followup", "follow-up"]) or any(
            w in text for w in ["متابعة", "متابعه", "إنشاء", "انشاء", "جديد", "سجل"]
        ):
            action = "create"

        # Followup type
        fu_type = None
        if "post-op" in normalized or "post op" in normalized or "بعد العملية" in text:
            fu_type = "post-op"
        elif "lab" in normalized or "تحاليل" in text or "نتائج" in text:
            fu_type = "lab_review"
        elif "routine" in normalized or "دوري" in text or "عادي" in text:
            fu_type = "routine"
        elif "medication" in normalized or "أدوية" in text:
            fu_type = "medication_check"
        elif "wound" in normalized or "جرح" in text:
            fu_type = "wound_care"
        else:
            fu_type = "clinical_followup"

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

        # IDs
        apt_id = None
        apt_match = re.search(r"(?:appointment|موعد)\s*[:#]?\s*([0-9a-fA-F\-]{8,36})", text, re.I)
        if apt_match:
            apt_id = apt_match.group(1)

        fu_id = None
        fu_match = re.search(r"(?:followup|متابعة)\s*[:#]?\s*([0-9a-fA-F\-]{8,36})", text, re.I)
        if fu_match:
            fu_id = fu_match.group(1)

        reason = "Patient post-encounter follow-up" if action == "create" else None

        return FollowUpExtraction(
            action=action,
            confirmation=confirmation,
            followup_type=fu_type,
            date=extracted_date,
            time=extracted_time,
            appointment_id=apt_id,
            followup_id=fu_id,
            reason=reason,
        )

    async def extract(self, text: str) -> FollowUpExtraction:
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
                            "Extract follow-up intent only. "
                            "Return JSON with exactly these fields: "
                            "action, confirmation, followup_type, date, time, "
                            "appointment_id, followup_id, reason. "
                            "action must be one of: create, get, modify, cancel, complete, unknown. "
                            "confirmation must be one of: confirm, reject, unknown. "
                            "Set confirmation=confirm when the user clearly accepts "
                            "or wants to proceed with the current operation. "
                            "Set confirmation=reject when the user clearly refuses "
                            "or stops the current operation. "
                            "Otherwise use unknown. When confirmation=reject, set action=unknown unless the user explicitly asks to cancel. "
                            "Normalize Arabic relative dates: بكرة -> tomorrow, اليوم -> today. "
                            "Extract explicit time exactly when possible. "
                            "If AM/PM is explicit, normalize time to HH:MM format (for example: الساعة 10 صباحا -> 10:00, الساعة 6 بالليل -> 18:00). "
                            "Do not infer missing data. Do not invent dates, times, or IDs. "
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
            return FollowUpExtraction.model_validate(data)
        except (OpenAIError, json.JSONDecodeError, ValidationError, Exception) as exc:
            logger.warning(f"LLM extraction failed in FollowUpExtractor ({exc}); using heuristic extraction.")
            return self._extract_heuristic(text)

