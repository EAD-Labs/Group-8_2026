import { useEffect, useState } from 'react'
import { Sparkles, Clock, Zap } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type Quiz = {
  id: string
  concept_id: string
  quiz_type: 'retention' | 'transfer'
  prompt: string | null
  scheduled_for: string
  available_now: boolean
}

export default function Quizzes() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { passed: boolean; points_awarded: number; newly_awarded_badges: string[] }>>({})

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
            <div className="flex items-center gap-2 mb-3">
              {quiz.quiz_type === 'transfer' ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-advanced bg-purple-50 px-2 py-1 rounded-full">
                  <Zap size={12} /> Transfer problem
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-basic bg-green-50 px-2 py-1 rounded-full">
                  <Clock size={12} /> Retention check
                </span>
              )}
              <span className="text-xs text-slate-400">{quiz.concept_id.replace('freeform:', '').replaceAll('-', ' ').replaceAll('_', ' ')}</span>
            </div>
            <p className="text-sm text-ink mb-3">{quiz.prompt}</p>
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
              {res.points_awarded > 0 && (
                <p className="text-xs text-amber flex items-center gap-1 mt-1">
                  <Sparkles size={12} /> +{res.points_awarded} points
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
                  <span className="text-sm text-slate-600">{quiz.concept_id.replaceAll('_', ' ')}</span>
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
