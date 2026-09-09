from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import User, LearningSession
from app.schemas import CheckpointSubmitRequest, CheckpointResultOut
from app.services.measurement_service import record_checkpoint

router = APIRouter(prefix="/checkpoint", tags=["checkpoint"])


@router.post("/submit", response_model=CheckpointResultOut)
def submit_checkpoint(
    payload: CheckpointSubmitRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    session = db.query(LearningSession).filter_by(id=payload.session_id, user_id=user.id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Placeholder scoring: replace with real answer-checking against the
    # verified record / blank targets. This just checks non-empty answers.
    total = len(payload.answers) or 1
    correct = sum(1 for v in payload.answers.values() if str(v).strip())
    score = round(correct / total, 2)
    passed = score >= 0.5

    if settings.checkpoints_are_blocking and not payload.answers:
        raise HTTPException(400, "Checkpoint is mandatory — at least one attempt is required (HLD 6.3).")

    result = record_checkpoint(db, session, payload.answers, score, passed)
    session.completed_at = session.completed_at or datetime.utcnow()
    db.commit()
    return result
