import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type Concept = { id: string; name: string; bloom_level: string }
type Module = { id: string; name: string; concepts: Concept[] }

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

  if (loading) return <NavShell title="Topic Setup"><p className="text-sm text-slate-500">Loading…</p></NavShell>

  return (
    <NavShell title="Topic Setup">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-medium text-slate-900 mb-1">Ask about anything</h2>
          <p className="text-xs text-slate-400 mb-3">
            Open exploration — runs the same teacher/student classroom, but isn't part of the pilot's graded
            platform-vs-chat comparison.
          </p>
          <div className="flex gap-2">
            <input
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1"
              placeholder="e.g. how do neural networks learn?"
              value={freeTopic}
              onChange={(e) => setFreeTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartFreeform()}
            />
            <button
              className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={startingFreeform || !freeTopic.trim()}
              onClick={handleStartFreeform}
            >
              {startingFreeform ? 'Starting…' : 'Start'}
            </button>
          </div>
        </div>

        {modules.map((mod) => (
          <div key={mod.id} className="bg-white rounded-xl shadow p-6">
            <h2 className="font-medium text-slate-900 mb-3">{mod.name}</h2>
            <ul className="space-y-2">
              {mod.concepts.map((c) => {
                const condition = conditionMap?.[c.id]
                return (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-slate-800">{c.name}</span>
                      <span className="ml-2 text-xs uppercase text-slate-400">{c.bloom_level}</span>
                      {condition && (
                        <span
                          className={`ml-2 text-xs rounded-full px-2 py-0.5 ${
                            condition === 'platform' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {condition === 'platform' ? 'platform condition' : 'plain-chat baseline'}
                        </span>
                      )}
                    </div>
                    <button
                      className="text-xs font-medium text-slate-900 border border-slate-300 rounded-lg px-3 py-1 disabled:opacity-50"
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
        ))}
      </div>
    </NavShell>
  )
}
