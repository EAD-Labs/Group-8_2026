import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, AlertCircle, ArrowRight, Sparkles, Loader2 } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

// Checkpoint items come from the session's structured record, so they test the
// claims and target the misconceptions the class just worked through (HLD T3.1).
// The rubric each one is graded against stays on the server.
type CheckpointItem = {
  id: string
  prompt: string
  bloom_level: string
}

type CheckpointForm = {
  session_id: string
  concept_id: string
  concept_name: string
  items: CheckpointItem[]
}

type ItemResult = {
  item_id: string
  passed: boolean
  score: number
  feedback: string
}

type Result = {
  passed: boolean
  score: number
  per_item: ItemResult[]
  doubts_logged: string[]
  graded_by: string
}

const BLOOM_LABEL: Record<string, string> = {
  remember: 'Recall',
  understand: 'Understand',
  apply: 'Apply',
  analyse: 'Analyse',
}

export default function Checkpoint() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [form, setForm] = useState<CheckpointForm | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionId) return
    api
      .getCheckpoint(sessionId)
      .then(setForm)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the checkpoint.'))
      .finally(() => setLoading(false))
  }, [sessionId])

  const answered = Object.values(answers).filter((a) => a.trim()).length
  const total = form?.items.length ?? 0

  async function handleSubmit() {
    if (!sessionId) return
    setSubmitting(true)
    setError(null)
    try {
      setResult(await api.submitCheckpoint(sessionId, answers))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the checkpoint.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <NavShell title="Checkpoint">
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Loading your checkpoint…
        </p>
      </NavShell>
    )
  }

  return (
    <NavShell title="Checkpoint">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-learner">{error}</div>
        )}

        {form && !result && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <div>
              <h2 className="font-display font-semibold text-ink">{form.concept_name}</h2>
              <p className="text-sm text-slate-500 mt-1">
                These questions come from the lesson you just had. Required before you move on — they
                feed your mastery record and your doubt log.
              </p>
            </div>

            {form.items.map((item, i) => (
              <div key={item.id} className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-slate-300 shrink-0">{i + 1}</span>
                  <p className="text-sm text-ink flex-1">{item.prompt}</p>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400 border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
                    {BLOOM_LABEL[item.bloom_level] ?? item.bloom_level}
                  </span>
                </div>
                <textarea
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cobalt/30 focus:border-cobalt"
                  rows={3}
                  placeholder="Your answer, in your own words…"
                  value={answers[item.id] ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [item.id]: e.target.value }))}
                />
              </div>
            ))}

            <div className="flex items-center gap-3">
              <button
                className="bg-ink text-white rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-cobalt-dark transition-colors"
                disabled={submitting || answered === 0}
                onClick={handleSubmit}
              >
                {submitting ? 'Submitting…' : 'Submit checkpoint'}
              </button>
              <p className="text-xs text-slate-400">
                {answered} of {total} answered
                {answered > 0 && answered < total && ' — unanswered questions still count against the score'}
              </p>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className={`flex items-start gap-3 rounded-xl p-4 ${result.passed ? 'bg-green-50' : 'bg-amber-light'}`}>
              {result.passed ? (
                <CheckCircle2 className="text-basic shrink-0 mt-0.5" size={18} />
              ) : (
                <AlertCircle className="text-amber shrink-0 mt-0.5" size={18} />
              )}
              <div>
                <p className={`text-sm font-medium ${result.passed ? 'text-basic' : 'text-amber'}`}>
                  {result.passed ? 'Checkpoint passed.' : 'Not quite — this concept stays open for now.'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Score: {Math.round(result.score * 100)}%
                </p>
                {result.passed && (
                  <p className="text-xs text-amber flex items-center gap-1 mt-1.5">
                    <Sparkles size={12} /> +10 points, and a transfer problem + retention check were scheduled
                  </p>
                )}
                {result.doubts_logged.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    {result.doubts_logged.length} open{' '}
                    {result.doubts_logged.length === 1 ? 'doubt' : 'doubts'} noted — see Progress.
                  </p>
                )}
              </div>
            </div>

            {/* per-item feedback, so a learner knows which question fell short
                rather than just seeing one aggregate number */}
            <div className="space-y-2">
              {result.per_item.map((item, i) => {
                const prompt = form?.items.find((x) => x.id === item.item_id)?.prompt
                return (
                  <div key={item.item_id} className="flex items-start gap-2 text-xs">
                    <span className="font-semibold text-slate-300 shrink-0">{i + 1}</span>
                    {item.passed ? (
                      <CheckCircle2 size={13} className="text-basic shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle size={13} className="text-amber shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      {prompt && <p className="text-slate-500 line-clamp-1">{prompt}</p>}
                      <p className="text-slate-400 mt-0.5">{item.feedback}</p>
                    </div>
                    <span className="text-slate-400 shrink-0">{Math.round(item.score * 100)}%</span>
                  </div>
                )
              })}
            </div>

            {result.graded_by === 'heuristic' && (
              <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">
                Graded by keyword coverage, not by reasoning — this backend is running on mocks. Real
                grading needs an API key configured server-side.
              </p>
            )}

            <div className="flex gap-3">
              <button
                className="flex items-center gap-1.5 bg-ink text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-cobalt-dark transition-colors"
                onClick={() => navigate('/progress')}
              >
                View progress <ArrowRight size={14} />
              </button>
              <button
                className="flex items-center gap-1.5 border border-slate-200 rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors"
                onClick={() => navigate('/topic-setup')}
              >
                Start another topic
              </button>
            </div>
          </div>
        )}
      </div>
    </NavShell>
  )
}
