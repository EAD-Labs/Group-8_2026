import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Beaker, Sigma, Users, UserMinus, Wand2, Sparkles, BookOpen } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api, type DialogueMode } from '../api/client'

type Concept = { id: string; name: string; bloom_level: string }
type Source = { title: string; author: string }
type Module = {
  id: string
  name: string
  concepts: Concept[]
  is_custom?: boolean
  topic_description?: string | null
  sources?: Source[]
}

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
  // HLD T2.7. Reduced mode drops the basic-student persona for learners who find
  // the three-way dialogue noisy; the gated hint and blocking blank stay.
  const [dialogueMode, setDialogueMode] = useState<DialogueMode>('full')
  const [startingFreeform, setStartingFreeform] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [customTopic, setCustomTopic] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const navigate = useNavigate()

  function loadModules() {
    return api
      .getModules()
      .then((data) => {
        setModules(data.modules)
        setConditionMap(data.pilot_condition_map)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load modules.'))
  }

  useEffect(() => {
    loadModules().finally(() => setLoading(false))
  }, [])

  /**
   * Each concept goes to the surface its condition assigns.
   *
   * The assignment is fixed per learner at signup (HLD 6.3 / D-03), and the
   * backend refuses a mismatch with a 409 — sending a plain-chat concept into the
   * classroom would compare the platform against itself. Routing here keeps that
   * from ever being a learner-visible error.
   */
  async function handleStart(conceptId: string, condition: string | undefined) {
    setStarting(conceptId)
    setError(null)
    try {
      if (condition === 'plain_chat') {
        const res = await api.startBaseline(conceptId)
        navigate(`/plain-chat/${res.session_id}`)
      } else {
        const res = await api.startSession(conceptId, dialogueMode)
        navigate(`/classroom/${res.session_id}`)
      }
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
      const res = await api.startFreeformSession(freeTopic.trim(), dialogueMode)
      navigate(`/classroom/${res.session_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start this session.')
    } finally {
      setStartingFreeform(false)
    }
  }

  async function handleGenerateModule() {
    if (!customTopic.trim()) return
    setGenerating(true)
    setGenerateError(null)
    try {
      await api.createCustomModule(customTopic.trim())
      setCustomTopic('')
      await loadModules()
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Could not generate that module.')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <NavShell title="Modules"><p className="text-sm text-slate-500">Loading…</p></NavShell>

  const sampleModules = modules.filter((m) => !m.is_custom)
  const customModules = modules.filter((m) => m.is_custom)

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

        {/* create a custom module — HLD 6.4 extension path: describe a topic,
            the model researches it and builds a full module you can return to */}
        <div className="bg-white rounded-2xl border-2 border-dashed border-cobalt/30 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Wand2 size={16} className="text-cobalt" />
            <h2 className="font-display font-semibold text-ink">Create a custom module</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4 max-w-lg">
            Describe a topic and the model researches it — breaking it into concepts with Bloom levels and
            reference reading — and saves it as a module in your account, ready to revisit any time.
          </p>
          <div className="flex gap-2">
            <input
              className="border border-slate-200 bg-white placeholder-slate-400 text-ink rounded-xl px-4 py-2.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-cobalt/30 focus:border-cobalt"
              placeholder="e.g. Fourier transforms, graph theory, thermodynamics of black holes…"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateModule()}
            />
            <button
              className="bg-cobalt text-white rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-cobalt-dark transition-colors flex items-center gap-1.5"
              disabled={generating || !customTopic.trim()}
              onClick={handleGenerateModule}
            >
              {generating ? 'Generating…' : 'Generate'}
              {!generating && <Sparkles size={14} />}
            </button>
          </div>
          {generateError && (
            <p className="text-xs text-learner mt-2">{generateError}</p>
          )}
        </div>

        {/* HLD T2.7 — a filter on the turn spec, chosen before entering */}
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
          <p className="text-sm font-medium text-ink mb-1">Classroom style</p>
          <p className="text-xs text-slate-400 mb-3">
            Applies to the simulated classroom. You'll still get the hints and the fill-in-the-blanks
            either way.
          </p>
          <div className="flex gap-2">
            {(
              [
                { mode: 'full' as DialogueMode, icon: Users, label: 'Full class', hint: 'Teacher, a student who asks basics, and one who pushes further' },
                { mode: 'reduced' as DialogueMode, icon: UserMinus, label: 'Fewer voices', hint: 'Teacher and the advanced student only' },
              ]
            ).map(({ mode, icon: Icon, label, hint }) => (
              <button
                key={mode}
                onClick={() => setDialogueMode(mode)}
                aria-pressed={dialogueMode === mode}
                className={`flex-1 text-left rounded-xl border px-3.5 py-2.5 transition-colors ${
                  dialogueMode === mode
                    ? 'border-cobalt bg-cobalt-light'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${dialogueMode === mode ? 'text-cobalt' : 'text-slate-500'}`}>
                  <Icon size={13} /> {label}
                </span>
                <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>
              </button>
            ))}
          </div>
        </div>

        {sampleModules.map((mod) => {
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
                        onClick={() => handleStart(c.id, condition)}
                      >
                        {starting === c.id
                          ? 'Starting…'
                          : condition === 'plain_chat'
                            ? 'Open chat'
                            : 'Enter classroom'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        {customModules.length > 0 && (
          <>
            <h2 className="font-display font-semibold text-ink flex items-center gap-2 mt-2">
              <BookOpen size={16} className="text-cobalt" /> Your custom modules
            </h2>
            {customModules.map((mod) => (
              <div key={mod.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-advanced">
                    <Sparkles size={17} />
                  </div>
                  <div>
                    <h2 className="font-display font-semibold text-ink">{mod.name}</h2>
                    {mod.topic_description && (
                      <p className="text-[11px] text-slate-400">{mod.topic_description}</p>
                    )}
                  </div>
                </div>
                {mod.sources && mod.sources.length > 0 && (
                  <div className="px-6 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">References</p>
                    <ul className="space-y-0.5">
                      {mod.sources.map((s, i) => (
                        <li key={i} className="text-[11px] text-slate-500">
                          {s.title}{s.author ? ` — ${s.author}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ul className="divide-y divide-slate-100">
                  {mod.concepts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-ink">{c.name}</span>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${BLOOM_COLOR[c.bloom_level] || 'text-slate-400 bg-slate-50'}`}>
                          {c.bloom_level}
                        </span>
                      </div>
                      <button
                        className="text-xs font-medium text-white bg-ink rounded-lg px-3.5 py-1.5 disabled:opacity-50 hover:bg-cobalt-dark transition-colors shrink-0"
                        disabled={starting === c.id}
                        onClick={() => handleStart(c.id, undefined)}
                      >
                        {starting === c.id ? 'Starting…' : 'Enter classroom'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </NavShell>
  )
}
