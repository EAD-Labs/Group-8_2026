"""
The plain-chat baseline arm (HLD 6.3 control condition, PROJECT.md §10).

This is the control the whole comparative study is measured against, and it
lives *inside this app* rather than sending learners to a third-party chat
product. That is a deliberate choice with three reasons:

  - the equal time budget promised in HLD 6.3 cannot be enforced if the learner
    leaves for another site;
  - nothing from the control condition would be logged, so `condition =
    plain_chat` sessions would never exist and the comparative report would
    have one permanently empty arm;
  - there would be no way to verify a learner completed it.

Same login, same timer, same checkpoint and the same quiz delivery. The only
difference is the surface: a chat box instead of a simulated classroom. That is
what makes the comparison about the scaffold rather than about two different
products.

**What is deliberately absent.** No personas, no gated hints, no blocking
blanks, no doubt log. A plain chat cannot produce those signals — which is
precisely the finding the third report figure is meant to show, so simulating
them here would destroy the contrast. The baseline answers questions, and
nothing more.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app.auth import get_current_user
from app.config import settings
from app.content.loader import get_concept
from app.database import get_db
from app.models import (
    BaselineMessage, ConditionType, DialogueMode, LearningSession, User,
)
from app.schemas import (
    BaselineMessageOut, BaselineMessageRequest, BaselineMessageResponse, BaselineStartRequest,
    BaselineStartResponse, BaselineTranscriptOut,
)
from app.services.llm_providers import generate, preferred_available_provider
from app.services.verification_engine import load_structured, produce_verified_record

router = APIRouter(prefix="/baseline", tags=["baseline"])

_MAX_MESSAGE_CHARS = 2000
# How much of the conversation is replayed into each reply. A plain chat keeps
# context, so the baseline must too — a control condition that forgot the
# previous turn would be worse than the tools it stands in for, and any
# difference measured against it would be an artefact of that handicap.
_CONTEXT_WINDOW_MESSAGES = 20


def _owned_baseline_session(db: DBSession, session_id: str, user: User) -> LearningSession:
    session = (
        db.query(LearningSession)
        .filter_by(id=session_id, user_id=user.id, condition=ConditionType.PLAIN_CHAT)
        .first()
    )
    if not session:
        raise HTTPException(404, "Baseline session not found")
    return session


def _timing(session: LearningSession) -> dict:
    elapsed = int((datetime.utcnow() - session.started_at).total_seconds())
    budget = session.time_budget_seconds
    remaining = max(0, budget - elapsed) if budget is not None else None
    return {
        "seconds_elapsed": elapsed,
        "seconds_remaining": remaining,
        "time_budget_exhausted": bool(budget is not None and elapsed >= budget),
    }


@router.post("/start", response_model=BaselineStartResponse)
async def start_baseline(
    payload: BaselineStartRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    Open the control-arm session for a concept.

    Refuses concepts the learner's counterbalanced assignment puts in the
    platform arm: letting a learner take the same concept in both arms would
    contaminate the within-learner delta the analysis rests on, which is the one
    error in this study that cannot be fixed after the fact.
    """
    concept = get_concept(payload.concept_id)
    if not concept:
        raise HTTPException(404, "Unknown concept")

    assigned = (user.pilot_condition_map or {}).get(payload.concept_id)
    if assigned != ConditionType.PLAIN_CHAT.value:
        raise HTTPException(
            409,
            "This concept is not assigned to the plain-chat arm for you — start it at "
            "/classroom/start instead (HLD 6.3).",
        )

    existing = (
        db.query(LearningSession)
        .filter_by(
            user_id=user.id, concept_id=payload.concept_id, condition=ConditionType.PLAIN_CHAT
        )
        .order_by(LearningSession.started_at.desc())
        .first()
    )

    # The baseline still draws on the same verified record. Both arms therefore
    # study the same verified content, so the comparison isolates the scaffold
    # rather than measuring a difference in what the two arms were told.
    record = await produce_verified_record(db, payload.concept_id)
    structured = load_structured(record)

    if existing and not existing.completed_at:
        session = existing
    else:
        session = LearningSession(
            user_id=user.id,
            concept_id=payload.concept_id,
            module_id=concept["module_id"],
            verified_record_id=record.id,
            condition=ConditionType.PLAIN_CHAT,
            dialogue_mode=DialogueMode.FULL,  # unused in this arm; kept non-null for the column
            time_budget_seconds=settings.session_time_budget_seconds,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

    opening = (
        f"You have {settings.session_time_budget_seconds // 60} minutes on "
        f"{concept['name']}. Ask me anything about it. When the time is up you'll take the same "
        f"checkpoint as everyone else."
    )
    if not db.query(BaselineMessage).filter_by(session_id=session.id).count():
        db.add(
            BaselineMessage(
                session_id=session.id, message_index=0, role="assistant", content=opening
            )
        )
        db.commit()

    return BaselineStartResponse(
        session_id=session.id,
        concept_id=session.concept_id,
        concept_name=concept["name"],
        condition=session.condition.value,
        time_budget_seconds=session.time_budget_seconds,
        opening_message=opening,
    )


@router.get("/{session_id}", response_model=BaselineTranscriptOut)
def get_transcript(
    session_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    session = _owned_baseline_session(db, session_id, user)
    concept = get_concept(session.concept_id)
    messages = (
        db.query(BaselineMessage)
        .filter_by(session_id=session.id)
        .order_by(BaselineMessage.message_index)
        .all()
    )
    return BaselineTranscriptOut(
        session_id=session.id,
        concept_id=session.concept_id,
        concept_name=concept["name"] if concept else session.concept_id,
        messages=[
            BaselineMessageOut(role=m.role, content=m.content, created_at=m.created_at)
            for m in messages
        ],
        **_timing(session),
    )


@router.post("/{session_id}/message", response_model=BaselineMessageResponse)
async def send_message(
    session_id: str,
    payload: BaselineMessageRequest,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = _owned_baseline_session(db, session_id, user)
    text = payload.message.strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty")
    if len(text) > _MAX_MESSAGE_CHARS:
        raise HTTPException(400, f"Keep messages under {_MAX_MESSAGE_CHARS} characters")
    if session.completed_at:
        raise HTTPException(409, "This baseline session is already complete")

    timing = _timing(session)
    if timing["time_budget_exhausted"]:
        # Reported, not enforced by cutting the learner off mid-thought. The
        # analysis filters on the recorded elapsed time; silently truncating a
        # reply would make the control arm worse than the thing it stands for.
        raise HTTPException(
            409, "Your time budget for this concept is up — go to the checkpoint (HLD 6.3)."
        )

    history = (
        db.query(BaselineMessage)
        .filter_by(session_id=session.id)
        .order_by(BaselineMessage.message_index)
        .all()
    )
    next_index = len(history)

    db.add(
        BaselineMessage(
            session_id=session.id, message_index=next_index, role="learner", content=text
        )
    )
    db.commit()

    reply_text = await _generate_reply(db, session, history, text)
    reply = BaselineMessage(
        session_id=session.id, message_index=next_index + 1, role="assistant", content=reply_text
    )
    db.add(reply)
    db.commit()
    db.refresh(reply)

    return BaselineMessageResponse(
        reply=BaselineMessageOut(
            role=reply.role, content=reply.content, created_at=reply.created_at
        ),
        **_timing(session),
    )


async def _generate_reply(
    db: DBSession, session: LearningSession, history: list[BaselineMessage], question: str
) -> str:
    """
    A plain, helpful answer. No personas, no Socratic withholding, no hints
    gated behind a guess — those are the intervention, and putting any of them
    here would bias the study toward finding no effect.
    """
    from app.models import VerifiedKnowledgeRecord

    record = db.query(VerifiedKnowledgeRecord).filter_by(id=session.verified_record_id).first()
    structured = load_structured(record) if record else None
    concept_name = structured.concept_name if structured else session.concept_id

    if settings.llm_mode == "live":
        provider = preferred_available_provider()
        if provider:
            recent = history[-_CONTEXT_WINDOW_MESSAGES:]
            transcript = "\n".join(
                f"{'Student' if m.role == 'learner' else 'Assistant'}: {m.content}" for m in recent
            )
            claims = "\n".join(f"- {c}" for c in (structured.claims if structured else []))
            prompt = (
                f"You are a helpful study assistant answering a first-year engineering student's "
                f"questions about '{concept_name}'. Answer directly and clearly.\n\n"
                f"Accurate material you may rely on:\n{claims}\n\n"
                f"Conversation so far:\n{transcript}\n\n"
                f"Student: {question}\n\n"
                f"Answer in 2-4 sentences. Do not quiz them, do not withhold information, and do "
                f"not role-play other students — just answer the question well."
            )
            try:
                content = (await generate(provider, prompt, concept_name=concept_name)).strip()
                if content:
                    return content
            except Exception:
                pass  # fall through to the templated reply

    return _mock_reply(question, concept_name, structured)


def _mock_reply(question: str, concept_name: str, structured) -> str:
    """
    Zero-key reply for the control arm.

    It answers from the verified claims, plainly. It is intentionally *not*
    worse than the platform's mock path: a baseline handicapped by its mock
    implementation would manufacture an effect in the platform's favour, which
    is the one outcome a control condition exists to rule out.
    """
    if not structured or not structured.claims:
        return (
            f"[mock] On {concept_name}: no verified material is loaded for this concept, so there "
            f"is nothing to answer from. Set llm_mode=live with an API key for real answers."
        )

    asked = question.lower()
    relevant = [c for c in structured.claims if any(
        term.lower() in asked for term in structured.key_terms
    )] or structured.claims

    answer = " ".join(relevant[:2])
    if structured.worked_example:
        answer += f" For a concrete case: {structured.worked_example.situation}"
    return f"[mock] {answer}"


@router.post("/{session_id}/complete")
def complete_baseline(
    session_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    Mark the baseline study period finished, so the learner can go to the same
    checkpoint the platform arm takes. Records the elapsed time, which is what
    lets the analysis verify the two arms actually got equal time rather than
    just being promised it.
    """
    session = _owned_baseline_session(db, session_id, user)
    timing = _timing(session)
    session.completed_at = session.completed_at or datetime.utcnow()
    db.commit()
    return {
        "session_id": session.id,
        "completed_at": session.completed_at.isoformat(),
        "seconds_elapsed": timing["seconds_elapsed"],
        "within_time_budget": not timing["time_budget_exhausted"],
        "next": f"/checkpoint/{session.id}",
    }
