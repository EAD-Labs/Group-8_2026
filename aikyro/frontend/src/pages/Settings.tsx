import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Mic, Volume2 } from 'lucide-react'
import NavShell from '../components/NavShell'
import { api, clearToken } from '../api/client'

type VoiceStatus = {
  enabled: boolean
  provider: string
  transcription_usable: boolean
  privacy_note: string
}

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

  // Voice capability is a server fact now, not a browser one. Dictation and
  // teach-back scoring both run on our own backend (PROJECT.md D6), so whether
  // they work depends on how the backend is configured, not on the browser.
  const [voice, setVoice] = useState<VoiceStatus | null>(null)
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    api
      .getMe()
      .then(setMe)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load account info.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    api.getVoiceStatus().then(setVoice).catch(() => setVoice(null))
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
          <h2 className="font-display font-semibold text-ink mb-3">Voice &amp; privacy</h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <Mic size={15} className={voice?.transcription_usable ? 'text-basic' : 'text-slate-300'} />
              <span className={voice?.transcription_usable ? 'text-ink' : 'text-slate-400'}>
                Ask questions by voice{' '}
                {voice?.transcription_usable
                  ? '— available'
                  : '— not available yet, so the classroom asks you to type instead'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Mic size={15} className={voice?.enabled ? 'text-basic' : 'text-slate-300'} />
              <span className={voice?.enabled ? 'text-ink' : 'text-slate-400'}>
                Teach-back scoring {voice?.enabled ? '— available' : '— switched off'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Volume2 size={15} className={ttsSupported ? 'text-basic' : 'text-slate-300'} />
              <span className={ttsSupported ? 'text-ink' : 'text-slate-400'}>
                Read the lesson aloud {ttsSupported ? '— supported in this browser' : '— not supported here'}
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-3 space-y-1.5">
            <p>
              {voice?.privacy_note ??
                'Audio is processed on our own backend and discarded; no clip is stored, and none is sent to a third-party speech service.'}
            </p>
            <p>
              Reading the lesson aloud happens entirely in your browser and sends nothing anywhere.
            </p>
          </div>
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
