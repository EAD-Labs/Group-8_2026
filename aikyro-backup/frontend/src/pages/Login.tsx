import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { api } from '../api/client'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
        await api.signup(name, email, password)
      }
      await api.login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-paper">
      {/* left panel — brand */}
      <div className="hidden md:flex md:w-5/12 bg-cobalt text-white flex-col justify-between px-12 py-12">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
            <GraduationCap size={18} />
          </div>
          <span className="font-display font-semibold text-lg">AI KYRO</span>
        </div>
        <div className="space-y-4">
          <p className="font-display text-3xl leading-snug">
            A classroom that checks its own answers before it teaches you.
          </p>
          <p className="text-cobalt-light/80 text-sm leading-relaxed max-w-sm">
            Every concept is cross-checked across multiple AI models before it reaches you, then taught
            through a live teacher/student dialogue — not a static explanation.
          </p>
        </div>
        <p className="text-xs text-white/40">ET 617 · Metacognitive AI Scaffold pilot</p>
      </div>

      {/* right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
          <div className="md:hidden flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-cobalt flex items-center justify-center text-white">
              <GraduationCap size={16} />
            </div>
            <span className="font-display font-semibold text-ink text-lg">AI KYRO</span>
          </div>

          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {mode === 'login' ? 'Log in to continue where you left off.' : 'Takes about 20 seconds.'}
            </p>
          </div>

          {mode === 'signup' && (
            <input
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cobalt/30 focus:border-cobalt"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cobalt/30 focus:border-cobalt"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cobalt/30 focus:border-cobalt"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-sm text-learner">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink text-white rounded-xl py-2.5 text-sm font-medium hover:bg-cobalt-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>

          <button
            type="button"
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? "New here? Sign up" : 'Already have an account? Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}
