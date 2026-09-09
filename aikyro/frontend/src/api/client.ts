const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function getToken(): string | null {
  return localStorage.getItem('aikyro_token')
}

export function setToken(token: string) {
  localStorage.setItem('aikyro_token', token)
}

export function clearToken() {
  localStorage.removeItem('aikyro_token')
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!(options.body instanceof FormData) && options.body) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const text = await res.text()
    let detail = text
    try {
      const parsed = JSON.parse(text)
      detail = parsed.detail || text
    } catch {
      // not JSON — use raw text as-is
    }

    if (res.status === 401 && path !== '/auth/login') {
      // Token is present but no longer valid — most often because the dev
      // database was reset (fresh DB, old browser token points at a user
      // id that no longer exists). Don't fail silently: clear the stale
      // token and send them back to log in / sign up again.
      clearToken()
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
      throw new Error('Your session is no longer valid — please log in again.')
    }

    throw new Error(`${detail} (HTTP ${res.status})`)
  }
  const contentType = res.headers.get('content-type') || ''
  return contentType.includes('application/json') ? res.json() : res.text()
}

export const api = {
  signup: (name: string, email: string, password: string) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) }),

  login: async (email: string, password: string) => {
    const body = new URLSearchParams({ username: email, password })
    const data = await request('/auth/login', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    setToken(data.access_token)
    return data
  },

  getMe: () => request('/auth/me'),

  getModules: () => request('/topics/modules'),

  getD03Status: () => request('/topics/d03-status'),

  startSession: (conceptId: string) =>
    request('/classroom/start', { method: 'POST', body: JSON.stringify({ concept_id: conceptId }) }),

  startFreeformSession: (topic: string) =>
    request('/classroom/start-freeform', { method: 'POST', body: JSON.stringify({ topic }) }),

  getVoiceStatus: () => request('/voice/status'),

  streamDialogueUrl: (sessionId: string) => `${BASE_URL}/classroom/${sessionId}/stream`,

  askQuestion: (sessionId: string, question: string) =>
    request(`/classroom/${sessionId}/question`, { method: 'POST', body: JSON.stringify({ question }) }),

  recordInteractionEvent: (payload: {
    turn_id: string
    event_type: string
    payload: Record<string, unknown>
    is_correct?: boolean | null
  }) => request('/classroom/interaction-event', { method: 'POST', body: JSON.stringify(payload) }),

  submitCheckpoint: (sessionId: string, answers: Record<string, string>) =>
    request('/checkpoint/submit', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, answers }),
    }),

  getProgress: () => request('/progress/me'),

  submitVoiceClip: (sessionId: string, blob: Blob) => {
    const form = new FormData()
    form.append('file', blob, 'clip.webm')
    return request(`/voice/${sessionId}/submit`, { method: 'POST', body: form })
  },
}

export { BASE_URL }
