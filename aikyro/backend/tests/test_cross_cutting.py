"""
Cross-cutting criteria (HLD T0.x) and the defects that span parts:
D3 (unauthenticated endpoints), D4 (irreproducible assignment), and the
plain-chat baseline arm.

Also sweeps every pilot concept. The per-session tests only exercise whichever
concept the counterbalanced assignment happened to give a randomly-generated
learner, so a content defect in the other nine would go unnoticed — one did,
until this file existed.
"""
import pytest

from app.content.loader import assign_pilot_condition, authored_record, load_content
from app.models import DialogueMode


def all_concept_ids():
    return [c["id"] for m in load_content()["modules"] for c in m["concepts"]]


# --- every concept, not just the assigned one ----------------------------


@pytest.mark.parametrize("concept_id", all_concept_ids())
def test_every_concept_builds_a_complete_dialogue(concept_id):
    """
    Each pilot concept must produce the full turn spec with a seeded basic
    student, a seeded boundary challenge, and a judgeable blank.
    """
    import asyncio

    from app.services.dialogue_orchestrator import build_dialogue
    from app.services.verification_engine import _adjudicate_naive

    record, _, _ = _adjudicate_naive({}, authored_record(concept_id))
    turns = asyncio.run(build_dialogue(record, DialogueMode.FULL))

    assert len(turns) == 7
    declared = set(record.misconception_ids())

    basic = next(t for t in turns if t["speaker"] == "basic_student")
    assert basic["misconception_id"] in declared

    boundary = [t for t in turns if t["speaker"] == "advanced_student"][-1]
    assert boundary["misconception_id"] in declared
    assert boundary["content"].rstrip().endswith("?"), "a challenge must invite an answer"

    blank = next(t for t in turns if t["turn_type"] == "blank")
    assert "____" in blank["content"]
    assert record.blank(blank["blank_id"]) is not None


@pytest.mark.parametrize("concept_id", all_concept_ids())
def test_every_concept_has_a_judgeable_blank_and_rubric(concept_id):
    record = authored_record(concept_id)
    assert record.blanks, f"{concept_id} has no blanks"
    for blank in record.blanks:
        assert blank.expected_answers
        assert blank.judge(blank.expected_answers[0]) is True
        assert blank.judge("a deliberately wrong answer") is False
    assert record.checkpoint_items
    for item in record.checkpoint_items:
        assert len(item.rubric) >= 2, f"{concept_id}/{item.id} rubric is too thin to grade against"


@pytest.mark.parametrize("concept_id", all_concept_ids())
def test_every_concept_reduced_mode_keeps_the_gates(concept_id):
    import asyncio

    from app.services.dialogue_orchestrator import build_dialogue
    from app.services.verification_engine import _adjudicate_naive

    record, _, _ = _adjudicate_naive({}, authored_record(concept_id))
    turns = asyncio.run(build_dialogue(record, DialogueMode.REDUCED))
    assert not [t for t in turns if t["speaker"] == "basic_student"]
    assert {"hint", "blank"} <= {t["turn_type"] for t in turns}


# --- D4: reproducible assignment ---------------------------------------


def test_D4_assignment_is_reproducible_for_the_same_user_id():
    """
    D4: `hash(user_id)` is randomised per process, so the same learner mapped to a
    different pair after every restart. Assignment must be recomputable from the
    id alone — the pilot analysis depends on it.
    """
    first = assign_pilot_condition("fixed-user-id-1234")
    for _ in range(5):
        assert assign_pilot_condition("fixed-user-id-1234") == first


def test_D4_assignment_is_stable_across_processes():
    """The real D4 failure only shows across processes, where PYTHONHASHSEED differs."""
    import subprocess
    import sys

    script = (
        "import sys; sys.path.insert(0, '.');"
        "from app.content.loader import assign_pilot_condition;"
        "print(assign_pilot_condition('fixed-user-id-1234'))"
    )
    outputs = {
        subprocess.run(
            [sys.executable, "-c", script], capture_output=True, text=True, check=True,
            env={"PYTHONHASHSEED": "random", "PATH": "/usr/bin:/bin"},
        ).stdout.strip()
        for _ in range(3)
    }
    assert len(outputs) == 1, f"assignment differed across processes: {outputs}"


def test_D4_cohort_spreads_across_all_four_pairs():
    """D-03 asks for the cohort spread across all four pairs, not everyone on one."""
    pairs = {assign_pilot_condition(f"learner-{i}")["pair_id"] for i in range(200)}
    assert len(pairs) == len(load_content()["graded_pairs"])


def test_D4_each_pair_gets_one_concept_in_each_arm():
    for i in range(50):
        assignment = assign_pilot_condition(f"learner-{i}")
        arms = sorted(assignment["condition_map"].values())
        assert arms == ["plain_chat", "platform"]


def test_signup_assignment_matches_a_later_recomputation(learner):
    """What was written at signup must equal what the analysis would recompute."""
    recomputed = assign_pilot_condition(learner.id)
    assert learner.user["pilot_pair_id"] == recomputed["pair_id"]
    assert learner.condition_map == recomputed["condition_map"]


# --- D3: authentication and ownership ---------------------------------


def test_D3_stream_requires_a_ticket(client, learner, platform_session):
    """
    D3: `GET /classroom/{id}/stream` took no authentication at all — any caller
    with a session id could read another learner's dialogue (HLD 11.3).
    """
    res = client.get(f"/classroom/{platform_session['session_id']}/stream")
    assert res.status_code == 422, "the stream accepted a request with no ticket"


def test_D3_stream_rejects_a_forged_ticket(client, platform_session):
    res = client.get(f"/classroom/{platform_session['session_id']}/stream?ticket=not-a-jwt")
    assert res.status_code == 401


def test_D3_stream_ticket_is_scoped_to_one_session(learner, other_learner):
    """A ticket for my session must not open someone else's."""
    mine = learner.post(
        "/classroom/start", json={"concept_id": learner.concept_for("platform")}
    ).json()
    theirs = other_learner.post(
        "/classroom/start", json={"concept_id": other_learner.concept_for("platform")}
    ).json()

    ticket = learner.post(f"/classroom/{mine['session_id']}/stream-ticket").json()["ticket"]
    res = learner.client.get(f"/classroom/{theirs['session_id']}/stream?ticket={ticket}")
    assert res.status_code == 401, "a session-scoped ticket opened a different session"


def test_D3_access_token_is_not_accepted_as_a_stream_ticket(learner, platform_session):
    res = learner.client.get(
        f"/classroom/{platform_session['session_id']}/stream?ticket={learner.token}"
    )
    assert res.status_code == 401, "an access token was accepted as a stream ticket"


def test_D3_stream_ticket_requires_owning_the_session(other_learner, learner, platform_session):
    res = other_learner.post(f"/classroom/{platform_session['session_id']}/stream-ticket")
    assert res.status_code == 404, "a non-owner was issued a stream ticket"


def test_D3_question_endpoint_requires_auth_and_ownership(
    client, other_learner, learner, platform_session
):
    """D3: `POST /classroom/{id}/question` let anyone post into another learner's dialogue."""
    session_id = platform_session["session_id"]

    anonymous = client.post(f"/classroom/{session_id}/question", json={"question": "hi"})
    assert anonymous.status_code == 401

    intruder = other_learner.post(f"/classroom/{session_id}/question", json={"question": "hi"})
    assert intruder.status_code == 404


def test_D3_close_doubt_requires_ownership(learner, other_learner, platform_session):
    """
    D3: `close_doubt` let any signed-in user close another learner's doubt and
    collect the points.
    """
    session_id = platform_session["session_id"]
    blank = next(t for t in learner.get(f"/classroom/{session_id}/turns").json()["turns"]
                 if t["turn_type"] == "blank")
    learner.post(f"/classroom/{session_id}/blank-attempt",
                 json={"turn_id": blank["id"], "guess": "wrong"})
    doubt_id = learner.get("/progress/me").json()["open_doubts"][0]["id"]

    points_before = other_learner.get("/progress/me").json()["points"]
    res = other_learner.post(f"/progress/doubts/{doubt_id}/close")
    assert res.status_code == 404, "another learner closed this doubt"
    assert other_learner.get("/progress/me").json()["points"] == points_before
    assert learner.get("/progress/me").json()["open_doubts"], "the doubt was closed by an intruder"


def test_D3_blank_attempt_requires_ownership(other_learner, learner, platform_session):
    session_id = platform_session["session_id"]
    blank = next(t for t in learner.get(f"/classroom/{session_id}/turns").json()["turns"]
                 if t["turn_type"] == "blank")
    res = other_learner.post(f"/classroom/{session_id}/blank-attempt",
                             json={"turn_id": blank["id"], "guess": "x"})
    assert res.status_code == 404


def test_D3_turns_listing_requires_ownership(other_learner, platform_session):
    res = other_learner.get(f"/classroom/{platform_session['session_id']}/turns")
    assert res.status_code == 404


def test_D3_checkpoint_requires_ownership(other_learner, platform_session):
    assert other_learner.get(f"/checkpoint/{platform_session['session_id']}").status_code == 404
    res = other_learner.post("/checkpoint/submit",
                             json={"session_id": platform_session["session_id"],
                                   "answers": {"x": "y"}})
    assert res.status_code == 404


def test_D3_interaction_event_rejects_another_learners_turn(
    other_learner, learner, platform_session
):
    turn_id = learner.get(f"/classroom/{platform_session['session_id']}/turns").json()["turns"][0]["id"]
    res = other_learner.post("/classroom/interaction-event",
                             json={"turn_id": turn_id, "event_type": "dwell_time", "payload": {}})
    assert res.status_code == 404


def test_unknown_session_is_404_not_403(learner):
    """
    404 rather than 403, so the API is not a membership oracle over session ids.
    """
    assert learner.get("/classroom/00000000-0000-0000-0000-000000000000/turns").status_code == 404


# --- the plain-chat baseline arm (HLD 6.3) ---------------------------


def test_baseline_arm_logs_a_plain_chat_session(learner, session_factory):
    """
    Without an in-app baseline, `condition = plain_chat` sessions never exist and
    the comparative report has one permanently empty arm (PROJECT.md §10).
    """
    from app.models import ConditionType, LearningSession

    concept_id = learner.concept_for("plain_chat")
    res = learner.post("/baseline/start", json={"concept_id": concept_id})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["condition"] == "plain_chat"
    assert body["time_budget_seconds"] > 0

    db = session_factory()
    try:
        session = db.query(LearningSession).filter_by(id=body["session_id"]).one()
        assert session.condition == ConditionType.PLAIN_CHAT
        assert session.time_budget_seconds is not None
    finally:
        db.close()


def test_baseline_conversation_is_persisted(learner):
    concept_id = learner.concept_for("plain_chat")
    session_id = learner.post("/baseline/start", json={"concept_id": concept_id}).json()["session_id"]

    reply = learner.post(f"/baseline/{session_id}/message", json={"message": "what is this about?"})
    assert reply.status_code == 200, reply.text
    assert reply.json()["reply"]["content"]
    assert reply.json()["seconds_remaining"] > 0

    transcript = learner.get(f"/baseline/{session_id}").json()
    roles = [m["role"] for m in transcript["messages"]]
    assert roles == ["assistant", "learner", "assistant"], roles


def test_baseline_refuses_a_concept_assigned_to_the_platform_arm(learner):
    """
    Taking the same concept in both arms would contaminate the within-learner
    delta — the one error in this design that cannot be fixed afterwards.
    """
    res = learner.post("/baseline/start", json={"concept_id": learner.concept_for("platform")})
    assert res.status_code == 409


def test_classroom_refuses_a_concept_assigned_to_the_baseline_arm(learner):
    res = learner.post("/classroom/start", json={"concept_id": learner.concept_for("plain_chat")})
    assert res.status_code == 409


def test_baseline_has_no_personas_hints_or_blanks(learner):
    """
    The baseline must not simulate the intervention. Any persona or gated hint
    here would destroy the contrast the study is measuring.
    """
    concept_id = learner.concept_for("plain_chat")
    session_id = learner.post("/baseline/start", json={"concept_id": concept_id}).json()["session_id"]
    learner.post(f"/baseline/{session_id}/message", json={"message": "explain it"})

    transcript = learner.get(f"/baseline/{session_id}").json()
    for message in transcript["messages"]:
        assert message["role"] in ("learner", "assistant")
        assert "____" not in message["content"]

    # and no dialogue turns were created for this session
    assert learner.get(f"/classroom/{session_id}/turns").json()["turns"] == []


def test_baseline_arm_takes_the_same_checkpoint(learner):
    """Same checkpoint, same grading — otherwise the arms aren't comparable."""
    concept_id = learner.concept_for("plain_chat")
    session_id = learner.post("/baseline/start", json={"concept_id": concept_id}).json()["session_id"]
    learner.post(f"/baseline/{session_id}/complete")

    form = learner.get(f"/checkpoint/{session_id}")
    assert form.status_code == 200, form.text
    record = authored_record(concept_id)
    assert [i["id"] for i in form.json()["items"]] == [i.id for i in record.checkpoint_items]


def test_baseline_reports_elapsed_time_for_the_equal_budget_check(learner):
    concept_id = learner.concept_for("plain_chat")
    session_id = learner.post("/baseline/start", json={"concept_id": concept_id}).json()["session_id"]
    done = learner.post(f"/baseline/{session_id}/complete").json()
    assert "seconds_elapsed" in done
    assert done["within_time_budget"] is True


# --- T0.2: clean-clone behaviour ------------------------------------


def test_T0_2_app_boots_and_is_healthy_with_no_api_keys(client):
    """T0.2: builds and runs from a clean clone, on mocks, with no keys."""
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["llm_mode"] == "mock"


def test_T0_1_a_first_time_learner_can_complete_a_topic_unaided(learner):
    """
    T0.1: a first-time user completes a topic end to end. Listed as 'plausible;
    untested' — this is the path, executed.
    """
    modules = learner.get("/topics/modules")
    assert modules.status_code == 200

    concept_id = learner.concept_for("platform")
    session = learner.post("/classroom/start", json={"concept_id": concept_id}).json()
    session_id = session["session_id"]

    ticket = learner.post(f"/classroom/{session_id}/stream-ticket").json()["ticket"]
    assert learner.client.get(f"/classroom/{session_id}/stream?ticket={ticket}").status_code == 200

    turns = learner.get(f"/classroom/{session_id}/turns").json()["turns"]
    blank = next(t for t in turns if t["turn_type"] == "blank")
    record = authored_record(concept_id)
    learner.post(f"/classroom/{session_id}/blank-attempt",
                 json={"turn_id": blank["id"],
                       "guess": record.blank(blank["blank_id"]).expected_answers[0]})

    learner.post(f"/classroom/{session_id}/question", json={"question": "why does that hold?"})

    form = learner.get(f"/checkpoint/{session_id}").json()
    answers = {
        i["id"]: " ".join(next(x for x in record.checkpoint_items if x.id == i["id"]).rubric)
        for i in form["items"]
    }
    result = learner.post("/checkpoint/submit",
                          json={"session_id": session_id, "answers": answers}).json()
    assert result["passed"] is True

    progress = learner.get("/progress/me").json()
    assert progress["points"] > 0
    assert any(m["concept_id"] == concept_id for m in progress["mastery"])
    assert learner.get("/progress/quizzes/pending").json(), "no follow-up work scheduled"


def test_content_review_status_is_reported(client, learner):
    """
    The pilot must not silently run on unreviewed misconceptions and rubrics.
    """
    body = learner.get("/topics/content-review-status").json()
    assert body["status"] == "open"
    assert len(body["outstanding"]) == len(all_concept_ids())

    marked = learner.post(f"/topics/concepts/{all_concept_ids()[0]}/mark-content-reviewed")
    assert marked.status_code == 200
    assert marked.json()["content_reviewed"] is True
