import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

export default function Dashboard() {
  const navigate = useNavigate()
  const [d03, setD03] = useState<{ status: string; pairs: { pair_id: string; difficulty_reviewed: boolean }[] } | null>(null)

  useEffect(() => {
    api.getD03Status().then(setD03).catch(() => {})
  }, [])

  return (
    <NavShell title="Dashboard">
      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <p className="text-sm text-slate-600">
          Pick a module to enter the classroom, or check your progress and any pending retention checks.
        </p>
        <div className="flex gap-3">
          <button
            className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium"
            onClick={() => navigate('/topic-setup')}
          >
            Start a topic
          </button>
          <button
            className="border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium"
            onClick={() => navigate('/progress')}
          >
            View progress
          </button>
        </div>
      </div>

      {d03 && d03.status === 'open' && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <span className="font-medium">D-03 open</span> — comparative-study topic pairs are assigned, but{' '}
          {d03.pairs.filter((p) => !p.difficulty_reviewed).length} of {d03.pairs.length} still need a TA/instructor
          difficulty check before the graded comparison is final (HLD §16).
        </div>
      )}
      {/* TODO: surface pending retention quizzes here directly, per HLD 9.2 
          ("Pending retention quizzes are entered directly from the Dashboard") */}
    </NavShell>
  )
}
