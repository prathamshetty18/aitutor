import sys
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent


def _fail(reason: str) -> None:
    print(f"FATAL: {reason}", file=sys.stderr)
    raise SystemExit(1)


class Settings(BaseSettings):
    # Server & CORS
    FRONTEND_ORIGIN: str = Field(default="http://localhost:3000")
    ENVIRONMENT: str = Field(default="development")

    # PostgreSQL
    DATABASE_URL: str = Field(default="postgresql://localhost:5432/harmony")

    # Institutional access control
    ALLOWED_EMAIL_DOMAINS: str = Field(default="nmamit.in")
    REQUIRE_INSTITUTIONAL_DOMAIN: bool = Field(default=True)

    # JWT (backend-issued session tokens)
    JWT_SECRET_KEY: str = Field(
        default="aitutor_production_jwt_secret_key_2026_super_secure_string_key"
    )
    JWT_ALGORITHM: str = Field(default="HS256")

    # Google OAuth (direct — no Supabase)
    GOOGLE_CLIENT_ID: str = Field(default="")
    GOOGLE_CLIENT_SECRET: str = Field(default="")
    GOOGLE_CALLBACK_URL: str = Field(
        default="http://localhost:8000/api/auth/google/callback"
    )

    # LLM & Groq
    GROQ_API_KEY: str = Field(default="")
    GROQ_MODEL: str = Field(default="qwen/qwen3.8-27b")
    GROQ_FORCE_FALLBACK: bool = Field(default=False)

    # Distress Detection
    SENTIMENT_THRESHOLD: float = Field(default=-0.2)
    ROLLING_WINDOW_DAYS: int = Field(default=7)
    HOD_EMAIL: str = Field(default="hod_counselor@university.edu")

    # Audio Settings
    ACCEPTED_AUDIO_FORMATS: str = Field(default="wav")
    WHISPER_MODEL: str = Field(default="base")
    EMBEDDING_MODEL: str = Field(default="all-MiniLM-L6-v2")

    # File Paths
    PROMPTS_DIR: str = Field(default=str(BASE_DIR / "prompts"))
    RESOURCES_JSON_PATH: str = Field(default=str(BASE_DIR / "resources.json"))
    SEED_JSON_PATH: str = Field(default=str(BASE_DIR / "seed.json"))
    FALLBACK_RESPONSES_PATH: str = Field(default=str(BASE_DIR / "fallback_responses.json"))
    ALERT_TEMPLATE_PATH: str = Field(default=str(BASE_DIR / "alert_template.txt"))
    ALERTS_LOG_PATH: str = Field(default=str(BASE_DIR / "alerts.log"))

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()


def validate_boot() -> None:
    is_prod = settings.ENVIRONMENT.lower() == "production"

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        print(
            "WARNING: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — "
            "Google OAuth will fall back to local dev sessions.",
            file=sys.stderr,
        )

    if not settings.JWT_SECRET_KEY or len(settings.JWT_SECRET_KEY) < 32:
        print(
            "WARNING: JWT_SECRET_KEY is short or missing. Using fallback secret key.",
            file=sys.stderr,
        )



validate_boot()
