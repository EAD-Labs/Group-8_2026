"""
Part 2 - Simulated Classroom (HLD 6.1, 6.5).

Converts a VerifiedKnowledgeRecord into a turn-by-turn dialogue between
teacher / basic_student / advanced_student, with hints (hidden reveal) and
fill-in-the-blank turns inserted at intuition-testable points, plus a
teach-back turn at the end (interaction modality escalation: read -> type ->
speak, HLD 6.5).

`build_dialogue` returns a plain list of turn dicts so it's easy to test /
swap out. The streaming (SSE) happens in routers/classroom.py, which just
iterates this list with a small delay to simulate turn-by-turn arrival —
replace that with real token-level streaming once turns are generated live
rather than templated.
"""
from app.content.loader import get_concept
from app.models import VerifiedKnowledgeRecord


def build_dialogue(record: VerifiedKnowledgeRecord) -> list[dict]:
    concept = get_concept(record.concept_id)
    name = concept["name"] if concept else (record.topic_name or record.concept_id)

    turns = [
        {
            "speaker": "teacher",
            "turn_type": "dialogue",
            "content": f"Let's look at {name}. {record.verified_text}",
            "target_bloom_level": "remember",
        },
        {
            "speaker": "basic_student",
            "turn_type": "dialogue",
            "content": f"Wait — can you say that in plain words? What does '{name}' actually mean day to day?",
            "target_bloom_level": "understand",
        },
        {
            "speaker": "teacher",
            "turn_type": "hint",
            "content": f"Before I answer: what do *you* think happens here? (Hint hidden until you guess.)",
            "target_bloom_level": "understand",
        },
        {
            "speaker": "advanced_student",
            "turn_type": "dialogue",
            "content": f"Here's a worked situation involving {name}. Let's apply it.",
            "target_bloom_level": "apply",
        },
        {
            "speaker": "teacher",
            "turn_type": "blank",
            "content": f"Fill in the blank: in this situation, the key quantity is ____.",
            "target_bloom_level": "apply",
        },
        {
            "speaker": "advanced_student",
            "turn_type": "dialogue",
            "content": f"Now a boundary case — what if the usual assumption behind {name} breaks down?",
            "target_bloom_level": "analyse",
        },
        {
            "speaker": "teacher",
            "turn_type": "dialogue",
            "content": "Good. Now, in your own words, explain this back to me — type it, or use voice.",
            "target_bloom_level": "apply",
        },
    ]
    return turns


def insert_learner_question(existing_turns: list[dict], question_text: str, verified_text: str) -> dict:
    """
    Learner enters as third student (HLD 6.1). In-context answer is a stand-in
    here — real implementation should ground the answer in `verified_text`
    via an LLM call, not just echo it.
    """
    return {
        "speaker": "teacher",
        "turn_type": "dialogue",
        "content": f"Good question. In context: {verified_text[:200]}...",
        "target_bloom_level": None,
        "in_response_to": question_text,
    }
