from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app.auth import get_current_user
from app.content.loader import get_concept
from app.database import get_db
from app.models import User, MasteryRecord, DoubtLogEntry, QuizResult, Badge, VerifiedKnowledgeRecord
from app.schemas import PendingQuizOut, QuizSubmitRequest, QuizSubmitResponse
from app.services.measurement_service import (
    comparative_report, record_retention_result, record_transfer_result,
    close_doubt as close_doubt_service, BADGE_CATALOG, POINTS, _check_badges,
)
from app.services.grading_service import grade_answer

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/me")
def my_progress(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Screen 2 data (HLD 9.3): per-concept state + target Bloom level, open
    doubts in plain language, next scheduled delayed check, points/badges.
    """
    mastery = db.query(MasteryRecord).filter_by(user_id=user.id).all()
    open_doubts = db.query(DoubtLogEntry).filter_by(user_id=user.id, closed=False).all()
    pending_quizzes = (
        db.query(QuizResult)
        .filter_by(user_id=user.id, completed_at=None)
        .order_by(QuizResult.scheduled_for)
        .all()
    )
    badges = db.query(Badge).filter_by(user_id=user.id).order_by(Badge.awarded_at).all()

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
            for q in pending_quizzes if q.quiz_type == "retention"
        ],
        "points": user.total_points,
        "badges": [
            {
                "code": b.badge_code,
                "label": BADGE_CATALOG.get(b.badge_code, {}).get("label", b.badge_code),
                "emoji": BADGE_CATALOG.get(b.badge_code, {}).get("emoji", "🏅"),
                "description": BADGE_CATALOG.get(b.badge_code, {}).get("description", ""),
                "awarded_at": b.awarded_at.isoformat(),
            }
            for b in badges
        ],
    }


@router.get("/quizzes/pending", response_model=list[PendingQuizOut])
def pending_quizzes(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Retention checks + transfer problems not yet completed. Retention checks
    aren't takeable until their scheduled date (HLD 6.6: never on the day the
    concept was learned); transfer problems are available immediately.
    """
    quizzes = (
        db.query(QuizResult)
        .filter_by(user_id=user.id, completed_at=None)
        .order_by(QuizResult.scheduled_for)
        .all()
    )
    now = datetime.utcnow()
    return [
        PendingQuizOut(
            id=q.id,
            concept_id=q.concept_id,
            quiz_type=q.quiz_type,
            prompt=q.prompt,
            scheduled_for=q.scheduled_for,
            available_now=q.scheduled_for <= now,
        )
        for q in quizzes
    ]


@router.post("/quizzes/{quiz_id}/submit", response_model=QuizSubmitResponse)
async def submit_quiz(
    quiz_id: str, payload: QuizSubmitRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    quiz = db.query(QuizResult).filter_by(id=quiz_id, user_id=user.id).first()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if quiz.completed_at:
        raise HTTPException(400, "Already completed")
    if quiz.scheduled_for > datetime.utcnow():
        raise HTTPException(400, "Not available yet — retention checks unlock on their scheduled date")

    record = (
        db.query(VerifiedKnowledgeRecord)
        .filter_by(concept_id=quiz.concept_id)
        .order_by(VerifiedKnowledgeRecord.created_at.desc())
        .first()
    )
    concept = get_concept(quiz.concept_id)
    concept_name = concept["name"] if concept else (record.topic_name if record else quiz.concept_id)

    passed, score, _feedback = await grade_answer(
        prompt=quiz.prompt or "",
        verified_text=record.verified_text if record else "",
        learner_answer=payload.answer,
        concept_name=concept_name,
    )

    points_before = user.total_points or 0
    if quiz.quiz_type == "retention":
        record_retention_result(db, quiz, passed, score, payload.answer)
    else:
        record_transfer_result(db, quiz, passed, score, payload.answer)

    db.refresh(user)
    points_awarded = (user.total_points or 0) - points_before
    newly_awarded = _check_badges(db, user.id) if passed else []

    return QuizSubmitResponse(passed=passed, score=score, points_awarded=points_awarded, newly_awarded_badges=newly_awarded)


@router.post("/doubts/{doubt_id}/close")
def close_doubt(doubt_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    entry = close_doubt_service(db, doubt_id)
    if not entry or entry.user_id != user.id:
        raise HTTPException(404, "Doubt not found")
    return {"id": entry.id, "closed": entry.closed}


@router.get("/comparative-report")
def comparative(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    """What the client/evaluators see (HLD 6.6). Aggregates across the cohort — no auth restriction beyond login for now; lock down to staff-only once roles exist (HLD 4)."""
    return comparative_report(db)
