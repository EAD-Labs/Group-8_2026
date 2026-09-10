"""
Part 3 - Learning Measurement Layer (HLD 6.6).

Concept state ladder: not_started -> introduced -> checkpoint_passed -> retained
(retained falls back to demoted on a failed later check)

Retained is reachable only via a delayed check, never on the day a concept was
learned — see `schedule_retention_check` / `record_retention_result`. That is
what stops one long session inflating the headline number.

### The doubt log

`log_doubt` was previously unreachable: the only caller required both
`is_correct is False` and a `misconception` key in the event payload, and the
frontend sent neither (PROJECT.md D1). So no `DoubtLogEntry` was ever written,
and "doubts closed per learner" — one of the three figures the client report
promises, and the one a plain-chat baseline structurally cannot produce — was
always zero.

It is now written from three places, all server-side:
  - a wrong blank guess, judged against the blank's expected answers
  - a hint revealed without a correct guess
  - a checkpoint item missed, where the item names a target misconception

Each entry carries `misconception_id` from the concept's authored enum, so the
rows aggregate.
"""
from collections import Counter
from datetime import datetime, timedelta
import random

from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.content.loader import authored_record, get_concept, pair_for_concept
from app.content.schema import Misconception
from app.models import (
    CheckpointResult, MasteryRecord, ConceptState, DoubtLogEntry,
    QuizResult, LearningSession, User, Badge, DialogueTurn, ConditionType,
)

# HLD 13.1: points, never awarded for revealing an answer or time spent.
POINTS = {
    "checkpoint_passed": 10,
    "retention_passed": 15,
    "transfer_passed": 20,
    "linked_passed": 15,
    "doubt_closed": 5,
}

# Badge catalog — code -> display info. Single source of truth so frontend
# and backend agree on labels without duplicating strings.
BADGE_CATALOG = {
    "first_checkpoint": {"label": "First Steps", "emoji": "🎯", "description": "Passed your first checkpoint."},
    "curious_mind": {"label": "Curious Mind", "emoji": "🙋", "description": "Asked 5 questions as the third student."},
    "retention_ace": {"label": "Retention Ace", "emoji": "🧠", "description": "Passed 3 delayed retention checks."},
    "transfer_thinker": {"label": "Transfer Thinker", "emoji": "🔀", "description": "Solved a transfer problem in a new situation."},
    "doubt_closer": {"label": "Loose Ends", "emoji": "🪢", "description": "Closed 3 open doubts."},
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

    closed_doubts = db.query(DoubtLogEntry).filter_by(user_id=user_id, closed=True).count()
    if closed_doubts >= 3 and _award_badge_if_new(db, user_id, "doubt_closer"):
        newly_awarded.append("doubt_closer")

    return newly_awarded


# --- doubt log -------------------------------------------------------------


def log_doubt(
    db: DBSession,
    user_id: str,
    concept_id: str,
    source: str,
    misconception_id: str | None = None,
    label: str | None = None,
) -> DoubtLogEntry | None:
    """
    Record an open doubt.

    `misconception_id` should come from the concept's authored enum; `label` is
    the human-readable form, looked up from the enum when not supplied. One open
    entry per (user, concept, misconception) — a learner who misses the same
    blank twice has one doubt, not two, or "doubts closed per learner" would
    count attempts instead of difficulties.

    Returns the entry, or None when there is nothing identifiable to log: a
    doubt with no misconception and no label would be an unaggregatable row,
    which is what the enum exists to prevent.
    """
    if misconception_id:
        label = label or _misconception_label(concept_id, misconception_id)
    if not label:
        return None

    existing = (
        db.query(DoubtLogEntry)
        .filter_by(
            user_id=user_id, concept_id=concept_id,
            misconception_id=misconception_id, closed=False,
        )
        .first()
    )
    if existing:
        return existing

    entry = DoubtLogEntry(
        user_id=user_id,
        concept_id=concept_id,
        misconception_id=misconception_id,
        misconception=label,
        source=source,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def _misconception_label(concept_id: str, misconception_id: str) -> str | None:
    """Learner-facing wording for a misconception id, from the authored content."""
    rec = authored_record(concept_id)
    if not rec:
        return None
    m: Misconception | None = rec.misconception(misconception_id)
    return m.for_learner() if m else None


def open_doubt_ids(db: DBSession, user_id: str, concept_id: str) -> list[str]:
    """Open misconception ids for one learner on one concept — seeds later dialogue (HLD 6.6)."""
    rows = (
        db.query(DoubtLogEntry.misconception_id)
        .filter(
            DoubtLogEntry.user_id == user_id,
            DoubtLogEntry.concept_id == concept_id,
            DoubtLogEntry.closed.is_(False),
            DoubtLogEntry.misconception_id.isnot(None),
        )
        .all()
    )
    return [r[0] for r in rows]


def close_doubt(db: DBSession, doubt_id: str, user_id: str) -> DoubtLogEntry | None:
    """
    Close a doubt. Scoped by `user_id`: the endpoint previously took no
    authentication at all, so any signed-in caller could close another
    learner's doubt and collect the points (PROJECT.md D3). Ownership is
    checked here as well as at the route, so a future caller cannot reintroduce
    the hole by forgetting.
    """
    entry = db.query(DoubtLogEntry).filter_by(id=doubt_id, user_id=user_id).first()
    if entry and not entry.closed:
        entry.closed = True
        entry.closed_at = datetime.utcnow()
        db.commit()
        _award_points(db, entry.user_id, POINTS["doubt_closed"])
        _check_badges(db, entry.user_id)
    return entry


# --- checkpoints and the state ladder -------------------------------------


def record_checkpoint(
    db: DBSession,
    session: LearningSession,
    answers: dict,
    score: float,
    passed: bool,
    flagged_misconceptions: list[str] | None = None,
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

    # A missed checkpoint item naming a target misconception is a doubt (HLD
    # 6.6, source "checkpoint_miss"). This is one of the three writers that
    # make the doubt log reachable at all — see the module docstring.
    for misconception_id in flagged_misconceptions or []:
        log_doubt(
            db,
            user_id=session.user_id,
            concept_id=session.concept_id,
            source="checkpoint_miss",
            misconception_id=misconception_id,
        )

    if passed:
        _award_points(db, session.user_id, POINTS["checkpoint_passed"])
        # T3.4: a passed concept can now be linked to an earlier one
        schedule_linked_question(db, session.user_id, session.concept_id, session.module_id)
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
    Unlike retention checks, transfer problems are available immediately after
    the checkpoint (HLD 13.1) — the point is applying the concept in a new
    situation, not testing memory over time.

    The prompt names a situation the session did *not* cover (HLD T3.5): the
    authored worked example is the situation the class worked through, so the
    transfer problem explicitly rules it out rather than re-asking it.
    """
    concept = get_concept(concept_id)
    name = concept["name"] if concept else concept_id
    rec = authored_record(concept_id)

    prompt = (
        f"Apply {name} to a situation that did not come up in your session. "
        f"Describe the situation, then walk through your reasoning."
    )
    if rec and rec.worked_example:
        prompt += f"\n\nDo not reuse the situation the class worked through ({rec.worked_example.situation})."
    if rec and rec.misconceptions:
        prompt += (
            f"\n\nYour answer should make clear you are not falling into this: "
            f"{rec.misconceptions[0].for_learner()}."
        )

    quiz = QuizResult(
        user_id=user_id,
        concept_id=concept_id,
        quiz_type="transfer",
        prompt=prompt,
        scheduled_for=datetime.utcnow(),
    )
    db.add(quiz)
    if commit:
        db.commit()
        db.refresh(quiz)
    return quiz


def schedule_linked_question(
    db: DBSession, user_id: str, concept_id: str, module_id: str, commit: bool = True
) -> QuizResult | None:
    """
    HLD T3.4: a new question linking this concept to one the learner has
    already learned.

    Needs a second passed concept to link to, so it returns None for a
    learner's first concept — the first checkpoint has nothing to connect to
    yet, and a linked question with only one side is just a transfer problem.
    Prefers a concept from the same module, where the link is substantive.
    """
    candidates = (
        db.query(MasteryRecord)
        .filter(
            MasteryRecord.user_id == user_id,
            MasteryRecord.concept_id != concept_id,
            MasteryRecord.state.in_([ConceptState.CHECKPOINT_PASSED, ConceptState.RETAINED]),
        )
        .order_by(MasteryRecord.updated_at.desc())
        .all()
    )
    if not candidates:
        return None

    same_module = [c for c in candidates if c.module_id == module_id]
    other = (same_module or candidates)[0]

    # don't stack duplicate links between the same two concepts
    already = (
        db.query(QuizResult)
        .filter_by(
            user_id=user_id, concept_id=concept_id,
            quiz_type="linked", linked_concept_id=other.concept_id,
        )
        .first()
    )
    if already:
        return None

    this_concept = get_concept(concept_id)
    other_concept = get_concept(other.concept_id)
    this_name = this_concept["name"] if this_concept else concept_id
    other_name = other_concept["name"] if other_concept else other.concept_id

    quiz = QuizResult(
        user_id=user_id,
        concept_id=concept_id,
        linked_concept_id=other.concept_id,
        quiz_type="linked",
        prompt=(
            f"You've now worked through both {this_name} and {other_name}. "
            f"Describe one situation where you need both at once, and say what each one "
            f"contributes that the other does not."
        ),
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
        points_key = "linked_passed" if quiz.quiz_type == "linked" else "transfer_passed"
        _award_points(db, quiz.user_id, POINTS[points_key])
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


# --- the comparative report (HLD 6.6, T3.9) -------------------------------


def comparative_report(db: DBSession) -> dict:
    """
    What the client and evaluators see: the three promised figures, computed
    over `condition x ConceptState x QuizResult`.

      1. proportion of concepts reaching RETAINED, platform vs plain_chat
      2. mean transfer score in each arm
      3. mean doubts closed per learner

    Only concepts in a graded pair count toward the comparison — `general_use`
    sessions and freeform topics are excluded by design (D-03), since they have
    no matched counterpart.

    Two things are deliberate here:

    **Condition comes from the session, not the user.** A learner is platform on
    one concept and plain_chat on the other; that is the whole point of the
    counterbalanced design. Reading condition off the user would collapse the
    within-learner delta the analysis rests on.

    **The third figure is reported per arm as well as overall.** Doubts closed
    is the figure a plain-chat baseline structurally cannot produce, so showing
    it split by arm is what makes that visible rather than hiding a zero inside
    an average.

    This returns descriptive statistics only. The inferential test (a paired
    Wilcoxon on the within-learner delta) belongs in the pre-registered
    analysis, not in an endpoint that recomputes on every page load — see
    PROJECT.md §10.
    """
    graded_conditions = (ConditionType.PLATFORM, ConditionType.PLAIN_CHAT)
    arms = {c.value: _arm_stats(db, c) for c in graded_conditions}

    learner_ids = [r[0] for r in db.query(User.id).all()]
    closed_per_learner = []
    for uid in learner_ids:
        closed_per_learner.append(
            db.query(DoubtLogEntry).filter_by(user_id=uid, closed=True).count()
        )

    total_doubts = db.query(DoubtLogEntry).count()
    closed_doubts = db.query(DoubtLogEntry).filter_by(closed=True).count()

    by_misconception = Counter(
        r[0]
        for r in db.query(DoubtLogEntry.misconception_id)
        .filter(DoubtLogEntry.misconception_id.isnot(None))
        .all()
    )

    paired = _paired_learners(db)

    return {
        "retained_rate": {arm: s["retained_rate"] for arm, s in arms.items()},
        "mean_transfer_score": {arm: s["mean_transfer_score"] for arm, s in arms.items()},
        "mean_doubts_closed_per_learner": (
            round(sum(closed_per_learner) / len(closed_per_learner), 2) if closed_per_learner else None
        ),
        "doubts_closed_per_arm": {arm: s["doubts_closed"] for arm, s in arms.items()},
        "per_arm_detail": arms,
        "doubt_log": {
            "total": total_doubts,
            "closed": closed_doubts,
            "open": total_doubts - closed_doubts,
            "by_misconception": dict(by_misconception.most_common()),
        },
        "cohort": {
            "learners": len(learner_ids),
            # learners with a completed session in BOTH arms — the n the paired
            # test actually runs on, which is always smaller than the learner
            # count and is the number to quote
            "learners_with_both_arms": len(paired),
            "paired_deltas": paired,
        },
        "caveats": _report_caveats(db, arms, paired),
    }


def _arm_stats(db: DBSession, condition: ConditionType) -> dict:
    """Per-arm figures, restricted to concepts that belong to a graded pair."""
    sessions = (
        db.query(LearningSession)
        .filter(LearningSession.condition == condition)
        .all()
    )
    graded = [s for s in sessions if pair_for_concept(s.concept_id)]
    pairs = {(s.user_id, s.concept_id) for s in graded}

    retained = 0
    for user_id, concept_id in pairs:
        mastery = db.query(MasteryRecord).filter_by(user_id=user_id, concept_id=concept_id).first()
        if mastery and mastery.state == ConceptState.RETAINED:
            retained += 1

    transfer_scores = [
        q.score
        for user_id, concept_id in pairs
        for q in db.query(QuizResult)
        .filter(
            QuizResult.user_id == user_id,
            QuizResult.concept_id == concept_id,
            QuizResult.quiz_type == "transfer",
            QuizResult.score.isnot(None),
        )
        .all()
    ]

    doubts_closed = sum(
        db.query(DoubtLogEntry)
        .filter_by(user_id=user_id, concept_id=concept_id, closed=True)
        .count()
        for user_id, concept_id in pairs
    )

    return {
        "sessions": len(graded),
        "learner_concepts": len(pairs),
        "retained": retained,
        "retained_rate": round(retained / len(pairs), 3) if pairs else None,
        "transfer_attempts": len(transfer_scores),
        "mean_transfer_score": (
            round(sum(transfer_scores) / len(transfer_scores), 3) if transfer_scores else None
        ),
        "doubts_closed": doubts_closed,
    }


def _paired_learners(db: DBSession) -> list[dict]:
    """
    The within-learner deltas the pre-registered paired test consumes: for each
    learner who completed a concept in both arms, their transfer score in each.
    Emitted as rows rather than a single statistic so the analysis can run the
    test itself on the raw pairs.
    """
    rows = []
    for (user_id,) in db.query(LearningSession.user_id).distinct().all():
        sides = {}
        for condition in (ConditionType.PLATFORM, ConditionType.PLAIN_CHAT):
            session = (
                db.query(LearningSession)
                .filter(
                    LearningSession.user_id == user_id,
                    LearningSession.condition == condition,
                    LearningSession.completed_at.isnot(None),
                )
                .order_by(LearningSession.completed_at)
                .first()
            )
            if not session or not pair_for_concept(session.concept_id):
                continue
            score = (
                db.query(func.avg(QuizResult.score))
                .filter(
                    QuizResult.user_id == user_id,
                    QuizResult.concept_id == session.concept_id,
                    QuizResult.quiz_type == "transfer",
                    QuizResult.score.isnot(None),
                )
                .scalar()
            )
            sides[condition.value] = {"concept_id": session.concept_id, "transfer_score": score}

        if len(sides) == 2:
            p, c = sides["platform"], sides["plain_chat"]
            delta = (
                round(p["transfer_score"] - c["transfer_score"], 3)
                if p["transfer_score"] is not None and c["transfer_score"] is not None
                else None
            )
            rows.append({"user_id": user_id, "platform": p, "plain_chat": c, "transfer_delta": delta})
    return rows


def _report_caveats(db: DBSession, arms: dict, paired: list[dict]) -> list[str]:
    """
    Stated with the numbers, not in a footnote somewhere else. A report figure
    computed from three learners on mock grading should not be presented as a
    finding, and the endpoint is the only place that knows which of those
    conditions currently hold.
    """
    caveats = []
    if settings.llm_mode != "live":
        caveats.append(
            "llm_mode is 'mock': every score here comes from the keyword-coverage placeholder in "
            "grading_service, not from real grading. These figures exercise the pipeline; they are "
            "not evidence about learning."
        )
    if len(paired) < 2:
        caveats.append(
            f"Only {len(paired)} learner(s) have completed a concept in both arms. The paired "
            f"within-learner test has no power at this n."
        )
    for arm, stats in arms.items():
        if not stats["learner_concepts"]:
            caveats.append(f"No graded sessions recorded in the '{arm}' arm yet.")
        elif stats["mean_transfer_score"] is None:
            caveats.append(f"No scored transfer attempts in the '{arm}' arm yet.")
    if not db.query(DoubtLogEntry).count():
        caveats.append(
            "No doubt-log entries exist yet, so 'doubts closed per learner' is structurally zero "
            "rather than measured."
        )
    unreviewed = [
        c["concept_id"] for c in _content_review_rows() if not c["content_reviewed"]
    ]
    if unreviewed:
        caveats.append(
            f"{len(unreviewed)} concept(s) still have TA/instructor-unreviewed authored content "
            f"(misconceptions and checkpoint rubrics): {', '.join(unreviewed)}."
        )
    return caveats


def _content_review_rows() -> list[dict]:
    from app.content.loader import content_review_status

    return content_review_status()["concepts"]
