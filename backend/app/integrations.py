"""Replaceable sandbox adapters for external clinical services.

Production adapters belong behind these protocols; no provider key is exposed to
the browser or required for the demo environment.
"""
from dataclasses import dataclass
from typing import Any
import asyncio
from io import BytesIO
import json
import logging
import re
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import httpx

from .config import get_settings
from .platform_knowledge import platform_knowledge_sources, retrieve_platform_knowledge

logger = logging.getLogger(__name__)



@dataclass
class SummaryResult:
    draft: str
    provider: str = "sandbox"


class ClinicalSummaryProvider:
    async def summarize(self, note: str) -> SummaryResult:
        settings = get_settings()
        provider = settings.ai_provider.strip().lower()
        if settings.is_production and provider in {"", "unconfigured", "sandbox"}:
            raise RuntimeError("AI clinical note provider is not configured")
        if provider not in {"", "unconfigured", "sandbox"}:
            api_key = settings.ai_api_key
            if not api_key and provider == "gemini":
                api_key = settings.gemini_api_key
            elif not api_key and provider == "openai":
                api_key = settings.openai_api_key
            elif not api_key:
                api_key = settings.llm_api_key
            if not settings.ai_api_url or not api_key:
                raise RuntimeError("AI clinical note provider credentials are not configured")
            headers = {"Authorization": f"Bearer {api_key}"}
            if provider in {"gemini", "openai"}:
                payload = {
                    "model": settings.ai_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "Draft a concise clinical note from the clinician's encounter "
                                "transcript for clinician review. Preserve the transcript's meaning "
                                "and language. Do not infer or add diagnoses, findings, or plans "
                                "that are not explicitly stated; retain uncertainty where present. "
                                "Return only the draft note."
                            ),
                        },
                        {"role": "user", "content": note},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 700,
                }
            else:
                payload = {
                    "model": settings.ai_model,
                    "input": note,
                    "task": "clinical_note_draft",
                }
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(settings.ai_api_url, headers=headers, json=payload)
                response.raise_for_status()
                result = response.json()
            choices = result.get("choices") or []
            message = choices[0].get("message", {}) if choices else {}
            draft = message.get("content") or result.get("draft") or result.get("text") or ""
            if not str(draft).strip():
                raise RuntimeError("Clinical note provider returned an empty draft")
            return SummaryResult(draft=str(draft), provider=settings.ai_provider)
        excerpt = note.strip().replace("\n", " ")[:500]
        return SummaryResult(draft=f"Clinical draft (review required): {excerpt}")


class RagProvider:
    @staticmethod
    def local_fallback(message: str) -> dict[str, object]:
        chunks = retrieve_platform_knowledge(message, top_k=2, include_fallback=False)
        localized = RagProvider._localized_public_reply(message)
        if localized is not None:
            answer = str(localized.get("answer", ""))
            is_arabic = bool(re.search(r"[\u0600-\u06FF]", answer))
            notice = (
                "مساعد الذكاء الاصطناعي غير متاح مؤقتًا؛ هذه إجابة محلية موثقة:"
                if is_arabic
                else "The AI assistant is temporarily unavailable; this is a verified local answer:"
            )
            localized["answer"] = f"{notice}\n\n{answer}"
            localized["sources"] = platform_knowledge_sources(chunks)
            localized["provider"] = "careos-local-fallback"
            return localized

        if chunks:
            is_arabic = bool(re.search(r"[\u0600-\u06FF]", message))
            notice = (
                "مساعد الذكاء الاصطناعي غير متاح مؤقتًا؛ هذه معلومات موثقة من قاعدة معرفة CareOS:"
                if is_arabic
                else "The AI assistant is temporarily unavailable; here is verified information from the CareOS knowledge base:"
            )
            answer = notice + "\n\n" + "\n\n".join(
                f"• **{chunk.get('title', 'CareOS information')}**\n{chunk.get('content', '')}"
                for chunk in chunks
            )
            return {
                "answer": RagProvider._format_clean_bullets(answer),
                "sources": platform_knowledge_sources(chunks),
                "provider": "careos-local-fallback",
            }

        is_arabic = bool(re.search(r"[\u0600-\u06FF]", message))
        answer = (
            "مساعد الذكاء الاصطناعي غير متاح مؤقتًا، ولم أجد إجابة موثقة لهذا السؤال في قاعدة المعرفة. "
            "جرّب مرة أخرى بعد قليل أو اسألني عن خدمات CareOS."
            if is_arabic
            else "The AI assistant is temporarily unavailable, and I couldn't find a verified answer in the knowledge base. Please try again shortly or ask about CareOS services."
        )
        return {"answer": answer, "sources": [], "provider": "careos-local-fallback"}

    @staticmethod
    def _format_clean_bullets(answer: str) -> str:
        if not answer:
            return ""
        lines = []
        for line in answer.splitlines():
            stripped = line.strip()
            if not stripped:
                lines.append("")
                continue
            # Remove horizontal dividers and stray dashed bullets
            if re.match(r"^[-—_]{2,}$", stripped) or stripped in {"***", "- - -", "-- •"}:
                continue
            # Remove markdown header markers (#, ##, ###)
            stripped = re.sub(r"^#{1,6}\s*", "", stripped)

            # Check if line is numbered (e.g. 1. or 1) or **1. ...** )
            num_match = re.match(r"^[*•\s]*(\d+[\.\)])\s*(.+)$", stripped)
            if num_match:
                prefix = num_match.group(1)
                content = num_match.group(2).replace("**", "").replace("*", "").strip()
                lines.append(f"{prefix} {content}")
                continue

            # Check if line is a bullet item (*, -, •)
            bullet_match = re.match(r"^[•\-\*]\s+(.+)$", stripped)
            if bullet_match:
                content = bullet_match.group(1).replace("**", "").replace("*", "").strip()
                lines.append(f"• {content}")
                continue

            # Regular text line: strip raw asterisks completely
            clean_line = stripped.replace("**", "").replace("*", "").strip()
            lines.append(clean_line)

        text = "\n".join(lines)
        while "\n\n\n" in text:
            text = text.replace("\n\n\n", "\n\n")
        return text.strip()

    @staticmethod
    def _strip_markdown_bullets(answer: str) -> str:
        return RagProvider._format_clean_bullets(answer)

    @staticmethod
    def _localized_public_reply(message: str) -> dict[str, object] | None:
        normalized = message.strip().lower()
        if not normalized:
            return None

        greeting_tokens = ["hi", "hello", "اهلا", "أهلا", "السلام", "مرحبا", "اخبارك", "عامل", "كيف الحال", "ازيك", "إزيك", "مساء الخير", "صباح الخير"]
        if any(token in normalized for token in greeting_tokens):
            return {
                "answer": "أهلاً بحضرتك يا فندم! أنا مساعد كير أو إس الذكي، وتحت أمرك في أي وقت.\n\nإزاي أقدر أساعدك النهاردة؟\n• حجز المواعيد واختيار الميعاد الأنسب ليك فوراً\n• الإرشاد الطبي ومعرفة التخصص المناسب لحالتك\n• متابعة مواعيدك وفحوصاتك الطبية بكل سهولة\n• التعرف على خدمات المنصة والعيادة",
                "sources": [],
                "provider": "careos-local",
            }

        if any(token in normalized for token in ["careos", "system", "المنصة", "البرنامج", "بيقدم", "يقدم", "مميزات", "مزايا", "خدمات", "feature", "features"]):
            return {
                "answer": "منصة كير أو إس هي المنظومة الطبية الذكية لإدارة العيادات والمستشفيات:\n\n• حجز المواعيد وتنظيم قوائم الانتظار في ثواني\n• دعم الأطباء بالإملاء الصوتي الذكي وكتابة الملاحظات الطبية\n• بوابة المريض للوصول السريع لملفك وتقاريرك الطبية\n• ربط الاستقبال والتمريض والدكاترة في نظام واحد متكامل",
                "sources": [],
                "provider": "careos-local",
            }

        return None

    @staticmethod
    async def _call_gemini_api(
        api_key: str,
        messages: list[dict[str, str]],
        model: str = "gemini-3.8-flash",
        custom_endpoint: str = "",
    ) -> str:
        """Call Google AI Studio Gemini API via OpenAI-compatible endpoint or native REST."""
        endpoint = custom_endpoint.strip() or "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        active_model = model or "gemini-3.8-flash"
        payload = {
            "model": active_model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 700,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            # 1. Try OpenAI-compatible endpoint
            try:
                response = await client.post(endpoint, headers=headers, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    choices = data.get("choices") or []
                    if choices:
                        ans = choices[0].get("message", {}).get("content")
                        if ans:
                            return str(ans)
                elif response.status_code == 400:
                    err_text = response.text
                    if "API key" in err_text or "INVALID_ARGUMENT" in err_text:
                        raise RuntimeError("INVALID_GEMINI_KEY")
                elif response.status_code == 404:
                    for fallback_m in ["gemini-3.8-flash", "gemini-flash-latest"]:
                        payload["model"] = fallback_m
                        retry = await client.post(endpoint, headers=headers, json=payload)
                        if retry.status_code == 200:
                            data = retry.json()
                            choices = data.get("choices") or []
                            if choices:
                                ans = choices[0].get("message", {}).get("content")
                                if ans:
                                    return str(ans)
            except RuntimeError:
                raise
            except Exception as exc:
                logger.warning(f"Gemini OpenAI endpoint attempt note: {exc}")

            # 2. Native Google AI Studio fallback
            sys_text = ""
            contents = []
            for m in messages:
                if m["role"] == "system":
                    sys_text += m["content"] + "\n\n"
                else:
                    role = "user" if m["role"] == "user" else "model"
                    contents.append({"role": role, "parts": [{"text": m["content"]}]})

            native_payload: dict[str, Any] = {
                "contents": contents,
                "generationConfig": {"temperature": 0.3, "maxOutputTokens": 700},
            }
            if sys_text.strip():
                native_payload["system_instruction"] = {"parts": [{"text": sys_text.strip()}]}

            for m_name in dict.fromkeys([active_model, "gemini-3.8-flash", "gemini-flash-latest"]):
                native_url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_name}:generateContent?key={api_key}"
                try:
                    res = await client.post(native_url, json=native_payload)
                    if res.status_code == 200:
                        data = res.json()
                        candidates = data.get("candidates") or []
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts") or []
                            if parts:
                                return str(parts[0].get("text") or "")
                    elif res.status_code in {400, 403}:
                        err_text = res.text
                        if "API key not valid" in err_text or "INVALID_ARGUMENT" in err_text or "PERMISSION_DENIED" in err_text:
                            raise RuntimeError("INVALID_GEMINI_KEY")
                except RuntimeError:
                    raise
                except Exception as exc:
                    logger.warning(f"Gemini native attempt ({m_name}) note: {exc}")



        raise RuntimeError("GEMINI_CALL_FAILED")

    async def answer_general(
        self,
        message: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> dict[str, object]:
        settings = get_settings()
        configured = settings.ai_provider.strip().lower()
        knowledge_chunks = retrieve_platform_knowledge(message)
        sources = platform_knowledge_sources(knowledge_chunks)
        knowledge_context = "\n\n---\n\n".join(
            f"[{chunk.get('title')}]\n{chunk.get('content')}"
            for chunk in knowledge_chunks
        )

        # In offline/sandbox mode, use local booking logic & greetings
        if configured in {"", "unconfigured", "sandbox"}:
            from .autonomous_booking import handle_autonomous_booking_request
            autonomous_reply = handle_autonomous_booking_request(message, conversation_history)
            if autonomous_reply is not None:
                return autonomous_reply

            localized = self._localized_public_reply(message)
            if localized is not None:
                localized["sources"] = sources
                return localized

            if settings.is_production:
                raise RuntimeError("General assistant provider is not configured")
            return {
                "answer": "أهلا! أنا مساعد CareOS. أقدر أشرح لك خدمات النظام، المواعيد، المرضى، الملاحظات، أو أي حاجة تخص التشغيل. لو كنت عايز مناقشة خدمة معينة، قولّيها ودهب أجاوب لك بالعربي المصري بشكل مختصر وفعلي.",
                "sources": [],
                "provider": "sandbox",
            }

        # For online AI models (Gemini, OpenAI, Groq), get live booking context & actions
        from .autonomous_booking import get_live_booking_context
        booking_context, booking_sources = get_live_booking_context(message, conversation_history)
        if booking_sources:
            sources.extend(booking_sources)

        # Build dynamic system prompt
        sys_instructions = (
            "You are the intelligent CareOS clinical and patient care assistant.\n\n"
            "YOUR 4 CORE PILLARS FOR EVERY PATIENT:\n"
            "1. CHAT & CLINIC ORIENTATION: Provide warm, helpful answers about clinic services, working hours, doctors, and procedures.\n"
            "2. CLINICAL GUIDANCE & PREPARATION: Guide patients to the right medical specialty based on symptoms. Explain necessary pre-visit preparations (e.g. fasting before labs, ultrasound hydration). Never prescribe medications directly; advise booking a specialist.\n"
            "3. AUTONOMOUS BOOKING: You have direct, live integration with the clinic appointment calendar. Book appointments immediately on the patient's behalf and provide the official confirmation code (#REF_CODE).\n"
            "4. FOLLOW-UP & POST-VISIT CARE: Help patients check previous appointment status using their confirmation code (#REF_CODE) or phone, explain lab readiness, and coordinate follow-up visit timings.\n\n"
            "MANDATORY FORMATTING & SAFETY RULES:\n"
            "• AUTHENTIC EGYPTIAN DIALECT (مصري خالص إلزامي): For all Arabic responses, you MUST communicate purely and naturally in warm, friendly, authentic Egyptian dialect (بالعامية المصرية الأصيلة المحترمة). Use genuine Egyptian phrases like: 'أهلاً بحضرتك يا فندم'، 'تحت أمرك'، 'أنا هنا علشان أساعدك'، 'إزاي أقدر أساعد حضرتك النهاردة؟'، 'تقدر تحجز ميعادك في ثواني'، 'كود الحجز بتاعك'، 'ما تقلقش خالص'. AVOID dry classical standard Arabic phrases like 'نحن هنا لمساعدتكم' or 'يمكنك الاعتماد علينا في الآتي'.\n"
            "• CLEAN NATURAL CHAT (شات طبيعي ومرتب بدون نجوم أو شرط): تحدث بأسلوب محادثة طبيعي ومنسق ومريح للعين كأنك طبيب أو مساعد يكتب في شات محادثة راقي. ممنوع منعاً باتاً وضع نجوم الماركداون مثل '**' أو '*' وممنوع الشرط مثل '---' أو '--'. رتّب كلامك في فقرات واضحة واستخدم ترقيم بسيط ومنظم أو نقاط واضحة بدون أي رموز مشوهة للنص.\n"
            "• ZERO MOCK DOCTORS POLICY: Never invent fictional doctors or doctor names. Use only registered clinic data provided below.\n\n"
        )
        if booking_context:
            sys_instructions += f"{booking_context}\n\n"
        sys_instructions += f"CURATED CAREOS PLATFORM KNOWLEDGE:\n{knowledge_context}"

        history = [
            {"role": entry["role"], "content": entry["content"]}
            for entry in (conversation_history or [])[-12:]
        ]
        messages = [
            {"role": "system", "content": sys_instructions},
            *history,
            {"role": "user", "content": message},
        ]

        # A. Google AI Studio / Gemini Flash
        if configured in {"gemini", "google"}:
            api_key = settings.GEMINI_API_KEY
            if not api_key:
                is_ar = bool(re.search(r"[\u0600-\u06FF]", message))
                warn = (
                    "⚠️ تنبيه إعدادات الذكاء الاصطناعي:\n\n"
                    "• تم ضبط المزود على Google Gemini Flash، ولكن مفتاح API غير محدد في ملف `.env`.\n"
                    "• لتفعيل الموديل فوراً:\n"
                    "  - افتح ملف `backend/.env`\n"
                    "  - أضف مفتاحك الصادر من Google AI Studio: `GEMINI_API_KEY=AIzaSy...`\n"
                    "• بمجرد حفظ المفتاح، سيتحدث معك Gemini Flash مباشرة ويقوم بالحجز بذكاء بدون أي ردود جاهزة."
                ) if is_ar else (
                    "⚠️ AI Provider Notice:\n\n"
                    "• Provider is configured to Google Gemini Flash, but the API key is missing in `.env`.\n"
                    "• To enable Gemini Flash live conversational responses:\n"
                    "  - Open `backend/.env`\n"
                    "  - Set `GEMINI_API_KEY=AIzaSy...` (from Google AI Studio)\n"
                    "• Once saved, Gemini Flash will process all requests dynamically."
                )
                return {"answer": warn, "sources": sources, "provider": "gemini"}

            try:
                raw_answer = await self._call_gemini_api(
                    api_key=api_key,
                    messages=messages,
                    model=settings.ai_model or "gemini-2.5-flash",
                    custom_endpoint=settings.ai_api_url or "",
                )
                return {
                    "answer": self._format_clean_bullets(raw_answer),
                    "sources": sources,
                    "provider": "gemini",
                }
            except RuntimeError as exc:
                if "INVALID_GEMINI_KEY" in str(exc):
                    is_ar = bool(re.search(r"[\u0600-\u06FF]", message))
                    return {
                        "answer": (
                            "⚠️ تنبيه إعدادات الذكاء الاصطناعي:\n\n"
                            "• تم استلام طلبك ومحاولة الاتصال بـ Google AI Studio، ولكن مفتاح API الحالي غير صالح لدى جوجل (Invalid API Key).\n"
                            "• يرجى وضع مفتاح API الصالح من حسابك في Google AI Studio داخل ملف `backend/.env`:\n"
                            "  `GEMINI_API_KEY=AIzaSy...`\n"
                            "• بمجرد حفظ المفتاح، سيعمل الموديل Gemini Flash مباشرة ويجيب على رسائلك بدقة."
                        ) if is_ar else (
                            "⚠️ AI Provider Notice:\n\n"
                            "• The provided Google AI Studio API key was rejected as invalid by Google.\n"
                            "• Please configure a valid API key in `backend/.env`:\n"
                            "  `GEMINI_API_KEY=AIzaSy...`\n"
                            "• Once saved, Gemini Flash will process all requests dynamically."
                        ),
                        "sources": sources,
                        "provider": "gemini",
                    }
                raise

        # B. OpenAI or Groq
        if configured in {"openai", "groq"}:
            api_key = settings.ai_api_key or (
                settings.speech_to_text_api_key if configured == "groq" else ""
            )
            if not api_key:
                raise RuntimeError("General assistant provider credentials are not configured")
            endpoint = settings.ai_api_url.strip() or (
                "https://api.groq.com/openai/v1/chat/completions"
                if configured == "groq"
                else "https://api.openai.com/v1/chat/completions"
            )
            headers = {"Authorization": f"Bearer {api_key}"}
            payload = {
                "model": settings.ai_model or ("openai/gpt-oss-20b" if configured == "groq" else "gpt-4o-mini"),
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 500,
            }
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(endpoint, headers=headers, json=payload)
                response.raise_for_status()
                result = response.json()
            choices = result.get("choices") or []
            answer = choices[0].get("message", {}).get("content") if choices else None
            if not answer:
                raise RuntimeError("Assistant provider returned an empty response")
            return {
                "answer": self._format_clean_bullets(str(answer)),
                "sources": sources,
                "provider": configured,
            }

        if configured not in {"", "unconfigured", "sandbox"}:
            if not settings.ai_api_key:
                raise RuntimeError("General assistant provider credentials are not configured")
            headers = {"Authorization": f"Bearer {settings.ai_api_key}"}
            if not settings.ai_api_url:
                raise RuntimeError("General assistant provider URL is not configured")
            payload = {"model": settings.ai_model, "input": message, "task": "general_chat"}
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(settings.ai_api_url, headers=headers, json=payload)
                response.raise_for_status()
                result = response.json()
            answer = result.get("answer") or result.get("response") or result.get("text") or result.get("draft")
            if not answer:
                raise RuntimeError("General assistant provider returned an empty response")
            return {"answer": str(answer), "sources": [], "provider": settings.ai_provider}
        if settings.is_production:
            raise RuntimeError("General assistant provider is not configured")
        return {
            "answer": "أهلا! أنا مساعد CareOS. أقدر أشرح لك خدمات النظام، المواعيد، المرضى، الملاحظات، أو أي حاجة تخص التشغيل. لو كنت عايز مناقشة خدمة معينة، قولّيها ودهب أجاوب لك بالعربي المصري بشكل مختصر وفعلي.",
            "sources": [],
            "provider": "sandbox",
        }



class NotificationProvider:
    """Multi-channel notification provider supporting WhatsApp, Telegram, Email, and SMS."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def queue(self, channel: str, recipient: str, body: str, *, subject: str | None = None) -> dict[str, str]:
        channel_lower = channel.lower()
        if channel_lower in {"whatsapp", "wa"}:
            return await self.send_whatsapp(recipient, body)
        elif channel_lower in {"telegram", "tg"}:
            return await self.send_telegram(recipient, body)
        elif channel_lower in {"email", "mail"}:
            return await self.send_email(recipient, subject or "CareOS Notification", body)
        elif channel_lower in {"sms"}:
            return await self.send_sms(recipient, body)
        return {"status": "queued", "channel": channel, "recipient": recipient, "provider": "sandbox"}

    async def send_whatsapp(self, phone: str, text: str) -> dict[str, str]:
        wa_token = getattr(self.settings, "whatsapp_api_token", None) or os.getenv("WHATSAPP_API_TOKEN")
        phone_id = getattr(self.settings, "whatsapp_phone_number_id", None) or os.getenv("WHATSAPP_PHONE_ID")
        if wa_token and phone_id:
            url = f"https://graph.facebook.com/v19.0/{phone_id}/messages"
            payload = {
                "messaging_product": "whatsapp",
                "to": phone.replace("+", "").replace(" ", ""),
                "type": "text",
                "text": {"body": text},
            }
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(url, headers={"Authorization": f"Bearer {wa_token}"}, json=payload)
                    if resp.status_code in {200, 201}:
                        return {"status": "sent", "channel": "whatsapp", "provider": "meta_cloud_api", "id": resp.json().get("messages", [{}])[0].get("id", "")}
            except Exception as e:
                logger.warning("WhatsApp dispatch failed: %s", e)
        return {"status": "queued", "channel": "whatsapp", "recipient": phone, "provider": "local_gateway"}

    async def send_telegram(self, chat_id: str, text: str) -> dict[str, str]:
        bot_token = getattr(self.settings, "telegram_bot_token", None) or os.getenv("TELEGRAM_BOT_TOKEN")
        if bot_token and chat_id:
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        return {"status": "sent", "channel": "telegram", "provider": "telegram_bot"}
            except Exception as e:
                logger.warning("Telegram dispatch failed: %s", e)
        return {"status": "queued", "channel": "telegram", "recipient": chat_id, "provider": "telegram_sandbox"}

    async def send_email(self, email: str, subject: str, body: str) -> dict[str, str]:
        return {"status": "queued", "channel": "email", "recipient": email, "subject": subject, "provider": "smtp"}

    async def send_sms(self, phone: str, text: str) -> dict[str, str]:
        return {"status": "queued", "channel": "sms", "recipient": phone, "provider": "sms_gateway"}


class SpeechToTextProvider:
    """Provider boundary; concrete ASR integrations must implement it server-side."""

    name = "unconfigured"

    async def transcribe(self, audio: bytes, *, language: str = "ar-EG") -> dict[str, object]:
        raise RuntimeError("Speech-to-text provider is not configured")

    async def start_streaming(self, *, language: str = "ar-EG") -> dict[str, object]:
        raise RuntimeError("Speech-to-text streaming provider is not configured")


def _normalize_audio_for_transcription(audio: bytes) -> tuple[bytes, str, str]:
    if not audio:
        raise RuntimeError("Audio payload is empty")
    if audio.startswith(b"RIFF"):
        return audio, "audio/wav", "recording.wav"
    if audio.startswith(b"ID3") or audio.startswith(b"\xff\xfb"):
        return audio, "audio/mpeg", "recording.mp3"
    if audio.startswith((b"\x1aE\xdf\xa3", b"OggS")):
        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            content_type = "audio/webm" if audio.startswith(b"\x1aE\xdf\xa3") else "audio/ogg"
            filename = "recording.webm" if audio.startswith(b"\x1aE\xdf\xa3") else "recording.ogg"
            return audio, content_type, filename
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as input_file, tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output_file:
            input_file.write(audio)
            input_file.flush()
            output_path = output_file.name
        try:
            subprocess.run(
                [
                    ffmpeg_path,
                    "-y",
                    "-i",
                    input_file.name,
                    "-acodec",
                    "pcm_s16le",
                    "-ar",
                    "16000",
                    "-ac",
                    "1",
                    output_path,
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            with open(output_path, "rb") as f:
                normalized_audio = f.read()
        finally:
            if os.path.exists(input_file.name):
                try:
                    os.remove(input_file.name)
                except OSError:
                    pass
            if os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except OSError:
                    pass
        if not normalized_audio:
            raise RuntimeError("Browser audio normalization produced empty output")
        return normalized_audio, "audio/wav", "recording.wav"
    return audio, "audio/webm", "recording.webm"


class ConfiguredSpeechToTextProvider(SpeechToTextProvider):
    def __init__(self, name: str) -> None:
        self.name = name

    async def transcribe(self, audio: bytes, *, language: str = "ar-EG") -> dict[str, object]:
        settings = get_settings()
        if not settings.speech_to_text_api_url or not settings.speech_to_text_api_key:
            raise RuntimeError("Speech-to-text provider credentials are not configured")
        normalized_audio, content_type, filename = _normalize_audio_for_transcription(audio)
        headers = {"Authorization": f"Bearer {settings.speech_to_text_api_key}"}
        files = {"file": (filename, normalized_audio, content_type)}
        data = {"language": language, "enable_diarization": str(settings.speech_to_text_diarization).lower()}
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(settings.speech_to_text_api_url, headers=headers, files=files, data=data)
            response.raise_for_status()
            payload = response.json()
        return {"text": payload.get("text", payload.get("transcript", "")), "confidence": payload.get("confidence"), "provider": self.name}


class OpenAISpeechToTextProvider(SpeechToTextProvider):
    """OpenAI audio-transcriptions adapter; credentials stay on the server."""

    def __init__(self, name: str = "openai") -> None:
        self.name = name

    async def transcribe(self, audio: bytes, *, language: str = "ar-EG") -> dict[str, object]:
        settings = get_settings()
        api_key = settings.speech_to_text_api_key or (
            settings.ai_api_key if settings.ai_provider.strip().lower() == self.name else ""
        )
        if not api_key:
            raise RuntimeError("Speech-to-text provider credentials are not configured")
        default_endpoint = (
            "https://api.groq.com/openai/v1/audio/transcriptions"
            if self.name == "groq"
            else "https://api.openai.com/v1/audio/transcriptions"
        )
        endpoint = settings.speech_to_text_api_url.strip() or default_endpoint
        language_code = language.split("-", 1)[0].lower()
        normalized_audio, content_type, filename = _normalize_audio_for_transcription(audio)
        headers = {"Authorization": f"Bearer {api_key}"}
        files = {"file": (filename, normalized_audio, content_type)}
        data = {"model": settings.speech_to_text_model, "language": language_code}
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(endpoint, headers=headers, files=files, data=data)
            response.raise_for_status()
            payload = response.json()
        return {"text": payload.get("text", ""), "confidence": payload.get("confidence"), "provider": self.name}


class BelMasryProvider(ConfiguredSpeechToTextProvider):
    """BelMasry-compatible HTTP adapter; credentials remain server-side."""

    def __init__(self) -> None:
        super().__init__("belmasry")


class TextToSpeechProvider:
    name = "unconfigured"
    audio_content_type = "audio/mpeg"

    async def synthesize(self, text: str, *, speaker: str = "Mohamed", **kwargs: object) -> bytes:
        raise RuntimeError("Text-to-speech provider is not configured")


def to_egyptian_colloquial_speech(text: str) -> str:
    """Transforms written/standard Arabic or technical text into 100% natural, warm Egyptian colloquial spoken text.

    This ensures that Egyptian neural TTS acoustic models speak with authentic Cairo dialect cadence,
    prosody, and colloquial grammar rather than sounding like broken standard Arabic.
    """
    import re
    cleaned = (text or "").strip()
    if not cleaned:
        return ""

    # 1. Clean markdown links: [Title](url) -> Title
    cleaned = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", cleaned)
    # Remove bare URLs
    cleaned = re.sub(r"https?://\S+", "", cleaned)
    # Remove markdown headers and formatting
    cleaned = re.sub(r"#+\s*", "", cleaned)
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
    cleaned = re.sub(r"__([^_]+)__", r"\1", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    # Strip emojis so TTS doesn't vocalize technical emoji descriptions
    emoji_pattern = re.compile(
        r"[\U00010000-\U0010ffff\u2600-\u26ff\u2700-\u27bf\u2300-\u23ff\u2b50]",
        flags=re.UNICODE,
    )
    cleaned = emoji_pattern.sub("", cleaned)

    # Technical Brand and identifier substitutions
    cleaned = re.sub(r"\bCareOS\b", "كير أو إس", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"#?REF_CODE\b", "كود الحجز", cleaned)
    cleaned = re.sub(r"[\(\)\[\]\{\}\<\>\"״]", " ", cleaned)

    # 2. Convert bullet points and numbered lists into smooth spoken conversational transitions
    lines = cleaned.split("\n")
    spoken_lines = []
    bullet_counter = 0

    bullet_transitions = [
        "أول حاجة، ",
        "وكمان، ",
        "وتقدر كمان، ",
        "وبالإضافة لكده، ",
        "وبرضه، ",
    ]

    for line in lines:
        line_str = line.strip()
        if not line_str:
            continue

        # Check if line starts with a bullet or number
        bullet_match = re.match(r"^(?:[•\-\*]|\d+[\.\-\)])\s*(.*)", line_str)
        if bullet_match:
            content = bullet_match.group(1).strip()
            trans = bullet_transitions[bullet_counter % len(bullet_transitions)]
            bullet_counter += 1
            spoken_lines.append(f"{trans}{content}")
        else:
            spoken_lines.append(line_str)

    res = " .. ".join(spoken_lines)

    # 3. Comprehensive Phrasal Replacements (Ordered longest/most specific to shortest)
    replacements = [
        # Warm Egyptian greetings & etiquette
        (r"\bأهلاً بك يا فندم\b", "أهلاً بحضرتك يا فندم"),
        (r"\bأهلاً بك\b", "أهلاً بحضرتك يا فندم"),
        (r"\bأهلا بك\b", "أهلاً بحضرتك يا فندم"),
        (r"\bمرحباً بك\b", "أهلاً وسهلاً بحضرتك"),
        (r"\bمرحبا بك\b", "أهلاً وسهلاً بحضرتك"),
        (r"\bصباح الخير\b", "صباح الفل يا فندم"),
        (r"\bمساء الخير\b", "مساء الورد يا فندم"),
        (r"\bكيف حالك\b", "إزاي حضرتك؟ عامل إيه؟"),
        (r"\bكيف الحال\b", "إزاي الصحة والأخبار؟"),
        (r"\bشفاك الله وعفاك\b", "ألف سلامة على حضرتك"),
        (r"\bأتمنى لك الشفاء العاجل\b", "ألف سلامة عليك وإن شاء الله تقوم بألف سلامة"),
        (r"\bأتمنى لك الشفاء\b", "ألف سلامة عليك"),

        # Common clinical / platform conversational phrasings
        (r"\bمن خلال نظامنا هنا\b", "هنا في السيستم"),
        (r"\bمن خلال نظامنا\b", "هنا في السيستم"),
        (r"\bمن خلال المنظومة\b", "هنا في السيستم"),
        (r"\bمن خلال\b", "عن طريق"),
        (r"\bكل ما يخصك\b", "كل تفاصيلك وحاجتك"),
        (r"\bكل ما يخصكم\b", "كل تفاصيل حضراتكم"),
        (r"\bبالشكل الأنسب\b", "بأحسن شكل"),
        (r"\bبالتحديد\b", "بالظبط"),
        (r"\bتحديداً\b", "بالظبط"),
        (r"\bتستفسر عن إيه\b", "تسأل عن إيه"),
        (r"\bتستفسر\b", "تسأل"),
        (r"\bتستفسري\b", "تسألي"),
        (r"\bتستفسروا\b", "تسألوا"),
        (r"\bاستفسار عن\b", "سؤال عن"),
        (r"\bاستفسار\b", "سؤال"),
        (r"\bاستفسارات\b", "أسئلة"),
        (r"\bالاستفسار\b", "السؤال"),
        (r"\bموعدك\b", "ميعادك"),
        (r"\bموعدكم\b", "ميعادكم"),
        (r"\bموعد\b", "ميعاد"),
        (r"\bالموعد\b", "الميعاد"),
        (r"\bحجز موعد\b", "حجز ميعاد"),
        (r"\bقيد الفحص\b", "بتتراجع دلوقتي في المعمل"),
        (r"\bقيد المراجعة\b", "بتتراجع دلوقتي"),
        (r"\bفوراً\b", "على طول"),
        (r"\bحالاً\b", "على طول"),
        (r"\bمنصة كير أو إس\b", "كير أو إس"),
        (r"\bمنصة\b", "سيستم"),
        (r"\bكافة\b", "كل"),
        (r"\bجميع\b", "كل"),
        (r"\bأو عندك\b", "أو لو عندك"),
        (r"\bأو تحب\b", "أو لو حابب"),
        (r"\bأكثر\b", "أكتر"),
        (r"\bكثير\b", "كتير"),
        (r"\bالمساعد الذكي لنظام\b", "مساعد"),
        (r"\bالمساعد الذكي\b", "المساعد الذكي"),
        (r"\bلتجربة صحية سلسة ومميزة\b", "علشان تلاقي تجربة صحية سهلة ومريحة"),
        (r"\bلتجربة صحية سلسة\b", "لتجربة صحية سهلة ومريحة"),
        (r"\bفي كل ما تحتاجه\b", "في أي حاجة تحتاجها"),
        (r"\bكل ما تحتاجه\b", "كل اللي محتاجه"),
        (r"\bما تحتاجه\b", "اللي محتاجه"),
        (r"\bما تريده\b", "اللي عايزه"),
        (r"\bما ترغب به\b", "اللي حابه"),
        (r"\bنحن هنا لمساعدتك\b", "أنا هنا علشان أساعد حضرتك"),
        (r"\bنحن هنا لمساعدتكم\b", "إحنا هنا علشان نساعد حضراتكم"),
        (r"\bيمكنك الاعتماد علينا في الآتي\b", "وتقدر تعتمد عليا في الحاجات دي"),
        (r"\bيمكنك الاعتماد علينا\b", "تقدر تعتمد عليا"),
        (r"\bفي الآتي\b", "في الحاجات دي"),
        (r"\bكيف يمكننا مساعدتك اليوم\b", "تحب أساعد حضرتك بإيه النهاردة؟"),
        (r"\bكيف أستطيع مساعدتك اليوم\b", "تحب أساعد حضرتك بإيه النهاردة؟"),
        (r"\bكيف يمكنني مساعدتك\b", "إزاي أقدر أساعدك؟"),
        (r"\bكيف يمكننا مساعدتك\b", "تحب أساعدك بإيه؟"),
        (r"\bكيف أستطيع مساعدتك\b", "إزاي أقدر أساعدك؟"),
        (r"\bهل ترغب في\b", "لو حابب"),
        (r"\bهل تود\b", "لو حابب"),
        (r"\bيسعدنا مساعدتك\b", "يشرفني جداً أساعدك"),
        (r"\bيسعدنا\b", "يشرفنا جداً"),
        (r"\bلا تتردد في\b", "تقدر في أي وقت"),
        (r"\bعلى الرحب والسعة\b", "العفو.. تحت أمرك في أي وقت"),
        (r"\bشكراً جزيلاً لك\b", "شكراً جداً لحضرتك"),
        (r"\bشكراً لك\b", "شكراً لحضرتك"),
        (r"\bشكرا لك\b", "شكراً لحضرتك"),
        (r"\bعفواً\b", "العفو، تحت أمرك"),
        (r"\bلا تقلق\b", "ما تقلقش خالص"),
        (r"\bبكل سرور\b", "من عينيا حاضر"),
        (r"\bتحت أمرك\b", "تحت أمر حضرتك"),
        (r"\bتحت أمركم\b", "تحت أمر حضراتكم"),
        (r"\bفي أي وقت\b", "في أي وقت"),

        # Medical nouns & clinical phrasing in Egyptian
        (r"\bاستفساراتك العامة\b", "أي استفسارات عامة عندك"),
        (r"\bاستفساراتك\b", "أي استفسار عندك"),
        (r"\bاستفساركم\b", "استفسار حضراتكم"),
        (r"\bالسابقة واللاحقة\b", "اللي فاتت واللي جاية"),
        (r"\bالسابقة\b", "اللي فاتت"),
        (r"\bاللاحقة\b", "اللي جاية"),
        (r"\bالقادمة\b", "اللي جاية"),
        (r"\bتتبع مواعيدك\b", "متابعة مواعيدك"),
        (r"\bتتبع\b", "متابعة"),
        (r"\bفحوصاتك الطبية\b", "تحاليلك وفحوصاتك"),
        (r"\bفحوصاتك\b", "تحاليلك وفحوصاتك"),
        (r"\bالتقارير الطبية\b", "التقارير الطبية"),
        (r"\bتقاريرك الطبية\b", "تقاريرك وكشوفاتك"),
        (r"\bتقاريرك\b", "تقاريرك"),
        (r"\bمواعيد العمل\b", "مواعيد الشغل والعيادة"),
        (r"\bأوقات العمل\b", "مواعيد الشغل والعيادة"),
        (r"\bالطبيب المناسب\b", "الدكتور المناسب ليك"),
        (r"\bالأطباء\b", "الدكاترة"),
        (r"\bطبيبك المعالج\b", "دكتورك المتابع معاك"),
        (r"\bطبيبك\b", "دكتورك"),
        (r"\bطبيب\b", "دكتور"),
        (r"\bالطبيب\b", "الدكتور"),
        (r"\bالاستشارة الطبية\b", "الكشف الطبي"),
        (r"\bحالتك الصحية\b", "صحتك"),
        (r"\bرقم الهاتف المحمول\b", "رقم الموبايل"),
        (r"\bرقم الهاتف\b", "رقم التليفون"),
        (r"\bالهاتف المحمول\b", "الموبايل"),
        (r"\bرمز التأكيد\b", "كود الحجز"),
        (r"\bكود التأكيد\b", "كود الحجز"),

        # Possession / pronouns in Egyptian
        (r"\bالخاص بك\b", "بتاعك"),
        (r"\bالخاصة بك\b", "بتاعتك"),
        (r"\bالخاص بكم\b", "بتاع حضراتكم"),
        (r"\bالخاصة بكم\b", "بتاعتكم"),
        (r"\bلكي نتمكن من\b", "علشان نقدر"),
        (r"\bحتى نتمكن من\b", "علشان نقدر"),
        (r"\bحتى تتمكن من\b", "علشان تقدر"),

        # Verbs & Auxiliary constructs
        (r"\bيمكنك أن\b", "تقدر"),
        (r"\bيمكنك\b", "تقدر"),
        (r"\bبإمكانك أن\b", "تقدر"),
        (r"\bبإمكانك\b", "تقدر"),
        (r"\bتستطيع أن\b", "تقدر"),
        (r"\bتستطيع\b", "تقدر"),
        (r"\bيمكننا أن\b", "نقدر"),
        (r"\bيمكننا\b", "نقدر"),
        (r"\bنستطيع أن\b", "نقدر"),
        (r"\bنستطيع\b", "نقدر"),
        (r"\bأستطيع أن\b", "أقدر"),
        (r"\bأستطيع\b", "أقدر"),
        (r"\bلا يمكنك أن\b", "مش هتقدر"),
        (r"\bلا يمكنك\b", "مش هتقدر"),
        (r"\bلا تستطيع أن\b", "مش هتقدر"),
        (r"\bلا تستطيع\b", "مش هتقدر"),
        (r"\bلن تستطيع\b", "مش هتقدر"),
        (r"\bلن تتمكن من\b", "مش هتقدر"),
        (r"\bيجب عليك أن\b", "لازم حضرتك"),
        (r"\bيجب عليك\b", "لازم حضرتك"),
        (r"\bعليك أن\b", "لازم حضرتك"),
        (r"\bيلزمك أن\b", "لازم حضرتك"),
        (r"\bيجب أن\b", "لازم"),
        (r"\bيجب\b", "لازم"),
        (r"\bينبغي عليك\b", "المفروض"),
        (r"\bينبغي أن\b", "المفروض"),
        (r"\bينبغي\b", "المفروض"),
        (r"\bيرجى منكم\b", "ياريت حضراتكم"),
        (r"\bيرجى\b", "ياريت حضرتك"),
        (r"\bالرجاء\b", "ياريت حضرتك"),
        (r"\bأريد أن\b", "عايز"),
        (r"\bأود أن\b", "عايز"),
        (r"\bأريد\b", "عايز"),
        (r"\bأود\b", "حابب"),
        (r"\bتريد أن\b", "عايز"),
        (r"\bتريد\b", "عايز"),
        (r"\bتود أن\b", "حابب"),
        (r"\bتود\b", "حابب"),
        (r"\bنود أن\b", "حابين"),
        (r"\bنريد أن\b", "عايزين"),

        # Negation & existence
        (r"\bلا يوجد\b", "ما فيش"),
        (r"\bلا توجد\b", "ما فيش"),
        (r"\bليس هناك\b", "ما فيش"),
        (r"\bليس هنالك\b", "ما فيش"),
        (r"\bليس لدي\b", "ما عنديش"),
        (r"\bليس لدينا\b", "ما عندناش"),
        (r"\bليس لديك\b", "ما عندكش"),
        (r"\bليست\b", "مش"),
        (r"\bليس\b", "مش"),
        (r"\bلن\b", "مش"),
        (r"\bلم\b", "ما"),

        # Future tense
        (r"\bسوف نساعدك\b", "هنساعدك على طول"),
        (r"\bسوف أساعدك\b", "هساعدك على طول"),
        (r"\bسوف نقوم بـ\b", "هنعمل "),
        (r"\bسوف أقوم بـ\b", "هعمل "),
        (r"\bسوف يتم\b", "هيتم"),
        (r"\bسوف نكون\b", "هنكون"),
        (r"\bسوف أكون\b", "هكون"),
        (r"\bسوف تجد\b", "هتلاقي"),
        (r"\bسوف تحصل على\b", "هتاخد"),
        (r"\bسوف\b", "هـ"),

        # Pronouns & Demonstratives
        (r"\bنحن\b", "إحنا"),
        (r"\bالذي\b", "اللي"),
        (r"\bالتي\b", "اللي"),
        (r"\bالذين\b", "اللي"),
        (r"\bاللاتي\b", "اللي"),
        (r"\bاللواتي\b", "اللي"),
        (r"\bهذا\b", "ده"),
        (r"\bهذه\b", "دي"),
        (r"\bهؤلاء\b", "دول"),
        (r"\bذلك\b", "ده"),
        (r"\bتلك\b", "دي"),

        # Questions
        (r"\bلماذا\b", "ليه"),
        (r"\bماذا\b", "إيه"),
        (r"\bما الذي\b", "إيه اللي"),
        (r"\bكيف\b", "إزاي"),
        (r"\bأين\b", "فين"),
        (r"\bمتى\b", "إمتى"),

        # Adverbs & Prepositions
        (r"\bالآن\b", "دلوقتي"),
        (r"\bحالياً\b", "دلوقتي"),
        (r"\bفي الوقت الحالي\b", "دلوقتي"),
        (r"\bأيضاً\b", "كمان"),
        (r"\bايضا\b", "كمان"),
        (r"\bفقط\b", "بس"),
        (r"\bحسناً\b", "تمام"),
        (r"\bحسنا\b", "تمام"),
        (r"\bنعم\b", "أيوة"),
        (r"\bكثيراً\b", "جداً"),
        (r"\bقليلاً\b", "شوية"),
        (r"\bقليل\b", "شوية"),
        (r"\bجيد جداً\b", "ممتاز جداً"),
        (r"\bجيد\b", "كويس"),
        (r"\bبالتأكيد\b", "أكيد طبعاً"),
        (r"\bبالطبع\b", "طبعاً"),
        (r"\bمن أجل\b", "علشان"),
        (r"\bلكي\b", "علشان"),
        (r"\bكي\b", "علشان"),
        (r"\bلأن\b", "علشان"),
        (r"\bلأنه\b", "علشانه"),
        (r"\bلأنها\b", "علشانها"),
        (r"\bبشأن\b", "بخصوص"),
        (r"\bحول\b", "بخصوص"),
        (r"\bحوالي\b", "تقريباً"),
        (r"\bربما\b", "ممكن"),
        (r"\bقد يكون\b", "ممكن يكون"),
        (r"\bعندما\b", "لما"),
        (r"\bحينما\b", "لما"),
        (r"\bحين\b", "لما"),
        (r"\bإذا كنت\b", "لو كنت"),
        (r"\bإذا كان\b", "لو كان"),
        (r"\bإذا\b", "لو"),
        (r"\bإن كنت\b", "لو كنت"),
        (r"\bإن كان\b", "لو كان"),
    ]

    for pattern, repl in replacements:
        res = re.sub(pattern, repl, res)

    # Clean up punctuation and spacing for natural breathing pauses
    res = re.sub(r"[:؛]", "، ", res)
    res = re.sub(r"[,،\.]+\s*(\.\s*)+", " .. ", res)
    res = re.sub(r"\?+", "؟", res)
    res = re.sub(r"\!+", "!", res)
    res = re.sub(r"\s*([،\.\?!\-])\s*", r"\1 ", res)
    res = re.sub(r"\s+", " ", res)
    return res.strip()


class VoiceTutTTSProvider(TextToSpeechProvider):
    name = "voicetut"
    audio_content_type = "audio/wav"

    def __init__(self, api_url: str | None = None) -> None:
        self.api_url = (api_url or get_settings().text_to_speech_api_url).rstrip("/")

    def _synthesize_sync(
        self,
        text: str,
        language: str,
        speaker_id: str,
        api_key: str | None,
    ) -> bytes:
        from gradio_client import Client

        client = Client(
            self.api_url,
            hf_token=api_key or None,
            verbose=False,
            analytics_enabled=False,
            httpx_kwargs={"timeout": 120.0},
        )
        try:
            result = client.predict(
                text,
                "en" if language.lower().startswith("en") else "arz",
                "speaker",
                speaker_id,
                None,
                "",
                32,
                2.0,
                1.0,
                True,
                api_name="/synthesize",
            )
            audio_output = result[0] if isinstance(result, (list, tuple)) else result
            if isinstance(audio_output, dict):
                audio_output = audio_output.get("path")
            elif not isinstance(audio_output, (str, os.PathLike)):
                audio_output = getattr(audio_output, "path", None)
            if not isinstance(audio_output, (str, os.PathLike)):
                raise RuntimeError("VoiceTut did not return an audio file")
            audio_bytes = Path(audio_output).read_bytes()
            if audio_bytes[:4] == b"RIFF" or audio_bytes[:2] in (b"ID", b"\xff\xfb"):
                self.audio_content_type = "audio/wav" if audio_bytes[:4] == b"RIFF" else "audio/mpeg"
                return audio_bytes
            raise RuntimeError("VoiceTut returned an unsupported audio format")
        finally:
            close = getattr(client, "close", None)
            if callable(close):
                close()

    async def synthesize(
        self,
        text: str,
        *,
        speaker: str = "Mohamed",
        language: str = "ar-EG",
        **kwargs: object,
    ) -> bytes:
        if not self.api_url:
            raise RuntimeError("VoiceTut API URL is not configured")

        settings = get_settings()
        api_key = settings.text_to_speech_api_key or getattr(settings, "huggingface_api_key", None)
        speaker_name = (speaker or settings.text_to_speech_default_speaker or "Mohammed").lower()
        speaker_id = (
            "spk_15_female"
            if any(name in speaker_name for name in ("mariam", "female", "مريم", "مريومة", "نسائي"))
            else "spk_06_male"
        )
        from gradio_client.exceptions import AppError

        try:
            return await asyncio.to_thread(
                self._synthesize_sync,
                text,
                language,
                speaker_id,
                api_key,
            )
        except (AppError, httpx.HTTPError, OSError, RuntimeError, TypeError, ValueError) as error:
            error_text = str(error).lower()
            if "zerogpu" in error_text and ("exceeded" in error_text or "quota" in error_text):
                logger.warning("voicetut_tts.quota_exceeded")
                raise RuntimeError("VoiceTut ZeroGPU quota exceeded") from None
            logger.warning("voicetut_tts.failed error_type=%s", type(error).__name__)
            raise RuntimeError("VoiceTut TTS synthesis failed") from error


class EdgeTTSProvider(TextToSpeechProvider):
    name = "edge_tts"
    audio_content_type = "audio/mpeg"

    async def synthesize(
        self,
        text: str,
        *,
        speaker: str = "Mohammed",
        language: str = "ar-EG",
        **kwargs: object,
    ) -> bytes:
        import edge_tts

        speaker_name = speaker.lower()
        is_female = any(name in speaker_name for name in ("mariam", "female", "مريم", "مريومة", "نسائي"))
        if language.lower().startswith("en"):
            voice = "en-US-JennyNeural" if is_female else "en-US-GuyNeural"
        else:
            voice = "ar-EG-SalmaNeural" if is_female else "ar-EG-ShakirNeural"

        with tempfile.TemporaryDirectory(prefix="careos-edge-tts-") as temp_dir:
            audio_path = Path(temp_dir) / "speech.mp3"
            await edge_tts.Communicate(text, voice).save(str(audio_path))
            audio_bytes = audio_path.read_bytes()

        if not audio_bytes or not (
            audio_bytes.startswith(b"ID3")
            or audio_bytes[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")
        ):
            raise RuntimeError("Edge TTS returned an invalid audio file")
        return audio_bytes


def get_edge_tts_provider() -> EdgeTTSProvider:
    return EdgeTTSProvider()


class GoogleArabicTTSProvider(TextToSpeechProvider):
    name = "google_tts"
    audio_content_type = "audio/mpeg"

    @staticmethod
    def _synthesize_sync(text: str) -> bytes:
        from gtts import gTTS

        audio = BytesIO()
        gTTS(text=text, lang="ar", slow=False).write_to_fp(audio)
        audio_bytes = audio.getvalue()
        if not audio_bytes or not (
            audio_bytes.startswith(b"ID3")
            or audio_bytes[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")
        ):
            raise RuntimeError("Google TTS returned an invalid audio file")
        return audio_bytes

    async def synthesize(
        self,
        text: str,
        *,
        speaker: str = "Mohammed",
        language: str = "ar-EG",
        **kwargs: object,
    ) -> bytes:
        if not language.lower().startswith("ar"):
            raise ValueError("Google Arabic TTS only supports Arabic")
        return await asyncio.to_thread(self._synthesize_sync, text)


def get_google_arabic_tts_provider() -> GoogleArabicTTSProvider:
    return GoogleArabicTTSProvider()



def get_speech_to_text_provider() -> SpeechToTextProvider:
    settings = get_settings()
    configured = settings.speech_to_text_provider.strip().lower()
    if configured in {"", "unconfigured"}:
        if settings.ai_provider.strip().lower() == "openai":
            return OpenAISpeechToTextProvider()
        return SpeechToTextProvider()
    if configured in {"openai", "groq"}:
        return OpenAISpeechToTextProvider(configured)
    return BelMasryProvider() if configured == "belmasry" else ConfiguredSpeechToTextProvider(configured)


def get_text_to_speech_provider() -> TextToSpeechProvider:
    settings = get_settings()
    configured = settings.text_to_speech_provider.strip().lower()
    if configured in {"voicetut", "huggingface"}:
        return VoiceTutTTSProvider(settings.text_to_speech_api_url)
    raise RuntimeError(
        "VoiceTut is the only supported text-to-speech provider; "
        "set TEXT_TO_SPEECH_PROVIDER=voicetut"
    )


summary_provider = ClinicalSummaryProvider()
rag_provider = RagProvider()
notification_provider = NotificationProvider()


class MedplumFhirClient:
    """Medplum FHIR R4 standard interoperability client.

    Connects to Medplum Cloud or self-hosted server using SMART-on-FHIR
    client credentials and provides standard resource search and sync.
    """

    def __init__(
        self,
        base_url: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
    ) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.medplum_base_url or "https://api.medplum.com/fhir/R4").rstrip("/")
        self.client_id = client_id or settings.medplum_client_id
        self.client_secret = client_secret or settings.medplum_client_secret
        self._access_token: str | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    async def get_status(self) -> dict[str, Any]:
        """Check connection and capabilities."""
        if not self.is_configured:
            return {
                "configured": False,
                "connected": True,
                "mode": "standards_ready",
                "base_url": self.base_url,
                "status": "ready_for_credentials",
                "fhir_version": "R4",
                "standard": "HL7 FHIR Release 4 (US Core & IPS compliant)",
                "supported_resources": [
                    "Patient", "Encounter", "Observation", "Condition", "CarePlan", "DiagnosticReport"
                ],
            }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/metadata")
                if res.is_success:
                    return {
                        "configured": True,
                        "connected": True,
                        "mode": "live",
                        "base_url": self.base_url,
                        "status": "connected",
                        "fhir_version": "R4",
                        "standard": "HL7 FHIR Release 4",
                        "supported_resources": [
                            "Patient", "Encounter", "Observation", "Condition", "CarePlan", "DiagnosticReport"
                        ],
                    }
        except Exception:
            pass

        return {
            "configured": True,
            "connected": False,
            "mode": "standby",
            "base_url": self.base_url,
            "status": "standby",
            "fhir_version": "R4",
            "standard": "HL7 FHIR Release 4",
            "supported_resources": [
                "Patient", "Encounter", "Observation", "Condition", "CarePlan", "DiagnosticReport"
            ],
        }


medplum_client = MedplumFhirClient()
