import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Mic, Volume2 } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api, clearToken } from '../api/client'

type Me = {
  id: string
  name: string
  email: string
  pilot_pair_id: string | null
  pilot_condition_map: Record<string, string> | null
  total_points: number
}

export default function Settings() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const speechSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    api
      .getMe()
      .then(setMe)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load account info.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <NavShell title="Settings"><p className="text-sm text-slate-500">Loading…</p></NavShell>

  return (
    <NavShell title="Settings">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-learner">{error}</div>
        )}

        {me && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-display font-semibold text-ink mb-4">Account</h2>
            <dl className="text-sm space-y-3">
              <div className="flex justify-between">
                <dt className="text-slate-400">Name</dt>
                <dd className="text-ink font-medium">{me.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Email</dt>
                <dd className="text-ink font-medium">{me.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Points</dt>
                <dd className="text-ink font-medium">{me.total_points}</dd>
              </div>
              {me.pilot_pair_id && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Comparative-study pair</dt>
                  <dd className="text-ink font-medium">{me.pilot_pair_id}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-display font-semibold text-ink mb-3">Voice capability</h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <Mic size={15} className={speechSupported ? 'text-basic' : 'text-slate-300'} />
              <span className={speechSupported ? 'text-ink' : 'text-slate-400'}>
                Ask questions by voice {speechSupported ? '— supported in this browser' : '— not supported here (try Chrome)'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Volume2 size={15} className={ttsSupported ? 'text-basic' : 'text-slate-300'} />
              <span className={ttsSupported ? 'text-ink' : 'text-slate-400'}>
                AI reads answers aloud {ttsSupported ? '— supported in this browser' : '— not supported here'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Both use your browser's built-in speech engine — no audio is sent anywhere for these two features.
            The separate "teach-back" voice scoring in the classroom does send a short clip to the backend for
            scoring, and never stores the raw audio.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-display font-semibold text-ink mb-1">Danger zone</h2>
          <p className="text-xs text-slate-400 mb-3">
            Signs you out of this browser. Doesn't delete your account or progress.
          </p>
          <button
            className="flex items-center gap-2 border border-red-200 text-learner rounded-xl px-4 py-2 text-sm font-medium hover:bg-red-50"
            onClick={() => {
              clearToken()
              navigate('/login')
            }}
          >
            <LogOut size={15} /> Log out
          </button>
        </div>
      </div>
    </NavShell>
  )
}
