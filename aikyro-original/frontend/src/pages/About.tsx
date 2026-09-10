import { GraduationCap, ShieldCheck, MessageSquare, LineChart } from 'lucide-react'
import NavShell from '../components/NavShell'

const PARTS = [
  {
    icon: ShieldCheck,
    title: 'Verified Knowledge Engine',
    body: 'Cross-checks multiple AI providers before teaching anything, flags disagreements, and caches the result per concept.',
  },
  {
    icon: MessageSquare,
    title: 'Simulated Classroom',
    body: 'A teacher, a basic student, and an advanced student — each pushing the concept toward a different Bloom level.',
  },
  {
    icon: LineChart,
    title: 'Learning Measurement Layer',
    body: 'Checkpoints, delayed retention checks, transfer problems, and a doubt log that tracks specific misconceptions.',
  },
]

export default function About() {
  return (
    <NavShell title="About">
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-cobalt to-cobalt-dark rounded-2xl p-8 text-white">
          <GraduationCap size={24} className="mb-3 text-white/80" />
          <h2 className="font-display text-2xl font-semibold mb-2">AI KYRO</h2>
          <p className="text-sm text-white/70 max-w-lg">
            A working scaffold for the ET 617 project, built off HLD v2.5 — a metacognitive AI tutor that
            checks its own answers before teaching, then teaches through dialogue rather than a static
            explanation.
          </p>
        </div>

        <div className="grid gap-4">
          {PARTS.map((part) => (
            <div key={part.title} className="bg-white rounded-2xl border border-slate-200 p-5 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-cobalt-light flex items-center justify-center text-cobalt shrink-0">
                <part.icon size={18} />
              </div>
              <div>
                <h3 className="font-display font-semibold text-ink text-sm mb-1">{part.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{part.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 pt-2">
          Development build — AI responses are currently templated placeholders, not live model output.
        </p>
      </div>
    </NavShell>
  )
}
