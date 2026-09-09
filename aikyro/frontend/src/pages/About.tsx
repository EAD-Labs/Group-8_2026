import NavShell from '../components/NavShell'

export default function About() {
  return (
    <NavShell title="About">
      <div className="bg-white rounded-xl shadow p-6 space-y-3 text-sm text-slate-700">
        <p>
          <span className="font-medium">AI KYRO — Metacognitive AI Scaffold</span> is a working scaffold
          built for the ET 617 project, based on HLD v2.5.
        </p>
        <p className="text-slate-500">
          Three parts under the hood: a Verified Knowledge Engine (cross-checks multiple AI providers
          before teaching anything), a Simulated Classroom (teacher / basic student / advanced student
          dialogue), and a Learning Measurement Layer (checkpoints, retention checks, doubt log).
        </p>
        <p className="text-slate-400 text-xs pt-2 border-t border-slate-100">
          Development build — AI responses are currently templated placeholders, not live model output.
        </p>
      </div>
    </NavShell>
  )
}
