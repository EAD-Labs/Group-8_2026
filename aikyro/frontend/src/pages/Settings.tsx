import { useEffect, useState } from 'react'
import NavShell from '../components/NavShell'
import { api, clearToken } from '../api/client'
import { useNavigate } from 'react-router-dom'

type Me = {
  id: string
  name: string
  email: string
  pilot_pair_id: string | null
  pilot_condition_map: Record<string, string> | null
}

export default function Settings() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

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
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
        )}

        {me && (
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="font-medium text-slate-900 mb-3">Account</h2>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between">
                <dt className="text-slate-400">Name</dt>
                <dd className="text-slate-800">{me.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Email</dt>
                <dd className="text-slate-800">{me.email}</dd>
              </div>
              {me.pilot_pair_id && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Comparative-study pair</dt>
                  <dd className="text-slate-800">{me.pilot_pair_id}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-medium text-slate-900 mb-1">Danger zone</h2>
          <p className="text-xs text-slate-400 mb-3">
            Signs you out of this browser. Doesn't delete your account or progress.
          </p>
          <button
            className="border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-50"
            onClick={() => {
              clearToken()
              navigate('/login')
            }}
          >
            Log out
          </button>
        </div>

        {/* TODO: once notification prefs / voice-on-by-default / theme exist
            server-side, surface real toggles here instead of this note. */}
      </div>
    </NavShell>
  )
}
