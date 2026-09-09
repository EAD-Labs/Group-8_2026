import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type Turn = {
  id: string
  speaker: 'teacher' | 'basic_student' | 'advanced_student' | 'learner'
  turn_type: 'dialogue' | 'hint' | 'blank' | 'learner_question'
  content: string
  target_bloom_level: string | null
}

const SPEAKER_STYLE: Record<string, string> = {
  teacher: 'border-teacher text-teacher',
  basic_student: 'border-basic text-basic',
  advanced_student: 'border-advanced text-advanced',
  learner: 'border-learner text-learner',
}

const SPEAKER_LABEL: Record<string, string> = {
  teacher: 'Teacher',
  basic_student: 'Basic Student',
  advanced_student: 'Advanced Student',
  learner: 'You',
}

export default function Classroom() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [turns, setTurns] = useState<Turn[]>([])
  const [streamDone, setStreamDone] = useState(false)
  const [revealedHints, setRevealedHints] = useState<Record<string, boolean>>({})
  const [guesses, setGuesses] = useState<Record<string, string>>({})
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [recording, setRecording] = useState(false)
  const [voiceSubmitting, setVoiceSubmitting] = useState(false)
  const [voiceResult, setVoiceResult] = useState<{
    ok: boolean
    reason?: string
    transcript_coverage_score?: number
    speech_rate_wpm?: number | null
    hesitation_flags?: { term: string; pause_ms: number }[]
    signal_degraded?: boolean
  } | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionId) return
    const es = new EventSource(api.streamDialogueUrl(sessionId))
    es.addEventListener('turn', (e) => {
      const turn = JSON.parse((e as MessageEvent).data) as Turn
      setTurns((prev) => [...prev, turn])
    })
    es.addEventListener('done', () => {
      setStreamDone(true)
      es.close()
    })
    es.onerror = () => es.close()
    return () => es.close()
  }, [sessionId])

  useEffect(() => {
    api.getVoiceStatus().then((s) => setVoiceEnabled(!!s.enabled)).catch(() => setVoiceEnabled(false))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  function submitGuess(turn: Turn, correct: boolean | null = null) {
    api.recordInteractionEvent({
      turn_id: turn.id,
      event_type: 'guess',
      payload: { guess: guesses[turn.id] || '' },
      is_correct: correct,
    })
    setRevealedHints((prev) => ({ ...prev, [turn.id]: true }))
  }

  async function handleAsk() {
    if (!question.trim() || !sessionId) return
    setAsking(true)
    try {
      const res = await api.askQuestion(sessionId, question)
      setTurns((prev) => [
        ...prev,
        { id: `learner-${Date.now()}`, speaker: 'learner', turn_type: 'learner_question', content: question, target_bloom_level: null },
        { id: res.id, speaker: 'teacher', turn_type: 'dialogue', content: res.content, target_bloom_level: null },
      ])
      setQuestion('')
    } finally {
      setAsking(false)
    }
  }

  async function startRecording() {
    setVoiceError(null)
    setVoiceResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch {
      // permission denied or no mic — voice is never a hard blocker, typed
      // teach-back below still works
      setVoiceError('Could not access the microphone. You can type your explanation instead.')
    }
  }

  async function stopAndSubmitRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || !sessionId) return
    recorder.stop()
    setRecording(false)
    setVoiceSubmitting(true)
    // wait a tick for the final ondataavailable/onstop to fire
    await new Promise((resolve) => setTimeout(resolve, 200))
    try {
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' })
      const res = await api.submitVoiceClip(sessionId, blob)
      setVoiceResult(res)
      if (!res.ok) {
        setVoiceError('Voice scoring failed — you can type your explanation instead.')
      }
    } catch {
      setVoiceError('Voice submission failed — you can type your explanation instead.')
    } finally {
      setVoiceSubmitting(false)
    }
  }

  return (
    <NavShell title="Classroom">
      <div className="bg-white rounded-xl shadow p-6 space-y-4 min-h-[300px]">
        {turns.map((turn) => (
          <div key={turn.id} className={`border-l-4 pl-3 ${SPEAKER_STYLE[turn.speaker] || 'border-slate-300 text-slate-700'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">{SPEAKER_LABEL[turn.speaker] || turn.speaker}</p>
            <p className="text-sm text-slate-800">{turn.content}</p>

            {turn.turn_type === 'hint' && (
              <div className="mt-2">
                {!revealedHints[turn.id] ? (
                  <div className="flex gap-2">
                    <input
                      className="border border-slate-300 rounded-lg px-2 py-1 text-sm flex-1"
                      placeholder="Your guess…"
                      value={guesses[turn.id] || ''}
                      onChange={(e) => setGuesses((prev) => ({ ...prev, [turn.id]: e.target.value }))}
                    />
                    <button
                      className="text-xs font-medium border border-slate-300 rounded-lg px-3 py-1"
                      onClick={() => submitGuess(turn)}
                    >
                      Reveal
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Hint revealed — your guess was recorded.</p>
                )}
              </div>
            )}

            {turn.turn_type === 'blank' && (
              <div className="mt-2 flex gap-2">
                <input
                  className="border border-slate-300 rounded-lg px-2 py-1 text-sm flex-1"
                  placeholder="Fill in the blank…"
                  value={guesses[turn.id] || ''}
                  onChange={(e) => setGuesses((prev) => ({ ...prev, [turn.id]: e.target.value }))}
                />
                <button
                  className="text-xs font-medium border border-slate-300 rounded-lg px-3 py-1"
                  onClick={() => submitGuess(turn)}
                >
                  Submit
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />

        {!streamDone && <p className="text-xs text-slate-400">Dialogue in progress…</p>}
      </div>

      <div className="bg-white rounded-xl shadow p-4 mt-4 flex gap-2">
        <input
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1"
          placeholder="Ask a question, as the third student…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
        />
        <button
          className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={asking}
          onClick={handleAsk}
        >
          Ask
        </button>
      </div>

      {streamDone && voiceEnabled && (
        <div className="bg-white rounded-xl shadow p-4 mt-4">
          <p className="text-sm text-slate-600 mb-3">
            Teach it back out loud — record a short clip explaining the concept in your own words.
          </p>
          <div className="flex items-center gap-3">
            {!recording ? (
              <button
                className="border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                disabled={voiceSubmitting}
                onClick={startRecording}
              >
                🎙️ Start recording
              </button>
            ) : (
              <button
                className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium animate-pulse"
                onClick={stopAndSubmitRecording}
              >
                ■ Stop & submit
              </button>
            )}
            {voiceSubmitting && <span className="text-xs text-slate-400">Scoring…</span>}
          </div>

          {voiceError && <p className="text-xs text-amber-600 mt-2">{voiceError}</p>}

          {voiceResult?.ok && (
            <div className="mt-3 text-sm text-slate-700 space-y-1">
              <p>
                Coverage score: <span className="font-medium">{voiceResult.transcript_coverage_score}</span>
                {voiceResult.signal_degraded && (
                  <span className="ml-2 text-xs text-amber-600">(timing signal degraded — coverage still counted)</span>
                )}
              </p>
              {voiceResult.speech_rate_wpm != null && (
                <p className="text-xs text-slate-400">Speech rate: {voiceResult.speech_rate_wpm} wpm</p>
              )}
              {voiceResult.hesitation_flags && voiceResult.hesitation_flags.length > 0 && (
                <p className="text-xs text-slate-400">
                  Hesitation noticed near: {voiceResult.hesitation_flags.map((h) => h.term).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {streamDone && (
        <div className="mt-4 flex justify-end">
          <button
            className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium"
            onClick={() => navigate(`/checkpoint/${sessionId}`)}
          >
            Proceed to checkpoint →
          </button>
        </div>
      )}
    </NavShell>
  )
}
