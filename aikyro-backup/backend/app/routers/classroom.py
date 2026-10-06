import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sse_starlette.sse import EventSourceResponse

from app.auth import get_current_user
from app.content.loader import get_concept
from app.database import get_db
from app.models import User, LearningSession, DialogueTurn, InteractionEvent, ConditionType, VerifiedKnowledgeRecord
from app.schemas import (
    StartSessionRequest, StartFreeformSessionRequest, StartSessionResponse,
    LearnerQuestionRequest, InteractionEventIn, QuestionHistoryItem,
)
from app.services.verification_engine import produce_verified_record, produce_verified_record_freeform
from app.services.dialogue_orchestrator import build_dialogue, insert_learner_question
from app.services.measurement_service import log_doubt

router = APIRouter(prefix="/classroom", tags=["classroom"])


@router.get("/questions", response_model=list[QuestionHistoryItem])
def question_history(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Every question the learner has asked as the third student, across every
    session, most recent first — with the teacher's answer alongside it, so
    it's actually reviewable rather than a name in a list (this is the
    'history of questions asked to the teacher' from Screen 1, HLD 9.3/5.1
    step 5, surfaced somewhere the learner can revisit it and open the
    session it came from).
    """
    questions = (
        db.query(DialogueTurn, LearningSession)
        .join(LearningSession, DialogueTurn.session_id == LearningSession.id)
        .filter(LearningSession.user_id == user.id, DialogueTurn.turn_type == "learner_question")
        .order_by(DialogueTurn.created_at.desc())
        .all()
    )
    if not questions:
        return []

    session_ids = {session.id for _, session in questions}
    all_turns = (
        db.query(DialogueTurn)
        .filter(DialogueTurn.session_id.in_(session_ids))
        .order_by(DialogueTurn.turn_index)
        .all()
    )
    turns_by_session: dict[str, list[DialogueTurn]] = {}
    for t in all_turns:
        turns_by_session.setdefault(t.session_id, []).append(t)

    records = {
        r.id: r
        for r in db.query(VerifiedKnowledgeRecord)
        .filter(VerifiedKnowledgeRecord.id.in_({s.verified_record_id for _, s in questions}))
        .all()
    }

    items = []
    for turn, session in questions:
        concept = get_concept(session.concept_id)
        if concept:
            concept_name = concept["name"]
        else:
            record = records.get(session.verified_record_id)
            concept_name = record.topic_name if record and record.topic_name else session.concept_id

        # the teacher's answer is inserted immediately after the question
        # turn by /classroom/{session_id}/question — find it by turn_index
        answer = None
        for t in turns_by_session.get(session.id, []):
            if t.turn_index == turn.turn_index + 1 and t.speaker == "teacher":
                answer = t.content
                break

        items.append(
            QuestionHistoryItem(
                session_id=session.id,
                turn_id=turn.id,
                concept_id=session.concept_id,
                concept_name=concept_name,
                question=turn.content,
                answer=answer,
                asked_at=turn.created_at,
            )
        )
    return items


@router.post("/start", response_model=StartSessionResponse)
async def start_session(
    payload: StartSessionRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    concept = get_concept(payload.concept_id)
    if not concept:
        raise HTTPException(404, "Unknown concept")

    record = await produce_verified_record(db, payload.concept_id)

    condition = ConditionType.GENERAL_USE
    if user.pilot_condition_map and payload.concept_id in user.pilot_condition_map:
        condition = ConditionType(user.pilot_condition_map[payload.concept_id])

    session = LearningSession(
        user_id=user.id,
        concept_id=payload.concept_id,
        module_id=concept["module_id"],
        verified_record_id=record.id,
        condition=condition,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    turns = await build_dialogue(record)
    for i, t in enumerate(turns):
        db.add(DialogueTurn(session_id=session.id, turn_index=i, **t))
    db.commit()

    return StartSessionResponse(session_id=session.id, concept_id=payload.concept_id, condition=condition.value)


@router.post("/start-freeform", response_model=StartSessionResponse)
async def start_freeform_session(
    payload: StartFreeformSessionRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    Open-topic entry point: not looked up in modules.json, not part of the
    graded platform-vs-plain-chat comparison (HLD's graded pairs are fixed to
    two pilot modules — see D-03). Always runs as GENERAL_USE.
    """
    topic = payload.topic.strip()
    if not topic:
        raise HTTPException(400, "Topic cannot be empty")
    if len(topic) > 200:
        raise HTTPException(400, "Keep the topic under 200 characters")

    record, concept_id = await produce_verified_record_freeform(db, topic)

    session = LearningSession(
        user_id=user.id,
        concept_id=concept_id,
        module_id="general",
        verified_record_id=record.id,
        condition=ConditionType.GENERAL_USE,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    turns = await build_dialogue(record)
    for i, t in enumerate(turns):
        db.add(DialogueTurn(session_id=session.id, turn_index=i, **t))
    db.commit()

    return StartSessionResponse(
        session_id=session.id, concept_id=concept_id, condition=ConditionType.GENERAL_USE.value, topic_name=topic
    )


@router.get("/{session_id}/stream")
async def stream_dialogue(session_id: str, db: DBSession = Depends(get_db)):
    """
    SSE stream of the dialogue, turn by turn. This simulates streaming with a
    delay between pre-generated turns; swap for real token-level streaming
    once turns are generated live rather than templated up front.
    """
    turns = (
        db.query(DialogueTurn)
        .filter(DialogueTurn.session_id == session_id)
        .order_by(DialogueTurn.turn_index)
        .all()
    )

    async def event_generator():
        for t in turns:
            yield {
                "event": "turn",
                "data": json.dumps(
                    {
                        "id": t.id,
                        "speaker": t.speaker,
                        "turn_type": t.turn_type,
                        "content": t.content,
                        "target_bloom_level": t.target_bloom_level.value if t.target_bloom_level else None,
                    }
                ),
            }
            await asyncio.sleep(0.6)
        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_generator())


@router.post("/{session_id}/question")
async def ask_question(session_id: str, payload: LearnerQuestionRequest, db: DBSession = Depends(get_db)):
    """
    Learner enters as third student (HLD 6.1). Both halves of this exchange
    are persisted — the learner's own question as a `learner_question` turn,
    then the teacher's answer right after it — so the exchange survives a
    reload and can be looked back up later (GET /classroom/questions). It
    used to only save the answer; the question itself was never written to
    the database, which is why past questions were never retrievable.
    """
    session = db.query(LearningSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    question_text = payload.question.strip()
    if not question_text:
        raise HTTPException(400, "Question cannot be empty")

    from app.models import VerifiedKnowledgeRecord
    record = db.query(VerifiedKnowledgeRecord).filter_by(id=session.verified_record_id).first()
    concept = get_concept(session.concept_id)
    concept_name = concept["name"] if concept else (record.topic_name if record else session.concept_id)

    answer_turn = await insert_learner_question(
        question_text, record.verified_text if record else "", concept_name
    )

    next_index = db.query(DialogueTurn).filter_by(session_id=session_id).count()
    question_turn = DialogueTurn(
        session_id=session_id,
        turn_index=next_index,
        speaker="learner",
        turn_type="learner_question",
        content=question_text,
        target_bloom_level=None,
    )
    db.add(question_turn)
    db.commit()
    db.refresh(question_turn)

    turn = DialogueTurn(session_id=session_id, turn_index=next_index + 1, **answer_turn)
    db.add(turn)
    db.commit()
    db.refresh(turn)
    return {"id": turn.id, "content": turn.content}


@router.post("/interaction-event")
def record_interaction_event(
    payload: InteractionEventIn, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    Reveals, guesses, questions, dwell time — feeds the Measurement Service
    (Part 3) and the doubt log (HLD 6.6).
    """
    event = InteractionEvent(
        turn_id=payload.turn_id,
        event_type=payload.event_type,
        payload=payload.payload,
        is_correct=payload.is_correct,
    )
    db.add(event)
    db.commit()

    # a wrong guess / revealed hint is a candidate doubt-log entry; caller
    # should pass the misconception label in payload when known, e.g.
    # {"misconception": "sign convention reversed", "concept_id": "..."}
    if payload.is_correct is False and "misconception" in payload.payload:
        log_doubt(
            db,
            user_id=user.id,
            concept_id=payload.payload.get("concept_id", ""),
            misconception=payload.payload["misconception"],
            source="wrong_blank" if payload.event_type == "guess" else "revealed_hint",
        )

    db.refresh(event)
    return {"id": event.id}
