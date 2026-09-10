import { useCallback, useRef, useState } from 'react'

// Web Speech API isn't in default TS lib types — minimal ambient declarations
// (same shape used in Classroom.tsx for the "ask as third student" mic).
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>
  resultIndex: number
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}

/**
 * Browser speech-to-text for filling a text answer by voice (HLD 10.6:
 * "any checkpoint or quiz can be answered by speaking instead of typing,
 * using the same transcription path"). This is the lightweight, text-only
 * transcription path — distinct from the recorded-clip teach-back on the
 * Classroom page, which is scored server-side for coverage/hesitation.
 * Text input always remains available; voice is additive, never required.
 */
export function useSpeechToText(onFinalTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const supported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const toggleListening = useCallback(() => {
    if (!supported) return
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    setError(null)
    const recognition = new Ctor()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.onresult = (e) => {
      let finalTranscript = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) finalTranscript += result[0].transcript
      }
      if (finalTranscript) onFinalTranscript(finalTranscript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      setError('Could not hear you clearly — try typing instead.')
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [listening, supported, onFinalTranscript])

  return { supported, listening, error, toggleListening }
}
