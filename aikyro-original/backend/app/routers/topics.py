from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.content.loader import load_content, d03_status, mark_pair_reviewed, list_custom_modules, save_custom_module
from app.models import User
from app.schemas import CustomModuleCreateRequest, ModuleOut
from app.services.module_generation_service import generate_custom_module

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("/modules")
def list_modules(user: User = Depends(get_current_user)):
    """
    Dashboard / Topic Setup screen data (HLD 9.1-9.2). Two fixed pilot
    modules (Thermodynamics, Probability & Statistics — HLD 6.4 sample
    modules) plus whatever custom modules this learner has generated for
    themselves (HLD 6.4 extension path).
    """
    content = load_content()
    sample_modules = [{**m, "is_custom": False, "topic_description": None, "sources": []} for m in content["modules"]]
    custom_modules = list_custom_modules(user.id)
    return {
        "modules": sample_modules + custom_modules,
        "pilot_pair_id": user.pilot_pair_id,
        "pilot_condition_map": user.pilot_condition_map,
    }


@router.post("/custom-modules", response_model=ModuleOut)
async def create_custom_module(
    payload: CustomModuleCreateRequest, user: User = Depends(get_current_user)
):
    """
    Learner describes a topic; the model researches it (HLD 6.4: "a module
    is a list of concepts with Bloom targets ... the verification engine
    generates everything else") and the result is saved to this learner's
    own account only — never shared modules.json, never visible to other
    learners.
    """
    topic = payload.topic.strip()
    if not topic:
        raise HTTPException(400, "Describe a topic first.")
    if len(topic) > 300:
        raise HTTPException(400, "Keep the topic description under 300 characters.")

    generated = await generate_custom_module(topic)
    module = save_custom_module(
        user_id=user.id,
        name=generated["name"],
        topic_description=topic,
        concepts=generated["concepts"],
        sources=generated["sources"],
    )
    return module


@router.get("/d03-status")
def get_d03_status():
    """
    HLD Section 16, D-03: OPEN until every graded pair has had its TA/
    instructor 'equally hard to a first-year' check; resolved once all four
    are reviewed. Surfaced here so it doesn't just live in a document.
    """
    return d03_status()


@router.post("/pairs/{pair_id}/mark-reviewed")
def review_pair(pair_id: str, user: User = Depends(get_current_user)):
    """
    Record that a course TA/instructor has done the difficulty check for
    this pair (D-03). No role system yet (HLD 4 doesn't define one for the
    pilot), so this is open to any logged-in user for now — lock it down to
    a staff/TA role once that exists.
    """
    pair = mark_pair_reviewed(pair_id, reviewed=True)
    if not pair:
        raise HTTPException(404, "Unknown pair_id")
    return pair
