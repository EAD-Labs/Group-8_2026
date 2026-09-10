"""
Central settings. Change behaviour here, not scattered through the code.

Everything that's likely to change as the HLD changes (which LLM providers,
whether voice is on, DB location, checkpoint blocking rules) is a setting,
not a hardcoded value, so future HLD revisions mostly mean editing this file
plus content/modules.json rather than touching route/service code.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal


class Settings(BaseSettings):
    # --- environment ---
    env: Literal["dev", "staging", "prod"] = "dev"

    # --- HTTP ---
    # Was hardcoded to the Vite dev server, which breaks the moment this is
    # deployed anywhere (PROJECT.md D8). Set CORS_ALLOW_ORIGINS in .env as a
    # JSON list for staging/production.
    cors_allow_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

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

    # --- classroom pacing ---
    # Pre-generated turns are replayed over SSE with this delay between them, to
    # give the dialogue the feel of arriving turn by turn. Presentation only —
    # it has nothing to do with how the turns were generated.
    sse_turn_delay_seconds: float = 0.6

    # --- measurement / assessment rules (HLD 6.3, 6.6) ---
    checkpoints_are_blocking: bool = True          # cannot advance topic without attempting
    # Mean rubric score across a checkpoint's items needed to pass. 0.6 reads as
    # "most of the rubric, not all of it" — a first-year answer that covers the
    # reasoning but misses a stated step should still pass.
    checkpoint_pass_threshold: float = 0.6
    retention_delay_days_min: int = 3
    retention_delay_days_max: int = 5

    # HLD 6.3: both arms of the comparative study get the same time budget.
    # Recorded on every session at creation so a later change to this setting
    # cannot retroactively alter what a completed session was given. Advisory —
    # the UI counts down and the budget is reported, but a learner mid-sentence
    # is not cut off; `was_within_time_budget` on the session record is what the
    # analysis filters on.
    session_time_budget_seconds: int = 20 * 60

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
