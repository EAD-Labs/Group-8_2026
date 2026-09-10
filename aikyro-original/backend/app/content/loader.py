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
import re
import uuid
from datetime import datetime
from pathlib import Path
from functools import lru_cache

_CONTENT_PATH = Path(__file__).parent / "modules.json"

# Learner-generated modules (HLD 6.4 extension path: "a module is a list of
# concepts with Bloom targets ... the verification engine generates
# everything else"). Stored one JSON file per user, outside modules.json,
# because these are per-account content, not shared pilot content.
_CUSTOM_MODULES_DIR = Path(__file__).parent / "custom_modules"


@lru_cache
def load_content() -> dict:
    with open(_CONTENT_PATH) as f:
        return json.load(f)


def get_concept(concept_id: str) -> dict | None:
    content = load_content()
    for module in content["modules"]:
        for concept in module["concepts"]:
            if concept["id"] == concept_id:
                return {**concept, "module_id": module["id"], "module_name": module["name"], "is_custom": False}

    if concept_id.startswith("custom:"):
        return get_custom_concept(concept_id)
    return None


def get_module(module_id: str) -> dict | None:
    content = load_content()
    for module in content["modules"]:
        if module["id"] == module_id:
            return module
    if module_id.startswith("custom_"):
        for path in _CUSTOM_MODULES_DIR.glob("*.json"):
            for module in _read_custom_file(path):
                if module["id"] == module_id:
                    return module
    return None


# ---------------------------------------------------------------------------
# Custom (learner-described) modules
# ---------------------------------------------------------------------------

def _custom_modules_path(user_id: str) -> Path:
    _CUSTOM_MODULES_DIR.mkdir(parents=True, exist_ok=True)
    # user_id is our own uuid, never user input, so it's safe as a filename
    return _CUSTOM_MODULES_DIR / f"{user_id}.json"


def _read_custom_file(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        with open(path) as f:
            return json.load(f).get("modules", [])
    except (json.JSONDecodeError, OSError):
        return []


def list_custom_modules(user_id: str) -> list[dict]:
    """All modules a specific learner has generated (HLD 4: scoped to their own account)."""
    return _read_custom_file(_custom_modules_path(user_id))


def save_custom_module(user_id: str, name: str, topic_description: str, concepts: list[dict], sources: list[dict]) -> dict:
    """
    Persists a learner-generated module to that user's own file. Concept ids
    are prefixed `custom:` and module ids `custom_` so they can never collide
    with pilot content ids from modules.json, and so get_concept/get_module
    know to look here when a pilot lookup misses.
    """
    slug = _slugify(name)
    module_id = f"custom_{slug}_{uuid.uuid4().hex[:8]}"
    module = {
        "id": module_id,
        "name": name,
        "topic_description": topic_description,
        "is_custom": True,
        "created_at": datetime.utcnow().isoformat(),
        "sources": sources,
        "concepts": [
            {
                "id": f"custom:{module_id}:{_slugify(c['name'])}",
                "name": c["name"],
                "bloom_level": c["bloom_level"],
            }
            for c in concepts
        ],
    }

    path = _custom_modules_path(user_id)
    existing = _read_custom_file(path)
    existing.append(module)
    with open(path, "w") as f:
        json.dump({"modules": existing}, f, indent=2)

    return module


def get_custom_concept(concept_id: str) -> dict | None:
    """
    Scans every user's custom-module file for a concept id. This is safe
    without a user_id because concept ids embed a per-module uuid, so a
    global scan can't collide across accounts — needed because callers like
    the dialogue orchestrator only have a concept_id, not the learner's
    identity, at that point in the pipeline.
    """
    if not _CUSTOM_MODULES_DIR.exists():
        return None
    for path in _CUSTOM_MODULES_DIR.glob("*.json"):
        for module in _read_custom_file(path):
            for concept in module["concepts"]:
                if concept["id"] == concept_id:
                    return {
                        **concept,
                        "module_id": module["id"],
                        "module_name": module["name"],
                        "is_custom": True,
                    }
    return None


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-")
    return slug[:60] or "topic"


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
