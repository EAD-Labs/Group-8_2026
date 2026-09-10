import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, HelpCircle, Clock, ArrowRight } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type MasteryItem = { concept_id: string; module_id: string; state: string; bloom_level_reached: string | null }
type Doubt = { id: string; concept_id: string; misconception: string }
type PendingCheck = { concept_id: string; scheduled_for: string }
type BadgeItem = { code: string; label: string; emoji: string; description: string; awarded_at: string }

const STATE_ORDER = ['not_started', 'introduced', 'checkpoint_passed', 'retained']
const STATE_LABEL: Record<string, string> = {
  not_started: 'Not started',
  introduced: 'Introduced',
  checkpoint_passed: 'Checkpoint passed',
  retained: 'Retained',
  demoted: 'Needs review',
}
const STATE_COLOR: Record<string, string> = {
  not_started: 'bg-slate-200',
  introduced: 'bg-cobalt/40',
  checkpoint_passed: 'bg-amber',
  retained: 'bg-basic',
  demoted: 'bg-learner',
}

function MasteryBar({ state }: { state: string }) {
  const idx = state === 'demoted' ? 1 : STATE_ORDER.indexOf(state)
  const pct = ((idx + 1) / STATE_ORDER.length) * 100
  return (
    <div className="w-28 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
      <div className={`h-full rounded-full ${STATE_COLOR[state] || 'bg-slate-200'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function Progress() {
  const [mastery, setMastery] = useState<MasteryItem[]>([])
  const [doubts, setDoubts] = useState<Doubt[]>([])
  const [pending, setPending] = useState<PendingCheck[]>([])
  const [badges, setBadges] = useState<BadgeItem[]>([])
  const [points, setPoints] = useState(0)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .getProgress()
      .then((data) => {
        setMastery(data.mastery)
        setDoubts(data.open_doubts)
        setPending(data.pending_retention_checks)
        setBadges(data.badges)
        setPoints(data.points ?? 0)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleCloseDoubt(id: string) {
    await api.closeDoubt(id)
    setDoubts((prev) => prev.filter((d) => d.id !== id))
  }

  if (loading) return <NavShell title="Progress"><p className="text-sm text-slate-500">Loading…</p></NavShell>

  return (
    <NavShell title="Progress">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-amber-light text-amber font-semibold text-sm px-4 py-2 rounded-full">
            <Sparkles size={15} /> {points} points
          </div>
          {badges.map((b) => (
            <span key={b.code} title={b.description} className="text-xl" aria-label={b.label}>
              {b.emoji}
            </span>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-display font-semibold text-ink mb-4">Concept mastery</h2>
          {mastery.length === 0 && <p className="text-sm text-slate-400">No concepts started yet.</p>}
          <ul className="space-y-3">
            {mastery.map((m) => (
              <li key={m.concept_id} className="flex items-center justify-between gap-4">
                <span className="text-sm text-ink truncate">{m.concept_id.replace('freeform:', '').replaceAll(/[-_]/g, ' ')}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <MasteryBar state={m.state} />
                  <span className="text-xs text-slate-500 w-28 text-right">{STATE_LABEL[m.state]}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {badges.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-display font-semibold text-ink mb-3">Badges</h2>
            <div className="flex flex-wrap gap-3">
              {badges.map((b) => (
                <div key={b.code} className="flex items-center gap-2 bg-amber-light border border-amber/20 rounded-xl px-3 py-2">
                  <span className="text-lg">{b.emoji}</span>
                  <div>
                    <p className="text-xs font-medium text-ink">{b.label}</p>
                    <p className="text-[11px] text-slate-500">{b.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-display font-semibold text-ink mb-3 flex items-center gap-2">
            <HelpCircle size={16} className="text-learner" /> Open doubts
          </h2>
          {doubts.length === 0 && <p className="text-sm text-slate-400">No open doubts right now.</p>}
          <ul className="space-y-2">
            {doubts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">
                  <span className="text-slate-400">{d.concept_id.replaceAll('_', ' ')}:</span> {d.misconception}
                </span>
                <button
                  className="text-xs text-cobalt hover:underline shrink-0"
                  onClick={() => handleCloseDoubt(d.id)}
                >
                  Mark resolved
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-display font-semibold text-ink mb-3 flex items-center gap-2">
            <Clock size={16} className="text-basic" /> Pending retention checks
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing scheduled.</p>
          ) : (
            <>
              <ul className="space-y-1 mb-3">
                {pending.map((p, i) => (
                  <li key={i} className="text-sm text-slate-700">
                    {p.concept_id.replaceAll('_', ' ')} — due {new Date(p.scheduled_for).toLocaleDateString()}
                  </li>
                ))}
              </ul>
              <button
                className="flex items-center gap-1.5 text-sm text-cobalt font-medium hover:underline"
                onClick={() => navigate('/quizzes')}
              >
                Go to quizzes <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </NavShell>
  )
}
