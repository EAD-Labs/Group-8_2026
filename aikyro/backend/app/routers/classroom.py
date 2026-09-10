"""
Classroom routes — Part 2's HTTP surface.

Three things here were rebuilt rather than adjusted:

**Every endpoint authenticates and checks ownership.** `GET /{id}/stream`,
`POST /{id}/question` and the event recorder previously took no
`get_current_user` dependency and performed no ownership check, so any caller
holding a session id could read another learner's dialogue or post into it
(PROJECT.md D3). HLD 11.3 requires ownership checked server-side on every
request. The SSE endpoint authenticates with a short-lived scoped ticket,
because `EventSource` cannot send an `Authorization` header — see
`app.auth.create_stream_ticket`.

**The SSE stream resumes.** Events carry their turn index as the SSE event id
and the endpoint honours `Last-Event-ID`, so a dropped connection resumes from
where it left off instead of replaying the lesson from turn 0 (HLD T2.10).
Cheap, because the turns are already persisted.

**Blanks are judged on the server.** A guess is compared against the blank's
expected answers, held server-side, and a wrong guess writes a doubt-log entry
naming the misconception it implies. The frontend is not asked to report
`is_correct` — it never sees the answer, which is the only way the gate means
anything.
"""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session as DBSession
from sse_starlette.sse import EventSourceResponse

from app.auth import (
    STREAM_TICKET_TTL_SECONDS, create_stream_ticket, get_current_user, verify_stream_ticket,
)
from app.config import settings
from app.content.loader import get_concept
from app.database import get_db
from app.models import (
    ConditionType, DialogueMode, DialogueTurn, InteractionEvent, LearningSession,
    User, VerifiedKnowledgeRecord,
)
from app.schemas import (
    BlankAttemptRequest, BlankAttemptResponse, HintRevealResponse, InteractionEventIn,
    LearnerQuestionRequest, StartFreeformSessionRequest, StartSessionRequest, StartSessionResponse,
    StreamTicketResponse,
)
from app.services.dialogue_orchestrator import build_dialogue, insert_learner_question
from app.services.measurement_service import log_doubt, open_doubt_ids
from app.services.verification_engine import (
    load_structured, produce_verified_record, produce_verified_record_freeform,
)

router = APIRouter(prefix="/classroom", tags=["classroom"])


def _owned_session(db: DBSession, session_id: str, user: User) -> LearningSession:
    """
    A session the caller owns, or 404.

    Deliberately 404 and not 403: a 403 would confirm that someone else's
    session id is real, which is a membership oracle over every learner's
    session ids.
    """
    session = db.query(LearningSession).filter_by(id=session_id, user_id=user.id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return session


def _session_record(db: DBSession, session: LearningSession):
    record = db.query(VerifiedKnowledgeRecord).filter_by(id=session.verified_record_id).first()
    if not record:
        raise HTTPException(500, "Session has no verified record")
    return record, load_structured(record)


@router.post("/start", response_model=StartSessionResponse)
async def start_session(
    payload: StartSessionRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    concept = get_concept(payload.concept_id)
    if not concept:
        raise HTTPException(404, "Unknown concept")

    record = await produce_verified_record(db, payload.concept_id)
    structured = load_structured(record)

    condition = ConditionType.GENERAL_USE
    if user.pilot_condition_map and payload.concept_id in user.pilot_condition_map:
        condition = ConditionType(user.pilot_condition_map[payload.concept_id])

    if condition == ConditionType.PLAIN_CHAT:
        # The learner's assignment puts this concept in the control arm. Sending
        # them into the classroom anyway would silently break the
        # counterbalanced design — the comparative report would compare the
        # platform against itself.
        raise HTTPException(
            409,
            "This concept is assigned to the plain-chat arm for you — start it at "
            "/baseline/start instead (HLD 6.3).",
        )

    session = LearningSession(
        user_id=user.id,
        concept_id=payload.concept_id,
        module_id=concept["module_id"],
        verified_record_id=record.id,
        condition=condition,
        dialogue_mode=DialogueMode(payload.dialogue_mode),
        time_budget_seconds=settings.session_time_budget_seconds,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    turns = await build_dialogue(structured, session.dialogue_mode)
    for i, t in enumerate(turns):
        db.add(DialogueTurn(session_id=session.id, turn_index=i, **t))
    db.commit()

    return StartSessionResponse(
        session_id=session.id,
        concept_id=payload.concept_id,
        condition=condition.value,
        dialogue_mode=session.dialogue_mode.value,
        time_budget_seconds=session.time_budget_seconds,
        topic_name=concept["name"],
    )


@router.post("/start-freeform", response_model=StartSessionResponse)
async def start_freeform_session(
    payload: StartFreeformSessionRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    Open-topic entry point: not in modules.json, not part of the graded
    platform-vs-plain-chat comparison (the HLD scopes the graded pairs to two
    pilot modules — see D-03). Always runs as GENERAL_USE.
    """
    topic = payload.topic.strip()
    if not topic:
        raise HTTPException(400, "Topic cannot be empty")
    if len(topic) > 200:
        raise HTTPException(400, "Keep the topic under 200 characters")

    record, concept_id = await produce_verified_record_freeform(db, topic)
    structured = load_structured(record)

    session = LearningSession(
        user_id=user.id,
        concept_id=concept_id,
        module_id="general",
        verified_record_id=record.id,
        condition=ConditionType.GENERAL_USE,
        dialogue_mode=DialogueMode(payload.dialogue_mode),
        time_budget_seconds=settings.session_time_budget_seconds,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    turns = await build_dialogue(structured, session.dialogue_mode)
    for i, t in enumerate(turns):
        db.add(DialogueTurn(session_id=session.id, turn_index=i, **t))
    db.commit()

    return StartSessionResponse(
        session_id=session.id,
        concept_id=concept_id,
        condition=ConditionType.GENERAL_USE.value,
        dialogue_mode=session.dialogue_mode.value,
        time_budget_seconds=session.time_budget_seconds,
        topic_name=topic,
    )


@router.post("/{session_id}/stream-ticket", response_model=StreamTicketResponse)
def issue_stream_ticket(
    session_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    Exchange a Bearer token for a short-lived, session-scoped ticket for the SSE
    stream. See the note in `app.auth` on why the stream cannot simply take the
    Bearer token.
    """
    _owned_session(db, session_id, user)
    return StreamTicketResponse(
        ticket=create_stream_ticket(user.id, session_id),
        expires_in_seconds=STREAM_TICKET_TTL_SECONDS,
    )


def _turn_payload(t: DialogueTurn) -> dict:
    """
    What the browser is allowed to see of a turn.

    `blank_id` is included so a guess can name which blank it answers, but the
    blank's expected answers and the misconception it probes are not: the former
    would defeat the gate, and the latter would tell the learner which mistake
    they are expected to make.
    """
    return {
        "id": t.id,
        "turn_index": t.turn_index,
        "speaker": t.speaker,
        "turn_type": t.turn_type,
        "content": t.content,
        "target_bloom_level": t.target_bloom_level.value if t.target_bloom_level else None,
        "blank_id": t.blank_id,
    }


@router.get("/{session_id}/stream")
async def stream_dialogue(
    request: Request,
    session_id: str,
    ticket: str = Query(..., description="Short-lived ticket from POST /classroom/{id}/stream-ticket"),
    db: DBSession = Depends(get_db),
):
    """
    SSE stream of the dialogue, turn by turn.

    Replays pre-generated, persisted turns with a delay between them. Each event
    carries its turn index as the SSE event id, and `Last-Event-ID` resumes from
    the next turn after a dropped connection (HLD T2.10) — `EventSource` sends
    that header automatically on reconnect, so the learner keeps their place
    instead of watching the lesson restart.
    """
    user_id = verify_stream_ticket(ticket, session_id)
    session = db.query(LearningSession).filter_by(id=session_id, user_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # `EventSource` resends the last id it saw; a client may also pass it
    # explicitly as a query parameter when replaying without EventSource.
    last_event_id = request.headers.get("last-event-id") or request.query_params.get("last_event_id")
    resume_from = 0
    if last_event_id is not None:
        try:
            resume_from = int(last_event_id) + 1
        except ValueError:
            resume_from = 0

    turns = (
        db.query(DialogueTurn)
        .filter(DialogueTurn.session_id == session_id, DialogueTurn.turn_index >= resume_from)
        .order_by(DialogueTurn.turn_index)
        .all()
    )

    async def event_generator():
        for t in turns:
            if await request.is_disconnected():
                break
            yield {
                "id": str(t.turn_index),
                "event": "turn",
                "data": json.dumps(_turn_payload(t)),
            }
            await asyncio.sleep(settings.sse_turn_delay_seconds)
        yield {"event": "done", "data": json.dumps({"resumed_from": resume_from})}

    return EventSourceResponse(event_generator())


@router.get("/{session_id}/turns")
def list_turns(
    session_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    Non-streaming view of the same turns.

    Exists for two reasons: the SSE stream is paced for effect and a learner
    returning to a finished session shouldn't sit through it again, and a client
    whose connection drops mid-stream can reconcile against this rather than
    trusting its own partial list.
    """
    session = _owned_session(db, session_id, user)
    turns = (
        db.query(DialogueTurn)
        .filter_by(session_id=session.id)
        .order_by(DialogueTurn.turn_index)
        .all()
    )
    return {
        "session_id": session.id,
        "dialogue_mode": session.dialogue_mode.value,
        "turns": [_turn_payload(t) for t in turns],
    }


@router.post("/{session_id}/question")
async def ask_question(
    session_id: str,
    payload: LearnerQuestionRequest,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Learner enters as the third student (HLD 6.1).

    The answer is given the dialogue so far and the learner's open doubts, so it
    can refer to what has actually been covered rather than answering generically
    (HLD T2.6). Both the question and the answer are persisted as turns, which is
    also what the `curious_mind` badge counts.
    """
    session = _owned_session(db, session_id, user)
    question = payload.question.strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty")

    _, structured = _session_record(db, session)

    prior = (
        db.query(DialogueTurn)
        .filter_by(session_id=session.id)
        .order_by(DialogueTurn.turn_index)
        .all()
    )
    next_index = len(prior)

    learner_turn = DialogueTurn(
        session_id=session.id,
        turn_index=next_index,
        speaker="learner",
        turn_type="learner_question",
        content=question,
    )
    db.add(learner_turn)

    answer = await insert_learner_question(
        question,
        structured,
        prior_turns=[{"speaker": t.speaker, "content": t.content} for t in prior],
        open_doubts=open_doubt_ids(db, user.id, session.concept_id),
    )
    answer_turn = DialogueTurn(session_id=session.id, turn_index=next_index + 1, **answer)
    db.add(answer_turn)
    db.commit()
    db.refresh(learner_turn)
    db.refresh(answer_turn)

    return {
        "question_turn": _turn_payload(learner_turn),
        "answer_turn": _turn_payload(answer_turn),
        # kept so existing callers reading `.id` / `.content` keep working
        "id": answer_turn.id,
        "content": answer_turn.content,
    }


@router.post("/{session_id}/blank-attempt", response_model=BlankAttemptResponse)
def submit_blank_attempt(
    session_id: str,
    payload: BlankAttemptRequest,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    A committed guess at a blank or a hint, judged server-side.

    This is the endpoint that makes the doubt log writable (PROJECT.md D1). The
    blank's expected answers live in the structured record on the server; the
    browser only ever sent `{guess}` with no verdict, which is why the old
    `is_correct is False and "misconception" in payload` branch could never fire.

    A wrong guess, or a reveal with no correct guess, writes a `DoubtLogEntry`
    naming the misconception that blank probes. The response carries the hint
    (HLD T2.4: revealed only after a guess is committed) and whether the guess
    was right — but never the expected answer, so a learner cannot walk the
    endpoint to extract answers.
    """
    session = _owned_session(db, session_id, user)
    turn = db.query(DialogueTurn).filter_by(id=payload.turn_id, session_id=session.id).first()
    if not turn:
        raise HTTPException(404, "Turn not found in this session")
    if turn.turn_type not in ("blank", "hint"):
        raise HTTPException(400, "That turn does not take a guess")

    _, structured = _session_record(db, session)
    guess = payload.guess.strip()

    is_correct: bool | None = None
    blank = structured.blank(turn.blank_id) if turn.blank_id else None
    if blank and guess:
        is_correct = blank.judge(guess)

    db.add(
        InteractionEvent(
            turn_id=turn.id,
            event_type="guess" if guess else "reveal",
            payload={
                "guess": guess,
                "blank_id": turn.blank_id,
                "judged_against_expected_answers": bool(blank),
            },
            is_correct=is_correct,
        )
    )
    db.commit()

    # A wrong guess is evidence of the misconception this turn probes; so is
    # revealing without guessing. Points are never awarded for either (HLD 13.1).
    doubt_logged = None
    if turn.misconception_id and is_correct is not True:
        entry = log_doubt(
            db,
            user_id=user.id,
            concept_id=session.concept_id,
            source="wrong_blank" if guess else "revealed_hint",
            misconception_id=turn.misconception_id,
        )
        doubt_logged = entry.id if entry else None

    hint = _hint_for(structured, turn, blank)
    return BlankAttemptResponse(
        is_correct=is_correct,
        hint=hint,
        feedback=_feedback_for(is_correct, guess),
        doubt_logged=doubt_logged is not None,
    )


def _hint_for(structured, turn: DialogueTurn, blank) -> str | None:
    """
    What to reveal once a guess is committed. Prefers the blank's own hint, then
    the first rung of the concept's hint ladder, then the misconception's probe —
    in every case a nudge, never the expected answer.
    """
    if blank and blank.hint:
        return blank.hint
    if structured.hint_ladder:
        return structured.hint_ladder[0].text
    if turn.misconception_id:
        m = structured.misconception(turn.misconception_id)
        if m:
            return m.probe
    return None


def _feedback_for(is_correct: bool | None, guess: str) -> str:
    if is_correct is True:
        return "That's it."
    if is_correct is False:
        return "Not quite — here's a nudge, and I've noted this as something to come back to."
    if not guess:
        return "Revealed without a guess — noted as something to come back to."
    return "Noted. There's no fixed answer to check this one against."


@router.post("/interaction-event")
def record_interaction_event(
    payload: InteractionEventIn, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    Reveals, dwell time, and other observational events — feeds the Measurement
    Service (Part 3).

    Guesses at blanks should go to `/blank-attempt`, which judges them. This
    endpoint deliberately no longer writes the doubt log: a client-supplied
    `is_correct` and a client-supplied misconception label would put unverified,
    unaggregatable rows into the figure the client report quotes.
    """
    turn = (
        db.query(DialogueTurn)
        .join(LearningSession, DialogueTurn.session_id == LearningSession.id)
        .filter(DialogueTurn.id == payload.turn_id, LearningSession.user_id == user.id)
        .first()
    )
    if not turn:
        raise HTTPException(404, "Turn not found")

    event = InteractionEvent(
        turn_id=turn.id,
        event_type=payload.event_type,
        payload=payload.payload,
        is_correct=payload.is_correct,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return {"id": event.id}


@router.get("/{session_id}/hint/{turn_id}", response_model=HintRevealResponse)
def reveal_hint(
    session_id: str, turn_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    The full hint ladder for a turn, for a learner who has already committed a
    guess through `/blank-attempt`. Rungs are returned in order so the UI can
    escalate one at a time rather than dumping the lot.
    """
    session = _owned_session(db, session_id, user)
    turn = db.query(DialogueTurn).filter_by(id=turn_id, session_id=session.id).first()
    if not turn:
        raise HTTPException(404, "Turn not found in this session")

    committed = (
        db.query(InteractionEvent)
        .filter(InteractionEvent.turn_id == turn.id, InteractionEvent.event_type.in_(["guess", "reveal"]))
        .count()
    )
    if not committed:
        raise HTTPException(409, "Commit a guess first (HLD T2.4)")

    _, structured = _session_record(db, session)
    return HintRevealResponse(
        turn_id=turn.id,
        rungs=[{"level": r.level, "text": r.text} for r in structured.hint_ladder],
    )
