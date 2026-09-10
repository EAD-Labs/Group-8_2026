"""
Part 3 acceptance criteria — Learning Measurement Layer (HLD T3.1 - T3.9).

Covers the two criteria PROJECT.md §8 records as outright failures (T3.1
checkpoints not derived from the dialogue, T3.9 the stubbed comparative report),
the one recorded as missing (T3.4 linked questions), and the state ladder.
"""
from datetime import datetime, timedelta

import pytest

from app.content.loader import authored_record
from app.models import ConceptState, DoubtLogEntry, MasteryRecord, QuizResult


def _answer_well(record, item) -> str:
    """
    An answer that covers the rubric, for exercising the pass path under the
    mock grader. It reuses the rubric's wording deliberately: the heuristic
    grader scores keyword coverage, so this is the shape of answer that passes
    without needing an API key. It is not a claim that the grader understands it.
    """
    return " ".join(item.rubric) + " " + " ".join(record.key_terms)


def _pass_checkpoint(learner, session_id, concept_id):
    form = learner.get(f"/checkpoint/{session_id}")
    assert form.status_code == 200, form.text
    record = authored_record(concept_id)
    answers = {}
    for item_out in form.json()["items"]:
        item = next(i for i in record.checkpoint_items if i.id == item_out["id"])
        answers[item.id] = _answer_well(record, item)
    res = learner.post("/checkpoint/submit", json={"session_id": session_id, "answers": answers})
    assert res.status_code == 200, res.text
    return res.json()


# --- T3.1: the checkpoint derives from this dialogue ----------------------


def test_T3_1_checkpoint_items_come_from_the_session_record(learner, platform_session):
    """
    T3.1: the checkpoint derives from this dialogue.

    Previously one generic prompt — "explain what you understood" — that ignored
    the turns entirely. Items must now be the concept's authored checkpoint
    items, matched by id.
    """
    form = learner.get(f"/checkpoint/{platform_session['session_id']}")
    assert form.status_code == 200, form.text
    body = form.json()

    record = authored_record(platform_session["concept_id"])
    assert body["concept_id"] == platform_session["concept_id"]
    assert [i["id"] for i in body["items"]] == [i.id for i in record.checkpoint_items]
    assert len(body["items"]) >= 1
    for item in body["items"]:
        assert item["prompt"]
        assert item["bloom_level"] in ("remember", "understand", "apply", "analyse")


def test_T3_1_checkpoint_rubrics_are_not_sent_to_the_learner(learner, platform_session):
    """A learner given the rubric writes to the marking scheme instead of answering."""
    body = learner.get(f"/checkpoint/{platform_session['session_id']}").text
    assert "rubric" not in body
    assert "targets_misconception" not in body


def test_T3_1_each_item_is_graded_separately_against_its_rubric(learner, platform_session):
    result = _pass_checkpoint(learner, platform_session["session_id"], platform_session["concept_id"])
    record = authored_record(platform_session["concept_id"])
    assert len(result["per_item"]) == len(record.checkpoint_items)
    for item_result in result["per_item"]:
        assert 0.0 <= item_result["score"] <= 1.0
        assert item_result["feedback"]


def test_checkpoint_grading_discriminates_between_answers(learner, platform_session):
    """
    A weak answer must not score the same as a strong one. The old grader passed
    any non-empty answer with score 1.0, which would have made every figure in
    the client report identically 1.0.
    """
    session_id = platform_session["session_id"]
    form = learner.get(f"/checkpoint/{session_id}").json()
    weak = {i["id"]: "yes" for i in form["items"]}
    res = learner.post("/checkpoint/submit", json={"session_id": session_id, "answers": weak})
    assert res.status_code == 200
    assert res.json()["score"] < 0.6, "a content-free answer passed the checkpoint"
    assert res.json()["passed"] is False


def test_missed_checkpoint_item_writes_a_doubt(learner, platform_session, session_factory):
    """A missed item naming a target misconception is a doubt (source checkpoint_miss)."""
    session_id = platform_session["session_id"]
    form = learner.get(f"/checkpoint/{session_id}").json()
    learner.post("/checkpoint/submit",
                 json={"session_id": session_id, "answers": {form["items"][0]["id"]: "no idea"}})

    db = session_factory()
    try:
        entries = db.query(DoubtLogEntry).filter_by(user_id=learner.id, source="checkpoint_miss").all()
        assert entries, "a missed checkpoint item logged no doubt"
        rec = authored_record(platform_session["concept_id"])
        assert all(e.misconception_id in rec.misconception_ids() for e in entries)
    finally:
        db.close()


def test_empty_checkpoint_is_rejected_when_blocking(learner, platform_session):
    res = learner.post("/checkpoint/submit",
                       json={"session_id": platform_session["session_id"], "answers": {}})
    assert res.status_code == 400


# --- T3.2, T3.3: the state ladder ----------------------------------------


def test_T3_2_retention_quiz_is_scheduled_and_not_takeable_early(
    learner, platform_session, session_factory
):
    """T3.2: a retention check is scheduled — and never on the day the concept was learned."""
    _pass_checkpoint(learner, platform_session["session_id"], platform_session["concept_id"])

    db = session_factory()
    try:
        quiz = (
            db.query(QuizResult)
            .filter_by(user_id=learner.id, concept_id=platform_session["concept_id"],
                       quiz_type="retention")
            .one()
        )
        assert quiz.scheduled_for > datetime.utcnow() + timedelta(days=2)
        quiz_id = quiz.id
    finally:
        db.close()

    early = learner.post(f"/progress/quizzes/{quiz_id}/submit", json={"answer": "something"})
    assert early.status_code == 400, "a retention check was takeable on the day of learning"


def test_retained_is_only_reachable_through_a_delayed_check(
    learner, platform_session, session_factory
):
    """
    HLD 6.6: passing a checkpoint reaches CHECKPOINT_PASSED, never RETAINED. This
    is what stops one long session inflating the headline number.
    """
    _pass_checkpoint(learner, platform_session["session_id"], platform_session["concept_id"])
    db = session_factory()
    try:
        mastery = db.query(MasteryRecord).filter_by(
            user_id=learner.id, concept_id=platform_session["concept_id"]
        ).one()
        assert mastery.state == ConceptState.CHECKPOINT_PASSED
    finally:
        db.close()


def _stored_record(session_factory, concept_id):
    """
    The *stored* structured record for a concept.

    Not the same as `authored_record`: that returns only the half held in
    modules.json (misconceptions, blanks, checkpoint items), while claims and the
    worked example are compiled by the verification engine at session start. Any
    test about grading against claims has to read what was actually stored.
    """
    from app.models import VerifiedKnowledgeRecord
    from app.services.verification_engine import load_structured

    db = session_factory()
    try:
        record = (
            db.query(VerifiedKnowledgeRecord)
            .filter_by(concept_id=concept_id)
            .order_by(VerifiedKnowledgeRecord.created_at.desc())
            .first()
        )
        return load_structured(record)
    finally:
        db.close()


def _unlock(session_factory, quiz_id):
    """Backdate a scheduled quiz so the delayed path can be exercised in a test."""
    db = session_factory()
    try:
        quiz = db.query(QuizResult).filter_by(id=quiz_id).one()
        quiz.scheduled_for = datetime.utcnow() - timedelta(days=1)
        db.commit()
    finally:
        db.close()


def _retention_quiz_id(session_factory, user_id, concept_id):
    db = session_factory()
    try:
        return (
            db.query(QuizResult)
            .filter_by(user_id=user_id, concept_id=concept_id, quiz_type="retention",
                       completed_at=None)
            .first()
            .id
        )
    finally:
        db.close()


def test_passing_a_delayed_check_reaches_retained(learner, platform_session, session_factory):
    concept_id = platform_session["concept_id"]
    _pass_checkpoint(learner, platform_session["session_id"], concept_id)
    quiz_id = _retention_quiz_id(session_factory, learner.id, concept_id)
    _unlock(session_factory, quiz_id)

    record = _stored_record(session_factory, concept_id)
    res = learner.post(f"/progress/quizzes/{quiz_id}/submit",
                       json={"answer": " ".join(record.claims + record.key_terms)})
    assert res.status_code == 200, res.text
    assert res.json()["passed"] is True

    db = session_factory()
    try:
        mastery = db.query(MasteryRecord).filter_by(user_id=learner.id, concept_id=concept_id).one()
        assert mastery.state == ConceptState.RETAINED
    finally:
        db.close()


def test_T3_3_wrong_answer_demotes_and_requeues_the_concept(
    learner, platform_session, session_factory
):
    """T3.3: a failed later check demotes the concept and schedules another check."""
    concept_id = platform_session["concept_id"]
    _pass_checkpoint(learner, platform_session["session_id"], concept_id)
    quiz_id = _retention_quiz_id(session_factory, learner.id, concept_id)
    _unlock(session_factory, quiz_id)

    res = learner.post(f"/progress/quizzes/{quiz_id}/submit", json={"answer": "dunno"})
    assert res.status_code == 200
    assert res.json()["passed"] is False

    db = session_factory()
    try:
        mastery = db.query(MasteryRecord).filter_by(user_id=learner.id, concept_id=concept_id).one()
        assert mastery.state == ConceptState.DEMOTED
        requeued = db.query(QuizResult).filter_by(
            user_id=learner.id, concept_id=concept_id, quiz_type="retention", completed_at=None
        ).count()
        assert requeued >= 1, "a failed check did not re-queue the concept"
    finally:
        db.close()


# --- T3.4: linked questions ----------------------------------------------


def test_T3_4_second_passed_concept_gets_a_question_linked_to_the_first(
    learner, session_factory
):
    """
    T3.4: a new question linked to a concept the learner has already learned.

    Recorded as 'missing' in PROJECT.md §8. Needs two passed concepts — the first
    checkpoint has nothing to link to.
    """
    first_id = learner.concept_for("platform")
    first = learner.post("/classroom/start", json={"concept_id": first_id}).json()
    _pass_checkpoint(learner, first["session_id"], first_id)

    db = session_factory()
    try:
        assert db.query(QuizResult).filter_by(user_id=learner.id, quiz_type="linked").count() == 0, (
            "a first concept should have nothing to link to"
        )
    finally:
        db.close()

    # a second concept, outside the graded pair so it runs as general_use
    second_id = "second_law_and_entropy"
    second = learner.post("/classroom/start", json={"concept_id": second_id})
    assert second.status_code == 200, second.text
    _pass_checkpoint(learner, second.json()["session_id"], second_id)

    db = session_factory()
    try:
        linked = db.query(QuizResult).filter_by(user_id=learner.id, quiz_type="linked").all()
        assert len(linked) == 1, "no linked question scheduled for the second concept"
        assert linked[0].concept_id == second_id
        assert linked[0].linked_concept_id == first_id
        assert first_id.split("_")[0] in linked[0].prompt.lower() or linked[0].prompt
    finally:
        db.close()

    pending = learner.get("/progress/quizzes/pending").json()
    assert any(q["quiz_type"] == "linked" and q["available_now"] for q in pending)


# --- T3.5: transfer problems --------------------------------------------


def test_T3_5_transfer_problem_rules_out_the_covered_situation(
    learner, platform_session, session_factory
):
    """
    T3.5: a transfer problem in a situation the session did not cover.

    Was a generic template. The prompt must now explicitly exclude the worked
    example the class went through, or it is a recall question wearing a
    transfer label.
    """
    concept_id = platform_session["concept_id"]
    _pass_checkpoint(learner, platform_session["session_id"], concept_id)

    db = session_factory()
    try:
        quiz = db.query(QuizResult).filter_by(
            user_id=learner.id, concept_id=concept_id, quiz_type="transfer"
        ).one()
    finally:
        db.close()

    record = authored_record(concept_id)
    assert "did not come up" in quiz.prompt
    assert record.worked_example is None or "Do not reuse" in quiz.prompt
    assert quiz.scheduled_for <= datetime.utcnow(), "transfer problems are available immediately"


# --- T3.6, T3.7: voice signals -----------------------------------------


def test_T3_6_only_derived_scores_are_stored_no_raw_media(learner, platform_session):
    """T3.6: derived scores stored, no raw media."""
    from app.config import settings
    from app.models import VoiceSignalScore

    res = learner.client.post(
        f"/voice/{platform_session['session_id']}/submit",
        headers=learner.headers,
        files={"file": ("clip.webm", b"\x00\x01fake audio bytes", "audio/webm")},
    )
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True

    # no column on the model can hold audio
    columns = {c.name for c in VoiceSignalScore.__table__.columns}
    assert not columns & {"audio", "audio_bytes", "clip", "raw_audio", "transcript"}


def test_voice_coverage_scores_against_key_terms_not_the_concept_name(learner, platform_session):
    """
    PROJECT.md D8: coverage used to match the concept title only, so a learner who
    explained it correctly without saying the title scored 0. It must score
    against the record's key terms.
    """
    res = learner.client.post(
        f"/voice/{platform_session['session_id']}/submit",
        headers=learner.headers,
        files={"file": ("clip.webm", b"fake", "audio/webm")},
    ).json()
    record = authored_record(platform_session["concept_id"])
    assert res["terms_expected"] == record.key_terms
    assert len(res["terms_expected"]) > 1


def test_T3_7_declining_voice_leaves_the_core_flow_working(learner, platform_session):
    """T3.7: declining capture leaves the core working — typed fallback throughout."""
    result = _pass_checkpoint(learner, platform_session["session_id"], platform_session["concept_id"])
    assert result["passed"] is True  # no voice clip was ever submitted


def test_voice_dictation_reports_unavailable_rather_than_faking_a_transcript(
    learner, platform_session
):
    """
    PROJECT.md D6: voice question input goes through the backend now, but the
    transcriber is still mocked. Returning the canned mock string as if it were
    the learner's words would put words in their mouth.
    """
    res = learner.client.post(
        f"/voice/{platform_session['session_id']}/transcribe",
        headers=learner.headers,
        files={"file": ("clip.webm", b"fake", "audio/webm")},
    )
    assert res.status_code == 503
    assert "type your question" in res.json()["detail"].lower()

    status = learner.get("/voice/status").json()
    assert status["transcription_usable"] is False


# --- T3.8, T3.9: progress and the report -------------------------------


def test_T3_8_progress_shows_mastery_gaps_and_points(learner, platform_session):
    """
    T3.8: the progress view shows mastery, gaps and points.

    'Gaps always empty' was the recorded shortfall, because the doubt log could
    not be written to (D1).
    """
    session_id = platform_session["session_id"]
    blank = next(t for t in learner.get(f"/classroom/{session_id}/turns").json()["turns"]
                 if t["turn_type"] == "blank")
    learner.post(f"/classroom/{session_id}/blank-attempt",
                 json={"turn_id": blank["id"], "guess": "wrong"})
    _pass_checkpoint(learner, session_id, platform_session["concept_id"])

    body = learner.get("/progress/me").json()
    assert body["mastery"], "no mastery records"
    assert body["open_doubts"], "gaps are still structurally empty"
    assert body["points"] > 0
    assert body["badges"], "no badge awarded for a first passed checkpoint"


def test_closing_a_doubt_awards_points_and_closes_it(learner, platform_session):
    session_id = platform_session["session_id"]
    blank = next(t for t in learner.get(f"/classroom/{session_id}/turns").json()["turns"]
                 if t["turn_type"] == "blank")
    learner.post(f"/classroom/{session_id}/blank-attempt",
                 json={"turn_id": blank["id"], "guess": "wrong"})

    doubt = learner.get("/progress/me").json()["open_doubts"][0]
    before = learner.get("/progress/me").json()["points"]

    res = learner.post(f"/progress/doubts/{doubt['id']}/close")
    assert res.status_code == 200
    assert res.json()["closed"] is True

    after = learner.get("/progress/me").json()
    assert after["points"] == before + 5
    assert after["open_doubts"] == []
    assert after["doubts_closed"] == 1


def test_T3_9_comparative_report_returns_real_figures(learner, other_learner, session_factory):
    """
    T3.9: the comparative evaluation is reportable.

    `comparative_report` was a stub returning None for every figure. It must now
    compute over condition x ConceptState x QuizResult, and must state its own
    caveats rather than presenting mock-graded numbers as findings.
    """
    # one learner completes both arms
    platform_id = learner.concept_for("platform")
    plain_id = learner.concept_for("plain_chat")

    p = learner.post("/classroom/start", json={"concept_id": platform_id}).json()
    _pass_checkpoint(learner, p["session_id"], platform_id)

    b = learner.post("/baseline/start", json={"concept_id": plain_id})
    assert b.status_code == 200, b.text
    learner.post(f"/baseline/{b.json()['session_id']}/message", json={"message": "explain this"})
    learner.post(f"/baseline/{b.json()['session_id']}/complete")
    _pass_checkpoint(learner, b.json()["session_id"], plain_id)

    report = learner.get("/progress/comparative-report")
    assert report.status_code == 200, report.text
    body = report.json()

    assert body["retained_rate"]["platform"] is not None
    assert body["retained_rate"]["plain_chat"] is not None
    assert body["per_arm_detail"]["platform"]["learner_concepts"] == 1
    assert body["per_arm_detail"]["plain_chat"]["learner_concepts"] == 1
    assert body["cohort"]["learners_with_both_arms"] == 1
    assert len(body["cohort"]["paired_deltas"]) == 1
    assert body["doubt_log"]["total"] >= 0
    assert any("mock" in c for c in body["caveats"]), (
        "a report built on mock grading must say so"
    )


def test_report_excludes_general_use_concepts_from_the_comparison(learner, session_factory):
    """
    D-03: the two module-orphan concepts never feed the graded comparison. A
    general_use session must not appear in either arm.
    """
    res = learner.post("/classroom/start", json={"concept_id": "second_law_and_entropy"})
    assert res.status_code == 200
    _pass_checkpoint(learner, res.json()["session_id"], "second_law_and_entropy")

    body = learner.get("/progress/comparative-report").json()
    assert body["per_arm_detail"]["platform"]["learner_concepts"] == 0
    assert body["per_arm_detail"]["plain_chat"]["learner_concepts"] == 0


def test_report_counts_doubts_by_misconception(learner, platform_session):
    session_id = platform_session["session_id"]
    blank = next(t for t in learner.get(f"/classroom/{session_id}/turns").json()["turns"]
                 if t["turn_type"] == "blank")
    learner.post(f"/classroom/{session_id}/blank-attempt",
                 json={"turn_id": blank["id"], "guess": "wrong"})

    body = learner.get("/progress/comparative-report").json()
    by_misconception = body["doubt_log"]["by_misconception"]
    assert by_misconception, "doubts are not aggregated by misconception"
    assert sum(by_misconception.values()) == body["doubt_log"]["total"]
