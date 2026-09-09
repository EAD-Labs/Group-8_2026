import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Mic, Square, Send, Volume2, VolumeX, ArrowRight, Loader2,
  GraduationCap, BookOpen, Brain, User, Hand, HelpCircle,
} from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type Turn = {
  id: string
  speaker: 'teacher' | 'basic_student' | 'advanced_student' | 'learner'
  turn_type: 'dialogue' | 'hint' | 'blank' | 'learner_question'
  content: string
  target_bloom_level: string | null
}

const PERSONA: Record<
  string,
  { label: string; icon: typeof GraduationCap; bg: string; text: string; border: string }
> = {
  teacher: { label: 'Teacher', icon: GraduationCap, bg: 'bg-teacher', text: 'text-teacher', border: 'border-teacher/25' },
  basic_student: { label: 'Basic Student', icon: BookOpen, bg: 'bg-basic', text: 'text-basic', border: 'border-basic/25' },
  advanced_student: { label: 'Advanced Student', icon: Brain, bg: 'bg-advanced', text: 'text-advanced', border: 'border-advanced/25' },
  learner: { label: 'You', icon: User, bg: 'bg-learner', text: 'text-learner', border: 'border-learner/25' },
}

// Web Speech API isn't in default TS lib types — minimal ambient declarations.
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

function Avatar({ speaker, size = 'md' }: { speaker: string; size?: 'sm' | 'md' | 'lg' }) {
  const meta = PERSONA[speaker] || PERSONA.teacher
  const Icon = meta.icon
  const dims = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-8 h-8' : 'w-11 h-11'
  const iconSize = size === 'lg' ? 24 : size === 'sm' ? 15 : 19
  return (
    <div className={`${dims} rounded-full ${meta.bg} text-white flex items-center justify-center shadow-sm shrink-0`}>
      <Icon size={iconSize} />
    </div>
  )
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

  const [speakMode, setSpeakMode] = useState(false)
  const [listening, setListening] = useState(false)
  const speechSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const spokenTurnIds = useRef<Set<string>>(new Set())
  const recapEndRef = useRef<HTMLDivElement>(null)
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

  // The stage freezes on the first unanswered hint/blank — like actually
  // being called on — instead of racing ahead while turns keep streaming
  // in behind the scenes. Anything that arrived after it stays hidden until
  // you respond, then the lecture "catches up" to the real latest turn.
  const pendingInteractive = turns.find(
    (t) => (t.turn_type === 'blank' || t.turn_type === 'hint') && !revealedHints[t.id]
  )
  const currentTurn = pendingInteractive || (turns.length ? turns[turns.length - 1] : null)
  const currentIndex = currentTurn ? turns.findIndex((t) => t.id === currentTurn.id) : -1
  const historyTurns = currentIndex > 0 ? turns.slice(0, currentIndex) : []

  useEffect(() => {
    recapEndRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'end' })
  }, [historyTurns.length])

  // speak newly-spotlighted AI turns aloud when speak-mode is on
  useEffect(() => {
    if (!speakMode || !ttsSupported || !currentTurn) return
    if (currentTurn.speaker === 'learner') return
    if (spokenTurnIds.current.has(currentTurn.id)) return
    spokenTurnIds.current.add(currentTurn.id)
    const utterance = new SpeechSynthesisUtterance(currentTurn.content)
    utterance.rate = 1.0
    window.speechSynthesis.speak(utterance)
  }, [currentTurn, speakMode, ttsSupported])

  useEffect(() => {
    return () => {
      if (ttsSupported) window.speechSynthesis.cancel()
    }
  }, [ttsSupported])

  function speakText(text: string) {
    if (!ttsSupported) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }

  function submitGuess(turn: Turn, correct: boolean | null = null) {
    api.recordInteractionEvent({
      turn_id: turn.id,
      event_type: 'guess',
      payload: { guess: guesses[turn.id] || '' },
      is_correct: correct,
    })
    setRevealedHints((prev) => ({ ...prev, [turn.id]: true }))
  }

  async function handleAsk(text?: string) {
    const q = (text ?? question).trim()
    if (!q || !sessionId) return
    setAsking(true)
    try {
      const res = await api.askQuestion(sessionId, q)
      setTurns((prev) => [
        ...prev,
        { id: `learner-${Date.now()}`, speaker: 'learner', turn_type: 'learner_question', content: q, target_bloom_level: null },
        { id: res.id, speaker: 'teacher', turn_type: 'dialogue', content: res.content, target_bloom_level: null },
      ])
      setQuestion('')
    } finally {
      setAsking(false)
    }
  }

  function toggleListening() {
    if (!speechSupported) return
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const recognition = new Ctor()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.onresult = (e) => {
      let finalTranscript = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) finalTranscript += result[0].transcript
        else setQuestion(result[0].transcript)
      }
      if (finalTranscript) setQuestion(finalTranscript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      setVoiceError('Could not hear you clearly — try typing instead.')
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
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
      setVoiceError('Could not access the microphone. You can type your explanation instead.')
    }
  }

  async function stopAndSubmitRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || !sessionId) return
    recorder.stop()
    setRecording(false)
    setVoiceSubmitting(true)
    await new Promise((resolve) => setTimeout(resolve, 200))
    try {
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' })
      const res = await api.submitVoiceClip(sessionId, blob)
      setVoiceResult(res)
      if (!res.ok) setVoiceError('Voice scoring failed — you can type your explanation instead.')
    } catch {
      setVoiceError('Voice submission failed — you can type your explanation instead.')
    } finally {
      setVoiceSubmitting(false)
    }
  }

  function renderStage() {
    if (!currentTurn) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-16 text-center">
          <Avatar speaker="teacher" size="lg" />
          <p className="text-sm text-slate-400 mt-3">Walking into the classroom…</p>
        </div>
      )
    }

    const meta = PERSONA[currentTurn.speaker] || PERSONA.teacher

    // The moment the user asked about explicitly: fill-in-the-blank is where
    // the teacher calls on you directly.
    if (currentTurn.turn_type === 'blank') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar speaker="teacher" size="sm" />
            <div className="flex items-center gap-1.5 text-amber">
              <Hand size={16} className="animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wide">The teacher points at you</span>
            </div>
          </div>
          <div className="border-2 border-dashed border-amber rounded-2xl bg-amber-light p-6">
            <p className="font-display text-lg text-ink leading-relaxed mb-5">{currentTurn.content}</p>
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <Avatar speaker="learner" size="md" />
                <span className="absolute -inset-1 rounded-full border-2 border-amber animate-ping" />
              </div>
              <input
                autoFocus
                className="border border-amber/40 bg-white rounded-xl px-4 py-2.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-amber/30"
                placeholder="Fill in the blank…"
                value={guesses[currentTurn.id] || ''}
                onChange={(e) => setGuesses((prev) => ({ ...prev, [currentTurn.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && submitGuess(currentTurn)}
              />
              <button
                className="bg-ink text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-cobalt-dark transition-colors shrink-0"
                onClick={() => submitGuess(currentTurn)}
              >
                Answer
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (currentTurn.turn_type === 'hint') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar speaker="teacher" size="sm" />
            <div className="flex items-center gap-1.5 text-cobalt">
              <HelpCircle size={16} />
              <span className="text-xs font-semibold uppercase tracking-wide">Your guess, before the answer</span>
            </div>
          </div>
          <div className="border-2 border-cobalt/30 rounded-2xl bg-cobalt-light p-6">
            <p className="font-display text-lg text-ink leading-relaxed mb-5">{currentTurn.content}</p>
            <div className="flex items-center gap-3">
              <Avatar speaker="learner" size="md" />
              <input
                autoFocus
                className="border border-cobalt/30 bg-white rounded-xl px-4 py-2.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-cobalt/30"
                placeholder="Your guess…"
                value={guesses[currentTurn.id] || ''}
                onChange={(e) => setGuesses((prev) => ({ ...prev, [currentTurn.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && submitGuess(currentTurn)}
              />
              <button
                className="bg-ink text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-cobalt-dark transition-colors shrink-0"
                onClick={() => submitGuess(currentTurn)}
              >
                Reveal
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (currentTurn.speaker === 'teacher') {
      return (
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <Avatar speaker="teacher" size="lg" />
            <span className="text-[10px] font-semibold text-teacher">Teacher</span>
          </div>
          <div className="flex-1 bg-[#28352F] text-white rounded-2xl p-6 relative shadow-inner">
            <div className="absolute top-3 right-3">
              {ttsSupported && (
                <button onClick={() => speakText(currentTurn.content)} className="text-white/40 hover:text-white transition-colors" aria-label="Read aloud">
                  <Volume2 size={14} />
                </button>
              )}
            </div>
            <p className="font-display text-lg leading-relaxed pr-6">{currentTurn.content}</p>
          </div>
        </div>
      )
    }

    if (currentTurn.speaker === 'learner') {
      return (
        <div className="flex items-start gap-4 flex-row-reverse text-right">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <Avatar speaker="learner" size="lg" />
            <span className="text-[10px] font-semibold text-learner">You</span>
          </div>
          <div className="flex-1 bg-white border-2 border-learner/20 rounded-2xl p-6">
            <p className="text-xs font-medium text-learner mb-1.5">✋ You raised your hand</p>
            <p className="text-sm text-ink leading-relaxed">{currentTurn.content}</p>
          </div>
        </div>
      )
    }

    // basic_student / advanced_student raising a doubt
    const fromRight = currentTurn.speaker === 'advanced_student'
    return (
      <div className={`flex items-start gap-4 ${fromRight ? 'flex-row-reverse text-right' : ''}`}>
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <Avatar speaker={currentTurn.speaker} size="lg" />
          <span className={`text-[10px] font-semibold ${meta.text}`}>{meta.label}</span>
        </div>
        <div className={`flex-1 bg-white border-2 ${meta.border} rounded-2xl p-6`}>
          <p className={`text-xs font-medium ${meta.text} mb-1.5`}>✋ raised a hand</p>
          <p className="text-sm text-ink leading-relaxed">{currentTurn.content}</p>
        </div>
      </div>
    )
  }

  return (
    <NavShell title="Classroom">
      <div className="space-y-4">
        {ttsSupported && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                setSpeakMode((v) => !v)
                if (speakMode) window.speechSynthesis.cancel()
              }}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                speakMode ? 'bg-cobalt text-white border-cobalt' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {speakMode ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {speakMode ? 'Reading aloud' : 'Read aloud'}
            </button>
          </div>
        )}

        {/* compact recap strip of what already happened */}
        {historyTurns.length > 0 && (
          <div className="bg-white/70 border border-slate-200 rounded-2xl px-4 py-3 overflow-x-auto">
            <div className="flex gap-3 min-w-max">
              {historyTurns.map((turn) => {
                const m = PERSONA[turn.speaker] || PERSONA.teacher
                const Icon = m.icon
                return (
                  <div key={turn.id} className="flex items-center gap-1.5 opacity-60 max-w-[220px] shrink-0">
                    <div className={`w-5 h-5 rounded-full ${m.bg} text-white flex items-center justify-center shrink-0`}>
                      <Icon size={11} />
                    </div>
                    <p className="text-xs text-slate-500 truncate">{turn.content}</p>
                  </div>
                )
              })}
              <div ref={recapEndRef} />
            </div>
          </div>
        )}

        {/* the stage — current classroom moment */}
        <div
          className="rounded-3xl border border-slate-200 p-8 min-h-[280px] flex flex-col justify-center"
          style={{
            backgroundColor: '#F8F7F3',
            backgroundImage:
              'linear-gradient(rgba(27,33,48,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(27,33,48,0.035) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        >
          {renderStage()}

          {!streamDone && !pendingInteractive && (
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-5">
              <Loader2 size={13} className="animate-spin" /> Class is in session…
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-3 flex gap-2 items-center">
          <Hand size={15} className="text-slate-300 ml-1 shrink-0" />
          <input
            className="border-0 focus:outline-none focus:ring-0 px-2 py-2 text-sm flex-1"
            placeholder={listening ? 'Listening…' : 'Raise your hand to ask a question…'}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          />
          {speechSupported && (
            <button
              onClick={toggleListening}
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                listening ? 'bg-learner text-white animate-pulse' : 'text-slate-400 hover:bg-slate-50'
              }`}
              aria-label={listening ? 'Stop listening' : 'Ask by voice'}
            >
              <Mic size={16} />
            </button>
          )}
          <button
            className="bg-ink text-white rounded-lg w-9 h-9 flex items-center justify-center disabled:opacity-50 hover:bg-cobalt-dark transition-colors shrink-0"
            disabled={asking || !question.trim()}
            onClick={() => handleAsk()}
            aria-label="Send question"
          >
            <Send size={15} />
          </button>
        </div>

        {streamDone && voiceEnabled && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-600 mb-3">
              Teach it back out loud — record a short clip explaining the concept in your own words.
            </p>
            <div className="flex items-center gap-3">
              {!recording ? (
                <button
                  className="flex items-center gap-2 border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                  disabled={voiceSubmitting}
                  onClick={startRecording}
                >
                  <Mic size={15} /> Start recording
                </button>
              ) : (
                <button
                  className="flex items-center gap-2 bg-learner text-white rounded-lg px-4 py-2 text-sm font-medium animate-pulse"
                  onClick={stopAndSubmitRecording}
                >
                  <Square size={13} /> Stop & submit
                </button>
              )}
              {voiceSubmitting && <span className="text-xs text-slate-400">Scoring…</span>}
            </div>

            {voiceError && <p className="text-xs text-amber mt-2">{voiceError}</p>}

            {voiceResult?.ok && (
              <div className="mt-3 text-sm text-slate-700 space-y-1">
                <p>
                  Coverage score: <span className="font-medium">{voiceResult.transcript_coverage_score}</span>
                  {voiceResult.signal_degraded && (
                    <span className="ml-2 text-xs text-amber">(timing signal degraded — coverage still counted)</span>
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

        {streamDone && !pendingInteractive && currentIndex === turns.length - 1 && (
          <div className="flex justify-end">
            <button
              className="flex items-center gap-1.5 bg-ink text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-cobalt-dark transition-colors"
              onClick={() => navigate(`/checkpoint/${sessionId}`)}
            >
              Proceed to checkpoint <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </NavShell>
  )
}
