"""
Loads content/modules.json, validates the authored half of the structured
concept record, and implements the counterbalanced assignment from the D-03
email:
  - assign a learner one of the four graded pairs (spread across all four,
    not everyone on the same pair)
  - randomise which concept in the pair is platform vs. plain_chat
  - the two module-orphan concepts (second_law_and_entropy,
    correlation_and_causation_fitted_model) never feed the graded comparison

Two things here are load-bearing beyond plain file reading:

**Assignment is reproducible.** `assign_pilot_condition` used `hash(user_id)`,
which Python randomises per process — the same learner mapped to a different
pair after every restart (PROJECT.md D4). It survived only because the result
was written to `User.pilot_condition_map` at signup and never recomputed. Both
the pair choice and the within-pair shuffle are now derived from a SHA-256
digest of the user id, so the pilot analysis can recompute any learner's
assignment from their id alone.

**Authored content is validated on load.** Every `misconception_id` and
`targets_misconception` must name a misconception declared on the same
concept. A typo there would silently produce unaggregatable doubt-log rows,
which is the exact failure mode the structured record exists to prevent, so it
fails loudly at startup instead.
"""
import hashlib
import json
import random
import re
import uuid
from datetime import datetime
from pathlib import Path
from functools import lru_cache

from app.content.schema import (
    BlankCandidate, CheckpointItem, Misconception, StructuredConceptRecord,
)

_CONTENT_PATH = Path(__file__).parent / "modules.json"
_CUSTOM_MODULES_DIR = Path(__file__).parent / "custom_modules"
_CUSTOM_MODULES_DIR.mkdir(exist_ok=True)

# Fields of a concept that must never reach the browser: `expected_answers`
# inside blanks would turn the blank gate into decoration, and rubrics let a
# learner reverse-engineer the checkpoint.
_SERVER_ONLY_CONCEPT_FIELDS = ("blanks", "checkpoint_items")


class ContentError(ValueError):
    """Raised when modules.json is internally inconsistent. Fails at load, not at runtime."""


@lru_cache
def load_content() -> dict:
    with open(_CONTENT_PATH) as f:
        content = json.load(f)
    _validate(content)
    return content


def _validate(content: dict) -> None:
    seen_concepts: set[str] = set()
    for module in content["modules"]:
        for concept in module["concepts"]:
            cid = concept["id"]
            if cid in seen_concepts:
                raise ContentError(f"Duplicate concept id: {cid}")
            seen_concepts.add(cid)

            declared = {m["id"] for m in concept.get("misconceptions", [])}
            if len(declared) != len(concept.get("misconceptions", [])):
                raise ContentError(f"{cid}: duplicate misconception ids")

            for m in concept.get("misconceptions", []):
                # A probe is what the basic-student persona says and what the
                # advanced student challenges with, so it has to demand a
                # response from the class. A probe phrased as a statement turns
                # the persona into a narrator and quietly weakens T2.2/T2.3.
                if not m.get("probe", "").rstrip().endswith("?"):
                    raise ContentError(
                        f"{cid}: misconception '{m['id']}' has a probe that is not a question — "
                        f"it is spoken aloud by a persona and must invite an answer"
                    )
                if not m.get("statement"):
                    raise ContentError(f"{cid}: misconception '{m['id']}' has no statement")

            for blank in concept.get("blanks", []):
                ref = blank.get("misconception_id")
                if ref and ref not in declared:
                    raise ContentError(
                        f"{cid}: blank {blank['id']} references unknown misconception '{ref}'"
                    )
                if "____" not in blank.get("prompt", ""):
                    raise ContentError(f"{cid}: blank {blank['id']} has no '____' in its prompt")
                if not blank.get("expected_answers"):
                    raise ContentError(
                        f"{cid}: blank {blank['id']} has no expected_answers — a guess against it "
                        f"could never be judged, which is the D1 failure this field exists to fix"
                    )

            for item in concept.get("checkpoint_items", []):
                ref = item.get("targets_misconception")
                if ref and ref not in declared:
                    raise ContentError(
                        f"{cid}: checkpoint item {item['id']} references unknown misconception '{ref}'"
                    )
                if not item.get("rubric"):
                    raise ContentError(f"{cid}: checkpoint item {item['id']} has no rubric")

    for pair in content["graded_pairs"]:
        for key in ("concept_a", "concept_b"):
            if pair[key] not in seen_concepts:
                raise ContentError(f"Pair {pair['pair_id']} references unknown concept {pair[key]}")
    for cid in content.get("general_use_only", []):
        if cid not in seen_concepts:
            raise ContentError(f"general_use_only references unknown concept {cid}")


def get_concept(concept_id: str) -> dict | None:
    content = load_content()
    for module in content["modules"]:
        for concept in module["concepts"]:
            if concept["id"] == concept_id:
                return {**concept, "module_id": module["id"], "module_name": module["name"]}
    return None


def public_concept(concept: dict) -> dict:
    """
    The browser-safe projection of a concept. Strips blanks (expected answers)
    and checkpoint items (rubrics), and reduces misconceptions to their
    learner-facing wording — the Progress screen needs to name an open doubt
    in plain language without handing over the probe text.
    """
    safe = {k: v for k, v in concept.items() if k not in _SERVER_ONLY_CONCEPT_FIELDS}
    safe["misconceptions"] = [
        {"id": m["id"], "learner_facing": m.get("learner_facing") or m["statement"]}
        for m in concept.get("misconceptions", [])
    ]
    return safe


def public_modules() -> list[dict]:
    """`/topics/modules` payload — see `public_concept` for what is held back."""
    return [
        {**module, "concepts": [public_concept(c) for c in module["concepts"]]}
        for module in load_content()["modules"]
    ]


def authored_record(concept_id: str) -> StructuredConceptRecord | None:
    """
    The authored half of the structured record, as validated Pydantic models.
    The verification engine fills in the compiled half (claims, worked
    example, hint ladder) on top of this.
    """
    concept = get_concept(concept_id)
    if not concept:
        return None
    return StructuredConceptRecord(
        concept_id=concept["id"],
        concept_name=concept["name"],
        bloom_level=concept["bloom_level"],
        key_terms=concept.get("key_terms", []),
        misconceptions=[Misconception(**m) for m in concept.get("misconceptions", [])],
        blanks=[BlankCandidate(**b) for b in concept.get("blanks", [])],
        checkpoint_items=[CheckpointItem(**i) for i in concept.get("checkpoint_items", [])],
        content_reviewed=bool(concept.get("content_reviewed", False)),
    )


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


def pair_for_concept(concept_id: str) -> dict | None:
    """The graded pair a concept belongs to, if any. Used by the comparative report."""
    for pair in load_content()["graded_pairs"]:
        if concept_id in (pair["concept_a"], pair["concept_b"]):
            return pair
    return None


def _write_content(content: dict) -> None:
    with open(_CONTENT_PATH, "w") as f:
        json.dump(content, f, indent=2, ensure_ascii=False)
        f.write("\n")
    load_content.cache_clear()


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

    _write_content(content)
    return pair


def mark_content_reviewed(concept_id: str, reviewed: bool = True) -> dict | None:
    """
    Flip content_reviewed once a TA/instructor has checked a concept's
    authored misconceptions and checkpoint rubrics. Separate from D-03's
    difficulty check: that compares two concepts for equal difficulty, this
    asks whether the pedagogical content for one concept is sound.
    """
    with open(_CONTENT_PATH) as f:
        content = json.load(f)

    found = None
    for module in content["modules"]:
        for concept in module["concepts"]:
            if concept["id"] == concept_id:
                concept["content_reviewed"] = reviewed
                found = concept
                break
        if found:
            break

    if found is None:
        return None

    _write_content(content)
    return {"concept_id": concept_id, "content_reviewed": reviewed}


def content_review_status() -> dict:
    """Which concepts still have unreviewed authored content. Surfaced via /topics."""
    concepts = [
        {
            "concept_id": c["id"],
            "name": c["name"],
            "content_reviewed": bool(c.get("content_reviewed", False)),
            "misconception_count": len(c.get("misconceptions", [])),
            "checkpoint_item_count": len(c.get("checkpoint_items", [])),
        }
        for m in load_content()["modules"]
        for c in m["concepts"]
    ]
    return {
        "status": "resolved" if all(c["content_reviewed"] for c in concepts) else "open",
        "outstanding": [c["concept_id"] for c in concepts if not c["content_reviewed"]],
        "concepts": concepts,
    }


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


def _stable_seed(user_id: str) -> int:
    """
    Process-stable integer from a user id.

    `hash()` is randomised per process (PYTHONHASHSEED), so the previous
    implementation gave a different pair per restart despite its docstring —
    see PROJECT.md D4. SHA-256 is stable across processes, machines and Python
    versions, which the pilot analysis needs in order to recompute an
    assignment from a user id alone.
    """
    return int(hashlib.sha256(user_id.encode("utf-8")).hexdigest(), 16)


def assign_pilot_condition(user_id: str) -> dict:
    """
    Deterministic per-user assignment: pick one of the four graded pairs
    (spread across all four per the D-03 email), then assign concept ->
    condition within the pair.

    Fully reproducible from `user_id`: both the pair choice and the
    within-pair order derive from the same stable digest, so re-running this
    for an existing learner returns exactly what they were given at signup.

    Returns {"pair_id": ..., "condition_map": {concept_id: "platform"|"plain_chat"}}
    """
    content = load_content()
    pairs = content["graded_pairs"]
    seed = _stable_seed(user_id)

    pair = pairs[seed % len(pairs)]
    concepts = [pair["concept_a"], pair["concept_b"]]
    random.Random(seed).shuffle(concepts)
    condition_map = {concepts[0]: "platform", concepts[1]: "plain_chat"}
    return {"pair_id": pair["pair_id"], "condition_map": condition_map}


# ---------------------------------------------------------------------------
# Custom (learner-generated) modules — HLD 6.4 extension path
# ---------------------------------------------------------------------------


def _custom_modules_path(user_id: str) -> Path:
    """Per-user file. user_id is our own uuid, never user input, so it's safe as a filename."""
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

