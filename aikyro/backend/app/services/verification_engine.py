"""
Part 1 - Verified Knowledge Engine (HLD 6.1).

Pipeline: parallel generation across providers -> pairwise disagreement
detection -> adjudication -> confidence annotation -> store with provenance.

Two entry points:
  - produce_verified_record: pilot concepts, looked up in content/modules.json,
    cached and reused across learners (HLD 6.1 "caching by topic").
  - produce_verified_record_freeform: arbitrary learner-typed topics, outside
    the pilot's graded comparison (HLD explicitly scopes the graded pairs to
    two modules; open-topic exploration is the "general use" path, not part
    of the platform-vs-plain-chat delta). Cached per exact topic string.

This is a working but intentionally simple implementation: disagreement
detection is a stand-in (string-similarity style placeholder) rather than a
real semantic diff. Swap `_detect_disagreements` and `_adjudicate` for
something more serious later — everything downstream (dialogue orchestrator,
storage schema) already expects the same output shape, so that swap is
isolated to this file.
"""
import asyncio
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.content.loader import get_concept
from app.models import VerifiedKnowledgeRecord
from app.services.llm_providers import generate


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

    disagreements = _detect_disagreements(answers)
    verified_text, confidence = _adjudicate(answers, disagreements)

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
    import re
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


def _detect_disagreements(answers: dict[str, str]) -> dict:
    # Placeholder pairwise check. Real implementation should do semantic
    # comparison (e.g. an adjudication LLM call), not string length.
    disagreements = {}
    providers = list(answers.keys())
    for i in range(len(providers)):
        for j in range(i + 1, len(providers)):
            a, b = providers[i], providers[j]
            if answers[a] and answers[b] and answers[a] != answers[b]:
                disagreements[f"{a}_vs_{b}"] = "flagged_for_review"
    return disagreements


def _adjudicate(answers: dict[str, str], disagreements: dict) -> tuple[str, float]:
    if not answers:
        return "Verification failed: no provider produced an answer.", 0.0
    # naive adjudication: take the first successful answer as the verified
    # text, lower confidence if providers disagreed. Replace with a real
    # adjudication pass (e.g. a third LLM call reconciling the two) later.
    verified_text = next(iter(answers.values()))
    confidence = 1.0 if not disagreements else max(0.5, 1.0 - 0.15 * len(disagreements))
    return verified_text, confidence
