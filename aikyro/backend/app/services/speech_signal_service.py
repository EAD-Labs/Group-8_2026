"""
Speech Signal Service (HLD 6.3, 10.6).

Committed multimodal signal is speech. This service is intentionally the
single point of contact for audio: it receives a short clip, returns a
derived score, and — critically — never persists the raw audio (HLD 8.4).

Degradation path built in: if timing/hesitation extraction fails but
transcription succeeds, we still return a usable (degraded) score rather
than failing the request, per HLD 10.6. If transcription itself fails, the
caller should fall back to typed input — voice is never a hard blocker.

Swap `_transcribe` for a real AI4Bharat/Whisper call once the D1 feasibility
spike (HLD 10.6) picks a winner; keep both wired behind this same interface
so the loser stays available as a runtime fallback.
"""
from app.config import settings


def score_speech_clip(audio_bytes: bytes, expected_concept_terms: list[str]) -> dict:
    if not settings.voice_enabled:
        raise RuntimeError("Voice is disabled in settings.")

    transcript = _transcribe(audio_bytes)
    if transcript is None:
        # transcription failed entirely — caller must fall back to typed input
        return {"ok": False, "reason": "transcription_failed"}

    coverage_score = _score_coverage(transcript, expected_concept_terms)
    covered = _covered_terms(transcript, expected_concept_terms)

    timing = _extract_timing(audio_bytes)
    if timing is None:
        # degrade: keep the teach-back/coverage score, drop hesitation signal
        return {
            "ok": True,
            "transcript": transcript,
            "transcript_coverage_score": coverage_score,
            "terms_covered": covered,
            "speech_rate_wpm": None,
            "hesitation_flags": [],
            "signal_degraded": True,
        }

    return {
        "ok": True,
        "transcript": transcript,
        "transcript_coverage_score": coverage_score,
        "terms_covered": covered,
        "speech_rate_wpm": timing["speech_rate_wpm"],
        "hesitation_flags": timing["hesitation_flags"],
        "signal_degraded": False,
    }


def _transcribe(audio_bytes: bytes) -> str | None:
    if settings.speech_provider == "mock":
        return "[mock transcript] the learner explains the concept here"
    # TODO: AI4Bharat or Whisper-class call, per D1 spike winner (HLD 10.6)
    raise NotImplementedError(f"Speech provider '{settings.speech_provider}' not wired yet.")


def transcribe_clip(audio_bytes: bytes) -> str | None:
    """
    Transcription on its own, for voice *dictation* (asking a question aloud).
    Separate from `score_speech_clip`, which derives teach-back signals: a
    dictated question needs the words and nothing else, and nothing about it is
    persisted. See routers/voice.transcribe_question_clip.
    """
    if not settings.voice_enabled:
        raise RuntimeError("Voice is disabled in settings.")
    return _transcribe(audio_bytes)


def _covered_terms(transcript: str, expected_terms: list[str]) -> list[str]:
    """
    Which expected terms the learner actually said.

    Matching is still substring-based, but it now runs over the concept's
    `key_terms` from the structured record rather than over the concept's title
    alone — previously a learner who explained the concept correctly without
    saying its name scored 0, and one who said the name twice scored 1
    (PROJECT.md D8). A multi-word term counts if its head word appears, so
    "internal energy" is credited to someone who said "the internal energy
    change".
    """
    said = transcript.lower()
    covered = []
    for term in expected_terms:
        needle = term.lower()
        if needle in said or (" " in needle and needle.split()[0] in said and needle.split()[-1] in said):
            covered.append(term)
    return covered


def _score_coverage(transcript: str, expected_terms: list[str]) -> float:
    if not expected_terms:
        return 1.0
    return round(len(_covered_terms(transcript, expected_terms)) / len(expected_terms), 2)


def _extract_timing(audio_bytes: bytes) -> dict | None:
    if settings.speech_provider == "mock":
        return {
            "speech_rate_wpm": 120.0,
            "hesitation_flags": [{"term": "entropy", "pause_ms": 900}],
        }
    return None  # real implementation may legitimately fail -> degrade, not crash
