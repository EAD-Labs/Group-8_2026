"""
Thin provider interface. Every caller in this codebase talks to
`generate(provider_name, prompt)` — never to a provider SDK directly — so
adding a third provider, or swapping models, is a one-file change.

Live calls use plain httpx against each provider's REST API (no SDK
dependency). Set ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY in
backend/.env and llm_mode=live to turn this on. Any provider whose key is missing raises
inside its own call and is caught by the caller's per-provider fallback
(verification_engine._generate_with_fallback) — a missing key degrades that
one provider, it doesn't take down the pipeline.

Model names live in config.py, not here — check
https://docs.claude.com/en/docs/about-claude/models for current Anthropic
model strings, and https://platform.openai.com/docs/models for OpenAI's,
since these lists move faster than this codebase should need to.
"""
import asyncio
import random
from typing import Literal

import httpx
from app.config import settings

# Statuses worth retrying: rate limits and transient server-side failures.
# Everything else (401 bad key, 400 bad request, 404 retired model) is a fault
# that retrying cannot fix, so it fails immediately and the caller falls back.
_RETRYABLE_STATUSES = frozenset({408, 429, 500, 502, 503, 504})


class ProviderError(RuntimeError):
    """
    A provider call that could not be completed.

    Carries the provider name and a short reason so the caller can record *why*
    a provider dropped out of a record rather than leaving an unexplained gap in
    `provenance.providers_used` (HLD 10.4 wants the degradation recorded, not
    merely survived).
    """

    def __init__(self, provider: str, reason: str):
        self.provider = provider
        self.reason = reason
        super().__init__(f"{provider}: {reason}")


# Cost and quota live almost entirely in *when* a call runs, not which model
# runs (PROJECT.md §6 "Model tiering"):
#
#   build — record compilation and adjudication. Runs roughly ten times for the
#           whole pilot, because verified records are cached by concept. Use the
#           strongest model available; cost is irrelevant at this volume.
#   run   — dialogue turns, third-student answers, grading, the baseline arm.
#           Once per session or per answer, so this is the volume. Use the
#           cheapest model that passes the grading tests.
#
# On a free-tier key this is also what makes the app usable at all: Gemini's
# daily request quota is *per model*, so the two tiers draw on separate buckets
# and exhausting one does not take out the other.
Tier = Literal["build", "run"]


async def generate(
    provider_name: str, prompt: str, *, concept_name: str = "", tier: Tier = "run"
) -> str:
    if settings.llm_mode == "mock":
        return _mock_response(provider_name, prompt, concept_name)
    return await _call_with_retry(provider_name, prompt, tier)


async def _call_with_retry(provider_name: str, prompt: str, tier: Tier = "run") -> str:
    """
    Retry transient failures with exponential backoff and jitter.

    Rate-limited keys return 429/503 intermittently, and one session makes many
    calls — verification, then a prompt per dialogue turn, then one per
    checkpoint item. Without this, a single blip silently drops the whole
    provider and the session quietly reverts to templates while still *looking*
    live, which is the worst of both: no signal to the operator that nothing
    real happened.

    Jitter matters because the verification engine fans out to every provider at
    once; a fixed backoff would have them all retry in lockstep.
    """
    last: Exception | None = None

    for attempt in range(settings.llm_max_retries + 1):
        try:
            return await _call_live(provider_name, prompt, tier)
        except httpx.HTTPStatusError as exc:
            last = exc
            status = exc.response.status_code
            if status not in _RETRYABLE_STATUSES or attempt == settings.llm_max_retries:
                raise ProviderError(provider_name, f"HTTP {status}") from exc
            delay = _retry_delay(exc.response, attempt)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last = exc
            if attempt == settings.llm_max_retries:
                raise ProviderError(provider_name, type(exc).__name__) from exc
            delay = _retry_delay(None, attempt)
        except ProviderError:
            raise  # already classified — an empty candidate list, say
        except Exception as exc:
            raise ProviderError(provider_name, str(exc)[:200]) from exc

        await asyncio.sleep(delay)

    raise ProviderError(provider_name, str(last)[:200])


def _retry_delay(response: httpx.Response | None, attempt: int) -> float:
    """Honour `Retry-After` when the provider sends one; otherwise back off exponentially."""
    if response is not None:
        header = response.headers.get("retry-after")
        if header:
            try:
                return min(float(header), settings.llm_retry_max_delay_seconds)
            except ValueError:
                pass  # http-date form; fall through to the computed backoff
    backoff = settings.llm_retry_base_delay_seconds * (2 ** attempt)
    return min(backoff, settings.llm_retry_max_delay_seconds) * (0.5 + random.random() / 2)


def _mock_response(provider_name: str, prompt: str, concept_name: str) -> str:
    topic = concept_name or "this concept"
    return (
        f"[{provider_name} mock] A verified explanation of {topic}: "
        f"the key idea is stated precisely, one common misconception is "
        f"flagged, and a short worked example is given."
    )


async def _call_live(provider_name: str, prompt: str, tier: Tier = "run") -> str:
    if provider_name == "anthropic":
        return await _call_anthropic(prompt, _model_for("anthropic", tier))
    if provider_name == "openai":
        return await _call_openai(prompt, _model_for("openai", tier))
    if provider_name == "gemini":
        return await _call_gemini(prompt, _model_for("gemini", tier))
    raise NotImplementedError(f"No live adapter wired for provider '{provider_name}'.")


def _model_for(provider: str, tier: Tier) -> str:
    """
    The model a provider uses for a tier. A provider whose `*_model_fast` is
    unset simply uses its one model for both tiers — tiering is an optimisation,
    never a requirement for a provider to work.
    """
    strong = {
        "anthropic": settings.anthropic_model,
        "openai": settings.openai_model,
        "gemini": settings.gemini_model,
    }[provider]
    if tier == "build":
        return strong
    fast = {
        "anthropic": settings.anthropic_model_fast,
        "openai": settings.openai_model_fast,
        "gemini": settings.gemini_model_fast,
    }[provider]
    return fast or strong


async def _call_anthropic(prompt: str, model: str) -> str:
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
                "model": model,
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text").strip()


async def _call_openai(prompt: str, model: str) -> str:
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
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


async def _call_gemini(prompt: str, model: str) -> str:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set — add it to backend/.env")

    async with httpx.AsyncClient(timeout=settings.llm_request_timeout_seconds) as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={
                "x-goog-api-key": settings.gemini_api_key,
                "content-type": "application/json",
            },
            json={"contents": [{"parts": [{"text": prompt}]}]},
        )
        resp.raise_for_status()
        data = resp.json()

        candidates = data.get("candidates") or []
        if not candidates:
            # A prompt blocked by safety filters returns no candidates at all,
            # with the reason under promptFeedback. Surfacing it beats an
            # IndexError. Not retryable — the same prompt will be blocked again.
            feedback = data.get("promptFeedback", {})
            raise ProviderError("gemini", f"no candidates (promptFeedback={feedback})")

        candidate = candidates[0]
        # MAX_TOKENS truncates mid-JSON, which then fails to parse somewhere far
        # from here. Fail loudly instead so the fallback path is taken.
        if candidate.get("finishReason") not in (None, "STOP"):
            raise ProviderError("gemini", f"stopped early: {candidate['finishReason']}")

        parts = candidate.get("content", {}).get("parts", [])
        # Gemini 3.x interleaves reasoning parts (flagged `thought`) with the
        # answer, and attaches a `thoughtSignature` to answer parts. Only the
        # visible text is wanted; concatenating everything would paste chain of
        # thought into the learner's classroom.
        return "".join(
            part.get("text", "") for part in parts if not part.get("thought")
        ).strip()


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
        if provider == "gemini" and settings.gemini_api_key:
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
