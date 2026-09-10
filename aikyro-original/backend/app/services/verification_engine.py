"""
Part 1 - Verified Knowledge Engine (HLD 6.1).

Pipeline: parallel generation across providers -> disagreement detection ->
adjudication (a judge LLM call reconciles them into one verified answer) ->
confidence annotation -> store with provenance.

Two entry points:
  - produce_verified_record: pilot concepts, looked up in content/modules.json,
    cached and reused across learners (HLD 6.1 "caching by topic").
  - produce_verified_record_freeform: arbitrary learner-typed topics, outside
    the pilot's graded comparison (HLD explicitly scopes the graded pairs to
    two modules; open-topic exploration is the "general use" path, not part
    of the platform-vs-plain-chat delta). Cached per exact topic string.

Adjudication has two paths:
  - live mode with 2+ real answers: a judge LLM call compares them and
    returns a single reconciled explanation plus its own disagreement/
    confidence read — see `_adjudicate_live`.
  - mock mode, or only one usable answer: falls back to the naive
    first-answer-wins placeholder (`_adjudicate_naive`) so the pipeline
    still works with zero API keys.
"""
import asyncio
import re

from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.content.loader import get_concept
from app.models import VerifiedKnowledgeRecord
from app.services.llm_providers import generate, preferred_available_provider, extract_json_object


async def produce_verified_record(db: DBSession, concept_id: str) -> VerifiedKnowledgeRecord:
    # cache: if we already have a verified record for this concept, reuse it
    # (HLD 6.1: "caching by topic")
    existing = (
        db.query(VerifiedKnowledgeRecord)
        .filter(VerifiedKnowledgeRecord.concept_id == concept_id)
        .order_by(VerifiedKnowledgeRecord.created_at.desc())
        .first()
    )
    if existing:
        return existing

    concept = get_concept(concept_id)
    if not concept:
        raise ValueError(f"Unknown concept_id: {concept_id}")

    prompt = _build_prompt(concept["name"], bloom_level=concept["bloom_level"])
    record = await _run_pipeline(db, concept_id, concept["module_id"], prompt, concept["name"])
    return record


async def produce_verified_record_freeform(db: DBSession, topic: str) -> tuple[VerifiedKnowledgeRecord, str]:
    """
    Learner types any topic — not looked up in modules.json. Returns
    (record, concept_id) since the caller needs the generated concept_id to
    create the LearningSession. Cached per exact topic text (case-insensitive)
    so re-asking the same thing doesn't re-hit the providers.
    """
    slug = _slugify(topic)
    concept_id = f"freeform:{slug}"

    existing = (
        db.query(VerifiedKnowledgeRecord)
        .filter(VerifiedKnowledgeRecord.concept_id == concept_id)
        .order_by(VerifiedKnowledgeRecord.created_at.desc())
        .first()
    )
    if existing:
        return existing, concept_id

    prompt = _build_prompt(topic, bloom_level="understand")  # no Bloom target for freeform; default to understand
    record = await _run_pipeline(db, concept_id, "general", prompt, topic, topic_name=topic)
    return record, concept_id


async def _run_pipeline(
    db: DBSession, concept_id: str, module_id: str, prompt: str, concept_name: str, topic_name: str | None = None
) -> VerifiedKnowledgeRecord:
    results = await asyncio.gather(
        *[
            _generate_with_fallback(provider, prompt, concept_name)
            for provider in settings.llm_providers
        ]
    )
    answers = {p: r for p, r in zip(settings.llm_providers, results) if r is not None}

    verified_text, disagreements, confidence = await _adjudicate(answers, concept_name)

    record = VerifiedKnowledgeRecord(
        concept_id=concept_id,
        module_id=module_id,
        topic_name=topic_name,
        verified_text=verified_text,
        provenance={"providers_used": list(answers.keys()), "raw_answers": answers},
        resolved_disagreements=disagreements,
        confidence=confidence,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-")
    return slug[:80] or "topic"


async def _generate_with_fallback(provider: str, prompt: str, concept_name: str) -> str | None:
    try:
        return await generate(provider, prompt, concept_name=concept_name)
    except Exception:
        # HLD 10.4 fallback: remaining agents proceed, record marked lower confidence
        return None


def _build_prompt(concept_name: str, bloom_level: str) -> str:
    return (
        f"Explain the concept '{concept_name}' at Bloom level "
        f"'{bloom_level}' for a first-year engineering student. "
        f"Be precise about common misconceptions."
    )


async def _adjudicate(answers: dict[str, str], concept_name: str) -> tuple[str, dict, float]:
    """Returns (verified_text, disagreements, confidence)."""
    if not answers:
        return "Verification failed: no provider produced an answer.", {}, 0.0

    if len(answers) >= 2 and settings.llm_mode == "live":
        judge = preferred_available_provider()
        if judge:
            live_result = await _adjudicate_live(judge, answers, concept_name)
            if live_result:
                return live_result

    return _adjudicate_naive(answers)


async def _adjudicate_live(judge_provider: str, answers: dict[str, str], concept_name: str) -> tuple[str, dict, float] | None:
    """
    Real adjudication: ask one provider to act as judge over every answer,
    reconcile any factual disagreements, and return strict JSON. Returns
    None (caller falls back to the naive method) on any parse/call failure
    — adjudication failing should degrade, not crash the whole pipeline.
    """
    labeled_answers = "\n\n".join(f"Answer from {name}:\n{text}" for name, text in answers.items())
    judge_prompt = (
        f"You are fact-checking {len(answers)} AI-generated explanations of the concept "
        f"'{concept_name}' before they're shown to a student. Compare them for factual "
        f"disagreements (not just wording differences).\n\n{labeled_answers}\n\n"
        "Respond with ONLY a JSON object, no other text, in this exact shape:\n"
        '{"verified_text": "<one accurate, concise explanation combining the best of '
        'both, correcting any error you found>", '
        '"disagreements": {"<short description>": "<how you resolved it>"}, '
        '"confidence": <0.0 to 1.0, lower if the sources meaningfully disagreed>}'
    )

    try:
        raw = await generate(judge_provider, judge_prompt, concept_name=concept_name)
        parsed = extract_json_object(raw)
        verified_text = parsed["verified_text"]
        disagreements = parsed.get("disagreements", {}) or {}
        confidence = float(parsed.get("confidence", 0.9))
        confidence = max(0.0, min(1.0, confidence))
        return verified_text, disagreements, confidence
    except Exception:
        return None


def _adjudicate_naive(answers: dict[str, str]) -> tuple[str, dict, float]:
    """Mock-mode / single-answer / judge-failure fallback: first answer wins."""
    disagreements = {}
    providers = list(answers.keys())
    for i in range(len(providers)):
        for j in range(i + 1, len(providers)):
            a, b = providers[i], providers[j]
            if answers[a] and answers[b] and answers[a] != answers[b]:
                disagreements[f"{a}_vs_{b}"] = "flagged_for_review (naive mode — no judge call made)"

    verified_text = next(iter(answers.values()))
    confidence = 1.0 if not disagreements else max(0.5, 1.0 - 0.15 * len(disagreements))
    return verified_text, disagreements, confidence
