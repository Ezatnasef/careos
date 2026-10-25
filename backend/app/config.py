import os
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_ROOT.parent
DEFAULT_DB_PATH = BACKEND_ROOT / "careos.db"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        enable_decoding=False,
        env_file=(
            REPO_ROOT / ".env",
            BACKEND_ROOT / ".env",
            REPO_ROOT / "voice-agent" / ".env",
            REPO_ROOT / "voice-agent" / "voice_agent" / ".env",
        ),
        extra="ignore",
    )
    app_env: str = "development"
    app_name: str = "careos-api"
    deployment_name: str = "careos-local"
    api_prefix: str = "/api/v1"
    app_url: str = "http://localhost:5173"
    log_level: str = "INFO"
    metrics_enabled: bool = True
    database_url: str = f"sqlite+aiosqlite:///{DEFAULT_DB_PATH.as_posix()}"
    secret_key: str = "development-only-change-this-secret"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    demo_login_enabled: bool = False
    speech_to_text_provider: str = "unconfigured"
    speech_to_text_api_url: str = ""
    speech_to_text_api_key: str = ""
    speech_to_text_model: str = "gpt-4o-mini-transcribe"
    speech_to_text_language: str = "ar-EG"
    speech_to_text_diarization: bool = True
    text_to_speech_provider: str = "voicetut"
    text_to_speech_api_url: str = ""
    text_to_speech_api_key: str = ""
    text_to_speech_model_id: str = ""
    text_to_speech_default_speaker: str = "Mohamed"
    huggingface_api_key: str = ""
    ai_provider: str = "gemini"
    ai_api_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    ai_api_key: str = ""
    ai_model: str = "gemini-3.8-flash"
    llm_api_key: str = ""
    google_api_key: str = ""
    audio_retention_days: int = 30
    oidc_issuer_url: str = ""
    oidc_client_id: str = ""
    oidc_audience: str = ""
    oidc_client_secret: str = ""
    saml_metadata_url: str = ""
    audit_retention_days: int = 2555
    backup_bucket: str = ""
    backup_region: str = ""
    medplum_base_url: str = "https://api.medplum.com/fhir/R4"
    medplum_client_id: str = ""
    medplum_client_secret: str = ""
    medplum_project_id: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_tls: bool = True
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    email_max_retries: int = 3
    email_retry_backoff_seconds: float = 0.5
    auth_rate_limit_requests: int = 60
    auth_rate_limit_window_seconds: int = 60
    max_upload_bytes: int = 25 * 1024 * 1024
    allowed_upload_content_types: list[str] = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
        "audio/wav",
        "audio/mpeg",
        "image/png",
        "image/jpeg",
        "image/webp",
    ]
    storage_backend: str = "filesystem"
    storage_local_root: str = ""
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    storage_prefix: str = "careos"
    ocr_default_engine: str = "printed"
    ocr_language: str = "ar"
    handwriting_ocr_model: str = "sherif1313/Arabic-handwritten-OCR-4bit-Qwen2.5-VL-3B-v3"
    handwriting_ocr_device: str = "auto"
    vector_top_k: int = 8
    rag_top_k: int = 8
    rag_relevance_threshold: float = 0.55
    rag_embedding_model: str = "intfloat/multilingual-e5-small"
    rag_allow_model_download: bool = False
    legacy_rag_db_path: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    openai_model: str = "gemini-3.8-flash"
    openai_timeout_seconds: float = 45.0
    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    gemini_model: str = "gemini-3.8-flash"
    sso_allowed_redirect_hosts: list[str] = ["localhost", "127.0.0.1", "[::1]", "careos.example.com"]
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "[::1]", "testserver"]
    telegram_bot_token: str | None = None
    telegram_bot_username: str = "CareOS_HealthBot"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str | None) -> str:
        if not value or not value.strip():
            return f"sqlite+aiosqlite:///{DEFAULT_DB_PATH.as_posix()}"
        raw = value.strip()
        # Resolve relative sqlite paths (e.g. sqlite+aiosqlite:///./careos.db) relative to BACKEND_ROOT
        if raw.startswith("sqlite+aiosqlite:///./") or raw.startswith("sqlite:///./"):
            scheme, rel_part = raw.split(":///./", 1)
            resolved = (BACKEND_ROOT / rel_part).resolve().as_posix()
            return f"{scheme}:///{resolved}"
        return raw

    @field_validator("cors_origins", "allowed_hosts", "sso_allowed_redirect_hosts", "allowed_upload_content_types", mode="before")
    @classmethod
    def split_list(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def validate_production_secret(self) -> "Settings":
        if not self.api_prefix.startswith("/"):
            raise ValueError("API_PREFIX must start with '/' (e.g. /api/v1)")
        if self.storage_backend.lower() not in {"filesystem", "s3"}:
            raise ValueError("STORAGE_BACKEND must be either 'filesystem' or 's3'")
        if self.is_production and self.secret_key in {"", "development-only-change-this-secret", "replace-with-a-long-random-secret"}:
            raise ValueError("SECRET_KEY must be configured with a strong secret in production")
        if self.is_production and self.database_url.startswith("sqlite"):
            raise ValueError("Production requires PostgreSQL; SQLite is development-only")
        return self

    @classmethod
    def _from_env(cls):
        raw = dict(os.environ)
        if raw.get("TEXT_TO_SPEECH_MODEL_ID") and not raw.get("TTS_MODEL_ID"):
            raw["TTS_MODEL_ID"] = raw["TEXT_TO_SPEECH_MODEL_ID"]
        if raw.get("TTS_MODEL_ID") and not raw.get("TEXT_TO_SPEECH_MODEL_ID"):
            raw["TEXT_TO_SPEECH_MODEL_ID"] = raw["TTS_MODEL_ID"]
        if raw.get("VOICE_TUT_SPEAKER") and not raw.get("TEXT_TO_SPEECH_DEFAULT_SPEAKER"):
            raw["TEXT_TO_SPEECH_DEFAULT_SPEAKER"] = raw["VOICE_TUT_SPEAKER"]
        if raw.get("TEXT_TO_SPEECH_DEFAULT_SPEAKER") and not raw.get("VOICE_TUT_SPEAKER"):
            raw["VOICE_TUT_SPEAKER"] = raw["TEXT_TO_SPEECH_DEFAULT_SPEAKER"]
        return cls(**raw)

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def VECTOR_TOP_K(self) -> int:
        return self.vector_top_k

    @property
    def RAG_RELEVANCE_THRESHOLD(self) -> float:
        return self.rag_relevance_threshold

    @property
    def OPENAI_API_KEY(self) -> str | None:
        return self.openai_api_key or self.ai_api_key or None

    @property
    def OPENAI_BASE_URL(self) -> str:
        return self.openai_base_url or self.ai_api_url

    @property
    def OPENAI_MODEL(self) -> str:
        return self.openai_model or self.ai_model

    @property
    def OPENAI_TIMEOUT_SECONDS(self) -> float:
        return self.openai_timeout_seconds

    @property
    def GEMINI_API_KEY(self) -> str | None:
        key = (
            os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
            or os.environ.get("AI_API_KEY")
            or os.environ.get("LLM_API_KEY")
            or self.gemini_api_key
            or self.google_api_key
            or self.ai_api_key
            or self.llm_api_key
            or None
        )
        return key.strip() if key and key.strip() else None

    @property
    def GEMINI_BASE_URL(self) -> str:
        return self.gemini_base_url or self.ai_api_url

    @property
    def GEMINI_MODEL(self) -> str:
        return self.gemini_model or self.ai_model


@lru_cache
def get_settings() -> Settings:
    env = os.environ
    if env.get("TEXT_TO_SPEECH_MODEL_ID") and not env.get("TTS_MODEL_ID"):
        env["TTS_MODEL_ID"] = env["TEXT_TO_SPEECH_MODEL_ID"]
    if env.get("TTS_MODEL_ID") and not env.get("TEXT_TO_SPEECH_MODEL_ID"):
        env["TEXT_TO_SPEECH_MODEL_ID"] = env["TTS_MODEL_ID"]
    if env.get("VOICE_TUT_SPEAKER") and not env.get("TEXT_TO_SPEECH_DEFAULT_SPEAKER"):
        env["TEXT_TO_SPEECH_DEFAULT_SPEAKER"] = env["VOICE_TUT_SPEAKER"]
    if env.get("TEXT_TO_SPEECH_DEFAULT_SPEAKER") and not env.get("VOICE_TUT_SPEAKER"):
        env["VOICE_TUT_SPEAKER"] = env["TEXT_TO_SPEECH_DEFAULT_SPEAKER"]
    return Settings()


class _SettingsProxy:
    def __getattr__(self, name: str):
        return getattr(get_settings(), name)


settings: Settings = _SettingsProxy()  # type: ignore[assignment]
