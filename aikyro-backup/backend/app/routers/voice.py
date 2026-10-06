from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session as DBSession

from app.auth import get_current_user
from app.config import settings
from app.content.loader import get_concept
from app.database import get_db
from app.models import User, LearningSession, VoiceSignalScore
from app.services.speech_signal_service import score_speech_clip

router = APIRouter(prefix="/voice", tags=["voice"])


@router.get("/status")
def voice_status():
    return {"enabled": settings.voice_enabled, "provider": settings.speech_provider}


@router.post("/{session_id}/submit")
async def submit_voice_clip(
    session_id: str,
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Accepts a short recorded clip (teach-back or voice-mode checkpoint
    answer). Audio is read into memory, scored, and discarded — never
    written to disk or DB (HLD 8.4).
    """
    if not settings.voice_enabled:
        raise HTTPException(400, "Voice is disabled.")

    session = db.query(LearningSession).filter_by(id=session_id, user_id=user.id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    concept = get_concept(session.concept_id)
    expected_terms = [concept["name"]] if concept else []

    audio_bytes = await file.read()  # in memory only
    result = score_speech_clip(audio_bytes, expected_terms)
    del audio_bytes  # explicit: nothing persisted, per HLD 8.4

    if not result["ok"]:
        # transcription failed -> caller (frontend) should fall back to typed input
        return {"ok": False, "reason": result["reason"], "fallback": "typed_input"}

    score = VoiceSignalScore(
        session_id=session_id,
        transcript_coverage_score=result["transcript_coverage_score"],
        speech_rate_wpm=result["speech_rate_wpm"],
        hesitation_flags=result["hesitation_flags"],
        signal_degraded=result["signal_degraded"],
    )
    db.add(score)
    db.commit()
    db.refresh(score)

    return {
        "ok": True,
        "transcript_coverage_score": score.transcript_coverage_score,
        "speech_rate_wpm": score.speech_rate_wpm,
        "hesitation_flags": score.hesitation_flags,
        "signal_degraded": score.signal_degraded,
    }
