from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.content.loader import load_content, d03_status, mark_pair_reviewed
from app.models import User

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("/modules")
def list_modules(user: User = Depends(get_current_user)):
    """Dashboard / Topic Setup screen data (HLD 9.1-9.2)."""
    content = load_content()
    return {
        "modules": content["modules"],
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
