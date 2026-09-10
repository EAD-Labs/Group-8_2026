"""
Part 2 acceptance criteria — Simulated Classroom (HLD T2.1 - T2.10).

These cover the defects PROJECT.md §7 lists against this part: D2 (learner
questions ignoring the dialogue, T2.6), D3 (unauthenticated endpoints), D7 (no
SSE resume, T2.10) and the missing reduced mode (T2.7).
"""
import json

import pytest

from app.content.loader import authored_record
from app.models import DialogueTurn, DoubtLogEntry, InteractionEvent


def _turns(learner, session_id):
    res = learner.get(f"/classroom/{session_id}/turns")
    assert res.status_code == 200, res.text
    return res.json()["turns"]


def _blank_turn(learner, session_id):
    return next(t for t in _turns(learner, session_id) if t["turn_type"] == "blank")


# --- T2.1 - T2.3: the dialogue itself --------------------------------------


def test_T2_1_three_personas_reach_the_concept(learner, platform_session):
    """T2.1: teacher, basic student and advanced student all speak, in a fixed spec."""
    turns = _turns(learner, platform_session["session_id"])
    speakers = {t["speaker"] for t in turns}
    assert {"teacher", "basic_student", "advanced_student"} <= speakers
    assert len(turns) == 7, f"expected the fixed 7-turn spec, got {len(turns)}"
    # Bloom progression: the spec must not end below where it started
    blooms = [t["target_bloom_level"] for t in turns if t["target_bloom_level"]]
    assert blooms[0] == "remember"
    assert "analyse" in blooms


def test_T2_2_basic_student_asks_about_a_named_misconception(
    learner, platform_session, session_factory
):
    """
    T2.2: the basic student asks a foundational question.

    Was scored 'weak': the question was generic because no misconception existed
    to draw on. It must now name one of the concept's authored difficulties.
    """
    db = session_factory()
    try:
        turn = (
            db.query(DialogueTurn)
            .filter_by(session_id=platform_session["session_id"], speaker="basic_student")
            .order_by(DialogueTurn.turn_index)
            .first()
        )
        assert turn is not None
        rec = authored_record(platform_session["concept_id"])
        assert turn.misconception_id in rec.misconception_ids(), (
            "the basic student's question is not seeded with a declared misconception"
        )
        probe = rec.misconception(turn.misconception_id).probe
        assert probe[:30] in turn.content, "the question does not use the misconception's probe"
    finally:
        db.close()


def test_T2_3_advanced_student_challenges_rather_than_agreeing(
    learner, platform_session, session_factory
):
    """
    T2.3: the advanced student challenges rather than just agreeing.

    Was scored 'weak': the boundary-case turn existed but was unseeded. It must
    now target a declared misconception, and must not simply assent.
    """
    db = session_factory()
    try:
        turns = (
            db.query(DialogueTurn)
            .filter_by(session_id=platform_session["session_id"], speaker="advanced_student")
            .order_by(DialogueTurn.turn_index)
            .all()
        )
        assert len(turns) >= 2, "expected a worked-situation turn and a boundary-case turn"
        boundary = turns[-1]
        rec = authored_record(platform_session["concept_id"])
        assert boundary.misconception_id in rec.misconception_ids()
        assert boundary.target_bloom_level.value == "analyse"
        assert "?" in boundary.content, "a challenge should be put as a question to the class"
    finally:
        db.close()


# --- T2.4, T2.5: the gates -------------------------------------------------


def test_T2_4_hint_is_blocked_until_a_guess_is_committed(learner, platform_session):
    """T2.4: the hint ladder is not readable before a guess is committed — server-side."""
    session_id = platform_session["session_id"]
    blank = _blank_turn(learner, session_id)

    early = learner.get(f"/classroom/{session_id}/hint/{blank['id']}")
    assert early.status_code == 409, "the hint ladder was readable without committing a guess"

    learner.post(f"/classroom/{session_id}/blank-attempt",
                 json={"turn_id": blank["id"], "guess": "something"})

    after = learner.get(f"/classroom/{session_id}/hint/{blank['id']}")
    assert after.status_code == 200
    assert after.json()["rungs"], "no hint rungs returned after a committed guess"


def test_T2_5_blank_prompt_is_present_and_answer_is_withheld(learner, platform_session):
    """
    T2.5: a blank blocks progress.

    The freeze itself is a client behaviour, but it can only be honest if the
    blank arrives with a prompt the learner must answer and without the answer
    attached — which is what is asserted here.
    """
    blank = _blank_turn(learner, platform_session["session_id"])
    assert "____" in blank["content"]
    assert blank["blank_id"]
    assert "expected_answers" not in blank


# --- D1: the doubt log ----------------------------------------------------


def test_D1_wrong_blank_guess_writes_a_doubt_with_a_misconception_id(
    learner, platform_session, session_factory
):
    """
    The doubt log is reachable (PROJECT.md D1).

    Before the fix, `log_doubt` had exactly one caller, gated on an `is_correct`
    and a `misconception` the frontend never sent, so no DoubtLogEntry could ever
    be created. A wrong guess must now write one, keyed on the enum.
    """
    session_id = platform_session["session_id"]
    blank = _blank_turn(learner, session_id)

    res = learner.post(
        f"/classroom/{session_id}/blank-attempt",
        json={"turn_id": blank["id"], "guess": "definitely not the right answer"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["is_correct"] is False
    assert body["doubt_logged"] is True
    assert body["hint"], "a nudge should come back with the verdict"

    db = session_factory()
    try:
        entries = db.query(DoubtLogEntry).filter_by(user_id=learner.id).all()
        assert len(entries) == 1
        entry = entries[0]
        assert entry.concept_id == platform_session["concept_id"]
        assert entry.source == "wrong_blank"
        rec = authored_record(entry.concept_id)
        assert entry.misconception_id in rec.misconception_ids(), "doubt is not keyed on the enum"
        assert entry.misconception, "doubt has no learner-facing label"
        assert entry.closed is False
    finally:
        db.close()

    # and it surfaces on the Progress screen, which showed an always-empty list before
    progress = learner.get("/progress/me").json()
    assert len(progress["open_doubts"]) == 1
    assert progress["open_doubts"][0]["misconception_id"]


def test_D1_correct_guess_logs_no_doubt(learner, platform_session, session_factory):
    """A correct guess must not write a doubt — otherwise the figure counts attempts."""
    session_id = platform_session["session_id"]
    blank = _blank_turn(learner, session_id)
    rec = authored_record(platform_session["concept_id"])
    expected = rec.blank(blank["blank_id"]).expected_answers[0]

    res = learner.post(
        f"/classroom/{session_id}/blank-attempt",
        json={"turn_id": blank["id"], "guess": expected},
    )
    assert res.json()["is_correct"] is True
    assert res.json()["doubt_logged"] is False

    db = session_factory()
    try:
        assert db.query(DoubtLogEntry).filter_by(user_id=learner.id).count() == 0
    finally:
        db.close()


def test_D1_guess_is_judged_case_and_punctuation_insensitively(learner, platform_session):
    session_id = platform_session["session_id"]
    blank = _blank_turn(learner, session_id)
    rec = authored_record(platform_session["concept_id"])
    expected = rec.blank(blank["blank_id"]).expected_answers[0]

    res = learner.post(
        f"/classroom/{session_id}/blank-attempt",
        json={"turn_id": blank["id"], "guess": f"  {expected.upper()}.  "},
    )
    assert res.json()["is_correct"] is True


def test_D1_repeat_wrong_guess_does_not_duplicate_the_doubt(
    learner, platform_session, session_factory
):
    """One open doubt per (learner, concept, misconception) — it counts difficulties, not attempts."""
    session_id = platform_session["session_id"]
    blank = _blank_turn(learner, session_id)
    for _ in range(3):
        learner.post(f"/classroom/{session_id}/blank-attempt",
                     json={"turn_id": blank["id"], "guess": "wrong again"})

    db = session_factory()
    try:
        assert db.query(DoubtLogEntry).filter_by(user_id=learner.id, closed=False).count() == 1
    finally:
        db.close()


def test_D1_revealing_without_guessing_logs_a_doubt(learner, platform_session, session_factory):
    session_id = platform_session["session_id"]
    blank = _blank_turn(learner, session_id)
    res = learner.post(f"/classroom/{session_id}/blank-attempt",
                       json={"turn_id": blank["id"], "guess": ""})
    assert res.json()["is_correct"] is None
    db = session_factory()
    try:
        entry = db.query(DoubtLogEntry).filter_by(user_id=learner.id).one()
        assert entry.source == "revealed_hint"
    finally:
        db.close()


def test_blank_attempt_records_an_interaction_event(learner, platform_session, session_factory):
    session_id = platform_session["session_id"]
    blank = _blank_turn(learner, session_id)
    learner.post(f"/classroom/{session_id}/blank-attempt",
                 json={"turn_id": blank["id"], "guess": "an attempt"})
    db = session_factory()
    try:
        event = db.query(InteractionEvent).filter_by(turn_id=blank["id"]).one()
        assert event.event_type == "guess"
        assert event.payload["judged_against_expected_answers"] is True
    finally:
        db.close()


# --- T2.6 / D2: learner questions in context ------------------------------


def test_T2_6_learner_question_is_answered_in_context(learner, platform_session):
    """
    T2.6: the answer refers to the dialogue so far, not a generic response.

    `insert_learner_question` previously received only the verified text and the
    concept name, so it structurally could not (PROJECT.md D2). It now receives
    the turns, and the mock path quotes the most recent speaker.
    """
    session_id = platform_session["session_id"]
    prior = _turns(learner, session_id)
    last_ai_turn = [t for t in prior if t["speaker"] != "learner"][-1]

    res = learner.post(f"/classroom/{session_id}/question",
                       json={"question": "Why does that step work?"})
    assert res.status_code == 200, res.text
    answer = res.json()["answer_turn"]["content"]

    snippet = last_ai_turn["content"].rstrip(".")[:40]
    assert snippet in answer, f"answer does not refer to the dialogue so far: {answer!r}"


def test_T2_6_question_and_answer_are_both_persisted_as_turns(learner, platform_session):
    session_id = platform_session["session_id"]
    before = len(_turns(learner, session_id))
    learner.post(f"/classroom/{session_id}/question", json={"question": "Can you repeat that?"})
    after = _turns(learner, session_id)
    assert len(after) == before + 2
    assert after[-2]["speaker"] == "learner"
    assert after[-1]["speaker"] == "teacher"


def test_empty_question_is_rejected(learner, platform_session):
    res = learner.post(f"/classroom/{platform_session['session_id']}/question",
                       json={"question": "   "})
    assert res.status_code == 400


# --- T2.7: reduced mode ---------------------------------------------------


def test_T2_7_reduced_mode_suppresses_the_basic_student(learner):
    """T2.7: reduced mode drops the basic-student persona and keeps everything else."""
    concept_id = learner.concept_for("platform")
    res = learner.post("/classroom/start",
                       json={"concept_id": concept_id, "dialogue_mode": "reduced"})
    assert res.status_code == 200, res.text
    assert res.json()["dialogue_mode"] == "reduced"

    turns = _turns(learner, res.json()["session_id"])
    speakers = {t["speaker"] for t in turns}
    assert "basic_student" not in speakers
    assert {"teacher", "advanced_student"} <= speakers

    # the gated hint and the blocking blank must survive the filter — they are
    # what T2.4 and T2.5 rest on
    types = {t["turn_type"] for t in turns}
    assert "hint" in types
    assert "blank" in types


def test_full_mode_is_the_default(learner, platform_session):
    assert platform_session["dialogue_mode"] == "full"


# --- T2.10 / D7: SSE resume ----------------------------------------------


def _read_sse(raw: str) -> list[dict]:
    """Parse an SSE body into [{'id','event','data'}] records."""
    events, current = [], {}
    for line in raw.splitlines():
        if not line.strip():
            if current:
                events.append(current)
                current = {}
            continue
        key, _, value = line.partition(":")
        current[key.strip()] = value.strip()
    if current:
        events.append(current)
    return events


def test_T2_10_stream_events_carry_turn_ids(learner, platform_session):
    """T2.10 precondition: every event has an id, or there is nothing to resume from."""
    session_id = platform_session["session_id"]
    ticket = learner.post(f"/classroom/{session_id}/stream-ticket").json()["ticket"]

    body = learner.client.get(f"/classroom/{session_id}/stream?ticket={ticket}").text
    events = [e for e in _read_sse(body) if e.get("event") == "turn"]
    assert events, "no turn events streamed"
    assert [e["id"] for e in events] == [str(i) for i in range(len(events))]


def test_T2_10_stream_resumes_from_last_event_id(learner, platform_session):
    """
    T2.10: after a dropped connection, the stream resumes rather than replaying
    from turn 0.

    `EventSource` sends Last-Event-ID automatically on reconnect; this simulates
    that header directly.
    """
    session_id = platform_session["session_id"]
    ticket = learner.post(f"/classroom/{session_id}/stream-ticket").json()["ticket"]

    full = [e for e in _read_sse(
        learner.client.get(f"/classroom/{session_id}/stream?ticket={ticket}").text
    ) if e.get("event") == "turn"]
    assert len(full) == 7

    resumed_body = learner.client.get(
        f"/classroom/{session_id}/stream?ticket={ticket}",
        headers={"Last-Event-ID": "3"},
    ).text
    resumed = [e for e in _read_sse(resumed_body) if e.get("event") == "turn"]

    assert len(resumed) == 3, "resume replayed the wrong number of turns"
    assert resumed[0]["id"] == "4", "resume did not continue after the last seen turn"
    assert json.loads(resumed[0]["data"])["content"] == json.loads(full[4]["data"])["content"]


def test_stream_resume_tolerates_a_junk_last_event_id(learner, platform_session):
    session_id = platform_session["session_id"]
    ticket = learner.post(f"/classroom/{session_id}/stream-ticket").json()["ticket"]
    body = learner.client.get(
        f"/classroom/{session_id}/stream?ticket={ticket}",
        headers={"Last-Event-ID": "not-a-number"},
    ).text
    turns = [e for e in _read_sse(body) if e.get("event") == "turn"]
    assert len(turns) == 7, "a malformed resume id should restart, not drop the lesson"
