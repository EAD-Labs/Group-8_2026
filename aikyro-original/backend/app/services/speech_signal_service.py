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

    timing = _extract_timing(audio_bytes)
    if timing is None:
        # degrade: keep the teach-back/coverage score, drop hesitation signal
        return {
            "ok": True,
            "transcript": transcript,
            "transcript_coverage_score": coverage_score,
            "speech_rate_wpm": None,
            "hesitation_flags": [],
            "signal_degraded": True,
        }

    return {
        "ok": True,
        "transcript": transcript,
        "transcript_coverage_score": coverage_score,
        "speech_rate_wpm": timing["speech_rate_wpm"],
        "hesitation_flags": timing["hesitation_flags"],
        "signal_degraded": False,
    }


def _transcribe(audio_bytes: bytes) -> str | None:
    if settings.speech_provider == "mock":
        return "[mock transcript] the learner explains the concept here"
    # TODO: AI4Bharat or Whisper-class call, per D1 spike winner (HLD 10.6)
    raise NotImplementedError(f"Speech provider '{settings.speech_provider}' not wired yet.")


def _score_coverage(transcript: str, expected_terms: list[str]) -> float:
    if not expected_terms:
        return 1.0
    hits = sum(1 for term in expected_terms if term.lower() in transcript.lower())
    return round(hits / len(expected_terms), 2)


def _extract_timing(audio_bytes: bytes) -> dict | None:
    if settings.speech_provider == "mock":
        return {
            "speech_rate_wpm": 120.0,
            "hesitation_flags": [{"term": "entropy", "pause_ms": 900}],
        }
    return None  # real implementation may legitimately fail -> degrade, not crash
