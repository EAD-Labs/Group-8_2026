import { useEffect, useState } from 'react'
import { Sparkles, Clock, Zap, Link2 } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

// 'linked' ties this concept to another the learner has already passed (HLD T3.4).
type QuizType = 'retention' | 'transfer' | 'linked'

type Quiz = {
  id: string
  concept_id: string
  quiz_type: QuizType
  linked_concept_id: string | null
  prompt: string | null
  scheduled_for: string
  available_now: boolean
}

const QUIZ_META: Record<QuizType, { label: string; blurb: string }> = {
  retention: {
    label: 'Retention check',
    blurb: 'A few days on, no notes — this is the only route to "retained".',
  },
  transfer: {
    label: 'Transfer problem',
    blurb: 'The same idea in a situation your session did not cover.',
  },
  linked: {
    label: 'Linked question',
    blurb: 'Connects this concept to another one you have already passed.',
  },
}

/**
 * Concept ids are slugs, and the pending-quiz payload is deliberately lean — it
 * carries ids rather than duplicating the concept catalogue. De-slugging here is
 * a display concern, so it lives next to the display.
 */
function conceptLabel(conceptId: string): string {
  const bare = conceptId.replace('freeform:', '')
  const words = bare.replaceAll('-', ' ').replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function QuizBadge({ type }: { type: QuizType }) {
  const style: Record<QuizType, { cls: string; icon: typeof Zap }> = {
    transfer: { cls: 'text-advanced bg-purple-50', icon: Zap },
    retention: { cls: 'text-basic bg-green-50', icon: Clock },
    linked: { cls: 'text-cobalt bg-cobalt-light', icon: Link2 },
  }
  const { cls, icon: Icon } = style[type]
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${cls}`}>
      <Icon size={12} /> {QUIZ_META[type].label}
    </span>
  )
}

export default function Quizzes() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [results, setResults] = useState<
    Record<
      string,
      { passed: boolean; score: number; feedback: string; points_awarded: number; newly_awarded_badges: string[] }
    >
  >({})

  function load() {
    setLoading(true)
    api.getPendingQuizzes().then(setQuizzes).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(quiz: Quiz) {
    const answer = answers[quiz.id]
    if (!answer?.trim()) return
    setSubmitting(quiz.id)
    try {
      const res = await api.submitQuiz(quiz.id, answer)
      setResults((prev) => ({ ...prev, [quiz.id]: res }))
    } finally {
      setSubmitting(null)
    }
  }

  const available = quizzes.filter((q) => q.available_now && !results[q.id])
  const upcoming = quizzes.filter((q) => !q.available_now)
  const completed = quizzes.filter((q) => results[q.id])

  if (loading) return <NavShell title="Quizzes"><p className="text-sm text-slate-500">Loading…</p></NavShell>

  return (
    <NavShell title="Quizzes">
      <div className="space-y-6">
        {available.length === 0 && upcoming.length === 0 && completed.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <p className="text-sm text-slate-500">No quizzes yet — finish a checkpoint to generate some.</p>
          </div>
        )}

        {available.map((quiz) => (
          <div key={quiz.id} className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-1.5">
              <QuizBadge type={quiz.quiz_type} />
              <span className="text-xs text-slate-400">{conceptLabel(quiz.concept_id)}</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">{QUIZ_META[quiz.quiz_type].blurb}</p>
            <p className="text-sm text-ink mb-3 whitespace-pre-line">{quiz.prompt}</p>
            <textarea
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cobalt/30 focus:border-cobalt"
              rows={3}
              placeholder="Your answer…"
              value={answers[quiz.id] || ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [quiz.id]: e.target.value }))}
            />
            <button
              className="mt-3 bg-ink text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-cobalt-dark transition-colors"
              disabled={submitting === quiz.id}
              onClick={() => handleSubmit(quiz)}
            >
              {submitting === quiz.id ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        ))}

        {Object.entries(results).map(([quizId, res]) => {
          const quiz = quizzes.find((q) => q.id === quizId)
          if (!quiz) return null
          return (
            <div key={quizId} className="bg-cobalt-light border border-cobalt/20 rounded-2xl p-5">
              <p className={`text-sm font-medium ${res.passed ? 'text-basic' : 'text-amber'}`}>
                {res.passed ? 'Nice — recorded.' : 'Recorded — this one stays open for now.'}
              </p>
              {res.feedback && <p className="text-xs text-slate-600 mt-1">{res.feedback}</p>}
              {res.points_awarded > 0 && (
                <p className="text-xs text-amber flex items-center gap-1 mt-1">
                  <Sparkles size={12} /> +{res.points_awarded} points
                </p>
              )}
              {res.newly_awarded_badges.length > 0 && (
                <p className="text-xs text-amber mt-1">
                  New badge{res.newly_awarded_badges.length > 1 ? 's' : ''} unlocked — see Progress.
                </p>
              )}
            </div>
          )
        })}

        {upcoming.length > 0 && (
          <div>
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">Not yet due</h2>
            <div className="space-y-2">
              {upcoming.map((quiz) => (
                <div key={quiz.id} className="bg-white border border-slate-100 rounded-xl p-4 flex items-center justify-between opacity-60">
                  <span className="text-sm text-slate-600">{conceptLabel(quiz.concept_id)}</span>
                  <span className="text-xs text-slate-400">
                    unlocks {new Date(quiz.scheduled_for).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </NavShell>
  )
}
