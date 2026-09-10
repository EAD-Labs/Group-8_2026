"""
Grading — checkpoints, retention checks, transfer problems and linked
questions all funnel through here.

Two paths, same shape as verification and dialogue generation:

  - **live**: an LLM judges the answer against the *rubric* from the structured
    concept record. Rubric-conditioned grading measurably beats grading against
    a paragraph, and the rubric is exactly what the record now carries — before
    D5 this function was handed `verified_text` and asked to grade against a
    prose blob (PROJECT.md D5).
  - **mock / no provider**: a deterministic rubric-coverage heuristic. It is
    still a placeholder and says so, but it is no longer the old "any non-empty
    answer passes" rule: that produced a constant score, which would have made
    every comparative figure in the client report identically 1.0 and hidden
    the fact that nothing was being measured. Coverage at least varies with the
    answer, so a mock pilot run exercises the measurement path honestly.

Grading also reports which misconceptions the answer showed. That is what lets
a checkpoint miss write a doubt-log entry naming something countable rather
than just recording a low score (HLD 6.6).
"""
from dataclasses import dataclass, field

from app.config import settings
from app.content.schema import CheckpointItem, StructuredConceptRecord
from app.services.llm_providers import generate, preferred_available_provider, extract_json_object

# A rubric criterion counts as met in the heuristic path when this share of its
# content words appear in the answer. Set from the observation that a first-year
# answer restating a criterion in its own words typically reuses roughly half
# its content words — it is a threshold for a placeholder, not a calibrated
# parameter, and it is one of the first things a real grading test should pin
# down.
_HEURISTIC_CRITERION_THRESHOLD = 0.5
_HEURISTIC_PASS_THRESHOLD = 0.5

# Words carrying no discriminating signal when matching an answer to a rubric.
_STOPWORDS = frozenset(
    """a an and are as at be been but by can cannot do does for from had has have how i if in
    into is it its no not of on or over so state states than that the their them then there these
    they this to under up use uses using was what when where which who why will with would your
    identifies explains says notes gives arrives concludes treats keeps counts computes""".split()
)


@dataclass
class GradeResult:
    passed: bool
    score: float
    feedback: str
    # misconception ids the answer showed, drawn from the concept's authored
    # enum. Feeds the doubt log.
    flagged_misconceptions: list[str] = field(default_factory=list)
    # which rubric criteria were judged met, for the per-item breakdown
    criteria_met: list[str] = field(default_factory=list)
    graded_by: str = "heuristic"

    def as_tuple(self) -> tuple[bool, float, str]:
        """Back-compatible shape for callers that only want the verdict."""
        return self.passed, self.score, self.feedback


async def grade_answer(
    *,
    prompt: str,
    record: StructuredConceptRecord,
    learner_answer: str,
    item: CheckpointItem | None = None,
) -> GradeResult:
    """
    `prompt` is what the learner was asked. `record` supplies the claims,
    misconception enum and rubric context. `item` is the specific checkpoint
    item when there is one — its rubric is what the answer is graded against;
    without one (retention / transfer / linked questions) the record's claims
    carry the grading context instead.
    """
    answer = learner_answer.strip()
    if not answer:
        return GradeResult(False, 0.0, "No answer given.", graded_by="empty")

    if settings.llm_mode == "live":
        provider = preferred_available_provider()
        if provider:
            live = await _grade_live(provider, prompt, record, answer, item)
            if live:
                return live

    return _grade_heuristic(record, answer, item)


async def _grade_live(
    provider: str,
    prompt: str,
    record: StructuredConceptRecord,
    answer: str,
    item: CheckpointItem | None,
) -> GradeResult | None:
    rubric_block = (
        "Grade against these criteria. A criterion counts as met if the answer conveys it in the "
        "student's own words — verbatim matching is not required.\n"
        + "\n".join(f"  {i + 1}. {c}" for i, c in enumerate(item.rubric))
        if item
        else record.rubric_block()
    )
    misconception_block = ""
    if record.misconceptions:
        misconception_block = (
            "\n\nIf the answer displays any of these known difficulties, list its id:\n"
            + "\n".join(f"  - [{m.id}] {m.statement}" for m in record.misconceptions)
        )

    judge_prompt = (
        f"You are grading a first-year engineering student's answer about "
        f"'{record.concept_name}'.\n\n"
        f"Question asked: {prompt}\n\n"
        f"{rubric_block}{misconception_block}\n\n"
        f"Student's answer:\n{answer}\n\n"
        "Judge whether the answer demonstrates real understanding. Correct reasoning in the "
        "student's own words is fine; partial credit is fine. Score as the share of criteria met.\n\n"
        "Respond with ONLY a JSON object, no other text, in this exact shape:\n"
        '{"passed": true or false, "score": <0.0 to 1.0>, '
        '"criteria_met": ["<criterion text that was met>"], '
        '"flagged_misconceptions": ["<id>"], '
        '"feedback": "<one short sentence of specific, constructive feedback>"}'
    )
    try:
        raw = await generate(provider, judge_prompt, concept_name=record.concept_name)
        parsed = extract_json_object(raw)
        declared = set(record.misconception_ids())
        return GradeResult(
            passed=bool(parsed["passed"]),
            score=max(0.0, min(1.0, float(parsed.get("score", 1.0 if parsed["passed"] else 0.0)))),
            feedback=str(parsed.get("feedback", "")),
            # keep only ids from the authored enum — a model inventing a new id
            # would put an unaggregatable row in the doubt log
            flagged_misconceptions=[
                m for m in parsed.get("flagged_misconceptions", []) if m in declared
            ],
            criteria_met=[str(c) for c in parsed.get("criteria_met", [])],
            graded_by=f"llm:{provider}",
        )
    except Exception:
        return None


def _grade_heuristic(
    record: StructuredConceptRecord, answer: str, item: CheckpointItem | None
) -> GradeResult:
    """
    Deterministic rubric-coverage placeholder, used in mock mode and whenever a
    live judge call fails.

    Scores the share of rubric criteria whose content words the answer covers.
    It cannot assess reasoning and will reward keyword stuffing — it is a
    placeholder, and the feedback string says so to the learner's face rather
    than implying the answer was understood. What it does buy is a score that
    actually varies with the answer, so the measurement layer and the
    comparative report can be exercised without API keys.
    """
    criteria = item.rubric if item else (record.claims or [record.concept_name])
    answer_words = _content_words(answer)

    met = [c for c in criteria if _criterion_covered(c, answer_words)]
    score = round(len(met) / len(criteria), 2) if criteria else 0.0
    passed = score >= _HEURISTIC_PASS_THRESHOLD

    # A criterion targeting a specific misconception that went unmet is
    # evidence of that misconception — the only signal available without a
    # judge call.
    flagged = []
    if item and item.targets_misconception and not passed:
        flagged.append(item.targets_misconception)

    missing = len(criteria) - len(met)
    if passed:
        feedback = (
            f"Covered {len(met)} of {len(criteria)} points. "
            f"(Scored by keyword coverage, not by reasoning — set llm_mode=live with an API key "
            f"for real grading.)"
        )
    else:
        feedback = (
            f"Covered {len(met)} of {len(criteria)} points — {missing} still missing. "
            f"(Scored by keyword coverage, not by reasoning — set llm_mode=live with an API key "
            f"for real grading.)"
        )

    return GradeResult(
        passed=passed,
        score=score,
        feedback=feedback,
        flagged_misconceptions=flagged,
        criteria_met=met,
        graded_by="heuristic",
    )


def _content_words(text: str) -> set[str]:
    import re

    words = re.findall(r"[a-z0-9]+", text.lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 2}


def _criterion_covered(criterion: str, answer_words: set[str]) -> bool:
    needed = _content_words(criterion)
    if not needed:
        return False
    overlap = len(needed & answer_words) / len(needed)
    return overlap >= _HEURISTIC_CRITERION_THRESHOLD
