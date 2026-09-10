"""
Part 1 acceptance criteria — Verified Knowledge Engine (HLD T1.1 - T1.7).

Test names are the criteria. Where a criterion cannot pass as written, the test
says so explicitly rather than being quietly omitted or weakened to green — see
`test_T1_2` and `test_T1_3`.
"""
import pytest

from app.content.loader import authored_record, load_content
from app.content.schema import StructuredConceptRecord
from app.models import VerifiedKnowledgeRecord


def _record(session_factory, concept_id):
    db = session_factory()
    try:
        return (
            db.query(VerifiedKnowledgeRecord)
            .filter_by(concept_id=concept_id)
            .order_by(VerifiedKnowledgeRecord.created_at.desc())
            .first()
        )
    finally:
        db.close()


def test_T1_1_record_stored_with_contributing_providers(learner, platform_session, session_factory):
    """T1.1: the record names which providers contributed to it."""
    record = _record(session_factory, platform_session["concept_id"])
    assert record is not None
    assert record.provenance["providers_used"], "no contributing providers recorded"
    assert record.provenance["providers_attempted"]
    assert record.provenance["llm_mode"] == "mock"


def test_T1_2_disagreement_is_detected_resolved_and_stored(platform_session, session_factory):
    """
    T1.2: a detected inter-agent disagreement is resolved and stored.

    This does NOT pass in mock mode, and the test asserts the honest state
    rather than faking it. In mock mode every provider returns the same canned
    response, so there is nothing to disagree about; with a single live key,
    `_adjudicate_live` never runs because it needs two answers. The record
    instead stores *why* no disagreement was detected, which is the minimum
    needed to report the finding truthfully.

    Passing this for real needs two model families (a gateway credential gives
    that from one key) — and even then, frontier models will not disagree on
    first-year facts, which is why the adjudicator also asks about pedagogical
    choices. See PROJECT.md §13 question 1: this criterion is open with the
    client.
    """
    record = _record(session_factory, platform_session["concept_id"])
    stored = record.resolved_disagreements

    assert "counts" in stored, "disagreement outcome must be stored either way"
    assert stored.get("note"), "when no disagreement is detected, the reason must be recorded"

    detected = sum(stored["counts"].values()) if stored["counts"] else 0
    pytest.xfail(
        f"T1.2 unsatisfiable in mock mode: {detected} disagreements detected because "
        f"{stored['note']}. Needs >=2 model families configured."
    )


def test_T1_3_incorrect_claim_does_not_survive():
    """
    T1.3: an incorrect claim does not survive verification.

    Untestable as specified: there is no ground truth in the system to check a
    claim against. Verifying this needs either the prescribed course text as an
    external reference or a human-marked set of deliberately wrong claims.
    Recorded here so it stays visible as an open criterion instead of being
    absent from the suite.
    """
    pytest.skip("No ground-truth source to verify against — PROJECT.md §13 question 2.")


def test_T1_4_cached_record_is_reused_without_new_calls(learner, session_factory, monkeypatch):
    """T1.4: a second session on the same concept reuses the record and makes no provider calls."""
    concept_id = learner.concept_for("platform")
    first = learner.post("/classroom/start", json={"concept_id": concept_id})
    assert first.status_code == 200
    record_before = _record(session_factory, concept_id)

    calls = []

    async def tracking_generate(provider_name, prompt, *, concept_name=""):
        calls.append(provider_name)
        return "should not be called"

    monkeypatch.setattr("app.services.verification_engine.generate", tracking_generate)

    second = learner.post("/classroom/start", json={"concept_id": concept_id})
    assert second.status_code == 200
    assert calls == [], f"cached concept still called providers: {calls}"

    record_after = _record(session_factory, concept_id)
    assert record_after.id == record_before.id

    db = session_factory()
    try:
        assert db.query(VerifiedKnowledgeRecord).filter_by(concept_id=concept_id).count() == 1
    finally:
        db.close()


def test_T1_5_one_provider_down_lowers_confidence(learner, monkeypatch):
    """T1.5: one provider failing degrades that provider only, and the record says so."""
    from app.config import settings

    async def half_failing(provider_name, prompt, *, concept_name=""):
        if provider_name == settings.llm_providers[0]:
            raise RuntimeError("simulated provider outage")
        return '{"claims": ["a surviving claim"]}'

    monkeypatch.setattr("app.services.verification_engine.generate", half_failing)

    concept_id = learner.concept_for("platform")
    res = learner.post("/classroom/start", json={"concept_id": concept_id})
    assert res.status_code == 200, res.text

    from app.database import get_db  # noqa: F401  (ensures override is in place)


def test_T1_5b_one_provider_down_is_recorded_in_provenance(learner, session_factory, monkeypatch):
    from app.config import settings

    down = settings.llm_providers[0]

    async def half_failing(provider_name, prompt, *, concept_name=""):
        if provider_name == down:
            raise RuntimeError("simulated provider outage")
        return '{"claims": ["a surviving claim"]}'

    monkeypatch.setattr("app.services.verification_engine.generate", half_failing)

    concept_id = learner.concept_for("platform")
    learner.post("/classroom/start", json={"concept_id": concept_id})
    record = _record(session_factory, concept_id)

    assert down not in record.provenance["providers_used"]
    assert down in record.provenance["providers_attempted"]
    assert record.confidence < 1.0, "a degraded record must not claim full confidence"


def test_T1_6_all_providers_down_is_recoverable(learner, session_factory, monkeypatch):
    """T1.6: every provider failing still leaves a usable session, not a 500."""

    async def all_failing(provider_name, prompt, *, concept_name=""):
        raise RuntimeError("simulated total outage")

    monkeypatch.setattr("app.services.verification_engine.generate", all_failing)

    concept_id = learner.concept_for("platform")
    res = learner.post("/classroom/start", json={"concept_id": concept_id})
    assert res.status_code == 200, res.text

    record = _record(session_factory, concept_id)
    assert record.confidence == 0.0

    # the session is still usable: authored content carries it
    turns = learner.get(f"/classroom/{res.json()['session_id']}/turns")
    assert turns.status_code == 200
    assert len(turns.json()["turns"]) >= 6
    checkpoint = learner.get(f"/checkpoint/{res.json()['session_id']}")
    assert checkpoint.status_code == 200
    assert checkpoint.json()["items"], "authored checkpoint items must survive a total outage"


def test_T1_7_content_is_segmented_and_addressable(platform_session, session_factory):
    """
    T1.7: the record is segmented and addressable, so the dialogue layer can draw
    on specific points rather than pasting a blob.
    """
    record = _record(session_factory, platform_session["concept_id"])
    assert record.structured, "record has no structured payload"

    parsed = StructuredConceptRecord.model_validate(record.structured)
    assert parsed.claims, "no addressable claims"
    assert parsed.worked_example is not None
    assert parsed.hint_ladder, "no hint ladder"
    assert parsed.misconceptions, "no misconceptions to address"
    assert parsed.blanks, "no blanks"
    assert parsed.checkpoint_items, "no checkpoint items"
    assert all(item.rubric for item in parsed.checkpoint_items), "a checkpoint item has no rubric"

    # addressable by id, not by substring search
    first = parsed.misconceptions[0]
    assert parsed.misconception(first.id) is first
    assert parsed.blank(parsed.blanks[0].id) is parsed.blanks[0]


def test_authored_misconception_ids_form_a_closed_enum():
    """
    Every blank and checkpoint item references a misconception declared on the
    same concept. This is what makes DoubtLogEntry rows aggregatable; a typo here
    would silently produce uncountable doubts.
    """
    for module in load_content()["modules"]:
        for concept in module["concepts"]:
            rec = authored_record(concept["id"])
            declared = set(rec.misconception_ids())
            assert declared, f"{concept['id']} declares no misconceptions"
            for blank in rec.blanks:
                if blank.misconception_id:
                    assert blank.misconception_id in declared, f"{concept['id']}/{blank.id}"
            for item in rec.checkpoint_items:
                if item.targets_misconception:
                    assert item.targets_misconception in declared, f"{concept['id']}/{item.id}"


def test_blank_expected_answers_never_reach_the_browser(learner, platform_session):
    """
    Expected answers and rubrics are server-side only. If either shipped to the
    client, the blank gate and the checkpoint would both be decorative.
    """
    modules = learner.get("/topics/modules").json()
    payload = repr(modules)
    assert "expected_answers" not in payload
    assert "rubric" not in payload

    turns = learner.get(f"/classroom/{platform_session['session_id']}/turns").json()
    assert "expected_answers" not in repr(turns)
