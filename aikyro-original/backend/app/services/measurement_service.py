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
from app.content.loader import get_concept
from app.models import (
    CheckpointResult, MasteryRecord, ConceptState, DoubtLogEntry,
    QuizResult, LearningSession, User, Badge, DialogueTurn,
)

# HLD 13.1: points, never awarded for revealing an answer or time spent.
POINTS = {
    "checkpoint_passed": 10,
    "retention_passed": 15,
    "transfer_passed": 20,
    "doubt_closed": 5,
}

# Badge catalog — code -> display info. Single source of truth so frontend
# and backend agree on labels without duplicating strings.
BADGE_CATALOG = {
    "first_checkpoint": {"label": "First Steps", "emoji": "🎯", "description": "Passed your first checkpoint."},
    "curious_mind": {"label": "Curious Mind", "emoji": "🙋", "description": "Asked 5 questions as the third student."},
    "retention_ace": {"label": "Retention Ace", "emoji": "🧠", "description": "Passed 3 delayed retention checks."},
    "transfer_thinker": {"label": "Transfer Thinker", "emoji": "🔀", "description": "Solved a transfer problem in a new situation."},
}


def _award_points(db: DBSession, user_id: str, amount: int) -> None:
    user = db.query(User).filter_by(id=user_id).first()
    if user:
        user.total_points = (user.total_points or 0) + amount
        db.commit()


def _award_badge_if_new(db: DBSession, user_id: str, badge_code: str) -> bool:
    exists = db.query(Badge).filter_by(user_id=user_id, badge_code=badge_code).first()
    if exists:
        return False
    db.add(Badge(user_id=user_id, badge_code=badge_code))
    db.commit()
    return True


def _check_badges(db: DBSession, user_id: str) -> list[str]:
    """Runs the simple badge rules; returns codes newly awarded this call."""
    newly_awarded = []

    checkpoint_count = (
        db.query(CheckpointResult)
        .join(LearningSession, CheckpointResult.session_id == LearningSession.id)
        .filter(LearningSession.user_id == user_id, CheckpointResult.passed.is_(True))
        .count()
    )
    if checkpoint_count >= 1 and _award_badge_if_new(db, user_id, "first_checkpoint"):
        newly_awarded.append("first_checkpoint")

    question_count = (
        db.query(DialogueTurn)
        .join(LearningSession, DialogueTurn.session_id == LearningSession.id)
        .filter(LearningSession.user_id == user_id, DialogueTurn.speaker == "learner")
        .count()
    )
    if question_count >= 5 and _award_badge_if_new(db, user_id, "curious_mind"):
        newly_awarded.append("curious_mind")

    retention_passed_count = (
        db.query(QuizResult)
        .filter_by(user_id=user_id, quiz_type="retention", passed=True)
        .count()
    )
    if retention_passed_count >= 3 and _award_badge_if_new(db, user_id, "retention_ace"):
        newly_awarded.append("retention_ace")

    transfer_passed_count = (
        db.query(QuizResult)
        .filter_by(user_id=user_id, quiz_type="transfer", passed=True)
        .count()
    )
    if transfer_passed_count >= 1 and _award_badge_if_new(db, user_id, "transfer_thinker"):
        newly_awarded.append("transfer_thinker")

    return newly_awarded


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
        schedule_transfer_problem(db, session.user_id, session.concept_id, commit=False)

    db.commit()
    db.refresh(result)

    if passed:
        _award_points(db, session.user_id, POINTS["checkpoint_passed"])
        _check_badges(db, session.user_id)

    return result


def schedule_retention_check(db: DBSession, user_id: str, concept_id: str, commit: bool = True) -> QuizResult:
    delay_days = random.randint(settings.retention_delay_days_min, settings.retention_delay_days_max)
    concept = get_concept(concept_id)
    name = concept["name"] if concept else concept_id
    quiz = QuizResult(
        user_id=user_id,
        concept_id=concept_id,
        quiz_type="retention",
        prompt=f"In your own words, explain {name} again — no notes.",
        scheduled_for=datetime.utcnow() + timedelta(days=delay_days),
    )
    db.add(quiz)
    if commit:
        db.commit()
        db.refresh(quiz)
    return quiz


def schedule_transfer_problem(db: DBSession, user_id: str, concept_id: str, commit: bool = True) -> QuizResult:
    """
    Unlike retention checks, transfer problems are available immediately
    after the checkpoint (HLD 13.1) — the point is applying the concept in a
    new situation, not testing memory over time.
    """
    concept = get_concept(concept_id)
    name = concept["name"] if concept else concept_id
    quiz = QuizResult(
        user_id=user_id,
        concept_id=concept_id,
        quiz_type="transfer",
        prompt=f"Apply {name} to a new situation you haven't seen in this session. Describe the situation and walk through your reasoning.",
        scheduled_for=datetime.utcnow(),
    )
    db.add(quiz)
    if commit:
        db.commit()
        db.refresh(quiz)
    return quiz


def record_retention_result(db: DBSession, quiz: QuizResult, passed: bool, score: float, answer: str) -> MasteryRecord:
    quiz.completed_at = datetime.utcnow()
    quiz.passed = passed
    quiz.score = score
    quiz.answer = answer

    mastery = db.query(MasteryRecord).filter_by(user_id=quiz.user_id, concept_id=quiz.concept_id).first()
    if mastery:
        # ladder runs backwards too: a failed later check demotes, per HLD 6.6
        mastery.state = ConceptState.RETAINED if passed else ConceptState.DEMOTED
        mastery.updated_at = datetime.utcnow()
        if not passed:
            # re-queue: demoted concepts get another retention check scheduled
            schedule_retention_check(db, quiz.user_id, quiz.concept_id, commit=False)

    db.commit()

    if passed:
        _award_points(db, quiz.user_id, POINTS["retention_passed"])
        _check_badges(db, quiz.user_id)

    return mastery


def record_transfer_result(db: DBSession, quiz: QuizResult, passed: bool, score: float, answer: str) -> None:
    quiz.completed_at = datetime.utcnow()
    quiz.passed = passed
    quiz.score = score
    quiz.answer = answer
    db.commit()

    if passed:
        _award_points(db, quiz.user_id, POINTS["transfer_passed"])
        _check_badges(db, quiz.user_id)

        # a passed transfer problem is evidence of applying the concept, not
        # just recalling it — bump the recorded Bloom level if we have a
        # concept definition
        concept = get_concept(quiz.concept_id)
        if concept:
            mastery = db.query(MasteryRecord).filter_by(user_id=quiz.user_id, concept_id=quiz.concept_id).first()
            if mastery:
                mastery.bloom_level_reached = concept["bloom_level"]
                db.commit()


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
        _award_points(db, entry.user_id, POINTS["doubt_closed"])
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
