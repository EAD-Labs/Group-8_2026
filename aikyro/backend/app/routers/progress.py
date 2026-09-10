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
    close_doubt as close_doubt_service, BADGE_CATALOG, _check_badges,
)
from app.services.grading_service import grade_answer
from app.services.verification_engine import load_structured

router = APIRouter(prefix="/progress", tags=["progress"])


def _concept_name(concept_id: str, record: VerifiedKnowledgeRecord | None) -> str:
    concept = get_concept(concept_id)
    if concept:
        return concept["name"]
    if record and record.topic_name:
        return record.topic_name
    return concept_id


@router.get("/me")
def my_progress(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Screen 2 data (HLD 9.3): per-concept state + target Bloom level, open doubts
    in plain language, next scheduled delayed check, points/badges.

    Open doubts are real rows now rather than a structurally empty list — see
    PROJECT.md D1 and the writers in measurement_service.
    """
    mastery = db.query(MasteryRecord).filter_by(user_id=user.id).all()
    open_doubts = (
        db.query(DoubtLogEntry)
        .filter_by(user_id=user.id, closed=False)
        .order_by(DoubtLogEntry.created_at)
        .all()
    )
    pending_quizzes = (
        db.query(QuizResult)
        .filter_by(user_id=user.id, completed_at=None)
        .order_by(QuizResult.scheduled_for)
        .all()
    )
    badges = db.query(Badge).filter_by(user_id=user.id).order_by(Badge.awarded_at).all()
    closed_count = db.query(DoubtLogEntry).filter_by(user_id=user.id, closed=True).count()

    return {
        "mastery": [
            {
                "concept_id": m.concept_id,
                "concept_name": _concept_name(m.concept_id, None),
                "module_id": m.module_id,
                "state": m.state.value,
                "bloom_level_reached": m.bloom_level_reached.value if m.bloom_level_reached else None,
                "next_retention_check": (
                    m.next_retention_check.isoformat() if m.next_retention_check else None
                ),
            }
            for m in mastery
        ],
        "open_doubts": [
            {
                "id": d.id,
                "concept_id": d.concept_id,
                "concept_name": _concept_name(d.concept_id, None),
                "misconception_id": d.misconception_id,
                "misconception": d.misconception,
                "source": d.source,
            }
            for d in open_doubts
        ],
        "doubts_closed": closed_count,
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
    Retention checks, transfer problems and linked questions not yet completed.
    Retention checks aren't takeable until their scheduled date (HLD 6.6: never
    on the day the concept was learned); transfer and linked questions are
    available immediately.
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
            linked_concept_id=q.linked_concept_id,
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
    structured = load_structured(record) if record else None
    if structured is None:
        raise HTTPException(500, "No verified record for this concept")

    result = await grade_answer(
        prompt=quiz.prompt or "", record=structured, learner_answer=payload.answer
    )

    points_before = user.total_points or 0
    if quiz.quiz_type == "retention":
        record_retention_result(db, quiz, result.passed, result.score, payload.answer)
    else:
        # transfer and linked questions share the same recording path — both are
        # application evidence rather than delayed recall
        record_transfer_result(db, quiz, result.passed, result.score, payload.answer)

    db.refresh(user)
    points_awarded = (user.total_points or 0) - points_before
    newly_awarded = _check_badges(db, user.id) if result.passed else []

    return QuizSubmitResponse(
        passed=result.passed,
        score=result.score,
        feedback=result.feedback,
        points_awarded=points_awarded,
        newly_awarded_badges=newly_awarded,
    )


@router.post("/doubts/{doubt_id}/close")
def close_doubt(doubt_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Close one of the caller's own doubts.

    This endpoint previously had no authentication dependency at all, so any
    signed-in user could close another learner's doubt and collect the points
    (PROJECT.md D3). Ownership is now enforced at the route and again in the
    service.
    """
    entry = close_doubt_service(db, doubt_id, user_id=user.id)
    if not entry:
        raise HTTPException(404, "Doubt not found")
    return {"id": entry.id, "closed": entry.closed, "misconception_id": entry.misconception_id}


@router.get("/comparative-report")
def comparative(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    """
    What the client and evaluators see (HLD 6.6).

    Aggregates across the cohort, so it is login-gated but not per-learner. There
    is no role system in the pilot (HLD 4 doesn't define one), so any signed-in
    user can read it — lock this to a staff role as soon as roles exist. It
    returns no free-text learner answers, only counts and means, which is what
    makes that acceptable in the interim.
    """
    return comparative_report(db)
