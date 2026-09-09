"""
Thin provider interface. Every caller in this codebase talks to
`generate(provider_name, prompt)` — never to a provider SDK directly — so
swapping mock -> live, or adding a third provider, is a one-file change.

To wire in a real provider: replace the body of `_call_live` with an actual
API call (e.g. httpx.post to the provider's endpoint) and flip
config.settings.llm_mode to "live".
"""
from app.config import settings


async def generate(provider_name: str, prompt: str, *, concept_name: str = "") -> str:
    if settings.llm_mode == "mock":
        return _mock_response(provider_name, prompt, concept_name)
    return await _call_live(provider_name, prompt)


def _mock_response(provider_name: str, prompt: str, concept_name: str) -> str:
    # Deterministic-ish canned response so the pipeline is fully demoable
    # without API keys. Replace with real generation in _call_live.
    topic = concept_name or "this concept"
    return (
        f"[{provider_name} mock] A verified explanation of {topic}: "
        f"the key idea is stated precisely, one common misconception is "
        f"flagged, and a short worked example is given."
    )


async def _call_live(provider_name: str, prompt: str) -> str:
    # TODO: wire in the real provider SDK/HTTP call here.
    raise NotImplementedError(
        f"Live LLM calls not wired yet for provider '{provider_name}'. "
        "Set llm_mode='mock' in config, or implement _call_live."
    )
