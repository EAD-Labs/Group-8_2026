"""
Thin provider interface. Every caller in this codebase talks to
`generate(provider_name, prompt)` — never to a provider SDK directly — so
adding a third provider, or swapping models, is a one-file change.

Live calls use plain httpx against each provider's REST API (no SDK
dependency). Set ANTHROPIC_API_KEY / OPENAI_API_KEY in backend/.env and
llm_mode=live to turn this on. Any provider whose key is missing raises
inside its own call and is caught by the caller's per-provider fallback
(verification_engine._generate_with_fallback) — a missing key degrades that
one provider, it doesn't take down the pipeline.

Model names live in config.py, not here — check
https://docs.claude.com/en/docs/about-claude/models for current Anthropic
model strings, and https://platform.openai.com/docs/models for OpenAI's,
since these lists move faster than this codebase should need to.
"""
import httpx
from app.config import settings


async def generate(provider_name: str, prompt: str, *, concept_name: str = "") -> str:
    if settings.llm_mode == "mock":
        return _mock_response(provider_name, prompt, concept_name)
    return await _call_live(provider_name, prompt)


def _mock_response(provider_name: str, prompt: str, concept_name: str) -> str:
    topic = concept_name or "this concept"
    return (
        f"[{provider_name} mock] A verified explanation of {topic}: "
        f"the key idea is stated precisely, one common misconception is "
        f"flagged, and a short worked example is given."
    )


async def _call_live(provider_name: str, prompt: str) -> str:
    if provider_name == "anthropic":
        return await _call_anthropic(prompt)
    if provider_name == "openai":
        return await _call_openai(prompt)
    raise NotImplementedError(f"No live adapter wired for provider '{provider_name}'.")


async def _call_anthropic(prompt: str) -> str:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set — add it to backend/.env")

    async with httpx.AsyncClient(timeout=settings.llm_request_timeout_seconds) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.anthropic_model,
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text").strip()


async def _call_openai(prompt: str) -> str:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set — add it to backend/.env")

    async with httpx.AsyncClient(timeout=settings.llm_request_timeout_seconds) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "content-type": "application/json",
            },
            json={
                "model": settings.openai_model,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


def preferred_available_provider() -> str | None:
    """
    Used for single-provider tasks (adjudication, grading) where we want
    one good answer rather than a cross-check. Returns None (caller should
    fall back to mock/placeholder behaviour) if nothing is configured.
    """
    if settings.llm_mode == "mock":
        return settings.llm_providers[0] if settings.llm_providers else None
    for provider in settings.llm_providers:
        if provider == "anthropic" and settings.anthropic_api_key:
            return provider
        if provider == "openai" and settings.openai_api_key:
            return provider
    return None


def extract_json_object(raw: str) -> dict:
    """
    Judge/grading models sometimes wrap JSON in prose or code fences —
    strip that. Shared by verification_engine (adjudication) and
    grading_service (checkpoint/quiz grading) so both parse LLM verdicts
    the same forgiving way.
    """
    import json
    import re

    text = raw.strip()
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1)
    else:
        brace_match = re.search(r"\{.*\}", text, re.DOTALL)
        if brace_match:
            text = brace_match.group(0)
    return json.loads(text)
