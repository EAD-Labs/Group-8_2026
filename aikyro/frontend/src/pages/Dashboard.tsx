import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, BarChart3, Bell, BookOpen, Brain, ClipboardCheck,
  Clock3, Lightbulb, MessageCircleQuestion, Sparkles, Target, Zap
} from 'lucide-react'
import NavShell from '../components/NavShell'
import { api } from '../api/client'

type ProgressData = {
  points: number
  badges: { code: string; label: string; emoji: string }[]
  open_doubts: { id: string; concept_id: string; misconception: string }[]
  mastery: { state: string }[]
}

type Me = { name: string; total_points?: number }

const MODULES = [
  { title: 'Linear Algebra\nFoundations', subtitle: 'Matrices, Systems, and more', kind: 'algebra', progress: 60, lessons: '3/5 lessons', tag: 'IN PROGRESS' },
  { title: 'Calculus for\nProblem Solving', subtitle: 'Limits, derivatives, applications', kind: 'calculus', progress: 25, lessons: '1/4 lessons', tag: '' },
  { title: 'Programming\nwith Python', subtitle: 'Basics to building', kind: 'python', progress: 33, lessons: '2/6 lessons', tag: '' },
  { title: 'Critical Thinking\n& Logic', subtitle: 'Reasoning, patterns, puzzles', kind: 'logic', progress: 0, lessons: '0/5 lessons', tag: '' },
]

function ModuleArt({ kind }: { kind: string }) {
  if (kind === 'algebra') return <div className="module-art module-art-algebra"><div className="grid-paper" /><span className="triangle-sketch" /><span className="pencil-sketch" /></div>
  if (kind === 'calculus') return <div className="module-art module-art-calculus"><span className="axis-x" /><span className="axis-y" /><span className="curve" /><span className="curve-label">f(x)</span></div>
  if (kind === 'python') return <div className="module-art module-art-python"><div className="laptop"><span /><span /><span /><code>{'{ }'}</code></div><span className="orbit orbit-one" /><span className="orbit orbit-two" /></div>
  return <div className="module-art module-art-logic"><Lightbulb size={46} strokeWidth={1.5} /><span className="spark spark-a">✦</span><span className="spark spark-b">✧</span></div>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [pendingQuizCount, setPendingQuizCount] = useState(0)
  const [me, setMe] = useState<Me | null>(null)
  const [spotlight, setSpotlight] = useState({ x: 60, y: 40 })

  useEffect(() => {
    api.getProgress().then(setProgress).catch(() => {})
    api.getMe().then(setMe).catch(() => {})
    api.getPendingQuizzes().then((qs) => setPendingQuizCount(qs.filter((q: { available_now: boolean }) => q.available_now).length)).catch(() => {})
  }, [])

  const firstName = me?.name?.split(' ')[0] || 'there'
  const conceptsStarted = progress?.mastery.length ?? 0
  const conceptsRetained = progress?.mastery.filter((m) => m.state === 'retained').length ?? 0
  const overall = conceptsStarted ? Math.round((conceptsRetained / conceptsStarted) * 100) : 0
  const points = progress?.points ?? me?.total_points ?? 0
  const badge = progress?.badges?.[0]

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'GOOD MORNING'
    if (hour < 18) return 'GOOD AFTERNOON'
    return 'GOOD EVENING'
  }, [])

  return (
    <NavShell title="Dashboard">
      <div className="kyro-dashboard" onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setSpotlight({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
      }}>
        <div className="dashboard-topline">
          <div>
            <p className="eyebrow"><Sparkles size={13} /> {greeting}, {firstName.toUpperCase()}!</p>
            <p className="dashboard-kicker">A little progress today goes a long way.</p>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications"><Bell size={17} /><span className="notification-dot" /></button>
            <div className="sunny-greeting"><span>☼</span> Good morning, {firstName}!</div>
          </div>
        </div>

        <section className="classroom-hero" style={{ '--spot-x': `${spotlight.x}%`, '--spot-y': `${spotlight.y}%` } as CSSProperties}>
          <div className="hero-window">
            <div className="window-sky"><span className="cloud cloud-one" /><span className="cloud cloud-two" /><span className="sun-disc" /></div>
            <div className="window-city"><i /><i /><i /><i /><i /></div>
            <div className="window-plant"><span /><span /><span /><span /></div>
          </div>
          <div className="hero-board">
            <div className="board-heading"><span className="sun-doodle">☼</span> {greeting}, {firstName.toUpperCase()}!</div>
            <h1>Step into the<br /><em>classroom.</em></h1>
            <p>Pick a concept and learn through a live teacher–student discussion. You’ll be asked to predict, explain, and challenge ideas along the way.</p>
            <button className="enter-class" onClick={() => navigate('/topic-setup')}>Enter class <ArrowRight size={17} /></button>
          </div>
          <div className="lesson-board">
            <div className="lesson-title"><BookOpen size={14} /> TODAY'S LESSON</div>
            <strong>Think → question → test</strong>
            <span>No answer is accepted<br />without a second thought. <b>☺</b></span>
          </div>
          <div className="hero-clock"><span>12</span><i>3</i><b>6</b><em>9</em><div className="clock-hands" /></div>
          <div className="hero-desk"><div className="desk-book book-one">Better</div><div className="desk-book book-two">Today</div><div className="desk-pencil" /></div>
          <div className="hero-pot"><span /><span /><span /><span /></div>
          <div className="sticky-hero">Better<br />Ideas<br /><b>Ahead!</b></div>
        </section>

        <div className="dashboard-columns">
          <div className="dashboard-main">
            <section className="paper-section">
              <div className="section-heading">
                <div><h2><BookOpen size={20} /> Class Library</h2><p>Structured modules to build your concepts, step by step.</p></div>
                <button onClick={() => navigate('/topic-setup')}>View all <ArrowRight size={14} /></button>
              </div>
              <div className="module-grid">
                {MODULES.map((m) => (
                  <button key={m.title} className="module-card" onClick={() => navigate('/topic-setup')}>
                    <div className="module-visual"><ModuleArt kind={m.kind} />{m.tag && <span className="module-tag">{m.tag}</span>}</div>
                    <div className="module-copy"><h3>{m.title.split('\n').map((x, i) => <span key={i}>{x}{i === 0 && <br />}</span>)}</h3><p>{m.subtitle}</p><div className="module-progress"><span><i style={{ width: `${m.progress}%` }} /></span><small>{m.lessons}</small><b><ArrowRight size={14} /></b></div></div>
                  </button>
                ))}
              </div>
            </section>

            <section className="paper-section quick-section">
              <div className="section-heading"><div><h2><Zap size={20} /> Quick Practice</h2><p>Short, focused questions to keep your mind sharp.</p></div><button onClick={() => navigate('/quizzes')}>View all <ArrowRight size={14} /></button></div>
              <div className="quick-grid">
                <button onClick={() => navigate('/quizzes')}><span className="quick-icon yellow"><Zap size={17} /></span><span><strong>Concept Check</strong><small>Quick, focused questions</small></span><ArrowRight size={15} /></button>
                <button onClick={() => navigate('/quizzes')}><span className="quick-icon coral"><Target size={17} /></span><span><strong>Mixed Practice</strong><small>Variety of concepts</small></span><ArrowRight size={15} /></button>
                <button onClick={() => navigate('/quizzes')}><span className="quick-icon purple"><ClipboardCheck size={17} /></span><span><strong>Past Papers</strong><small>Real exam style</small></span><ArrowRight size={15} /></button>
                <button onClick={() => navigate('/quizzes')}><span className="quick-icon blue"><Brain size={17} /></span><span><strong>Custom Quiz</strong><small>Build your own</small></span><ArrowRight size={15} /></button>
              </div>
            </section>

            {pendingQuizCount > 0 && <button className="doubt-banner" onClick={() => navigate('/quizzes')}><span className="doubt-icon"><ClipboardCheck size={18} /></span><span><strong>{pendingQuizCount} quiz{pendingQuizCount > 1 ? 'zes' : ''} ready for you</strong><small>Retention checks and transfer problems</small></span><ArrowRight size={16} /></button>}
          </div>

          <aside className="dashboard-rail">
            <section className="rail-card schedule-card"><div className="rail-title"><span><Clock3 size={17} /> Today's Schedule</span></div><div className="schedule-item"><i className="blue-dot" /><div><strong>9:00 AM</strong><span>Math – Linear Algebra</span></div><b>Live Class</b></div><div className="schedule-item"><i className="blue-dot" /><div><strong>11:00 AM</strong><span>Physics – Mechanics</span></div><b>Live Class</b></div><div className="schedule-item"><i className="orange-dot" /><div><strong>3:00 PM</strong><span>DSA Practice</span></div><b className="self-study">Self Study</b></div><button onClick={() => navigate('/topic-setup')}>View full schedule <ArrowRight size={13} /></button></section>

            <section className="rail-card progress-card"><div className="rail-title"><span><BarChart3 size={17} /> Your Progress</span><ArrowRight size={14} /></div><div className="progress-ring-row"><div className="progress-ring" style={{ '--progress': `${overall}%` } as CSSProperties}><strong>{overall}%</strong></div><div><strong>Overall Progress</strong><span>{conceptsRetained} of {conceptsStarted || 0} concepts retained</span><em>“Progress, not perfection.”</em></div></div></section>

            <section className="rail-card report-card"><div className="rail-title"><span>🏆 Report Card</span><button onClick={() => navigate('/progress')}>View details <ArrowRight size={13} /></button></div><div className="score-grid"><div><span>Math</span><strong>—</strong></div><div><span>Physics</span><strong>—</strong></div><div><span>CS</span><strong>{points}</strong></div><div><span>Overall</span><strong>{conceptsRetained}/{conceptsStarted || 0}</strong></div></div></section>

            <div className="motivation-note"><span className="note-books">▰<br />▰<br />▰</span><p>You’re not just<br />learning concepts,<br />you’re building<br /><b>a better you.</b></p><span className="heart">♡</span></div>
          </aside>
        </div>

        <div className="dashboard-bottom-note"><span>✦</span> Small steps build big progress <span>☺</span>{badge && <b>{badge.emoji} {badge.label}</b>}</div>

        {progress && progress.open_doubts.length > 0 && <button className="open-doubt-strip" onClick={() => navigate('/progress')}><MessageCircleQuestion size={16} /> {progress.open_doubts.length} open doubt{progress.open_doubts.length > 1 ? 's' : ''} — revisit these concepts <ArrowRight size={14} /></button>}
      </div>
    </NavShell>
  )
}
