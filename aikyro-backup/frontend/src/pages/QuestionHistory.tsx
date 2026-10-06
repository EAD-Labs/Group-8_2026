import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircleQuestion, ArrowRight } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type QuestionEntry = {
  session_id: string
  turn_id: string
  concept_id: string
  concept_name: string
  question: string
  answer: string | null
  asked_at: string
}

function formatConceptName(name: string) {
  return name.replace('freeform:', '').replaceAll(/[-_]/g, ' ')
}

export default function QuestionHistory() {
  const [questions, setQuestions] = useState<QuestionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .getQuestionHistory()
      .then(setQuestions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your question history.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <NavShell title="Questions"><p className="text-sm text-slate-500">Loading…</p></NavShell>

  return (
    <NavShell title="Questions">
      <div className="space-y-4">
        <p className="text-sm text-slate-500 max-w-lg">
          Every question you've raised your hand and asked as the third student, across every session. Click one
          to open the classroom it happened in.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-learner">{error}</div>
        )}

        {!error && questions.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <MessageCircleQuestion className="mx-auto text-slate-300 mb-2" size={28} />
            <p className="text-sm text-slate-500">
              No questions asked yet — raise your hand in the classroom and it'll show up here.
            </p>
          </div>
        )}

        <ul className="space-y-3">
          {questions.map((q) => {
            const isOpen = expanded === q.turn_id
            return (
              <li key={q.turn_id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : q.turn_id)}
                  aria-expanded={isOpen}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400 mb-1">
                        {formatConceptName(q.concept_name)} — {new Date(q.asked_at).toLocaleDateString()}
                      </p>
                      <p className={`text-sm text-ink ${isOpen ? '' : 'truncate'}`}>{q.question}</p>
                    </div>
                    <span className="text-[10px] font-medium text-cobalt shrink-0 mt-0.5">
                      {isOpen ? 'Hide' : 'View'}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-4 pt-1 border-t border-slate-100 space-y-3">
                    {q.answer && (
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                          Teacher's answer
                        </p>
                        <p className="text-sm text-slate-700">{q.answer}</p>
                      </div>
                    )}
                    <button
                      className="flex items-center gap-1.5 text-xs font-medium text-cobalt hover:underline"
                      onClick={() => navigate(`/classroom/${q.session_id}`)}
                    >
                      Open this session <ArrowRight size={12} />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </NavShell>
  )
}
