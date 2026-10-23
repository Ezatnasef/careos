import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env
env_path = BASE_DIR / ".env"
load_dotenv(dotenv_path=env_path, override=True)
load_dotenv(dotenv_path=BASE_DIR.parent / "backend" / ".env", override=False)

def configured_api_key(name: str) -> str:
    key = os.getenv(name, "").strip()
    if key.casefold().startswith("your_") or key in {
        "GROQ_API_KEY",
        "your_groq_api_key_here",
        "your_api_key_here",
        "your_grok_api_key_here",
    }:
        return ""
    return key

GEMINI_API_KEY = configured_api_key("GEMINI_API_KEY")
API_KEY = next(
    (
        key
        for key in (
            configured_api_key("GROQ_API_KEY"),
            configured_api_key("LLM_API_KEY"),
            configured_api_key("OPENROUTER_API_KEY"),
            configured_api_key("OPENAI_API_KEY"),
            GEMINI_API_KEY,
        )
        if key
    ),
    "",
)
USING_GEMINI = bool(GEMINI_API_KEY and API_KEY == GEMINI_API_KEY)

# Determine model and endpoint for the selected provider.
if USING_GEMINI:
    MODEL = (
        os.getenv("GEMINI_MODEL")
        or os.getenv("LLM_MODEL")
        or "gemini-3.8-flash"
    ).strip()
    BASE_URL = (
        os.getenv("GEMINI_BASE_URL")
        or "https://generativelanguage.googleapis.com/v1beta/openai"
    ).strip()
else:
    MODEL = (
        os.getenv("GROQ_MODEL")
        or os.getenv("LLM_MODEL")
        or "llama-3.3-70b-versatile"
    ).strip()
    BASE_URL = (
        os.getenv("GROQ_BASE_URL")
        or os.getenv("LLM_BASE_URL")
        or ""
    ).strip()

    if not BASE_URL:
        if API_KEY.startswith("gsk_") or "groq" in MODEL.lower():
            BASE_URL = "https://api.groq.com/openai/v1"
        elif "openrouter" in API_KEY or "/" in MODEL:
            BASE_URL = "https://openrouter.ai/api/v1"
        elif API_KEY.startswith("xai-"):
            BASE_URL = "https://api.x.ai/v1"
        else:
            BASE_URL = "https://api.groq.com/openai/v1"

# Deep Link URLs
PLATFORM_BASE_URL = os.getenv("PLATFORM_BASE_URL", "https://careos-pearl.vercel.app").rstrip("/")
SIGNIN_URL = os.getenv("SIGNIN_URL", f"{PLATFORM_BASE_URL}/signin")
SIGNUP_URL = os.getenv("SIGNUP_URL", f"{PLATFORM_BASE_URL}/")

# Server Config
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))

# Knowledge Base Path
KNOWLEDGE_FILE = BASE_DIR / "knowledge" / "knowledge_chunks.json"
