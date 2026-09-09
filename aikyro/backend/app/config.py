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
    # app is fully demoable with no API keys. Flip to "live" once provider
    # keys are wired in llm_providers.py.
    llm_mode: Literal["mock", "live"] = "mock"
    llm_providers: list[str] = ["provider_a", "provider_b"]  # >=2 per HLD 10.4

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
