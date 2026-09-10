"""
Part 1 - Verified Knowledge Engine (HLD 6.1).

Produces one trustworthy, **addressable** record per concept (HLD T1.7): not a
prose blob, but an `app.content.schema.StructuredConceptRecord` with claims, a
worked example, a hint ladder, misconceptions, blanks and checkpoint items
carrying rubrics. That object is the contract between all three parts — the
dialogue layer draws on specific fields, grading conditions on the rubrics, and
the doubt log keys on the misconception enum.

Two halves merge into each record:

  - **Authored** (content/modules.json): misconceptions, key terms, blanks,
    checkpoint items. Pedagogical decisions stay reviewable content, not code.
  - **Compiled** (this module): claims, the worked example, the hint ladder,
    generated across providers and adjudicated.

Pipeline: parallel generation across providers -> disagreement detection ->
adjudication (a judge call reconciles them) -> confidence annotation -> store
with provenance.

### Why the disagreement surface is pedagogy, not facts

T1.2 asks for a detected, resolved, stored inter-agent disagreement. On
first-year thermodynamics and probability, frontier models from different
families will not disagree on the facts — so an adjudicator asked only "who is
factually right" will honestly report nothing, every time, and T1.2 can never
pass. The adjudication prompt below therefore asks for disagreements on the
*teaching* choices where models genuinely differ: which misconception to
target first, how to frame a sign convention, which worked example is clearest
for a first-year. `resolved_disagreements` records which surface each
disagreement came from, so a report can state plainly how many were factual
(likely zero) and how many pedagogical. This is a proposal to the client, not
a silent substitution — it is open question 1 in PROJECT.md §13.

### Why rounds are not run

Gains come from model *heterogeneity*, not from debate rounds: unguided
multi-agent debate underperforms a single model self-correcting while costing
2-3.4x the tokens. One pass per provider, one adjudication. The test applied to
any proposed verification step is whether it adds information or only opinions
— which is also why a single configured provider degrades to the naive path
rather than being asked to argue with itself.

Two entry points:
  - produce_verified_record: pilot concepts from content/modules.json, cached
    and reused across learners (HLD 6.1 "caching by topic").
  - produce_verified_record_freeform: arbitrary learner-typed topics, outside
    the graded comparison. No authored content exists for these, so the whole
    record is compiled and `content_reviewed` stays false.
"""
import asyncio
import re

from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.content.loader import authored_record, get_concept
from app.content.schema import (
    BlankCandidate, CheckpointItem, HintRung, Misconception,
    StructuredConceptRecord, WorkedExample,
)
from app.models import VerifiedKnowledgeRecord
from app.services.llm_providers import generate, preferred_available_provider, extract_json_object


async def produce_verified_record(db: DBSession, concept_id: str) -> VerifiedKnowledgeRecord:
    # cache: if we already have a verified record for this concept, reuse it
    # (HLD 6.1: "caching by topic", HLD T1.4: no new provider calls)
    existing = _cached(db, concept_id)
    if existing:
        return existing

    concept = get_concept(concept_id)
    if not concept:
        raise ValueError(f"Unknown concept_id: {concept_id}")

    base = authored_record(concept_id)
    if base is None:
        raise ValueError(f"No authored content for concept_id: {concept_id}")

    return await _run_pipeline(db, base, concept["module_id"])


async def produce_verified_record_freeform(db: DBSession, topic: str) -> tuple[VerifiedKnowledgeRecord, str]:
    """
    Learner types any topic — not in modules.json, so nothing is authored for
    it and the entire record has to be compiled. Outside the graded comparison
    (the HLD scopes the graded pairs to two pilot modules); this is the
    "general use" path. Cached per slugified topic so re-asking doesn't re-hit
    the providers. Returns (record, concept_id) — the caller needs the
    generated concept_id to create the LearningSession.
    """
    slug = _slugify(topic)
    concept_id = f"freeform:{slug}"

    existing = _cached(db, concept_id)
    if existing:
        return existing, concept_id

    # no Bloom target for freeform; default to understand
    base = StructuredConceptRecord(
        concept_id=concept_id, concept_name=topic, bloom_level="understand"
    )
    record = await _run_pipeline(db, base, "general", topic_name=topic)
    return record, concept_id


def _cached(db: DBSession, concept_id: str) -> VerifiedKnowledgeRecord | None:
    return (
        db.query(VerifiedKnowledgeRecord)
        .filter(VerifiedKnowledgeRecord.concept_id == concept_id)
        .order_by(VerifiedKnowledgeRecord.created_at.desc())
        .first()
    )


def load_structured(record: VerifiedKnowledgeRecord) -> StructuredConceptRecord:
    """
    The structured view of a stored record, for every consumer downstream.

    Records written before the structured column existed (and any row whose
    payload fails validation after a schema change) degrade to a minimal
    record carrying just the prose, rather than raising — a stale row should
    cost a rubric, not a learner's session.
    """
    if record.structured:
        try:
            return StructuredConceptRecord.model_validate(record.structured)
        except Exception:
            pass

    base = authored_record(record.concept_id)
    if base is not None:
        if not base.claims:
            base.claims = [record.verified_text]
        return base
    return StructuredConceptRecord(
        concept_id=record.concept_id,
        concept_name=record.topic_name or record.concept_id,
        bloom_level="understand",
        claims=[record.verified_text] if record.verified_text else [],
    )


async def _run_pipeline(
    db: DBSession,
    base: StructuredConceptRecord,
    module_id: str,
    topic_name: str | None = None,
) -> VerifiedKnowledgeRecord:
    needs_authoring = not base.misconceptions  # freeform topics
    prompt = _build_prompt(base, needs_authoring=needs_authoring)

    results = await asyncio.gather(
        *[
            _generate_with_fallback(provider, prompt, base.concept_name)
            for provider in settings.llm_providers
        ]
    )
    answers = {p: r for p, r in zip(settings.llm_providers, results) if r is not None}

    compiled, disagreements, confidence = await _adjudicate(answers, base)

    record = VerifiedKnowledgeRecord(
        concept_id=base.concept_id,
        module_id=module_id,
        topic_name=topic_name,
        verified_text=compiled.render_prose(),
        structured=compiled.model_dump(),
        provenance={
            "providers_used": list(answers.keys()),
            "providers_attempted": list(settings.llm_providers),
            "llm_mode": settings.llm_mode,
            "authored_fields_from_modules_json": not needs_authoring,
            "raw_answers": answers,
        },
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


def _build_prompt(base: StructuredConceptRecord, *, needs_authoring: bool) -> str:
    """
    Asks for the *compiled* half as strict JSON. When the concept has authored
    misconceptions, they are handed to the model as given and it is told not to
    invent its own — the enum has to stay closed or the doubt log stops
    aggregating. Freeform topics have nothing authored, so the model supplies
    misconceptions, blanks and checkpoint items too.
    """
    shape = {
        "claims": ["<3-5 short, self-contained, individually checkable statements>"],
        "worked_example": {
            "situation": "<one concrete first-year situation>",
            "steps": ["<step>", "<step>"],
            "answer": "<the result>",
        },
        "hint_ladder": [
            {"level": 1, "text": "<nudge that does not give the answer>"},
            {"level": 2, "text": "<narrower hint>"},
            {"level": 3, "text": "<nearly the answer>"},
        ],
    }
    if needs_authoring:
        shape |= {
            "key_terms": ["<term>"],
            "misconceptions": [
                {
                    "id": "<snake_case_id>",
                    "statement": "<what the learner does wrong, not what is true>",
                    "probe": "<question that surfaces it without giving the answer>",
                    "learner_facing": "<same idea in plain words for a progress screen>",
                }
            ],
            "blanks": [
                {
                    "id": "<snake_case_id>",
                    "prompt": "<sentence ending with ____>",
                    "expected_answers": ["<accepted form>", "<other accepted form>"],
                    "misconception_id": "<one of the ids above>",
                    "hint": "<nudge>",
                }
            ],
            "checkpoint_items": [
                {
                    "id": "<snake_case_id>",
                    "prompt": "<question>",
                    "bloom_level": "remember|understand|apply|analyse",
                    "rubric": ["<what a passing answer must contain>"],
                    "targets_misconception": "<one of the ids above>",
                }
            ],
        }

    import json

    parts = [
        f"Compile a teaching record for the concept '{base.concept_name}' at Bloom level "
        f"'{base.bloom_level}', for a first-year engineering student. Be precise and concrete."
    ]
    if base.key_terms:
        parts.append("Key terms that must appear in the claims: " + ", ".join(base.key_terms) + ".")
    if base.misconceptions:
        listed = "\n".join(f"  - [{m.id}] {m.statement}" for m in base.misconceptions)
        parts.append(
            "These are the known learner difficulties for this concept, already agreed with the "
            f"course team. Write claims and a worked example that directly pre-empt them. Do NOT "
            f"invent additional misconceptions.\n{listed}"
        )
    parts.append(
        "Respond with ONLY a JSON object, no other text, in exactly this shape:\n"
        + json.dumps(shape, indent=2)
    )
    return "\n\n".join(parts)


async def _adjudicate(
    answers: dict[str, str], base: StructuredConceptRecord
) -> tuple[StructuredConceptRecord, dict, float]:
    """Returns (compiled record, disagreements, confidence)."""
    if not answers:
        # HLD T1.6: all providers down must stay recoverable — the session is
        # preserved and the learner still gets the authored content.
        failed = _merge(base, {})
        failed.claims = failed.claims or [
            f"Verification failed: no provider produced a record for {base.concept_name}."
        ]
        return failed, {"verification": "no provider produced an answer"}, 0.0

    parsed = {}
    for provider, raw in answers.items():
        try:
            parsed[provider] = extract_json_object(raw)
        except Exception:
            continue

    if len(parsed) >= 2 and settings.llm_mode == "live":
        judge = preferred_available_provider()
        if judge:
            live = await _adjudicate_live(judge, parsed, base)
            if live:
                return live

    return _adjudicate_naive(parsed, base)


async def _adjudicate_live(
    judge_provider: str, parsed: dict[str, dict], base: StructuredConceptRecord
) -> tuple[StructuredConceptRecord, dict, float] | None:
    """
    One judge call over every provider's record. Reconciles them into one
    record and reports disagreements, each tagged with the surface it came
    from — `factual` or `pedagogical`. See the module docstring on why the
    pedagogical surface is the one that will actually fire.

    Returns None on any parse/call failure; the caller falls back to the naive
    merge. Adjudication failing should degrade, not crash the pipeline.
    """
    import json

    labeled = "\n\n".join(
        f"Record from {name}:\n{json.dumps(payload, indent=2)}" for name, payload in parsed.items()
    )
    judge_prompt = (
        f"You are reviewing {len(parsed)} independently compiled teaching records for the concept "
        f"'{base.concept_name}', before one of them is used to teach a first-year engineering "
        f"student. Reconcile them into a single best record.\n\n{labeled}\n\n"
        "Report disagreements on two separate surfaces:\n"
        "  - factual: the records make incompatible claims about the subject. Report these only "
        "when they are genuinely incompatible, not when the wording differs. If there are none, "
        "return none — do not manufacture one.\n"
        "  - pedagogical: the records make different teaching choices — which difficulty to "
        "tackle first, how to frame a convention, which worked example is clearest for a "
        "first-year, how much to give away in hint 1. Report these even when both choices are "
        "defensible, and say which you picked and why.\n\n"
        "Respond with ONLY a JSON object, no other text, in this exact shape:\n"
        '{"claims": ["..."], '
        '"worked_example": {"situation": "...", "steps": ["..."], "answer": "..."}, '
        '"hint_ladder": [{"level": 1, "text": "..."}], '
        '"disagreements": [{"surface": "factual"|"pedagogical", "description": "...", '
        '"resolution": "..."}], '
        '"confidence": <0.0 to 1.0, lower if a FACTUAL disagreement was found>}'
    )

    try:
        raw = await generate(judge_provider, judge_prompt, concept_name=base.concept_name)
        payload = extract_json_object(raw)
        compiled = _merge(base, payload)
        disagreements = _normalise_disagreements(
            payload.get("disagreements", []), judge=judge_provider, providers=list(parsed)
        )
        confidence = max(0.0, min(1.0, float(payload.get("confidence", 0.9))))
        return compiled, disagreements, confidence
    except Exception:
        return None


def _normalise_disagreements(raw, *, judge: str, providers: list[str]) -> dict:
    """
    Stores disagreements in a countable shape (HLD T1.2 asks for detected,
    resolved AND stored). Keeping the counts per surface is what lets the
    report say "0 factual, 3 pedagogical" rather than showing a pile of
    strings.
    """
    items = []
    if isinstance(raw, dict):
        # tolerate the older {description: resolution} shape
        items = [
            {"surface": "unclassified", "description": k, "resolution": v} for k, v in raw.items()
        ]
    elif isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            surface = entry.get("surface", "unclassified")
            items.append(
                {
                    "surface": surface if surface in ("factual", "pedagogical") else "unclassified",
                    "description": str(entry.get("description", "")),
                    "resolution": str(entry.get("resolution", "")),
                }
            )

    return {
        "adjudicated_by": judge,
        "compared_providers": providers,
        "counts": {
            "factual": sum(1 for i in items if i["surface"] == "factual"),
            "pedagogical": sum(1 for i in items if i["surface"] == "pedagogical"),
            "unclassified": sum(1 for i in items if i["surface"] == "unclassified"),
        },
        "items": items,
    }


def _adjudicate_naive(
    parsed: dict[str, dict], base: StructuredConceptRecord
) -> tuple[StructuredConceptRecord, dict, float]:
    """
    Mock-mode / single-provider / judge-failure fallback: first usable record
    wins, with a flag recording that no judge call was made.

    With one provider configured there is nothing to cross-check, so this is
    always the path taken — which is precisely why T1.2 cannot pass on a
    single key (PROJECT.md §6). It is recorded honestly rather than dressed up
    as adjudication.
    """
    if not parsed:
        compiled = _merge(base, {})
        return compiled, {"adjudicated_by": None, "counts": {}, "items": [],
                          "note": "no provider returned parseable JSON; authored content only"}, 0.4

    providers = list(parsed)
    compiled = _merge(base, parsed[providers[0]])
    note = (
        "single usable record — no cross-check possible, so no disagreement could be detected"
        if len(providers) == 1
        else "naive merge (mock mode or judge unavailable) — no judge call made"
    )
    confidence = 1.0 if len(providers) >= 2 else 0.75
    return compiled, {
        "adjudicated_by": None,
        "compared_providers": providers,
        "counts": {"factual": 0, "pedagogical": 0, "unclassified": 0},
        "items": [],
        "note": note,
    }, confidence


def _merge(base: StructuredConceptRecord, payload: dict) -> StructuredConceptRecord:
    """
    Lay a compiled payload over the authored record.

    Authored fields win wherever they exist: a model must not overwrite
    misconceptions the course team agreed on, because `misconception_id` is an
    enum that the doubt log and the report both group on. Compiled fields fill
    in, and anything missing falls back to a template derived from the
    authored content so mock mode stays fully demoable with no keys.
    """
    merged = base.model_copy(deep=True)

    claims = [str(c).strip() for c in payload.get("claims", []) if str(c).strip()]
    merged.claims = claims or _template_claims(base)

    we = payload.get("worked_example")
    if isinstance(we, dict) and we.get("situation"):
        merged.worked_example = WorkedExample(
            situation=str(we.get("situation", "")),
            steps=[str(s) for s in we.get("steps", []) if str(s).strip()],
            answer=str(we.get("answer", "")),
        )
    else:
        merged.worked_example = _template_worked_example(base)

    ladder = []
    for rung in payload.get("hint_ladder", []):
        if isinstance(rung, dict) and str(rung.get("text", "")).strip():
            try:
                ladder.append(HintRung(level=int(rung.get("level", len(ladder) + 1)),
                                       text=str(rung["text"]).strip()))
            except (TypeError, ValueError):
                continue
    merged.hint_ladder = sorted(ladder, key=lambda r: r.level) or _template_hint_ladder(base)

    # Authored content is absent only for freeform topics; then, and only
    # then, take the model's.
    if not merged.misconceptions:
        merged.misconceptions = _coerce_misconceptions(payload.get("misconceptions", []))
    if not merged.key_terms:
        merged.key_terms = [str(t).strip() for t in payload.get("key_terms", []) if str(t).strip()]
    declared = set(merged.misconception_ids())
    if not merged.blanks:
        merged.blanks = _coerce_blanks(payload.get("blanks", []), declared) or _template_blanks(merged)
    if not merged.checkpoint_items:
        merged.checkpoint_items = _coerce_checkpoint_items(
            payload.get("checkpoint_items", []), declared, merged.bloom_level
        ) or _template_checkpoint_items(merged)

    return merged


def _coerce_misconceptions(raw) -> list[Misconception]:
    out = []
    for entry in raw if isinstance(raw, list) else []:
        if not isinstance(entry, dict) or not entry.get("statement"):
            continue
        mid = _slugify(str(entry.get("id") or entry["statement"])).replace("-", "_")[:60]
        out.append(
            Misconception(
                id=mid,
                statement=str(entry["statement"]),
                probe=str(entry.get("probe") or f"What makes you say that about this?"),
                learner_facing=str(entry["learner_facing"]) if entry.get("learner_facing") else None,
            )
        )
    return out


def _coerce_blanks(raw, declared: set[str]) -> list[BlankCandidate]:
    out = []
    for entry in raw if isinstance(raw, list) else []:
        if not isinstance(entry, dict):
            continue
        prompt = str(entry.get("prompt", "")).strip()
        answers = [str(a).strip() for a in entry.get("expected_answers", []) if str(a).strip()]
        if "____" not in prompt or not answers:
            continue
        ref = entry.get("misconception_id")
        out.append(
            BlankCandidate(
                id=_slugify(str(entry.get("id") or prompt)).replace("-", "_")[:60],
                prompt=prompt,
                expected_answers=answers,
                misconception_id=ref if ref in declared else None,
                hint=str(entry["hint"]) if entry.get("hint") else None,
            )
        )
    return out


def _coerce_checkpoint_items(raw, declared: set[str], default_bloom: str) -> list[CheckpointItem]:
    out = []
    for entry in raw if isinstance(raw, list) else []:
        if not isinstance(entry, dict):
            continue
        prompt = str(entry.get("prompt", "")).strip()
        rubric = [str(r).strip() for r in entry.get("rubric", []) if str(r).strip()]
        if not prompt or not rubric:
            continue
        bloom = entry.get("bloom_level")
        ref = entry.get("targets_misconception")
        out.append(
            CheckpointItem(
                id=_slugify(str(entry.get("id") or prompt)).replace("-", "_")[:60],
                prompt=prompt,
                bloom_level=bloom if bloom in ("remember", "understand", "apply", "analyse") else default_bloom,
                rubric=rubric,
                targets_misconception=ref if ref in declared else None,
            )
        )
    return out


# --- templates: what mock mode and degraded live calls fall back to ---------
#
# These are derived from the authored content rather than being generic
# filler, so a zero-key demo still shows a concept-specific classroom. They
# are deliberately plain: anything that reads well here is doing so because
# the authored content is good, which is the right dependency.


def _template_claims(base: StructuredConceptRecord) -> list[str]:
    claims = [
        f"{base.concept_name} is the focus of this session, targeted at the "
        f"'{base.bloom_level}' level."
    ]
    if base.key_terms:
        claims.append("The terms that have to be used precisely here are " + ", ".join(base.key_terms) + ".")
    claims += [f"Learners often go wrong by this route: {m.statement}." for m in base.misconceptions[:2]]
    return claims


def _template_worked_example(base: StructuredConceptRecord) -> WorkedExample:
    first = base.misconceptions[0] if base.misconceptions else None
    return WorkedExample(
        situation=f"A standard first-year situation involving {base.concept_name}.",
        steps=[
            "Name what is being asked and which quantities are given.",
            first.probe if first else "Check each assumption before substituting.",
            "Substitute, then sanity-check the direction and magnitude of the result.",
        ],
        answer="The result follows once the setup above is stated explicitly.",
    )


def _template_hint_ladder(base: StructuredConceptRecord) -> list[HintRung]:
    rungs = [HintRung(level=1, text=f"Start from what {base.concept_name} is actually defined as.")]
    for i, m in enumerate(base.misconceptions[:2], start=2):
        rungs.append(HintRung(level=i, text=m.probe))
    rungs.append(
        HintRung(level=len(rungs) + 1, text="Work through the worked example's first step with your own numbers.")
    )
    return rungs


def _template_blanks(base: StructuredConceptRecord) -> list[BlankCandidate]:
    """
    Only reached for freeform topics where the model returned no usable blank.
    The blank has to be judgeable or the doubt log goes dead again (D1), so it
    asks for the concept's own name rather than inventing an answer nobody can
    check.
    """
    return [
        BlankCandidate(
            id="generated_name_blank",
            prompt=f"The concept this session is about is called ____.",
            expected_answers=[base.concept_name, base.concept_name.lower()],
            misconception_id=None,
            hint="It is the title of this session.",
        )
    ]


def _template_checkpoint_items(base: StructuredConceptRecord) -> list[CheckpointItem]:
    rubric = ["Explains the concept in the learner's own words", "Uses the key terms correctly"]
    rubric += [f"Does not show this difficulty: {m.statement}" for m in base.misconceptions[:2]]
    return [
        CheckpointItem(
            id="generated_cp_1",
            prompt=f"Explain {base.concept_name} in your own words, and give one situation where it applies.",
            bloom_level=base.bloom_level,
            rubric=rubric,
            targets_misconception=base.misconceptions[0].id if base.misconceptions else None,
        )
    ]
