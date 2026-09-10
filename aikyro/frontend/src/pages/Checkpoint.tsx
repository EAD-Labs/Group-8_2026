import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, AlertCircle, ArrowRight, Sparkles, Mic } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'
import { useSpeechToText } from '../hooks/useSpeechToText'

export default function Checkpoint() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<{ passed: boolean; score: number; feedback: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  const { supported: speechSupported, listening, error: speechError, toggleListening } = useSpeechToText(
    (text) => setAnswer((prev) => (prev ? `${prev} ${text}` : text))
  )

  async function handleSubmit() {
    if (!sessionId) return
    setSubmitting(true)
    try {
      const res = await api.submitCheckpoint(sessionId, { q1: answer })
      setResult(res)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <NavShell title="Checkpoint">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <p className="text-sm text-slate-500">
          Quick check before you move on — this is required, and it feeds your mastery record and doubt log.
        </p>
        <div className="relative">
          <textarea
            className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-cobalt/30 focus:border-cobalt disabled:bg-slate-50"
            rows={4}
            placeholder={listening ? 'Listening…' : 'Answer the checkpoint question…'}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={!!result}
          />
          {speechSupported && !result && (
            <button
              type="button"
              onClick={toggleListening}
              className={`absolute top-2.5 right-2.5 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                listening ? 'bg-learner text-white animate-pulse' : 'text-slate-400 hover:bg-slate-50'
              }`}
              aria-label={listening ? 'Stop listening' : 'Answer by voice'}
              title="Answer by voice"
            >
              <Mic size={15} />
            </button>
          )}
        </div>
        {speechError && <p className="text-xs text-amber">{speechError}</p>}
        {!result ? (
          <button
            className="bg-ink text-white rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-cobalt-dark transition-colors"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting…' : 'Submit checkpoint'}
          </button>
        ) : (
          <div className="space-y-4">
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
                <p className="text-xs text-slate-500 mt-0.5">Score: {result.score}</p>
                {result.feedback && <p className="text-xs text-slate-600 mt-1.5">{result.feedback}</p>}
                {result.passed && (
                  <p className="text-xs text-amber flex items-center gap-1 mt-1.5">
                    <Sparkles size={12} /> +10 points, and a transfer problem + retention check were scheduled
                  </p>
                )}
              </div>
            </div>
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
