import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

export default function Checkpoint() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<{ passed: boolean; score: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit() {
    if (!sessionId) return
    setSubmitting(true)
    try {
      // HLD 6.3: checkpoint is mandatory — at least one attempt required.
      const res = await api.submitCheckpoint(sessionId, { q1: answer })
      setResult(res)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <NavShell title="Checkpoint">
      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <p className="text-sm text-slate-600">
          Quick check before you move on — this is required, and it's what feeds your mastery record and doubt log.
        </p>
        <textarea
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          rows={4}
          placeholder="Answer the checkpoint question…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={!!result}
        />
        {!result ? (
          <button
            className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting…' : 'Submit checkpoint'}
          </button>
        ) : (
          <div className="space-y-3">
            <p className={`text-sm font-medium ${result.passed ? 'text-green-700' : 'text-amber-700'}`}>
              {result.passed ? 'Checkpoint passed.' : 'Not quite — this concept stays open for now.'} Score: {result.score}
            </p>
            <button
              className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium"
              onClick={() => navigate('/progress')}
            >
              View progress →
            </button>
          </div>
        )}
      </div>
    </NavShell>
  )
}
