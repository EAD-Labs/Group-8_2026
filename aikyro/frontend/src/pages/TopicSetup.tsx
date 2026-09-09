import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Beaker, Sigma } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type Concept = { id: string; name: string; bloom_level: string }
type Module = { id: string; name: string; concepts: Concept[] }

const MODULE_ICON: Record<string, typeof Beaker> = {
  thermodynamics: Beaker,
  probability_stats: Sigma,
}

const BLOOM_COLOR: Record<string, string> = {
  remember: 'text-slate-400 bg-slate-50',
  understand: 'text-basic bg-green-50',
  apply: 'text-cobalt bg-cobalt-light',
  analyse: 'text-advanced bg-purple-50',
}

export default function TopicSetup() {
  const [modules, setModules] = useState<Module[]>([])
  const [conditionMap, setConditionMap] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  const [freeTopic, setFreeTopic] = useState('')
  const [startingFreeform, setStartingFreeform] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .getModules()
      .then((data) => {
        setModules(data.modules)
        setConditionMap(data.pilot_condition_map)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load modules.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleStart(conceptId: string) {
    setStarting(conceptId)
    setError(null)
    try {
      const res = await api.startSession(conceptId)
      navigate(`/classroom/${res.session_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start this session.')
    } finally {
      setStarting(null)
    }
  }

  async function handleStartFreeform() {
    if (!freeTopic.trim()) return
    setStartingFreeform(true)
    setError(null)
    try {
      const res = await api.startFreeformSession(freeTopic.trim())
      navigate(`/classroom/${res.session_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start this session.')
    } finally {
      setStartingFreeform(false)
    }
  }

  if (loading) return <NavShell title="Modules"><p className="text-sm text-slate-500">Loading…</p></NavShell>

  return (
    <NavShell title="Modules">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-learner">{error}</div>
        )}

        <div className="bg-gradient-to-br from-cobalt to-cobalt-dark rounded-2xl p-6 text-white">
          <h2 className="font-display font-semibold text-lg mb-1">Ask about anything</h2>
          <p className="text-xs text-white/70 mb-4 max-w-lg">
            Open exploration — runs the same teacher/student classroom, but isn't part of the pilot's graded
            platform-vs-chat comparison.
          </p>
          <div className="flex gap-2">
            <input
              className="border border-white/20 bg-white/10 placeholder-white/50 text-white rounded-xl px-4 py-2.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-white/40"
              placeholder="e.g. how do neural networks learn?"
              value={freeTopic}
              onChange={(e) => setFreeTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartFreeform()}
            />
            <button
              className="bg-white text-cobalt-dark rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-white/90 transition-colors flex items-center gap-1.5"
              disabled={startingFreeform || !freeTopic.trim()}
              onClick={handleStartFreeform}
            >
              {startingFreeform ? 'Starting…' : 'Start'}
              {!startingFreeform && <ArrowRight size={14} />}
            </button>
          </div>
        </div>

        {modules.map((mod) => {
          const Icon = MODULE_ICON[mod.id] || Beaker
          return (
            <div key={mod.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-cobalt-light flex items-center justify-center text-cobalt">
                  <Icon size={17} />
                </div>
                <h2 className="font-display font-semibold text-ink">{mod.name}</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {mod.concepts.map((c) => {
                  const condition = conditionMap?.[c.id]
                  return (
                    <li key={c.id} className="flex items-center justify-between px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-ink">{c.name}</span>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${BLOOM_COLOR[c.bloom_level] || 'text-slate-400 bg-slate-50'}`}>
                          {c.bloom_level}
                        </span>
                        {condition && (
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              condition === 'platform' ? 'bg-cobalt-light text-cobalt' : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {condition === 'platform' ? 'platform condition' : 'plain-chat baseline'}
                          </span>
                        )}
                      </div>
                      <button
                        className="text-xs font-medium text-white bg-ink rounded-lg px-3.5 py-1.5 disabled:opacity-50 hover:bg-cobalt-dark transition-colors shrink-0"
                        disabled={starting === c.id}
                        onClick={() => handleStart(c.id)}
                      >
                        {starting === c.id ? 'Starting…' : 'Enter classroom'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </NavShell>
  )
}
