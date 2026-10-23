import httpx
import json
from typing import List, Dict, Any, AsyncGenerator
from backend.config import API_KEY, BASE_URL, MODEL, SIGNIN_URL, SIGNUP_URL
from backend.rag_engine import rag_engine

class LLMClient:
    def __init__(self):
        self.active_model: str | None = None
        self.reload()

    def reload(self):
        import backend.config as cfg
        api_key = cfg.API_KEY
        base_url = cfg.BASE_URL.rstrip("/")
        model = cfg.MODEL
        configuration = (api_key, base_url, model)
        if getattr(self, "_configuration", None) != configuration:
            self.active_model = None
        self._configuration = configuration
        self.api_key = api_key
        self.base_url = base_url
        self.model = model

    def is_configured(self) -> bool:
        self.reload()
        return bool(self.api_key and self.api_key not in ["GROQ_API_KEY", "your_groq_api_key_here"])

    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
        max_tokens: int = 1000,
        knowledge_chunks: List[Dict[str, Any]] | None = None,
    ) -> str:
        last_user_message = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        if knowledge_chunks is None:
            knowledge_chunks = rag_engine.retrieve(
                last_user_message,
                top_k=4,
                include_fallback=False,
            )
        system_prompt = rag_engine.build_system_prompt(
            last_user_message,
            relevant_chunks=knowledge_chunks,
        )

        # Build full payload
        payload_messages = [{"role": "system", "content": system_prompt}] + messages

        configured = self.is_configured()
        self.active_model = None
        if not configured:
            if not knowledge_chunks:
                is_arabic = any("\u0600" <= ch <= "\u06FF" for ch in last_user_message)
                if is_arabic:
                    return (
                        "مش لاقي معلومة موثقة عن السؤال ده في قاعدة المعرفة، ومفيش نموذج LLM "
                        "متوصل حاليًا عشان أبحث عن إجابة أوسع."
                    )
                return (
                    "I couldn't find verified information for this question in the knowledge base, "
                    "and no LLM provider is currently configured for a broader answer."
                )

            summary = "\n\n".join(
                f"**{chunk.get('title')}**\n{chunk.get('content')}"
                for chunk in knowledge_chunks[:2]
            )

            is_arabic = any("\u0600" <= ch <= "\u06FF" for ch in last_user_message)
            is_asking_signin = any(w in last_user_message.lower() for w in ["دخول", "تسجيل", "signin", "login", "register", "signup", "رابط"])

            links_section_ar = f"\n\n🔗 [تسجيل الدخول إلى CareOS]({SIGNIN_URL})\n🔗 [الصفحة الرئيسية والتسجيل]({SIGNUP_URL})" if is_asking_signin else ""
            links_section_en = f"\n\n🔗 [Sign In to CareOS]({SIGNIN_URL})\n🔗 [Get Started / Register]({SIGNUP_URL})" if is_asking_signin else ""

            if is_arabic:
                return (
                    f"{summary}{links_section_ar}\n\n"
                    f"> ⚠️ **تنبيه:** يتم عرض المعلومات من قاعدة المعرفة مباشرة؛ لا يوجد مزود LLM مفعّل حاليًا "
                    f"لصياغة إجابة مولّدة بواسطة `{self.model}`."
                )
            else:
                return (
                    f"{summary}{links_section_en}\n\n"
                    f"> ⚠️ **Notice:** This answer came directly from the knowledge base; no LLM provider is "
                    f"currently enabled to generate a response with `{self.model}`."
                )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # OpenRouter specific headers if using OpenRouter
        if "openrouter.ai" in self.base_url:
            headers["HTTP-Referer"] = "https://careos-pearl.vercel.app"
            headers["X-Title"] = "CareOS Platform Assistant"

        body = {
            "model": self.model,
            "messages": payload_messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        url = f"{self.base_url}/chat/completions"

        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                response = await client.post(url, headers=headers, json=body)
                response.raise_for_status()
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                self.active_model = body["model"]
                return content
            except httpx.HTTPStatusError as e:
                if (
                    e.response.status_code == 404
                    and "generativelanguage.googleapis.com" in self.base_url
                    and self.model != "gemini-3.8-flash"
                ):
                    fallback_model = "gemini-3.8-flash"
                    fallback_body = {**body, "model": fallback_model}
                    fallback_error_detail = ""
                    try:
                        fallback_response = await client.post(url, headers=headers, json=fallback_body)
                        fallback_response.raise_for_status()
                        content = fallback_response.json()["choices"][0]["message"]["content"]
                        self.active_model = fallback_model
                        return content
                    except httpx.HTTPStatusError as fallback_error:
                        fallback_error_detail = fallback_error.response.text
                    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
                        pass
                else:
                    fallback_error_detail = ""
                error_detail = fallback_error_detail or e.response.text
                return (
                    f"⚠️ Error from model provider ({e.response.status_code}): {error_detail}\n\n"
                    f"Please verify your `API_KEY`, `BASE_URL` (`{self.base_url}`), and `MODEL` (`{self.model}`) in `.env`."
                )
            except Exception as e:
                return f"⚠️ Connection error: {str(e)}"

llm_client = LLMClient()
