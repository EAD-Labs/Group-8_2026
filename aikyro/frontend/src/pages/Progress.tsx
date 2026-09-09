import { useEffect, useState } from 'react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type MasteryItem = { concept_id: string; module_id: string; state: string; bloom_level_reached: string | null }
type Doubt = { id: string; concept_id: string; misconception: string }
type PendingCheck = { concept_id: string; scheduled_for: string }

const STATE_LABEL: Record<string, string> = {
  not_started: 'Not started',
  introduced: 'Introduced',
  checkpoint_passed: 'Checkpoint passed',
  retained: 'Retained',
  demoted: 'Needs review',
}

const STATE_COLOR: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-500',
  introduced: 'bg-blue-100 text-blue-700',
  checkpoint_passed: 'bg-amber-100 text-amber-700',
  retained: 'bg-green-100 text-green-700',
  demoted: 'bg-red-100 text-red-700',
}

export default function Progress() {
  const [mastery, setMastery] = useState<MasteryItem[]>([])
  const [doubts, setDoubts] = useState<Doubt[]>([])
  const [pending, setPending] = useState<PendingCheck[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .getProgress()
      .then((data) => {
        setMastery(data.mastery)
        setDoubts(data.open_doubts)
        setPending(data.pending_retention_checks)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <NavShell title="Progress"><p className="text-sm text-slate-500">Loading…</p></NavShell>

  return (
    <NavShell title="Checkpoint & Progress">
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-medium text-slate-900 mb-3">Concept mastery</h2>
          {mastery.length === 0 && <p className="text-sm text-slate-400">No concepts started yet.</p>}
          <ul className="space-y-2">
            {mastery.map((m) => (
              <li key={m.concept_id} className="flex items-center justify-between text-sm">
                <span className="text-slate-800">{m.concept_id.replaceAll('_', ' ')}</span>
                <span className={`text-xs rounded-full px-2 py-0.5 ${STATE_COLOR[m.state]}`}>
                  {STATE_LABEL[m.state]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-medium text-slate-900 mb-3">Open doubts</h2>
          {doubts.length === 0 && <p className="text-sm text-slate-400">No open doubts right now.</p>}
          <ul className="space-y-1">
            {doubts.map((d) => (
              <li key={d.id} className="text-sm text-slate-700">
                <span className="text-slate-400">{d.concept_id.replaceAll('_', ' ')}:</span> {d.misconception}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-medium text-slate-900 mb-3">Pending retention checks</h2>
          {pending.length === 0 && <p className="text-sm text-slate-400">Nothing scheduled.</p>}
          <ul className="space-y-1">
            {pending.map((p, i) => (
              <li key={i} className="text-sm text-slate-700">
                {p.concept_id.replaceAll('_', ' ')} — due {new Date(p.scheduled_for).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>

        {/* TODO: points/badges once gamification rules are finalised (HLD 6.6) */}
      </div>
    </NavShell>
  )
}
