"""
Checkpoint routes.

Previously this submitted one generic prompt — "explain what you understood" —
joined every answer into a single string and graded the lot against the verified
prose. HLD T3.1 asks the checkpoint to derive from *this* dialogue; it couldn't,
because there was nothing to derive from (PROJECT.md §8, T3.1 fail).

Now the session's structured record supplies real checkpoint items, each with
its own rubric and its own target misconception. Each item is graded separately
against its rubric, and an item missed where the item names a misconception
writes a doubt-log entry (HLD 6.6).
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app.auth import get_current_user
from app.config import settings
from app.content.loader import get_concept
from app.database import get_db
from app.models import DialogueTurn, LearningSession, User, VerifiedKnowledgeRecord
from app.schemas import (
    CheckpointFormOut, CheckpointItemOut, CheckpointItemResultOut, CheckpointResultOut,
    CheckpointSubmitRequest,
)
from app.services.grading_service import grade_answer
from app.services.measurement_service import record_checkpoint
from app.services.verification_engine import load_structured

router = APIRouter(prefix="/checkpoint", tags=["checkpoint"])


def _owned_session(db: DBSession, session_id: str, user: User) -> LearningSession:
    session = db.query(LearningSession).filter_by(id=session_id, user_id=user.id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return session


def _structured(db: DBSession, session: LearningSession):
    record = db.query(VerifiedKnowledgeRecord).filter_by(id=session.verified_record_id).first()
    if not record:
        raise HTTPException(500, "Session has no verified record")
    return load_structured(record)


@router.get("/{session_id}", response_model=CheckpointFormOut)
def get_checkpoint(
    session_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    The checkpoint for this session (HLD T3.1).

    Items come from the structured record the dialogue was built from, so they
    test the same claims and target the same misconceptions the class just
    worked through. Rubrics are stripped — see `CheckpointItemOut`.
    """
    session = _owned_session(db, session_id, user)
    structured = _structured(db, session)

    if not structured.checkpoint_items:
        raise HTTPException(500, "This concept's record carries no checkpoint items")

    concept = get_concept(session.concept_id)
    return CheckpointFormOut(
        session_id=session.id,
        concept_id=session.concept_id,
        concept_name=concept["name"] if concept else structured.concept_name,
        items=[
            CheckpointItemOut(id=i.id, prompt=i.prompt, bloom_level=i.bloom_level)
            for i in structured.checkpoint_items
        ],
    )


@router.post("/submit", response_model=CheckpointResultOut)
async def submit_checkpoint(
    payload: CheckpointSubmitRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    Grade a checkpoint, item by item, each against its own rubric.

    Overall score is the mean across items; pass requires the mean to clear the
    threshold. Items the learner left blank still count against the mean — a
    checkpoint where skipping an item is free would reward skipping the items
    that are hardest, which are exactly the ones carrying the misconceptions.
    """
    session = _owned_session(db, session_id=payload.session_id, user=user)

    if settings.checkpoints_are_blocking and not any(
        str(v).strip() for v in payload.answers.values()
    ):
        raise HTTPException(
            400, "Checkpoint is mandatory — at least one attempt is required (HLD 6.3)."
        )

    structured = _structured(db, session)
    items = structured.checkpoint_items
    if not items:
        raise HTTPException(500, "This concept's record carries no checkpoint items")

    per_item: list[CheckpointItemResultOut] = []
    flagged: list[str] = []
    graders: set[str] = set()

    for item in items:
        answer = str(payload.answers.get(item.id, "")).strip()
        result = await grade_answer(
            prompt=item.prompt, record=structured, learner_answer=answer, item=item
        )
        per_item.append(
            CheckpointItemResultOut(
                item_id=item.id, passed=result.passed, score=result.score, feedback=result.feedback
            )
        )
        flagged.extend(result.flagged_misconceptions)
        graders.add(result.graded_by)

    score = round(sum(p.score for p in per_item) / len(per_item), 3)
    passed = score >= settings.checkpoint_pass_threshold
    flagged = list(dict.fromkeys(flagged))  # de-duplicate, keep order

    result = record_checkpoint(
        db, session, payload.answers, score, passed, flagged_misconceptions=flagged
    )
    session.completed_at = session.completed_at or datetime.utcnow()
    db.commit()

    return CheckpointResultOut(
        passed=result.passed,
        score=result.score,
        per_item=per_item,
        doubts_logged=flagged,
        graded_by=",".join(sorted(graders)) or "heuristic",
    )
