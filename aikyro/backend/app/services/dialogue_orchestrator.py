"""
Part 2 - Simulated Classroom (HLD 6.1, 6.5).

Converts a structured concept record into a turn-by-turn dialogue between
teacher / basic_student / advanced_student, with hints (gated reveal) and
fill-in-the-blank turns at intuition-testable points, plus a teach-back turn at
the end (interaction modality escalation: read -> type -> speak, HLD 6.5).

The turn *structure* — which persona speaks when, hint vs. blank placement,
Bloom progression — is fixed. That sequence encodes the pedagogical design from
the HLD and shouldn't vary per concept. What varies is the *content*.

### What the personas are seeded with

Previously both student personas were generic: the basic student asked "can you
say that in plain words?" for every concept, and the advanced student's
boundary-case turn had nothing specific to push on (HLD T2.2, T2.3 both scored
weak). Both now draw on the concept's authored misconceptions — the basic
student is confused about a *named* difficulty, and the advanced student probes
the one the course team flagged as the deepest. That is the payoff of the
structured record: the personas address fields, not a paragraph.

### Blanks are judgeable

A blank turn carries the id of the `BlankCandidate` it came from, so when a
guess arrives the server can look up the accepted answers and the misconception
a wrong answer implies. The expected answers themselves never leave the server
— the turn streamed to the browser carries the prompt only. This is what makes
the doubt log writable (PROJECT.md D1).

### Dialogue is pre-generated

`build_dialogue` returns the full turn list up front; the caller persists it and
the SSE endpoint replays it. That is deliberate: demos are deterministic, a bad
dialogue can be fixed by hand, and "resume after a dropped connection" reduces
to "resume from a turn index" (HLD T2.10). Do not replace it with live
generation.
"""
import logging

from app.config import settings
from app.content.schema import StructuredConceptRecord
from app.models import DialogueMode
from app.services.llm_providers import generate, preferred_available_provider

logger = logging.getLogger(__name__)

# Appended to every live prompt in this module.
#
# Two failure modes seen in real output that the per-turn prompts do not
# prevent on their own: models reach for LaTeX ("$P(A \cap B)$") on
# mathematical topics, which renders as literal dollar signs and backslashes in
# a classroom with no math typesetter; and they prefix their own speaker label
# ("Teacher: ...") when the UI already shows whose turn it is.
_HOUSE_STYLE = (
    "\n\nStyle rules, which override anything above:\n"
    "- Plain text only. No LaTeX, no $...$, no backslash commands, no markdown "
    "formatting. Write mathematics in words and plain symbols the way a person "
    "says it aloud: 'P(A and B)', 'delta-U', 'the square root of n'.\n"
    "- Do not prefix your line with your own name or role. Speak directly.\n"
    "- Do not use stage directions or narration about yourself.\n"
    "- If a fill-in-the-blank question appears in the transcript above, do NOT "
    "state its answer. The learner has to fill it in themselves; a character "
    "who answers it out loud has taken the question away from them."
)

# Turn indices are not stable identities; turn *roles* are. Each spec below
# names the role it plays so reduced mode can filter by role rather than by
# position.


def _turn_specs(rec: StructuredConceptRecord) -> list[dict]:
    """
    The fixed 7-turn spec (HLD T2.1), with content drawn from `rec`.

    Each spec carries a `mock_content` template (used in mock mode, and as the
    per-turn fallback when a live call fails) and a `live_prompt` built from the
    same structured fields.
    """
    name = rec.concept_name
    claims = " ".join(rec.claims)
    # The basic student is confused about the first authored difficulty; the
    # advanced student pushes on the last, which in the authored content is
    # consistently the one needing the most analysis.
    basic_target = rec.misconceptions[0] if rec.misconceptions else None
    advanced_target = rec.misconceptions[-1] if rec.misconceptions else None
    rung_one = rec.hint_ladder[0].text if rec.hint_ladder else None
    blank = rec.blanks[0] if rec.blanks else None
    example = rec.worked_example

    def context(transcript: str) -> str:
        return (
            f"Verified claims about '{name}':\n" + "\n".join(f"- {c}" for c in rec.claims)
            + (f"\n\nWorked situation: {example.situation}" if example else "")
            + f"\n\nSo far in class:\n{transcript}"
        )

    return [
        {
            "role": "teacher_opening",
            "speaker": "teacher",
            "turn_type": "dialogue",
            "target_bloom_level": "remember",
            "mock_content": f"Let's look at {name}. {claims}",
            "live_prompt": lambda t: (
                f"{context(t)}\n\n"
                f"You are a teacher introducing '{name}' to a first-year engineering student for "
                f"the first time. State the claims above in your own words — 2-3 sentences, "
                f"precise, no preamble like 'Sure' or 'Great question'. Just the explanation."
            ),
        },
        {
            "role": "basic_student_question",
            "speaker": "basic_student",
            "turn_type": "dialogue",
            "target_bloom_level": "understand",
            "misconception_id": basic_target.id if basic_target else None,
            "mock_content": (
                f"Hang on — I think I'm doing this wrong. {basic_target.probe}"
                if basic_target
                else f"Wait — can you say that in plain words? What does '{name}' actually mean day to day?"
            ),
            "live_prompt": lambda t: (
                f"{context(t)}\n\n"
                + (
                    f"You are a first-year student who has exactly this difficulty: "
                    f"{basic_target.statement}. Ask the question that difficulty would make you "
                    f"ask — the foundational one a self-conscious learner would suppress. Show the "
                    f"confusion rather than naming it. One or two sentences, natural spoken voice, "
                    f"no meta-commentary like 'As a student I would say'."
                    if basic_target
                    else f"You are a first-year student who learns best in plain, everyday words. "
                    f"Ask the teacher to restate '{name}' more simply. One or two sentences."
                )
            ),
        },
        {
            "role": "teacher_hint",
            "speaker": "teacher",
            "turn_type": "hint",
            "target_bloom_level": "understand",
            "misconception_id": basic_target.id if basic_target else None,
            # The reveal is gated on a committed guess (HLD T2.4), so this turn
            # must not contain the answer — it is rung 1 of the ladder.
            "mock_content": (
                f"Before I answer that: what do *you* think? {rung_one}"
                if rung_one
                else "Before I answer: what do *you* think happens here? (Hint hidden until you guess.)"
            ),
            "live_prompt": lambda t: (
                f"{context(t)}\n\n"
                f"As the teacher, turn the question back to the class with one short encouraging "
                f"prompt asking them to guess first. You may use this nudge: "
                f"'{rung_one or 'start from the definition'}'. Do NOT give away the answer. One sentence."
            ),
        },
        {
            "role": "advanced_student_worked",
            "speaker": "advanced_student",
            "turn_type": "dialogue",
            "target_bloom_level": "apply",
            "mock_content": (
                f"Can we work one through? {example.situation}"
                if example
                else f"Here's a worked situation involving {name}. Let's apply it."
            ),
            "live_prompt": lambda t: (
                f"{context(t)}\n\n"
                f"You are a stronger student who wants concepts made concrete. Propose working "
                f"through this specific situation: "
                f"'{example.situation if example else f'a situation where {name} applies'}'. "
                f"Say why it is worth doing. 1-2 sentences."
            ),
        },
        {
            "role": "teacher_blank",
            "speaker": "teacher",
            "turn_type": "blank",
            "target_bloom_level": "apply",
            "blank_id": blank.id if blank else None,
            "misconception_id": blank.misconception_id if blank else None,
            # A blank turn's content is the authored prompt verbatim. It is NOT
            # regenerated live: the server judges the guess against this
            # blank's expected answers, so the wording the learner sees has to
            # be the wording those answers were written for.
            "mock_content": (
                blank.prompt if blank else "Fill in the blank: in this situation, the key quantity is ____."
            ),
            "live_prompt": None,
        },
        {
            "role": "advanced_student_boundary",
            "speaker": "advanced_student",
            "turn_type": "dialogue",
            "target_bloom_level": "analyse",
            "misconception_id": advanced_target.id if advanced_target else None,
            "mock_content": (
                f"Let me push on that. {advanced_target.probe}"
                if advanced_target
                else f"Now a boundary case — what if the usual assumption behind {name} breaks down?"
            ),
            "live_prompt": lambda t: (
                f"{context(t)}\n\n"
                + (
                    f"You are the advanced student. Challenge the class on this specific "
                    f"difficulty: {advanced_target.statement}. Construct a boundary case where "
                    f"getting it wrong would change the answer, and put it to the class as a "
                    f"question. Do not simply agree with what has been said. 1-2 sentences."
                    if advanced_target
                    else f"As the advanced student, push into a boundary case where the usual "
                    f"assumption behind '{name}' might break down. Phrase it as a question. 1-2 sentences."
                )
            ),
        },
        {
            "role": "teacher_teachback",
            "speaker": "teacher",
            "turn_type": "dialogue",
            "target_bloom_level": "apply",
            "mock_content": "Good. Now, in your own words, explain this back to me — type it, or use voice.",
            "live_prompt": lambda t: (
                f"{context(t)}\n\n"
                f"As the teacher, wrap up and ask the student to explain '{name}' back in their own "
                f"words, typed or spoken. One warm, encouraging sentence."
            ),
        },
    ]


# HLD T2.7: reduced mode suppresses the basic-student persona. It is a filter
# over the spec above, not a second spec — the hint turn stays (the gated
# reveal is load-bearing for T2.4), it just no longer answers a question the
# basic student asked.
_REDUCED_SUPPRESSES = {"basic_student_question"}

_REDUCED_HINT_OVERRIDE = (
    "Before I go on: what do *you* think? {rung}"
)


async def build_dialogue(
    rec: StructuredConceptRecord, mode: DialogueMode = DialogueMode.FULL
) -> list[dict]:
    specs = _turn_specs(rec)

    if mode == DialogueMode.REDUCED:
        specs = [s for s in specs if s["role"] not in _REDUCED_SUPPRESSES]
        for spec in specs:
            if spec["role"] == "teacher_hint":
                rung = rec.hint_ladder[0].text if rec.hint_ladder else "start from the definition."
                spec["mock_content"] = _REDUCED_HINT_OVERRIDE.format(rung=rung)

    provider = preferred_available_provider() if settings.llm_mode == "live" else None
    if not provider:
        return [_finalize(spec, spec["mock_content"]) for spec in specs]

    turns: list[dict] = []
    transcript = ""
    for spec in specs:
        if spec["live_prompt"] is None:
            # blank turns are authored verbatim — see the spec comment
            content, generated = spec["mock_content"], False
        else:
            try:
                # Run tier, not build. PROJECT.md §6 files dialogue scripting
                # under build-time, on the assumption it happens once per
                # concept — but only the *verified record* is cached, and
                # build_dialogue runs afresh for every session. Six calls per
                # session is the volume driver in this app, so it belongs on the
                # cheap model.
                content = (await generate(provider, spec["live_prompt"](transcript) + _HOUSE_STYLE,
                                          concept_name=rec.concept_name, tier="run")).strip()
                content = _strip_speaker_prefix(content, spec["speaker"])
                generated = bool(content)
                if not content:
                    content = spec["mock_content"]
            except Exception as exc:
                # One turn failing shouldn't take down the whole lesson — drop
                # back to the template for just this turn. But say so: a
                # rate-limited key can silently template half a dialogue, and a
                # lesson that looks live while being mostly canned is the one
                # outcome an operator most needs to know about.
                logger.warning(
                    "dialogue turn '%s' for %r fell back to its template: %s",
                    spec["role"], rec.concept_name, exc,
                )
                content, generated = spec["mock_content"], False
        turns.append(_finalize(spec, content, generated=generated))
        transcript += f"{spec['speaker']}: {content}\n"
    return turns


def _strip_speaker_prefix(content: str, speaker: str) -> str:
    """
    Remove a self-applied speaker label, belt-and-braces alongside the house
    style rule. Models re-add these intermittently, and the UI already shows
    whose turn it is, so a leading "Teacher:" reads as a stutter.
    """
    labels = (speaker.replace("_", " "), speaker, "teacher", "student")
    stripped = content.lstrip()
    for label in labels:
        prefix = f"{label}:"
        if stripped[: len(prefix)].lower() == prefix.lower():
            return stripped[len(prefix):].lstrip()
    return content


def _finalize(spec: dict, content: str, *, generated: bool = False) -> dict:
    """
    Shape the caller persists as a DialogueTurn. Keys match the model's columns.

    `generated` is deliberately not one of them: whether a given turn came from
    a model or its template is operational detail, not learner state, and adding
    a column for it would put a migration in the way of every future prompt
    tweak. It is logged instead — see build_dialogue.
    """
    return {
        "speaker": spec["speaker"],
        "turn_type": spec["turn_type"],
        "content": content,
        "target_bloom_level": spec["target_bloom_level"],
        "blank_id": spec.get("blank_id"),
        "misconception_id": spec.get("misconception_id"),
    }


async def insert_learner_question(
    question_text: str,
    rec: StructuredConceptRecord,
    prior_turns: list[dict],
    open_doubts: list[str] | None = None,
) -> dict:
    """
    Learner enters as the third student (HLD 6.1).

    `prior_turns` is the dialogue so far, as [{"speaker", "content"}, ...]. It
    is required, not optional: HLD T2.6 asks the answer to refer to the
    dialogue so far rather than being a generic response, and the previous
    implementation only ever saw the verified text and the concept name, so it
    structurally could not (PROJECT.md D2). The answer is also told not to jump
    ahead of what the class has covered — otherwise a question at turn 2 gets
    answered with material from turn 6 and the remaining dialogue spoils itself.

    `open_doubts` are misconception ids this learner still has open; when the
    question touches one, the answer addresses it (HLD 6.6).
    """
    transcript = "\n".join(f"{t['speaker']}: {t['content']}" for t in prior_turns)
    covered = len(prior_turns)

    if settings.llm_mode == "live":
        provider = preferred_available_provider()
        if provider:
            doubt_note = ""
            if open_doubts:
                relevant = [m for m in rec.misconceptions if m.id in set(open_doubts)]
                if relevant:
                    doubt_note = (
                        "\n\nThis learner has these difficulties still open — if the question "
                        "touches one, address it directly:\n"
                        + "\n".join(f"- {m.statement}" for m in relevant)
                    )
            prompt = (
                f"You are the teacher in a class on '{rec.concept_name}'.\n\n"
                f"Verified claims you may rely on:\n"
                + "\n".join(f"- {c}" for c in rec.claims)
                + f"\n\nThe class has had exactly these {covered} turns so far:\n{transcript}\n\n"
                f"A student has just put their hand up and asked: '{question_text}'\n\n"
                f"Answer them within what the class has actually covered above. Refer back to what "
                f"was said — name the student who raised it, or the situation already on the table "
                f"— rather than giving a generic explanation. Do NOT introduce material the class "
                f"has not reached yet; the rest of the lesson still has to happen."
                + doubt_note
                + "\n\n2-3 sentences, no preamble."
            )
            try:
                content = (await generate(provider, prompt + _HOUSE_STYLE,
                                          concept_name=rec.concept_name)).strip()
                content = _strip_speaker_prefix(content, "teacher")
                if content:
                    return {
                        "speaker": "teacher",
                        "turn_type": "dialogue",
                        "content": content,
                        "target_bloom_level": None,
                        "blank_id": None,
                        "misconception_id": None,
                    }
            except Exception as exc:
                logger.warning("learner-question answer fell back to template: %s", exc)

    return {
        "speaker": "teacher",
        "turn_type": "dialogue",
        "content": _mock_contextual_answer(question_text, rec, prior_turns),
        "target_bloom_level": None,
        "blank_id": None,
        "misconception_id": None,
    }


def _mock_contextual_answer(
    question_text: str, rec: StructuredConceptRecord, prior_turns: list[dict]
) -> str:
    """
    Mock-mode answer that still satisfies T2.6 by construction: it quotes the
    most recent non-learner turn and stays inside the claims already covered.
    A canned answer that ignores the dialogue would make the mock demo fail the
    very criterion this path is meant to exercise.
    """
    last = next(
        (t for t in reversed(prior_turns) if t.get("speaker") not in ("learner", None)), None
    )
    covered_claim = rec.claims[0] if rec.claims else rec.concept_name
    if last:
        snippet = last["content"].rstrip(".")
        if len(snippet) > 120:
            snippet = snippet[:120].rsplit(" ", 1)[0] + "…"
        return (
            f"Good question — it follows on from what the {last['speaker'].replace('_', ' ')} just "
            f"raised (\"{snippet}\"). Staying with where we are: {covered_claim} "
            f"We'll get to the rest shortly."
        )
    return f"Good question. We've only just started, so let's stay with this: {covered_claim}"
