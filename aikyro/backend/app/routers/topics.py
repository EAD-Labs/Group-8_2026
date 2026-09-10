from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.content.loader import (
    content_review_status, d03_status, load_content, mark_content_reviewed,
    mark_pair_reviewed, public_modules,
)
from app.models import User

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("/modules")
def list_modules(user: User = Depends(get_current_user)):
    """Dashboard / Topic Setup screen data (HLD 9.1-9.2)."""
    # public_modules() strips each concept's blanks (expected answers) and
    # checkpoint rubrics. Returning content["modules"] raw would ship every
    # blank's accepted answers to the browser, which would make the blank gate
    # and the checkpoint decorative.
    return {
        "modules": public_modules(),
        "pilot_pair_id": user.pilot_pair_id,
        "pilot_condition_map": user.pilot_condition_map,
    }


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


@router.get("/content-review-status")
def get_content_review_status():
    """
    Which concepts still have TA/instructor-unreviewed authored content —
    misconceptions and checkpoint rubrics (PROJECT.md §5).

    Separate from D-03: that asks whether two paired concepts are equally hard,
    this asks whether one concept's pedagogical content is sound. A pilot should
    not run on unreviewed misconceptions, and this is how that stays visible
    rather than living in a document.
    """
    return content_review_status()


@router.post("/concepts/{concept_id}/mark-content-reviewed")
def review_concept_content(concept_id: str, user: User = Depends(get_current_user)):
    """
    Record that a TA/instructor has checked this concept's misconceptions and
    checkpoint rubrics. Same caveat as mark-reviewed below: no role system in the
    pilot, so any logged-in user can call it for now.
    """
    result = mark_content_reviewed(concept_id, reviewed=True)
    if not result:
        raise HTTPException(404, "Unknown concept_id")
    return result
