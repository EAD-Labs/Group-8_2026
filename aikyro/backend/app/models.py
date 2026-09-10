"""
Data entities per HLD 8.2/8.3:
User -> many LearningSessions -> one VerifiedKnowledgeRecord, many DialogueTurns
Turns of type hint/blank -> InteractionEvents
Session -> one CheckpointResult
CheckpointResult + delayed QuizResult -> one MasteryRecord per user per topic
VoiceSignalScore attaches to a Session, never to raw audio (8.4: no raw audio stored)

NOTE: pilot Module/Concept *definitions* (Thermodynamics, Prob & Stats, Bloom
levels, D-03 topic pairs) live in content/modules.json, not here — they're
pilot content, not user data, and the client review cycle changes them often.
This file only stores per-learner state referencing those concept ids.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    String, Boolean, DateTime, ForeignKey, Text, Float, Integer, Enum as SAEnum, JSON
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class ConceptState(str, enum.Enum):
    NOT_STARTED = "not_started"
    INTRODUCED = "introduced"
    CHECKPOINT_PASSED = "checkpoint_passed"
    RETAINED = "retained"          # only reachable via delayed check, per HLD 6.6
    DEMOTED = "demoted"            # failed a later check


class BloomLevel(str, enum.Enum):
    REMEMBER = "remember"
    UNDERSTAND = "understand"
    APPLY = "apply"
    ANALYSE = "analyse"


class DialogueMode(str, enum.Enum):
    """
    HLD T2.7. `REDUCED` suppresses the basic-student persona, leaving
    teacher + advanced student, for learners who find the three-way dialogue
    noisy. It is a filter over the fixed turn spec, not a different spec —
    see services/dialogue_orchestrator.
    """
    FULL = "full"
    REDUCED = "reduced"


class ConditionType(str, enum.Enum):
    PLATFORM = "platform"   # simulated classroom
    PLAIN_CHAT = "plain_chat"  # baseline, for the comparative study (HLD 6.3)
    GENERAL_USE = "general_use"  # unpaired concepts, per D-03 email


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # cohort assignment for the counterbalanced comparative study (HLD 6.3 / D-03)
    pilot_pair_id: Mapped[str | None] = mapped_column(String, nullable=True)
    pilot_condition_map: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # e.g. {"first_law_energy_accounting": "platform", "sign_conventions_work_heat": "plain_chat"}

    # HLD 13.1: points/badges, never awarded for revealing an answer or time spent
    total_points: Mapped[int] = mapped_column(Integer, default=0)

    sessions: Mapped[list["LearningSession"]] = relationship(back_populates="user")
    mastery_records: Mapped[list["MasteryRecord"]] = relationship(back_populates="user")
    doubt_log_entries: Mapped[list["DoubtLogEntry"]] = relationship(back_populates="user")
    badges: Mapped[list["Badge"]] = relationship(back_populates="user")


class Badge(Base):
    """Awarded milestones (HLD 13.1). See measurement_service.BADGE_CATALOG for definitions."""
    __tablename__ = "badges"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    badge_code: Mapped[str] = mapped_column(String, index=True)
    awarded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="badges")


class VerifiedKnowledgeRecord(Base):
    """Output of Part 1 — Verified Knowledge Engine."""
    __tablename__ = "verified_knowledge_records"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    concept_id: Mapped[str] = mapped_column(String, index=True)  # references content/modules.json, or "freeform:<slug>"
    module_id: Mapped[str] = mapped_column(String, index=True)
    topic_name: Mapped[str | None] = mapped_column(String, nullable=True)  # set for freeform topics only; pilot concepts get their name from modules.json
    # Prose rendering of `structured`, kept so the classroom board and older
    # prompt paths keep working. Derived, not authoritative.
    verified_text: Mapped[str] = mapped_column(Text)
    # The addressable record (HLD T1.7, PROJECT.md D5): claims, worked example,
    # misconceptions, hint ladder, blanks, checkpoint items with rubrics.
    # Serialised app.content.schema.StructuredConceptRecord. Everything
    # downstream addresses fields of this instead of substring-searching prose.
    structured: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    provenance: Mapped[dict] = mapped_column(JSON)          # which providers agreed/disagreed
    resolved_disagreements: Mapped[dict] = mapped_column(JSON)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class LearningSession(Base):
    __tablename__ = "learning_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    concept_id: Mapped[str] = mapped_column(String, index=True)
    module_id: Mapped[str] = mapped_column(String, index=True)
    verified_record_id: Mapped[str] = mapped_column(String, ForeignKey("verified_knowledge_records.id"))
    condition: Mapped[ConditionType] = mapped_column(SAEnum(ConditionType), default=ConditionType.PLATFORM)
    dialogue_mode: Mapped[DialogueMode] = mapped_column(SAEnum(DialogueMode), default=DialogueMode.FULL)
    # HLD 6.3 equal time budget. Both arms of the comparative study get the
    # same number of seconds; enforcing it requires the baseline to live
    # inside this app rather than sending learners to a third-party chat.
    time_budget_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")
    turns: Mapped[list["DialogueTurn"]] = relationship(back_populates="session")
    baseline_messages: Mapped[list["BaselineMessage"]] = relationship(back_populates="session")
    checkpoint_result: Mapped["CheckpointResult"] = relationship(back_populates="session", uselist=False)
    voice_signal_score: Mapped["VoiceSignalScore"] = relationship(back_populates="session", uselist=False)


class DialogueTurn(Base):
    """Output of Part 2 — Simulated Classroom."""
    __tablename__ = "dialogue_turns"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("learning_sessions.id"))
    turn_index: Mapped[int] = mapped_column(Integer)
    speaker: Mapped[str] = mapped_column(String)   # teacher | basic_student | advanced_student | learner
    turn_type: Mapped[str] = mapped_column(String)  # dialogue | hint | blank | learner_question
    content: Mapped[str] = mapped_column(Text)
    target_bloom_level: Mapped[BloomLevel | None] = mapped_column(SAEnum(BloomLevel), nullable=True)
    # For turn_type == "blank": which BlankCandidate in the structured record
    # this turn came from. The expected answers stay server-side, looked up
    # through this id when a guess arrives — they are never streamed to the
    # browser, or the gate would be decorative.
    blank_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # The misconception this turn is aimed at, where one applies. Drawn from
    # the concept's authored enum, so a wrong answer here names something
    # countable (PROJECT.md D1).
    misconception_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["LearningSession"] = relationship(back_populates="turns")
    interaction_events: Mapped[list["InteractionEvent"]] = relationship(back_populates="turn")


class InteractionEvent(Base):
    """Generated by hint/blank turns; consumed by the Measurement Service (Part 3)."""
    __tablename__ = "interaction_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    turn_id: Mapped[str] = mapped_column(String, ForeignKey("dialogue_turns.id"))
    event_type: Mapped[str] = mapped_column(String)  # reveal | guess | question_asked | dwell_time
    payload: Mapped[dict] = mapped_column(JSON)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    turn: Mapped["DialogueTurn"] = relationship(back_populates="interaction_events")


class CheckpointResult(Base):
    __tablename__ = "checkpoint_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("learning_sessions.id"), unique=True)
    passed: Mapped[bool] = mapped_column(Boolean)
    score: Mapped[float] = mapped_column(Float)
    answers: Mapped[dict] = mapped_column(JSON)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["LearningSession"] = relationship(back_populates="checkpoint_result")


class QuizResult(Base):
    """
    Delayed retention quizzes, transfer problems, and linked questions
    (non-blocking, HLD 6.3).

    `quiz_type` is one of:
      - retention — the same concept, after a delay. The only route to RETAINED.
      - transfer  — the concept in an uncovered situation (HLD T3.5).
      - linked    — a new question that ties this concept to another the
                    learner has already passed (HLD T3.4). `linked_concept_id`
                    records the other side of the link.
    """
    __tablename__ = "quiz_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    concept_id: Mapped[str] = mapped_column(String, index=True)
    quiz_type: Mapped[str] = mapped_column(String)  # retention | transfer | linked
    # Set for quiz_type == "linked": the previously-passed concept this
    # question connects to (HLD T3.4).
    linked_concept_id: Mapped[str | None] = mapped_column(String, nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)


class MasteryRecord(Base):
    """One per user per concept. Drives the Progress screen (HLD 6.6, 9.3)."""
    __tablename__ = "mastery_records"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    concept_id: Mapped[str] = mapped_column(String, index=True)
    module_id: Mapped[str] = mapped_column(String, index=True)
    state: Mapped[ConceptState] = mapped_column(SAEnum(ConceptState), default=ConceptState.NOT_STARTED)
    bloom_level_reached: Mapped[BloomLevel | None] = mapped_column(SAEnum(BloomLevel), nullable=True)
    next_retention_check: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="mastery_records")


class DoubtLogEntry(Base):
    """Per-concept, per-misconception log (HLD 6.6). Seeds future basic-student questions."""
    __tablename__ = "doubt_log_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    concept_id: Mapped[str] = mapped_column(String, index=True)
    # The enum id from the concept's authored misconception list. This is the
    # aggregatable field — "doubts closed per learner", and the per-
    # misconception breakdown, both group on it (HLD 6.6).
    misconception_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    # Human-readable label for the same thing, denormalised so the Progress
    # screen and the report do not have to reload modules.json per row.
    misconception: Mapped[str] = mapped_column(String)   # e.g. "sign convention reversed"
    source: Mapped[str] = mapped_column(String)  # wrong_blank | revealed_hint | checkpoint_miss | teachback_omission | speech_hesitation
    closed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="doubt_log_entries")


class BaselineMessage(Base):
    """
    One turn of the plain-chat baseline arm (HLD 6.3 control condition).

    The baseline lives inside this app rather than sending learners to a
    third-party chat product: otherwise the equal time budget cannot be
    enforced, nothing from the control condition is logged, and there is no
    way to verify a learner completed it. Same login, same timer, same
    checkpoint and quiz delivery — just a chat box instead of a classroom.
    """
    __tablename__ = "baseline_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("learning_sessions.id"), index=True)
    message_index: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String)  # learner | assistant
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["LearningSession"] = relationship(back_populates="baseline_messages")


class VoiceSignalScore(Base):
    """Derived score only — no raw audio stored, ever (HLD 8.4)."""
    __tablename__ = "voice_signal_scores"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("learning_sessions.id"), unique=True)
    transcript_coverage_score: Mapped[float] = mapped_column(Float)
    speech_rate_wpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    hesitation_flags: Mapped[dict] = mapped_column(JSON)  # [{term, pause_ms}, ...]
    signal_degraded: Mapped[bool] = mapped_column(Boolean, default=False)  # HLD 10.6 degradation path
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["LearningSession"] = relationship(back_populates="voice_signal_score")
