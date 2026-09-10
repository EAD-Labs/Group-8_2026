"""
The structured concept record — the contract between all three parts
(PROJECT.md D5 / HLD T1.7).

Before this existed, Part 1 emitted a prose blob and Parts 2 and 3 could only
paste it into prompts: the dialogue layer couldn't draw on a specific claim,
grading had no rubric, the basic student had nothing specific to be confused
about, and the doubt log had nothing to key on. Everything downstream
addresses *fields of this object* instead of substring-searching a paragraph.

Two sources merge into one record:

  - **Authored** (`content/modules.json`): misconceptions, key terms, blanks,
    checkpoint items and their rubrics. These are pedagogical decisions, and
    per PROJECT.md §5 / §12 they are content, not code — they stay in
    modules.json where the client and a TA can review them without a deploy.
  - **Compiled** (the verification engine): claims, the worked example, and
    the hint ladder. These are generated and cross-checked across model
    families, then adjudicated.

`misconception_id` is the load-bearing field. Because it is drawn from an
enumerable authored list rather than free text, `DoubtLogEntry` rows
aggregate, the client's third report figure becomes a number, and open doubts
can seed later dialogues (HLD 6.6).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

BloomLiteral = Literal["remember", "understand", "apply", "analyse"]


class Misconception(BaseModel):
    """
    A specific, named way a first-year learner gets this concept wrong.

    `statement` is what the learner is doing (not what's true) — it's what the
    basic-student persona is seeded with, and what the Progress screen shows
    as an open doubt. `probe` is a question that surfaces it without giving
    the answer away.
    """

    id: str
    statement: str
    probe: str
    # plain-language form shown to the learner on the Progress screen; falls
    # back to `statement` when not authored separately.
    learner_facing: str | None = None

    def for_learner(self) -> str:
        return self.learner_facing or self.statement


class WorkedExample(BaseModel):
    situation: str
    steps: list[str] = Field(default_factory=list)
    answer: str


class HintRung(BaseModel):
    """
    One rung of a graduated hint ladder. Rung 1 nudges, the last rung is
    nearly the answer. Reveal is always gated on a committed guess (HLD
    T2.4); the ladder is what makes the reveal worth something instead of
    just handing over the answer.
    """

    level: int
    text: str


class BlankCandidate(BaseModel):
    """
    A fill-in-the-blank with a *judgeable* answer.

    `expected_answers` holds accepted surface forms, matched case- and
    punctuation-insensitively. `misconception_id` is what a wrong answer here
    is evidence of — this is the field that makes D1 (the dead doubt log)
    fixable: a wrong guess can finally be wrong *against something*.

    NOTE: this object is never sent to the browser. The dialogue stream
    carries `prompt` only. Shipping `expected_answers` to the client would
    make the gate decorative.
    """

    id: str
    prompt: str
    expected_answers: list[str]
    misconception_id: str | None = None
    hint: str | None = None

    @field_validator("prompt")
    @classmethod
    def _must_have_a_blank(cls, v: str) -> str:
        if "____" not in v:
            raise ValueError("A blank prompt must contain '____' to mark the blank.")
        return v

    def judge(self, guess: str) -> bool:
        """True when `guess` matches any accepted form."""
        return _normalise(guess) in {_normalise(a) for a in self.expected_answers}


class CheckpointItem(BaseModel):
    """
    One checkpoint question plus the rubric it is graded against.

    The rubric is the point: rubric-conditioned grading measurably beats
    grading against a paragraph (PROJECT.md D5), and it is what lets a
    checkpoint miss name a specific misconception for the doubt log rather
    than just recording a low score.
    """

    id: str
    prompt: str
    bloom_level: BloomLiteral
    rubric: list[str]
    targets_misconception: str | None = None


class StructuredConceptRecord(BaseModel):
    """
    The addressable form of a verified concept record (T1.7).

    `verified_text` is kept as a rendered prose view so the classroom board
    and the older prompt paths keep working, but it is now *derived from*
    this object rather than being the only thing there is.
    """

    concept_id: str
    concept_name: str
    bloom_level: BloomLiteral

    # --- compiled by the verification engine ---
    claims: list[str] = Field(default_factory=list)
    worked_example: WorkedExample | None = None
    hint_ladder: list[HintRung] = Field(default_factory=list)

    # --- authored in modules.json ---
    key_terms: list[str] = Field(default_factory=list)
    misconceptions: list[Misconception] = Field(default_factory=list)
    blanks: list[BlankCandidate] = Field(default_factory=list)
    checkpoint_items: list[CheckpointItem] = Field(default_factory=list)

    # set when any authored field needed review and hasn't had it (see
    # modules.json `content_reviewed`) — surfaced so a pilot never runs on
    # unreviewed pedagogical content without anyone noticing.
    content_reviewed: bool = False

    def misconception(self, misconception_id: str) -> Misconception | None:
        return next((m for m in self.misconceptions if m.id == misconception_id), None)

    def blank(self, blank_id: str) -> BlankCandidate | None:
        return next((b for b in self.blanks if b.id == blank_id), None)

    def misconception_ids(self) -> list[str]:
        return [m.id for m in self.misconceptions]

    def render_prose(self) -> str:
        """
        Flatten to the prose form older callers (and the classroom board)
        expect. Deliberately lossy — anything that needs a specific claim
        should address `claims` directly rather than parsing this.
        """
        parts: list[str] = []
        if self.claims:
            parts.append(" ".join(self.claims))
        if self.worked_example:
            steps = " ".join(self.worked_example.steps)
            parts.append(
                f"Worked situation: {self.worked_example.situation} {steps} "
                f"Result: {self.worked_example.answer}"
            )
        if self.misconceptions:
            parts.append(
                "Common difficulties: "
                + "; ".join(m.statement for m in self.misconceptions)
                + "."
            )
        return " ".join(p.strip() for p in parts if p.strip())

    def rubric_block(self) -> str:
        """The grading context a judge call is conditioned on (replaces 'here is a paragraph')."""
        lines = [f"Concept: {self.concept_name} (Bloom target: {self.bloom_level})"]
        if self.claims:
            lines.append("Claims a correct answer must be consistent with:")
            lines += [f"  - {c}" for c in self.claims]
        if self.misconceptions:
            lines.append("Known learner misconceptions — flag if the answer shows one:")
            lines += [f"  - [{m.id}] {m.statement}" for m in self.misconceptions]
        return "\n".join(lines)


def _normalise(text: str) -> str:
    """Lowercase, strip punctuation and collapse whitespace, for answer matching."""
    import re

    return re.sub(r"[^a-z0-9 ]", "", text.strip().lower()).strip()
