import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Send, ArrowRight, Loader2, Clock, User, Sparkles } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

/**
 * The plain-chat baseline arm (HLD 6.3 control condition).
 *
 * This is the control the comparative study is measured against, and it lives
 * inside the app rather than sending learners to a third-party chat product:
 * otherwise the equal time budget cannot be enforced, nothing from the control
 * condition is logged, and there is no way to verify a learner completed it.
 *
 * Same login, same timer, same checkpoint. Deliberately no personas, no gated
 * hints, no blocking blanks — those are the intervention, and simulating any of
 * them here would destroy the contrast the study exists to measure.
 */

type Message = {
  role: 'learner' | 'assistant'
  content: string
  created_at: string
}

type Transcript = {
  session_id: string
  concept_id: string
  concept_name: string
  messages: Message[]
  seconds_elapsed: number
  seconds_remaining: number | null
  time_budget_exhausted: boolean
}

function formatClock(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60)
  const s = Math.max(0, seconds) % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function PlainChat() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Counted down locally between requests so the timer moves, then re-synced
  // from the server on every reply — the server's elapsed time is what the
  // analysis uses, so the client clock is display only.
  const [remaining, setRemaining] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionId) return
    api
      .getBaselineTranscript(sessionId)
      .then((body: Transcript) => {
        setTranscript(body)
        setRemaining(body.seconds_remaining)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this session.'))
      .finally(() => setLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (remaining === null) return
    const id = window.setInterval(() => setRemaining((r) => (r === null ? null : Math.max(0, r - 1))), 1000)
    return () => window.clearInterval(id)
  }, [remaining === null])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript?.messages.length])

  async function send() {
    const text = draft.trim()
    if (!text || !sessionId || sending) return
    setSending(true)
    setError(null)

    // optimistic: the learner's own message appears immediately
    const optimistic: Message = { role: 'learner', content: text, created_at: new Date().toISOString() }
    setTranscript((prev) => (prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev))
    setDraft('')

    try {
      const res = await api.sendBaselineMessage(sessionId, text)
      setTranscript((prev) =>
        prev ? { ...prev, messages: [...prev.messages, res.reply as Message] } : prev,
      )
      setRemaining(res.seconds_remaining)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that message.')
      // roll the optimistic message back so the transcript matches the server
      setTranscript((prev) =>
        prev ? { ...prev, messages: prev.messages.filter((m) => m !== optimistic) } : prev,
      )
      setDraft(text)
    } finally {
      setSending(false)
    }
  }

  async function finish() {
    if (!sessionId) return
    try {
      await api.completeBaseline(sessionId)
    } catch {
      // Completing is a bookkeeping call; if it fails the learner should still
      // reach the checkpoint rather than being stuck here.
    }
    navigate(`/checkpoint/${sessionId}`)
  }

  if (loading) {
    return (
      <NavShell title="Study session">
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Opening your session…
        </p>
      </NavShell>
    )
  }

  const timeUp = remaining !== null && remaining <= 0

  return (
    <NavShell title={transcript?.concept_name ?? 'Study session'}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">{transcript?.concept_name}</p>
            <p className="text-xs text-slate-400">
              Ask anything about this topic. You'll take the same checkpoint either way.
            </p>
          </div>
          {remaining !== null && (
            <div
              className={`flex items-center gap-1.5 text-sm font-medium tabular-nums shrink-0 ${
                timeUp ? 'text-learner' : remaining < 120 ? 'text-amber' : 'text-slate-500'
              }`}
            >
              <Clock size={14} />
              {formatClock(remaining)}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-learner">{error}</div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 min-h-[320px]">
          {transcript?.messages.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === 'learner' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-cobalt text-white flex items-center justify-center shrink-0">
                  <Sparkles size={13} />
                </div>
              )}
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-sm max-w-[78%] ${
                  m.role === 'learner'
                    ? 'bg-ink text-white rounded-br-sm'
                    : 'bg-slate-50 text-ink rounded-bl-sm'
                }`}
              >
                {m.content}
              </div>
              {m.role === 'learner' && (
                <div className="w-7 h-7 rounded-full bg-learner text-white flex items-center justify-center shrink-0">
                  <User size={13} />
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 size={12} className="animate-spin" /> Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {timeUp ? (
          <div className="bg-amber-light border border-amber/30 rounded-2xl px-4 py-3 text-sm text-amber">
            Your time on this topic is up. Head to the checkpoint when you're ready.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex gap-2 items-center">
            <input
              className="border-0 focus:outline-none focus:ring-0 px-2 py-2 text-sm flex-1"
              placeholder="Ask a question about this topic…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button
              className="bg-ink text-white rounded-lg w-9 h-9 flex items-center justify-center disabled:opacity-50 hover:bg-cobalt-dark transition-colors shrink-0"
              disabled={sending || !draft.trim()}
              onClick={send}
              aria-label="Send message"
            >
              <Send size={15} />
            </button>
          </div>
        )}

        <div className="flex justify-end">
          <button
            className="flex items-center gap-1.5 bg-ink text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-cobalt-dark transition-colors"
            onClick={finish}
          >
            Proceed to checkpoint <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </NavShell>
  )
}
