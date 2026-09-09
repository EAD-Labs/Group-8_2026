"""
Loads content/modules.json and implements the counterbalanced assignment
described in the D-03 email:
  - assign a learner one of the four graded pairs (spread across all four,
    not everyone on the same pair)
  - randomise which concept in the pair is platform vs. plain_chat
  - the two module-orphan concepts (second_law_and_entropy,
    correlation_and_causation_fitted_model) never feed the graded comparison
"""
import json
import random
from pathlib import Path
from functools import lru_cache

_CONTENT_PATH = Path(__file__).parent / "modules.json"


@lru_cache
def load_content() -> dict:
    with open(_CONTENT_PATH) as f:
        return json.load(f)


def get_concept(concept_id: str) -> dict | None:
    content = load_content()
    for module in content["modules"]:
        for concept in module["concepts"]:
            if concept["id"] == concept_id:
                return {**concept, "module_id": module["id"], "module_name": module["name"]}
    return None


def get_module(module_id: str) -> dict | None:
    content = load_content()
    for module in content["modules"]:
        if module["id"] == module_id:
            return module
    return None


def get_pair(pair_id: str) -> dict | None:
    content = load_content()
    for pair in content["graded_pairs"]:
        if pair["pair_id"] == pair_id:
            return pair
    return None


def mark_pair_reviewed(pair_id: str, reviewed: bool = True) -> dict | None:
    """
    Flip difficulty_reviewed once a course TA/instructor has done the
    'does this feel equally hard to a first-year' check (D-03, HLD 6.4/16).
    Writes back to modules.json so the change persists and is visible to
    whoever edits that file directly too.
    """
    with open(_CONTENT_PATH) as f:
        content = json.load(f)

    pair = None
    for p in content["graded_pairs"]:
        if p["pair_id"] == pair_id:
            p["difficulty_reviewed"] = reviewed
            pair = p
            break

    if pair is None:
        return None

    with open(_CONTENT_PATH, "w") as f:
        json.dump(content, f, indent=2)

    load_content.cache_clear()
    return pair


def d03_status() -> dict:
    """
    Surfaces the D-03 decision-log status (HLD Section 16): OPEN until every
    graded pair has been TA/instructor-reviewed, then resolved.
    """
    content = load_content()
    pairs = content["graded_pairs"]
    all_reviewed = all(p.get("difficulty_reviewed") for p in pairs)
    return {
        "status": "resolved" if all_reviewed else "open",
        "pairs": [
            {"pair_id": p["pair_id"], "difficulty_reviewed": p.get("difficulty_reviewed", False)}
            for p in pairs
        ],
    }


def assign_pilot_condition(user_id: str) -> dict:
    """
    Deterministic-ish per-user assignment: pick one of the four graded pairs
    (round-robin-ish via hash so the cohort spreads across all four per the
    D-03 email), then randomise concept -> condition within the pair.

    Returns {"pair_id": ..., "condition_map": {concept_id: "platform"|"plain_chat"}}
    """
    content = load_content()
    pairs = content["graded_pairs"]
    # spread deterministically by user_id so re-calling doesn't reshuffle a learner
    pair = pairs[hash(user_id) % len(pairs)]
    concepts = [pair["concept_a"], pair["concept_b"]]
    random.shuffle(concepts)
    condition_map = {concepts[0]: "platform", concepts[1]: "plain_chat"}
    return {"pair_id": pair["pair_id"], "condition_map": condition_map}
