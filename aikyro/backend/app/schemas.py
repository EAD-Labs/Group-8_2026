from pydantic import BaseModel, EmailStr
from datetime import datetime


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

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ModuleOut(BaseModel):
    id: str
    name: str
    concepts: list[dict]


class StartSessionRequest(BaseModel):
    concept_id: str


class StartFreeformSessionRequest(BaseModel):
    topic: str


class StartSessionResponse(BaseModel):
    session_id: str
    concept_id: str
    condition: str
    topic_name: str | None = None


class LearnerQuestionRequest(BaseModel):
    question: str


class InteractionEventIn(BaseModel):
    turn_id: str
    event_type: str  # reveal | guess | question_asked | dwell_time
    payload: dict
    is_correct: bool | None = None


class CheckpointSubmitRequest(BaseModel):
    session_id: str
    answers: dict


class CheckpointResultOut(BaseModel):
    passed: bool
    score: float

    class Config:
        from_attributes = True


class MasteryOut(BaseModel):
    concept_id: str
    module_id: str
    state: str
    bloom_level_reached: str | None
    next_retention_check: datetime | None

    class Config:
        from_attributes = True


class DoubtOut(BaseModel):
    id: str
    concept_id: str
    misconception: str
    closed: bool

    class Config:
        from_attributes = True
