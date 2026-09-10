from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    pilot_pair_id: str | None = None
    pilot_condition_map: dict | None = None
    total_points: int = 0

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ModuleOut(BaseModel):
    id: str
    name: str
    concepts: list[dict]
    is_custom: bool = False
    topic_description: str | None = None
    sources: list[dict] = []


class CustomModuleCreateRequest(BaseModel):
    topic: str


class QuestionHistoryItem(BaseModel):
    session_id: str
    turn_id: str
    concept_id: str
    concept_name: str
    question: str
    answer: str | None
    asked_at: datetime


# --- sessions --------------------------------------------------------------

# HLD T2.7. "reduced" suppresses the basic-student persona.
DialogueModeIn = Literal["full", "reduced"]


class StartSessionRequest(BaseModel):
    concept_id: str
    dialogue_mode: DialogueModeIn = "full"


class StartFreeformSessionRequest(BaseModel):
    topic: str
    dialogue_mode: DialogueModeIn = "full"


class StartSessionResponse(BaseModel):
    session_id: str
    concept_id: str
    condition: str
    dialogue_mode: str = "full"
    time_budget_seconds: int | None = None
    topic_name: str | None = None


class StreamTicketResponse(BaseModel):
    """Short-lived, session-scoped credential for the SSE stream — see app.auth."""

    ticket: str
    expires_in_seconds: int


class LearnerQuestionRequest(BaseModel):
    question: str


class InteractionEventIn(BaseModel):
    turn_id: str
    event_type: str  # reveal | dwell_time | question_asked
    payload: dict
    is_correct: bool | None = None


class BlankAttemptRequest(BaseModel):
    """
    A committed guess at a blank or hint turn. Deliberately carries no verdict:
    the server judges it against the blank's expected answers, which never reach
    the browser (PROJECT.md D1).
    """

    turn_id: str
    guess: str = ""


class BlankAttemptResponse(BaseModel):
    # None when the turn has no judgeable expected answer (a hint turn, or a
    # reveal with no guess) — distinct from False, which means "judged, wrong".
    is_correct: bool | None
    hint: str | None = None
    feedback: str
    doubt_logged: bool = False


class HintRungOut(BaseModel):
    level: int
    text: str


class HintRevealResponse(BaseModel):
    turn_id: str
    rungs: list[HintRungOut]


# --- checkpoint ------------------------------------------------------------


class CheckpointItemOut(BaseModel):
    """
    A checkpoint question as the learner sees it. The rubric is NOT included —
    it is the grading criteria, and handing it over would let a learner write to
    the marking scheme instead of answering.
    """

    id: str
    prompt: str
    bloom_level: str


class CheckpointFormOut(BaseModel):
    session_id: str
    concept_id: str
    concept_name: str
    items: list[CheckpointItemOut]
    derived_from_session: bool = True


class CheckpointSubmitRequest(BaseModel):
    session_id: str
    # {checkpoint_item_id: answer text}
    answers: dict


class CheckpointItemResultOut(BaseModel):
    item_id: str
    passed: bool
    score: float
    feedback: str


class CheckpointResultOut(BaseModel):
    passed: bool
    score: float
    per_item: list[CheckpointItemResultOut] = Field(default_factory=list)
    doubts_logged: list[str] = Field(default_factory=list)
    graded_by: str = "heuristic"

    model_config = ConfigDict(from_attributes=True)


# --- plain-chat baseline arm (HLD 6.3) ------------------------------------


class BaselineStartRequest(BaseModel):
    concept_id: str


class BaselineStartResponse(BaseModel):
    session_id: str
    concept_id: str
    concept_name: str
    condition: str
    time_budget_seconds: int | None = None
    opening_message: str


class BaselineMessageRequest(BaseModel):
    message: str


class BaselineMessageOut(BaseModel):
    role: str
    content: str
    created_at: datetime


class BaselineMessageResponse(BaseModel):
    reply: BaselineMessageOut
    seconds_elapsed: int
    seconds_remaining: int | None = None
    time_budget_exhausted: bool = False


class BaselineTranscriptOut(BaseModel):
    session_id: str
    concept_id: str
    concept_name: str
    messages: list[BaselineMessageOut]
    seconds_elapsed: int
    seconds_remaining: int | None = None
    time_budget_exhausted: bool = False


# --- progress --------------------------------------------------------------


class MasteryOut(BaseModel):
    concept_id: str
    module_id: str
    state: str
    bloom_level_reached: str | None
    next_retention_check: datetime | None

    model_config = ConfigDict(from_attributes=True)


class DoubtOut(BaseModel):
    id: str
    concept_id: str
    misconception_id: str | None = None
    misconception: str
    source: str
    closed: bool

    model_config = ConfigDict(from_attributes=True)


class PendingQuizOut(BaseModel):
    id: str
    concept_id: str
    quiz_type: str  # retention | transfer | linked
    linked_concept_id: str | None = None
    prompt: str | None
    scheduled_for: datetime
    available_now: bool


class QuizSubmitRequest(BaseModel):
    answer: str


class QuizSubmitResponse(BaseModel):
    passed: bool
    score: float
    feedback: str = ""
    points_awarded: int
    newly_awarded_badges: list[str] = []


class BadgeOut(BaseModel):
    code: str
    label: str
    emoji: str
    description: str
    awarded_at: datetime
