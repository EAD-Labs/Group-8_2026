"""
Central settings. Change behaviour here, not scattered through the code.

Everything that's likely to change as the HLD changes (which LLM providers,
whether voice is on, DB location, checkpoint blocking rules) is a setting,
not a hardcoded value, so future HLD revisions mostly mean editing this file
plus content/modules.json rather than touching route/service code.
"""
from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    # --- environment ---
    env: Literal["dev", "staging", "prod"] = "dev"

    # --- database ---
    # dev default: sqlite, zero setup. Point this at postgres for real use
    # (matches HLD 8.4 - "Cloud managed PostgreSQL with the backend host").
    database_url: str = "sqlite:///./aikyro_dev.db"

    # --- auth ---
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # --- AI providers ---
    # "mock" runs the whole pipeline with canned/templated responses so the
    # app is fully demoable with no API keys. Set llm_mode=live in a .env
    # file once you've added your keys below and it starts calling real
    # providers — nothing else in the codebase needs to change.
    llm_mode: Literal["mock", "live"] = "mock"
    llm_providers: list[str] = ["anthropic", "openai"]  # order = preference for judge/grading calls, HLD 10.4 wants >=2

    # API keys — leave unset to keep a provider mocked even in "live" mode
    # (each provider fails gracefully and independently, HLD 10.4). Put
    # these in backend/.env, never commit real keys.
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None

    # Model names are deliberately settings, not hardcoded — provider
    # lineups change faster than this codebase should need to.
    anthropic_model: str = "claude-sonnet-5"
    openai_model: str = "gpt-4o-mini"
    llm_request_timeout_seconds: float = 30.0

    # --- voice / speech signal ---
    # HLD 6.3 / 10.6: speech is the one committed multimodal signal.
    # This flag exists so it can be killed instantly if D1's feasibility
    # spike fails, without ripping code out — see services/speech_signal_service.py
    voice_enabled: bool = True
    speech_provider: Literal["ai4bharat", "whisper", "mock"] = "mock"

    # --- measurement / assessment rules (HLD 6.3, 6.6) ---
    checkpoints_are_blocking: bool = True          # cannot advance topic without attempting
    retention_delay_days_min: int = 3
    retention_delay_days_max: int = 5

    class Config:
        env_file = ".env"


settings = Settings()
