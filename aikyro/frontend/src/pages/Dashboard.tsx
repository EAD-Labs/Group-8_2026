import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles, Flame, HelpCircle, ClipboardCheck } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type ProgressData = {
  points: number
  badges: { code: string; label: string; emoji: string }[]
  open_doubts: { id: string; concept_id: string; misconception: string }[]
  mastery: { state: string }[]
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [pendingQuizCount, setPendingQuizCount] = useState(0)
  const [me, setMe] = useState<{ name: string } | null>(null)

  useEffect(() => {
    api.getProgress().then(setProgress).catch(() => {})
    api.getMe().then(setMe).catch(() => {})
    api.getPendingQuizzes().then((qs) => setPendingQuizCount(qs.filter((q: { available_now: boolean }) => q.available_now).length)).catch(() => {})
  }, [])

  const conceptsStarted = progress?.mastery.length ?? 0
  const conceptsRetained = progress?.mastery.filter((m) => m.state === 'retained').length ?? 0

  return (
    <NavShell title="Dashboard">
      <div className="space-y-6">
        <div>
          <p className="text-sm text-slate-500">{me ? `Welcome back, ${me.name.split(' ')[0]}.` : 'Welcome back.'}</p>
        </div>

        {/* stat row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-amber mb-2">
              <Sparkles size={16} />
              <span className="text-xs font-medium uppercase tracking-wide">Points</span>
            </div>
            <p className="font-display text-3xl font-semibold text-ink">{progress?.points ?? 0}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-basic mb-2">
              <Flame size={16} />
              <span className="text-xs font-medium uppercase tracking-wide">Retained</span>
            </div>
            <p className="font-display text-3xl font-semibold text-ink">
              {conceptsRetained}<span className="text-slate-300 text-lg">/{conceptsStarted || 0}</span>
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-advanced mb-2">
              <ClipboardCheck size={16} />
              <span className="text-xs font-medium uppercase tracking-wide">Quizzes due</span>
            </div>
            <p className="font-display text-3xl font-semibold text-ink">{pendingQuizCount}</p>
          </div>
        </div>

        {/* badges */}
        {progress && progress.badges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {progress.badges.map((b) => (
              <span
                key={b.code}
                className="inline-flex items-center gap-1.5 bg-amber-light text-amber text-xs font-medium px-3 py-1.5 rounded-full border border-amber/20"
              >
                <span>{b.emoji}</span> {b.label}
              </span>
            ))}
          </div>
        )}

        {/* pending quizzes callout */}
        {pendingQuizCount > 0 && (
          <button
            onClick={() => navigate('/quizzes')}
            className="w-full flex items-center justify-between bg-cobalt-light border border-cobalt/20 rounded-2xl p-5 text-left hover:border-cobalt/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <ClipboardCheck className="text-cobalt" size={20} />
              <div>
                <p className="text-sm font-medium text-ink">
                  {pendingQuizCount} quiz{pendingQuizCount > 1 ? 'zes' : ''} ready for you
                </p>
                <p className="text-xs text-slate-500">Retention checks and transfer problems</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-cobalt" />
          </button>
        )}

        {/* open doubts callout */}
        {progress && progress.open_doubts.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle size={16} className="text-learner" />
              <p className="text-sm font-medium text-ink">{progress.open_doubts.length} open doubt(s)</p>
            </div>
            <p className="text-xs text-slate-500">Revisit these concepts — see Progress for details.</p>
          </div>
        )}

        {/* main actions */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <button
            className="group bg-ink text-white rounded-2xl p-6 text-left hover:bg-cobalt-dark transition-colors"
            onClick={() => navigate('/topic-setup')}
          >
            <p className="font-display text-lg font-semibold mb-1">Start a topic</p>
            <p className="text-xs text-white/60">Enter the classroom on a module concept, or ask about anything.</p>
            <ArrowRight size={16} className="mt-3 group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            className="group bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-slate-300 transition-colors"
            onClick={() => navigate('/progress')}
          >
            <p className="font-display text-lg font-semibold text-ink mb-1">View progress</p>
            <p className="text-xs text-slate-500">Mastery ladder, doubts, badges.</p>
            <ArrowRight size={16} className="mt-3 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </NavShell>
  )
}
