"""
Part 3 - Learning Measurement Layer (HLD 6.6).

Concept state ladder: not_started -> introduced -> checkpoint_passed -> retained
(retained can fall back to demoted on a failed later check)

Retained is only reachable via a delayed check (never on the day a concept
was learned) — see `schedule_retention_check` / `record_retention_result`.
"""
from datetime import datetime, timedelta
import random

from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.models import (
    CheckpointResult, MasteryRecord, ConceptState, DoubtLogEntry,
    QuizResult, LearningSession,
)


def record_checkpoint(
    db: DBSession, session: LearningSession, answers: dict, score: float, passed: bool
) -> CheckpointResult:
    result = CheckpointResult(session_id=session.id, passed=passed, score=score, answers=answers)
    db.add(result)

    mastery = _get_or_create_mastery(db, session.user_id, session.concept_id, session.module_id)
    if passed and mastery.state in (ConceptState.NOT_STARTED, ConceptState.INTRODUCED):
        mastery.state = ConceptState.CHECKPOINT_PASSED
        mastery.updated_at = datetime.utcnow()
        schedule_retention_check(db, session.user_id, session.concept_id, commit=False)

    db.commit()
    db.refresh(result)
    return result


def schedule_retention_check(db: DBSession, user_id: str, concept_id: str, commit: bool = True) -> QuizResult:
    delay_days = random.randint(settings.retention_delay_days_min, settings.retention_delay_days_max)
    quiz = QuizResult(
        user_id=user_id,
        concept_id=concept_id,
        quiz_type="retention",
        scheduled_for=datetime.utcnow() + timedelta(days=delay_days),
    )
    db.add(quiz)
    if commit:
        db.commit()
        db.refresh(quiz)
    return quiz


def record_retention_result(db: DBSession, quiz: QuizResult, passed: bool, score: float) -> MasteryRecord:
    quiz.completed_at = datetime.utcnow()
    quiz.passed = passed
    quiz.score = score

    mastery = db.query(MasteryRecord).filter_by(user_id=quiz.user_id, concept_id=quiz.concept_id).first()
    if mastery:
        # ladder runs backwards too: a failed later check demotes, per HLD 6.6
        mastery.state = ConceptState.RETAINED if passed else ConceptState.DEMOTED
        mastery.updated_at = datetime.utcnow()
        if not passed:
            # re-queue: demoted concepts get another retention check scheduled
            schedule_retention_check(db, quiz.user_id, quiz.concept_id, commit=False)

    db.commit()
    return mastery


def log_doubt(db: DBSession, user_id: str, concept_id: str, misconception: str, source: str) -> DoubtLogEntry:
    entry = DoubtLogEntry(user_id=user_id, concept_id=concept_id, misconception=misconception, source=source)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def close_doubt(db: DBSession, doubt_id: str) -> DoubtLogEntry | None:
    entry = db.query(DoubtLogEntry).filter_by(id=doubt_id).first()
    if entry and not entry.closed:
        entry.closed = True
        entry.closed_at = datetime.utcnow()
        db.commit()
    return entry


def _get_or_create_mastery(db: DBSession, user_id: str, concept_id: str, module_id: str) -> MasteryRecord:
    mastery = db.query(MasteryRecord).filter_by(user_id=user_id, concept_id=concept_id).first()
    if not mastery:
        mastery = MasteryRecord(
            user_id=user_id, concept_id=concept_id, module_id=module_id,
            state=ConceptState.INTRODUCED,
        )
        db.add(mastery)
        db.commit()
        db.refresh(mastery)
    return mastery


def comparative_report(db: DBSession) -> dict:
    """
    HLD 6.6 'what the client and evaluators see': proportion reaching Retained
    (platform vs plain_chat), mean transfer score in each, mean doubts closed
    per learner. Stubbed aggregation — fill in real queries once pilot data exists.
    """
    return {
        "retained_rate": {"platform": None, "plain_chat": None},
        "mean_transfer_score": {"platform": None, "plain_chat": None},
        "mean_doubts_closed_per_learner": None,
        "note": "No pilot data yet — this aggregates once sessions/quizzes are recorded.",
    }
