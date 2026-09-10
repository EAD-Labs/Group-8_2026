from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app.auth import get_current_user
from app.config import settings
from app.content.loader import get_concept
from app.database import get_db
from app.models import User, LearningSession, VerifiedKnowledgeRecord
from app.schemas import CheckpointSubmitRequest, CheckpointResultOut
from app.services.measurement_service import record_checkpoint
from app.services.grading_service import grade_answer

router = APIRouter(prefix="/checkpoint", tags=["checkpoint"])


@router.post("/submit", response_model=CheckpointResultOut)
async def submit_checkpoint(
    payload: CheckpointSubmitRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    session = db.query(LearningSession).filter_by(id=payload.session_id, user_id=user.id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    if settings.checkpoints_are_blocking and not payload.answers:
        raise HTTPException(400, "Checkpoint is mandatory — at least one attempt is required (HLD 6.3).")

    record = db.query(VerifiedKnowledgeRecord).filter_by(id=session.verified_record_id).first()
    concept = get_concept(session.concept_id)
    concept_name = concept["name"] if concept else (record.topic_name if record else session.concept_id)
    combined_answer = " ".join(str(v).strip() for v in payload.answers.values() if str(v).strip())

    passed, score, _feedback = await grade_answer(
        prompt=f"Checkpoint on {concept_name}: explain what you understood.",
        verified_text=record.verified_text if record else "",
        learner_answer=combined_answer,
        concept_name=concept_name,
    )

    result = record_checkpoint(db, session, payload.answers, score, passed)
    session.completed_at = session.completed_at or datetime.utcnow()
    db.commit()
    return result
