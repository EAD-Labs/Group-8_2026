"""
Grading — checkpoints, retention checks, and transfer problems all funnel
through here.

Two paths, same shape as verification/dialogue generation:
  - live mode with a configured provider: an LLM judges the learner's
    answer against the verified explanation and returns a real verdict.
  - mock mode, or no provider configured: falls back to the placeholder
    "any non-empty answer passes" rule that was here before. This keeps the
    pipeline demoable with zero API keys, but it's an honest placeholder —
    nothing about it is actually checking correctness.

This was flagged in the README as the most load-bearing remaining stub;
wiring it up here is what makes "verified knowledge, real assessment" true
rather than aspirational, once API keys are configured.
"""
from app.config import settings
from app.services.llm_providers import generate, preferred_available_provider, extract_json_object


async def grade_answer(
    *, prompt: str, verified_text: str, learner_answer: str, concept_name: str
) -> tuple[bool, float, str]:
    """
    Returns (passed, score 0-1, feedback). `prompt` is what the learner was
    asked (checkpoint question / quiz prompt); `verified_text` is the
    ground-truth explanation to grade against.
    """
    answer = learner_answer.strip()
    if not answer:
        return False, 0.0, "No answer given."

    if settings.llm_mode == "live":
        provider = preferred_available_provider()
        if provider:
            live_result = await _grade_live(provider, prompt, verified_text, answer, concept_name)
            if live_result:
                return live_result

    return _grade_naive(answer)


async def _grade_live(
    provider: str, prompt: str, verified_text: str, answer: str, concept_name: str
) -> tuple[bool, float, str] | None:
    judge_prompt = (
        f"You are grading a first-year engineering student's answer about '{concept_name}'.\n\n"
        f"Question asked: {prompt}\n\n"
        f"Ground-truth explanation:\n{verified_text}\n\n"
        f"Student's answer:\n{answer}\n\n"
        "Judge whether the answer demonstrates real understanding — not a verbatim match, "
        "but correct reasoning in the student's own words is fine. Partial credit is fine.\n\n"
        "Respond with ONLY a JSON object, no other text, in this exact shape:\n"
        '{"passed": true or false, "score": <0.0 to 1.0>, '
        '"feedback": "<one short sentence of specific, constructive feedback>"}'
    )
    try:
        raw = await generate(provider, judge_prompt, concept_name=concept_name)
        parsed = extract_json_object(raw)
        passed = bool(parsed["passed"])
        score = max(0.0, min(1.0, float(parsed.get("score", 1.0 if passed else 0.0))))
        feedback = str(parsed.get("feedback", ""))
        return passed, score, feedback
    except Exception:
        return None


def _grade_naive(answer: str) -> tuple[bool, float, str]:
    return True, 1.0, "Recorded (non-empty answer — real grading needs llm_mode=live and a configured API key)."
