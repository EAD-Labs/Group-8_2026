"""
Custom module generation — HLD 6.4 extension path: "Adding a third module
later is a content task rather than an engineering one: a module is a list
of concepts with Bloom targets and known difficulties, and the verification
engine generates everything else."

This service is what does that content task on demand, for any topic a
learner types in, instead of a human editing content/modules.json by hand.

Two paths, same fallback pattern as verification_engine / grading_service:
  - live mode with a configured provider: one LLM call acts as a curriculum
    researcher — it proposes a concept breakdown with Bloom targets and a
    short list of reference material (books / papers / standard texts) for
    the topic, grounded in what it knows rather than invented on the spot.
  - mock mode, or no provider configured: falls back to a templated module
    so the "describe a topic, get a module" flow is still demoable with
    zero API keys.

Output feeds content.loader.save_custom_module, which is what actually
persists it (scoped to the requesting learner's own account, HLD 4).
"""
from app.config import settings
from app.services.llm_providers import generate, preferred_available_provider, extract_json_object

_VALID_BLOOM_LEVELS = {"remember", "understand", "apply", "analyse"}


async def generate_custom_module(topic: str) -> dict:
    """
    Returns {"name": str, "concepts": [{"name", "bloom_level"}, ...], "sources": [{"title", "author"}, ...]}
    Caller (topics router) is responsible for persisting this via
    content.loader.save_custom_module.
    """
    topic = topic.strip()

    if settings.llm_mode == "live":
        provider = preferred_available_provider()
        if provider:
            live_result = await _generate_live(provider, topic)
            if live_result:
                return live_result

    return _generate_mock(topic)


async def _generate_live(provider: str, topic: str) -> dict | None:
    prompt = (
        f"A first-year engineering/computing student wants to learn about: '{topic}'.\n\n"
        "Act as a curriculum researcher. Break this topic down the way a course module would:\n"
        "1. A short, clear module name for this topic.\n"
        "2. Between 4 and 6 core concepts a learner would need, in a sensible teaching order. "
        "Each concept gets a target Bloom's taxonomy level — one of exactly: "
        "remember, understand, apply, analyse — matching how deep a first-year student should "
        "go with that concept.\n"
        "3. Between 2 and 4 real, specific reference sources (textbooks, standard papers, or "
        "well-known lecture notes) a learner could actually go read for this topic — title and "
        "author. If you are not confident a specific source is real, omit it rather than "
        "inventing one.\n\n"
        "Respond with ONLY a JSON object, no other text, in this exact shape:\n"
        '{"name": "<short module name>", '
        '"concepts": [{"name": "<concept name>", "bloom_level": "<remember|understand|apply|analyse>"}, ...], '
        '"sources": [{"title": "<title>", "author": "<author or organisation>"}, ...]}'
    )
    try:
        raw = await generate(provider, prompt, concept_name=topic)
        parsed = extract_json_object(raw)
        return _validate_and_clean(parsed, topic)
    except Exception:
        return None


def _validate_and_clean(parsed: dict, topic: str) -> dict | None:
    name = str(parsed.get("name") or topic).strip()[:100]

    concepts = []
    for c in parsed.get("concepts", []):
        cname = str(c.get("name", "")).strip()
        level = str(c.get("bloom_level", "")).strip().lower()
        if cname and level in _VALID_BLOOM_LEVELS:
            concepts.append({"name": cname, "bloom_level": level})
    if not concepts:
        return None

    sources = []
    for s in parsed.get("sources", []):
        title = str(s.get("title", "")).strip()
        author = str(s.get("author", "")).strip()
        if title:
            sources.append({"title": title, "author": author})

    return {"name": name, "concepts": concepts[:6], "sources": sources[:4]}


def _generate_mock(topic: str) -> dict:
    display = topic[:1].upper() + topic[1:] if topic else "This topic"
    return {
        "name": display[:100],
        "concepts": [
            {"name": f"Core definitions in {display}", "bloom_level": "remember"},
            {"name": f"Explaining {display} in plain terms", "bloom_level": "understand"},
            {"name": f"Applying {display} to a worked problem", "bloom_level": "apply"},
            {"name": f"Edge cases and limits of {display}", "bloom_level": "analyse"},
        ],
        "sources": [
            {"title": "(mock mode — set llm_mode=live for real reference suggestions)", "author": ""},
        ],
    }
