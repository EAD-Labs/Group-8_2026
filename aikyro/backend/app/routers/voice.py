"""
Voice routes.

Two jobs, both going through `MediaRecorder` in the browser and this backend —
never the browser's Web Speech API.

The classroom previously used `window.SpeechRecognition` for voice *question*
input, which is Chrome-only, gives no word timings, and sends the audio to
Google — while HLD 11.4 states raw media is "never transmitted to third parties"
(PROJECT.md D6). Both paths now post a clip here, where the audio is read into
memory, scored or transcribed, and discarded (HLD 8.4).

`speech_provider` is still `mock` by default: the transcriber is deferred
pending the D1 feasibility spike (HLD 10.6), and the interface stays wired so
the real provider is a config change. `/voice/status` reports `transcription_usable`
so the UI can tell a learner the truth — that voice dictation is not available
yet — rather than silently returning a canned transcript as if it had heard them.
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session as DBSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import LearningSession, User, VerifiedKnowledgeRecord, VoiceSignalScore
from app.services.speech_signal_service import score_speech_clip, transcribe_clip
from app.services.verification_engine import load_structured

router = APIRouter(prefix="/voice", tags=["voice"])

# A teach-back clip is short by design; this is a guard against an oversized
# upload, not a pedagogical limit.
_MAX_CLIP_BYTES = 10 * 1024 * 1024


@router.get("/status")
def voice_status():
    return {
        "enabled": settings.voice_enabled,
        "provider": settings.speech_provider,
        # False while the transcriber is mocked. The UI must not offer voice
        # dictation as though it worked — see HLD 10.6 / PROJECT.md D6.
        "transcription_usable": settings.voice_enabled and settings.speech_provider != "mock",
        "privacy_note": (
            "Audio is processed in memory on our own backend and discarded; no clip is stored, "
            "and none is sent to a third-party speech service (HLD 11.4)."
        ),
    }


def _owned_session(db: DBSession, session_id: str, user: User) -> LearningSession:
    session = db.query(LearningSession).filter_by(id=session_id, user_id=user.id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return session


def _expected_terms(db: DBSession, session: LearningSession) -> list[str]:
    """
    The terms a teach-back should contain.

    Was `[concept["name"]]` — so a learner who explained the concept correctly
    without ever saying its title scored 0, and one who said the title twice
    scored 1 (PROJECT.md D8). The structured record's `key_terms` are what
    coverage should actually be measured against.
    """
    record = db.query(VerifiedKnowledgeRecord).filter_by(id=session.verified_record_id).first()
    if not record:
        return []
    structured = load_structured(record)
    terms = list(structured.key_terms)
    if not terms:
        terms = [structured.concept_name]
    return terms


@router.post("/{session_id}/submit")
async def submit_voice_clip(
    session_id: str,
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Teach-back clip: scored for key-term coverage, speech rate and hesitation.
    Audio is read into memory, scored, and discarded — never written to disk or
    the database (HLD 8.4, T3.6).
    """
    if not settings.voice_enabled:
        raise HTTPException(400, "Voice is disabled.")

    session = _owned_session(db, session_id, user)
    audio_bytes = await file.read()  # in memory only
    if len(audio_bytes) > _MAX_CLIP_BYTES:
        del audio_bytes
        raise HTTPException(413, "Clip too large — keep teach-back under a minute.")

    expected_terms = _expected_terms(db, session)
    result = score_speech_clip(audio_bytes, expected_terms)
    del audio_bytes  # explicit: nothing persisted, per HLD 8.4

    if not result["ok"]:
        # transcription failed -> caller falls back to typed input (HLD T3.7)
        return {"ok": False, "reason": result["reason"], "fallback": "typed_input"}

    existing = db.query(VoiceSignalScore).filter_by(session_id=session.id).first()
    if existing:
        existing.transcript_coverage_score = result["transcript_coverage_score"]
        existing.speech_rate_wpm = result["speech_rate_wpm"]
        existing.hesitation_flags = result["hesitation_flags"]
        existing.signal_degraded = result["signal_degraded"]
        score = existing
    else:
        score = VoiceSignalScore(
            session_id=session.id,
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
        "terms_expected": expected_terms,
        "terms_covered": result.get("terms_covered", []),
    }


@router.post("/{session_id}/transcribe")
async def transcribe_question_clip(
    session_id: str,
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Dictation for asking a question by voice (PROJECT.md D6).

    This replaces the browser's Web Speech API, which sent the learner's audio to
    Google while HLD 11.4 promised it went to no third party. The clip is
    transcribed here and discarded; the transcript is returned to the client,
    which puts it in the question box for the learner to edit and send. No
    transcript is stored — only derived scores are ever persisted (HLD 8.4).

    Returns 503 while `speech_provider` is mock: there is no transcriber yet, and
    returning the canned mock string as if it were what the learner said would
    put words in their mouth.
    """
    if not settings.voice_enabled:
        raise HTTPException(400, "Voice is disabled.")
    _owned_session(db, session_id, user)

    if settings.speech_provider == "mock":
        raise HTTPException(
            503,
            "Voice dictation isn't available yet — the transcriber is still mocked pending the D1 "
            "spike (HLD 10.6). Please type your question.",
        )

    audio_bytes = await file.read()
    if len(audio_bytes) > _MAX_CLIP_BYTES:
        del audio_bytes
        raise HTTPException(413, "Clip too large.")

    transcript = transcribe_clip(audio_bytes)
    del audio_bytes

    if transcript is None:
        return {"ok": False, "reason": "transcription_failed", "fallback": "typed_input"}
    return {"ok": True, "transcript": transcript}
