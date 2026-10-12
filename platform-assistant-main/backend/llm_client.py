import httpx
import json
from typing import List, Dict, Any, AsyncGenerator
from backend.config import API_KEY, BASE_URL, MODEL, SIGNIN_URL, SIGNUP_URL
from backend.rag_engine import rag_engine

class LLMClient:
    def __init__(self):
        self.reload()

    def reload(self):
        import backend.config as cfg
        self.api_key = cfg.API_KEY
        self.base_url = cfg.BASE_URL.rstrip("/")
        self.model = cfg.MODEL

    def is_configured(self) -> bool:
        self.reload()
        return bool(self.api_key and self.api_key not in ["GROQ_API_KEY", "your_groq_api_key_here"])

    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
        max_tokens: int = 1000
    ) -> str:
        last_user_message = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        system_prompt = rag_engine.build_system_prompt(last_user_message)

        # Build full payload
        payload_messages = [{"role": "system", "content": system_prompt}] + messages

        # Check if configured
        if not self.is_configured():
            retrieved = rag_engine.retrieve(last_user_message, top_k=2)
            summary = "\n\n".join([f"**{c.get('title')}**\n{c.get('content')}" for c in retrieved])
            
            is_arabic = any("\u0600" <= ch <= "\u06FF" for ch in last_user_message)
            is_asking_signin = any(w in last_user_message.lower() for w in ["دخول", "تسجيل", "signin", "login", "register", "signup", "رابط"])

            links_section_ar = f"\n\n🔗 [تسجيل الدخول إلى CareOS]({SIGNIN_URL})\n🔗 [الصفحة الرئيسية والتسجيل]({SIGNUP_URL})" if is_asking_signin else ""
            links_section_en = f"\n\n🔗 [Sign In to CareOS]({SIGNIN_URL})\n🔗 [Get Started / Register]({SIGNUP_URL})" if is_asking_signin else ""

            if is_arabic:
                return (
                    f"{summary}{links_section_ar}\n\n"
                    f"> ⚠️ **تنبيه:** لم يتم العثور على مفتاح Groq API في ملف `.env`، لذا يتم عرض الإجابة من قاعدة المعرفة مباشرة. "
                    f"لتفعيل التوليد الذكي بواسطة نموذج `{self.model}`، يرجى وضع الـ API Key في ملف `.env`."
                )
            else:
                return (
                    f"{summary}{links_section_en}\n\n"
                    f"> ⚠️ **Notice:** Groq API key is not yet set in `.env` (currently serving directly from indexed knowledge). "
                    f"To activate live AI generation with `{self.model}`, please add your key to `.env`."
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
                return content
            except httpx.HTTPStatusError as e:
                error_detail = e.response.text
                return (
                    f"⚠️ Error from model provider ({e.response.status_code}): {error_detail}\n\n"
                    f"Please verify your `API_KEY`, `BASE_URL` (`{self.base_url}`), and `MODEL` (`{self.model}`) in `.env`."
                )
            except Exception as e:
                return f"⚠️ Connection error: {str(e)}"

llm_client = LLMClient()
