import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Mic, Square, Send, Volume2, VolumeX, ArrowRight, Loader2,
  GraduationCap, BookOpen, Brain, User, Hand,
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
  teacher: { label: 'Teacher', icon: GraduationCap, bg: 'bg-teacher', text: 'text-teacher', border: 'border-teacher/30' },
  basic_student: { label: 'Basic Student', icon: BookOpen, bg: 'bg-basic', text: 'text-basic', border: 'border-basic/30' },
  advanced_student: { label: 'Advanced Student', icon: Brain, bg: 'bg-advanced', text: 'text-advanced', border: 'border-advanced/30' },
  learner: { label: 'You', icon: User, bg: 'bg-learner', text: 'text-learner', border: 'border-learner/30' },
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

function SpeechBubble({ text, color }: { text: string; color: string }) {
  return (
    <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full w-44 z-30 animate-[fadeIn_0.2s_ease-out]">
      <div className={`bg-white border-2 ${color} rounded-xl px-3 py-2 shadow-lg text-[11px] text-ink leading-snug`}>
        {text}
      </div>
      <div className={`w-3 h-3 bg-white border-r-2 border-b-2 ${color} rotate-45 mx-auto -mt-[7px]`} />
    </div>
  )
}

function Shadow({ width = 'w-14' }: { width?: string }) {
  return <div className={`${width} h-2 bg-black/10 rounded-full mx-auto blur-[2px] mt-0.5`} />
}

const HAIR_TONES = ['#5B4636', '#2E2A28', '#8A6642', '#3D3D3D', '#6B4A38']

function GenericFigure({ seed = 0 }: { seed?: number }) {
  const hair = HAIR_TONES[seed % HAIR_TONES.length]
  return (
    <div className="flex flex-col items-center opacity-40 scale-90">
      <div className="relative">
        <div className="w-6 h-6 rounded-full bg-[#D9B99B]" />
        <div
          className="absolute -top-1 left-0 right-0 h-3 rounded-t-full"
          style={{ backgroundColor: hair }}
        />
      </div>
      <div className="w-9 h-6 bg-slate-400 rounded-t-xl -mt-0.5" />
      <div className="w-12 h-2 rounded-sm mt-0.5" style={{ backgroundColor: '#8B5E34', opacity: 0.5 }} />
      <Shadow width="w-10" />
    </div>
  )
}

function StudentDesk({
  persona,
  speaking,
  speechText,
  calledOn,
}: {
  persona: 'basic_student' | 'advanced_student' | 'learner'
  speaking: boolean
  speechText?: string
  calledOn?: boolean
}) {
  const meta = PERSONA[persona]
  const Icon = meta.icon
  const active = speaking || calledOn
  return (
    <div className="flex flex-col items-center relative">
      {speaking && speechText && <SpeechBubble text={speechText} color={meta.border} />}

      <div
        className={`relative flex flex-col items-center transition-transform duration-300 ${
          active ? '-translate-y-1.5 scale-105' : ''
        }`}
      >
        {calledOn && <span className={`absolute -inset-2 rounded-full border-2 ${meta.border} animate-ping`} />}
        {speaking && (
          <Hand size={12} className={`absolute -right-2 -top-1 ${meta.text} rotate-12 z-10`} strokeWidth={2.5} />
        )}

        {/* simple arms, resting on the desk */}
        <div className={`absolute top-9 -left-1.5 w-2.5 h-4 rounded-full ${meta.bg} opacity-80 rotate-[18deg]`} />
        <div className={`absolute top-9 -right-1.5 w-2.5 h-4 rounded-full ${meta.bg} opacity-80 -rotate-[18deg]`} />

        <div className={`w-9 h-9 rounded-full ${meta.bg} flex items-center justify-center text-white shrink-0 relative z-10`}>
          <Icon size={16} />
        </div>
        <div className={`w-12 h-8 ${meta.bg} ${active ? '' : 'opacity-85'} rounded-t-2xl -mt-1`} />
      </div>

      {/* 3D-ish desk: top surface + front panel */}
      <div className="relative">
        <div className="w-16 h-2 rounded-t-sm" style={{ backgroundColor: '#A97C50' }} />
        <div className="w-16 h-2.5 rounded-b-sm" style={{ backgroundColor: '#7A5637' }} />
      </div>
      <Shadow />
      <span className={`text-[9px] font-semibold mt-1 ${active ? meta.text : 'text-slate-400'}`}>{meta.label}</span>
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

  // The room freezes on the first unanswered hint/blank — like actually
  // being called on — instead of racing ahead while turns keep streaming in
  // behind the scenes. Anything that arrived after it stays hidden until you
  // respond, then the lecture "catches up" to the real latest turn.
  const pendingInteractive = turns.find(
    (t) => (t.turn_type === 'blank' || t.turn_type === 'hint') && !revealedHints[t.id]
  )
  const currentTurn = pendingInteractive || (turns.length ? turns[turns.length - 1] : null)
  const currentIndex = currentTurn ? turns.findIndex((t) => t.id === currentTurn.id) : -1
  const visibleTurns = currentIndex >= 0 ? turns.slice(0, currentIndex + 1) : []
  const historyTurns = currentIndex > 0 ? turns.slice(0, currentIndex) : []
  const lastTeacherTurn = [...visibleTurns].reverse().find((t) => t.speaker === 'teacher')
  const boardText = lastTeacherTurn?.content ?? 'Welcome — class is about to begin.'
  const calledOn = currentTurn?.turn_type === 'blank' || currentTurn?.turn_type === 'hint'

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

  const basicSpeaking = currentTurn?.speaker === 'basic_student'
  const advancedSpeaking = currentTurn?.speaker === 'advanced_student'
  const learnerSpeaking = currentTurn?.speaker === 'learner'

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

        {/* the classroom */}
        <div className="relative rounded-3xl border border-slate-200 overflow-hidden">
          {/* walls */}
          <div className="absolute inset-0" style={{ backgroundColor: '#E4E7DD' }} />
          <div className="absolute left-0 right-0 bottom-0 h-[38%]" style={{ backgroundColor: '#D7C4A3' }} />
          <div className="absolute left-0 right-0 bottom-[38%] h-[3px]" style={{ backgroundColor: '#B99E76' }} />
          {/* floor */}
          <div className="absolute left-0 right-0 bottom-0 h-[16%]" style={{ backgroundColor: '#9C7A50' }} />
          <div
            className="absolute left-0 right-0 bottom-0 h-[16%] opacity-25"
            style={{
              backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 78px, rgba(0,0,0,0.25) 78px 80px)',
            }}
          />
          {/* window */}
          <div className="absolute top-5 right-6 w-20 h-24 rounded-md shadow-inner hidden sm:block" style={{ backgroundColor: '#CFE3EA', border: '5px solid #F5F1E8' }}>
            <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(160deg, rgba(255,255,255,0.55), transparent 60%)' }} />
            <div className="absolute left-1/2 top-0 bottom-0 w-[3px] -translate-x-1/2 bg-[#F5F1E8]" />
            <div className="absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2 bg-[#F5F1E8]" />
          </div>
          {/* wall clock */}
          <div className="absolute top-6 left-6 w-9 h-9 rounded-full bg-white border-2 border-slate-300 hidden sm:flex items-center justify-center shadow-sm">
            <div className="absolute w-[2px] h-2.5 bg-ink rounded-full origin-bottom" style={{ transform: 'rotate(35deg)', bottom: '50%' }} />
            <div className="absolute w-[2px] h-3.5 bg-ink/70 rounded-full origin-bottom" style={{ transform: 'rotate(-70deg)', bottom: '50%' }} />
          </div>
          {/* potted plant, bottom-left corner */}
          <div className="absolute bottom-[15%] left-4 hidden sm:block">
            <div className="relative flex flex-col items-center">
              <div className="flex items-end gap-[-2px]">
                <div className="w-4 h-7 rounded-t-full bg-basic -mr-1.5 rotate-[-18deg] opacity-90" />
                <div className="w-4 h-9 rounded-t-full bg-basic z-10" />
                <div className="w-4 h-7 rounded-t-full bg-basic -ml-1.5 rotate-[18deg] opacity-90" />
              </div>
              <div className="w-8 h-6 rounded-b-lg" style={{ backgroundColor: '#B5764A' }} />
              <Shadow width="w-8" />
            </div>
          </div>

          <div className="relative p-6 pb-4">
            {/* blackboard + teacher */}
            <div className="flex items-end justify-center gap-4 mb-6">
              <div className="flex flex-col items-center shrink-0">
                {calledOn && (
                  <span className="text-[10px] font-semibold text-amber mb-1 flex items-center gap-1 animate-pulse">
                    <Hand size={11} /> points at you
                  </span>
                )}
                <div className={`relative transition-transform duration-300 ${calledOn ? 'rotate-3' : ''}`}>
                  {calledOn && (
                    <div className="absolute top-11 -right-3 w-3 h-8 rounded-full bg-teacher rotate-[35deg] origin-top z-0" />
                  )}
                  <div className="absolute top-9 -left-2 w-2.5 h-5 rounded-full bg-teacher opacity-90 rotate-[15deg]" />
                  <div className="w-11 h-11 rounded-full bg-teacher flex items-center justify-center text-white relative z-10">
                    <GraduationCap size={20} />
                  </div>
                  <div className="w-16 h-20 bg-teacher rounded-t-full -mt-1 relative z-[1]" />
                  <div className="flex justify-center gap-1">
                    <div className="w-3 h-4 bg-ink/80 rounded-b-sm" />
                    <div className="w-3 h-4 bg-ink/80 rounded-b-sm" />
                  </div>
                </div>
                <Shadow width="w-16" />
              </div>

              <div className="flex-1 max-w-xl">
                <div
                  className="rounded-xl p-5 shadow-inner border-[6px] relative"
                  style={{ backgroundColor: '#28352F', borderColor: '#8B5E34' }}
                >
                  {ttsSupported && lastTeacherTurn && (
                    <button
                      onClick={() => speakText(boardText)}
                      className="absolute top-2 right-2 text-white/30 hover:text-white transition-colors"
                      aria-label="Read board aloud"
                    >
                      <Volume2 size={13} />
                    </button>
                  )}
                  <p className="font-display text-white text-[15px] leading-relaxed text-center pr-4">
                    {boardText}
                  </p>
                </div>
                <div className="h-2 rounded-b-sm mx-3 relative" style={{ backgroundColor: '#8B5E34' }}>
                  <div className="absolute left-4 -top-0.5 w-3 h-1.5 bg-white/80 rounded-full" />
                  <div className="absolute left-9 -top-0.5 w-2.5 h-1.5 bg-white/60 rounded-full" />
                </div>
              </div>
            </div>

            {/* back row — decorative, sells "whole class" */}
            <div className="flex justify-center gap-8 mb-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <GenericFigure key={i} seed={i} />
              ))}
            </div>

            {/* front row — basic student | you | advanced student */}
            <div className="flex justify-center items-end gap-10 mb-1">
              <StudentDesk persona="basic_student" speaking={basicSpeaking} speechText={basicSpeaking ? currentTurn?.content : undefined} />
              <StudentDesk
                persona="learner"
                speaking={learnerSpeaking}
                speechText={learnerSpeaking ? currentTurn?.content : undefined}
                calledOn={calledOn}
              />
              <StudentDesk persona="advanced_student" speaking={advancedSpeaking} speechText={advancedSpeaking ? currentTurn?.content : undefined} />
            </div>

            {/* your turn — answer card, appears right under your desk */}
            {calledOn && currentTurn && (
              <div className="max-w-md mx-auto mt-4 border-2 border-dashed border-amber rounded-2xl bg-white/90 backdrop-blur-sm p-4">
                <p className="text-xs font-semibold text-amber mb-2 uppercase tracking-wide">
                  {currentTurn.turn_type === 'blank' ? 'Fill in the blank' : 'Your guess, before the answer'}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    className="border border-amber/40 bg-white rounded-xl px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-amber/30"
                    placeholder={currentTurn.turn_type === 'blank' ? 'Your answer…' : 'Your guess…'}
                    value={guesses[currentTurn.id] || ''}
                    onChange={(e) => setGuesses((prev) => ({ ...prev, [currentTurn.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && submitGuess(currentTurn)}
                  />
                  <button
                    className="bg-ink text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-cobalt-dark transition-colors shrink-0"
                    onClick={() => submitGuess(currentTurn)}
                  >
                    {currentTurn.turn_type === 'blank' ? 'Answer' : 'Reveal'}
                  </button>
                </div>
              </div>
            )}

            {!streamDone && !pendingInteractive && (
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400 mt-4">
                <Loader2 size={13} className="animate-spin" /> Class is in session…
              </div>
            )}
          </div>
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
