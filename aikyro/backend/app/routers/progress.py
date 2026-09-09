from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User, MasteryRecord, DoubtLogEntry, QuizResult
from app.services.measurement_service import comparative_report

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/me")
def my_progress(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Screen 2 data (HLD 9.3): per-concept state + target Bloom level, open
    doubts in plain language, next scheduled delayed check, points/badges.
    Points/badges are stubbed — wire in once the gamification rules
    (HLD 6.6: "never for revealing an answer or time spent") are finalised.
    """
    mastery = db.query(MasteryRecord).filter_by(user_id=user.id).all()
    open_doubts = db.query(DoubtLogEntry).filter_by(user_id=user.id, closed=False).all()
    pending_quizzes = (
        db.query(QuizResult)
        .filter_by(user_id=user.id, completed_at=None)
        .order_by(QuizResult.scheduled_for)
        .all()
    )

    return {
        "mastery": [
            {
                "concept_id": m.concept_id,
                "module_id": m.module_id,
                "state": m.state.value,
                "bloom_level_reached": m.bloom_level_reached.value if m.bloom_level_reached else None,
            }
            for m in mastery
        ],
        "open_doubts": [
            {"id": d.id, "concept_id": d.concept_id, "misconception": d.misconception}
            for d in open_doubts
        ],
        "pending_retention_checks": [
            {"concept_id": q.concept_id, "scheduled_for": q.scheduled_for.isoformat()}
            for q in pending_quizzes
        ],
        # points/badges: not yet implemented, see note above
        "points": None,
        "badges": [],
    }


@router.get("/comparative-report")
def comparative(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    """What the client/evaluators see (HLD 6.6). Aggregates across the cohort — no auth restriction beyond login for now; lock down to staff-only once roles exist (HLD 4)."""
    return comparative_report(db)
