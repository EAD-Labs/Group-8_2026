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

    sessions: Mapped[list["LearningSession"]] = relationship(back_populates="user")
    mastery_records: Mapped[list["MasteryRecord"]] = relationship(back_populates="user")
    doubt_log_entries: Mapped[list["DoubtLogEntry"]] = relationship(back_populates="user")


class VerifiedKnowledgeRecord(Base):
    """Output of Part 1 — Verified Knowledge Engine."""
    __tablename__ = "verified_knowledge_records"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    concept_id: Mapped[str] = mapped_column(String, index=True)  # references content/modules.json, or "freeform:<slug>"
    module_id: Mapped[str] = mapped_column(String, index=True)
    topic_name: Mapped[str | None] = mapped_column(String, nullable=True)  # set for freeform topics only; pilot concepts get their name from modules.json
    verified_text: Mapped[str] = mapped_column(Text)
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
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")
    turns: Mapped[list["DialogueTurn"]] = relationship(back_populates="session")
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
    """Delayed retention quizzes + transfer problems (non-blocking, HLD 6.3)."""
    __tablename__ = "quiz_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    concept_id: Mapped[str] = mapped_column(String, index=True)
    quiz_type: Mapped[str] = mapped_column(String)  # retention | transfer
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
    misconception: Mapped[str] = mapped_column(String)   # e.g. "sign convention reversed"
    source: Mapped[str] = mapped_column(String)  # wrong_blank | revealed_hint | checkpoint_miss | teachback_omission | speech_hesitation
    closed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="doubt_log_entries")


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
