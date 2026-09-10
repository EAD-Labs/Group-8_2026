import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Sparkles, Flame, HelpCircle, ClipboardCheck, Beaker, Sigma,
  BookOpen, Sun, Clock3, Lightbulb, Pencil, Leaf, Target, Brain, Zap, BarChart3,
  CheckCircle2
} from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type ProgressData = {
  points: number
  badges: { code: string; label: string; emoji: string }[]
  open_doubts: { id: string; concept_id: string; misconception: string }[]
  mastery: { state: string }[]
}

type Concept = { id: string; name: string; bloom_level: string }
type ModuleData = { id: string; name: string; concepts: Concept[] }

const MODULE_ICON: Record<string, typeof Beaker> = {
  thermodynamics: Beaker,
  probability_stats: Sigma,
}

const MODULE_TONE: Record<string, string> = {
  thermodynamics: 'module-visual module-visual-green',
  probability_stats: 'module-visual module-visual-gold',
}

const BLOOM_COLOR: Record<string, string> = {
  remember: 'text-slate-500 bg-slate-100',
  understand: 'text-emerald-700 bg-emerald-50',
  apply: 'text-sky-700 bg-sky-50',
  analyse: 'text-violet-700 bg-violet-50',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [pendingQuizCount, setPendingQuizCount] = useState(0)
  const [me, setMe] = useState<{ name: string } | null>(null)
  const [modules, setModules] = useState<ModuleData[]>([])
  const [starting, setStarting] = useState<string | null>(null)
  const heroRef = useRef<HTMLButtonElement>(null)

  function handleHeroMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const el = heroRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--x', `${e.clientX - rect.left}px`)
    el.style.setProperty('--y', `${e.clientY - rect.top}px`)
  }

  useEffect(() => {
    api.getProgress().then(setProgress).catch(() => {})
    api.getMe().then(setMe).catch(() => {})
    api.getPendingQuizzes().then((qs) => setPendingQuizCount(qs.filter((q: { available_now: boolean }) => q.available_now).length)).catch(() => {})
    api.getModules().then((data) => setModules(data.modules)).catch(() => {})
  }, [])

  async function quickStart(conceptId: string) {
    setStarting(conceptId)
    try {
      const res = await api.startSession(conceptId)
      navigate(`/classroom/${res.session_id}`)
    } catch {
      setStarting(null)
    }
  }

  const conceptsStarted = progress?.mastery.length ?? 0
  const conceptsRetained = progress?.mastery.filter((m) => m.state === 'retained').length ?? 0
  const firstName = me?.name.split(' ')[0]

  return (
    <NavShell title="My Desk">
      <div className="kyro-dashboard">
        {/* Header / greeting */}
        <section className="dashboard-greeting">
          <div>
            <div className="eyebrow"><Sun size={14} /> GOOD MORNING, STUDENT</div>
            <h2 className="kyro-title">Welcome back{firstName ? `, ${firstName}` : ''}.</h2>
            <p className="kyro-subtitle">
              {conceptsStarted > 0
                ? `${conceptsRetained} of ${conceptsStarted} concept${conceptsStarted === 1 ? '' : 's'} retained so far.`
                : 'A good day to learn something new.'}
            </p>
          </div>
          <div className="desk-note hidden md:flex">
            <Pencil size={15} />
            <span>Small steps build big ideas.</span>
          </div>
        </section>

        {/* Hero classroom scene */}
        <button
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onClick={() => navigate('/topic-setup')}
          className="classroom-hero group"
        >
          <div className="hero-window-glow" />
          <div className="hero-sunbeam beam-one" />
          <div className="hero-sunbeam beam-two" />
          <div className="hero-window">
            <div className="window-sky" />
            <div className="window-cross horizontal" />
            <div className="window-cross vertical" />
            <div className="window-trees" />
          </div>
          <div className="hero-clock"><span>10</span><i /><span>2</span><b /><span>4</span><em /><span>8</span></div>
          <div className="hero-board">
            <div className="board-pin pin-a" /><div className="board-pin pin-b" />
            <span className="board-kicker"><BookOpen size={13} /> TODAY'S LESSON</span>
            <strong>Think → question → test</strong>
            <div className="board-rule" />
            <p>No answer is accepted<br />without a second thought.</p>
            <span className="board-smile">☼</span>
            <div className="chalk-lines"><i /><i /><i /></div>
          </div>
          <div className="hero-copy">
            <div className="hero-mini"><span className="sun-doodle">☼</span> NEXT PERIOD</div>
            <h1>Step into the<br /><span>classroom.</span></h1>
            <p>Pick a concept and learn through a live teacher–student discussion. Predict, explain, challenge, and test your thinking.</p>
            <span className="hero-cta">Enter class <ArrowRight size={16} /></span>
            <span className="hero-meta"><Clock3 size={13} /> ~10 min · interactive</span>
          </div>
          <div className="hero-desk desk-books"><span /><span /><span /><i /></div>
          <div className="hero-desk desk-pencil"><i /><b /><em /></div>
          <div className="hero-plant"><Leaf size={35} /><span /><i /><b /></div>
          <div className="hero-cursor-light" />
        </button>

        {/* Stats ribbon */}
        <section className="stats-ribbon">
          <div className="stat-pill"><span className="stat-icon gold"><Sparkles size={16} /></span><strong>{progress?.points ?? 0}</strong><small>points</small></div>
          <div className="stat-pill"><span className="stat-icon green"><Flame size={16} /></span><strong>{conceptsRetained}<small>/{conceptsStarted || 0}</small></strong><small>retained</small></div>
          <div className="stat-pill"><span className="stat-icon violet"><ClipboardCheck size={16} /></span><strong>{pendingQuizCount}</strong><small>quiz{pendingQuizCount === 1 ? '' : 'zes'} due</small></div>
          <button className="stats-progress" onClick={() => navigate('/progress')}><BarChart3 size={16} /> View learning progress <ArrowRight size={14} /></button>
        </section>

        <div className="dashboard-grid">
          <main className="dashboard-main">
            {/* Continue learning */}
            <section>
              <div className="section-heading">
                <div><span className="section-icon book"><BookOpen size={17} /></span><div><h3>Continue Learning</h3><p>Pick up where your thinking left off.</p></div></div>
                <button onClick={() => navigate('/topic-setup')}>View all <ArrowRight size={14} /></button>
              </div>

              {modules.length > 0 ? (
                <div className="module-grid">
                  {modules.map((mod, index) => {
                    const Icon = MODULE_ICON[mod.id] || (index % 2 ? Sigma : Beaker)
                    return (
                      <article key={mod.id} className="module-card group">
                        <div className={MODULE_TONE[mod.id] || `module-visual module-visual-${index % 2 ? 'blue' : 'green'}`}>
                          <span className="module-badge">{index === 0 ? 'IN PROGRESS' : 'NEXT UP'}</span>
                          <Icon className="module-main-icon" size={42} strokeWidth={1.35} />
                          <span className="module-scribble">{index === 0 ? 'keep going →' : 'new idea'}</span>
                          <span className="module-shape shape-one" /><span className="module-shape shape-two" />
                        </div>
                        <div className="module-body">
                          <div className="module-title-row"><h4>{mod.name}</h4><span className="module-arrow"><ArrowRight size={15} /></span></div>
                          <p>{mod.concepts.length} concepts · build it step by step</p>
                          <div className="module-progress"><span style={{ width: `${Math.min(82, 22 + mod.concepts.length * 12)}%` }} /></div>
                          <span className="module-progress-label">{Math.min(3, mod.concepts.length)} / {mod.concepts.length || 1} concepts explored</span>
                          {mod.concepts.slice(0, 2).map((c) => (
                            <button key={c.id} className="concept-row" disabled={starting === c.id} onClick={() => quickStart(c.id)}>
                              <span className="concept-dot" />
                              <span className="concept-name">{c.name}</span>
                              <span className={`bloom-tag ${BLOOM_COLOR[c.bloom_level] || 'text-slate-500 bg-slate-100'}`}>{c.bloom_level}</span>
                              <ArrowRight size={13} />
                            </button>
                          ))}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="empty-module">Your modules will appear here once they load.</div>
              )}
            </section>

            {/* Learning journey */}
            <section className="journey-card">
              <div className="section-heading compact">
                <div><span className="section-icon journey"><Target size={17} /></span><div><h3>Your Learning Journey</h3><p>Progress, not perfection.</p></div></div>
              </div>
              <div className="journey-content">
                <div className="progress-ring" style={{ '--progress': `${Math.min(100, conceptsStarted ? Math.round((conceptsRetained / conceptsStarted) * 100) : 0)}%` } as React.CSSProperties}>
                  <div><strong>{conceptsStarted ? Math.round((conceptsRetained / conceptsStarted) * 100) : 0}%</strong><span>retained</span></div>
                </div>
                <div className="journey-copy"><strong>{conceptsRetained} concepts retained</strong><span>{conceptsStarted} concepts explored so far</span><em>“Curiosity first. Answers second.”</em></div>
                <div className="journey-mini"><span><Flame size={15} />Streak</span><strong>{Math.max(0, conceptsRetained)}</strong><small>concepts</small></div>
                <div className="journey-mini"><span><Brain size={15} />Thinking</span><strong>{progress?.open_doubts.length ?? 0}</strong><small>open doubts</small></div>
              </div>
            </section>

            {/* Quick practice */}
            <section>
              <div className="section-heading compact"><div><span className="section-icon practice"><Zap size={17} /></span><div><h3>Quick Practice</h3><p>Short activities to keep your mind sharp.</p></div></div></div>
              <div className="practice-grid">
                <button onClick={() => navigate('/quizzes')} className="practice-card yellow"><span><Lightbulb size={19} /></span><div><strong>Concept Check</strong><small>Quick, focused questions</small></div><ArrowRight size={15} /></button>
                <button onClick={() => navigate('/quizzes')} className="practice-card coral"><span><Target size={19} /></span><div><strong>Mixed Practice</strong><small>Variety of concepts</small></div><ArrowRight size={15} /></button>
                <button onClick={() => navigate('/progress')} className="practice-card blue"><span><ClipboardCheck size={19} /></span><div><strong>Past Progress</strong><small>See what needs review</small></div><ArrowRight size={15} /></button>
              </div>
            </section>
          </main>

          {/* Right rail */}
          <aside className="dashboard-rail">
            <div className="rail-card lesson-card">
              <div className="rail-title"><span><Clock3 size={16} /> Today at a glance</span><span className="live-dot">LIVE</span></div>
              <div className="rail-timeline">
                <div className="timeline-item active"><span className="timeline-dot" /><div><small>NOW</small><strong>Interactive classroom</strong><p>Think → question → test</p></div></div>
                <div className="timeline-item"><span className="timeline-dot" /><div><small>NEXT</small><strong>{pendingQuizCount > 0 ? `${pendingQuizCount} quiz${pendingQuizCount > 1 ? 'zes' : ''} waiting` : 'Keep exploring'}</strong><p>{pendingQuizCount > 0 ? 'A quick check is ready.' : 'Choose a concept from your desk.'}</p></div></div>
              </div>
              <button onClick={() => navigate('/topic-setup')} className="rail-link">Open class library <ArrowRight size={14} /></button>
            </div>

            <div className="rail-card activity-card">
              <div className="rail-title"><span><CheckCircle2 size={16} /> Your desk</span></div>
              <div className="desk-stat"><span className="desk-stat-icon yellow"><Sparkles size={15} /></span><div><strong>{progress?.points ?? 0}</strong><small>learning points</small></div></div>
              <div className="desk-stat"><span className="desk-stat-icon green"><Leaf size={15} /></span><div><strong>{conceptsRetained}</strong><small>concepts retained</small></div></div>
              <div className="desk-stat"><span className="desk-stat-icon violet"><HelpCircle size={15} /></span><div><strong>{progress?.open_doubts.length ?? 0}</strong><small>open doubts to revisit</small></div></div>
            </div>

            <div className="quote-note">
              <span className="pin" />
              <span className="quote-icon">✦</span>
              <p>“The goal isn't to know everything. It's to notice what you don't know yet.”</p>
              <small>— AI KYRO</small>
            </div>
          </aside>
        </div>

        {progress && progress.open_doubts.length > 0 && (
          <button className="doubt-banner" onClick={() => navigate('/progress')}>
            <HelpCircle size={16} /><strong>{progress.open_doubts.length} open doubt{progress.open_doubts.length > 1 ? 's' : ''}</strong><span>Worth revisiting while they're fresh.</span><ArrowRight size={15} />
          </button>
        )}

        {progress && progress.badges.length > 0 && (
          <div className="badges-strip"><span>Earned in class</span>{progress.badges.map((b) => <span key={b.code} className="badge-chip">{b.emoji} {b.label}</span>)}</div>
        )}

        <div className="kyro-footer"><span /> ET 617 · Metacognitive AI Scaffold <span /></div>
      </div>
    </NavShell>
  )
}
