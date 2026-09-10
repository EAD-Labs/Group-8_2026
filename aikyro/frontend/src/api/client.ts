const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export type DialogueMode = 'full' | 'reduced'

export type Condition = 'platform' | 'plain_chat' | 'general_use'

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

  getContentReviewStatus: () => request('/topics/content-review-status'),

  // `dialogueMode` 'reduced' suppresses the basic-student persona (HLD T2.7).
  startSession: (conceptId: string, dialogueMode: DialogueMode = 'full') =>
    request('/classroom/start', {
      method: 'POST',
      body: JSON.stringify({ concept_id: conceptId, dialogue_mode: dialogueMode }),
    }),

  startFreeformSession: (topic: string, dialogueMode: DialogueMode = 'full') =>
    request('/classroom/start-freeform', {
      method: 'POST',
      body: JSON.stringify({ topic, dialogue_mode: dialogueMode }),
    }),

  getVoiceStatus: () => request('/voice/status'),

  // EventSource cannot send an Authorization header, so the stream is opened with
  // a short-lived, session-scoped ticket instead — see backend app/auth.py.
  getStreamTicket: (sessionId: string): Promise<{ ticket: string; expires_in_seconds: number }> =>
    request(`/classroom/${sessionId}/stream-ticket`, { method: 'POST' }),

  streamDialogueUrl: (sessionId: string, ticket: string) =>
    `${BASE_URL}/classroom/${sessionId}/stream?ticket=${encodeURIComponent(ticket)}`,

  // Non-streaming view of the same turns. Used to reconcile after a dropped
  // connection, and to skip the pacing when revisiting a finished session.
  getTurns: (sessionId: string) => request(`/classroom/${sessionId}/turns`),

  askQuestion: (sessionId: string, question: string) =>
    request(`/classroom/${sessionId}/question`, { method: 'POST', body: JSON.stringify({ question }) }),

  // A committed guess at a blank or hint. Deliberately sends no verdict: the
  // server judges it against expected answers the browser never sees, and writes
  // the doubt-log entry itself.
  submitBlankAttempt: (
    sessionId: string,
    turnId: string,
    guess: string,
  ): Promise<{
    is_correct: boolean | null
    hint: string | null
    feedback: string
    doubt_logged: boolean
  }> =>
    request(`/classroom/${sessionId}/blank-attempt`, {
      method: 'POST',
      body: JSON.stringify({ turn_id: turnId, guess }),
    }),

  getHintLadder: (sessionId: string, turnId: string) =>
    request(`/classroom/${sessionId}/hint/${turnId}`),

  recordInteractionEvent: (payload: {
    turn_id: string
    event_type: string
    payload: Record<string, unknown>
    is_correct?: boolean | null
  }) => request('/classroom/interaction-event', { method: 'POST', body: JSON.stringify(payload) }),

  // --- plain-chat baseline arm (HLD 6.3) ---
  startBaseline: (conceptId: string) =>
    request('/baseline/start', { method: 'POST', body: JSON.stringify({ concept_id: conceptId }) }),

  getBaselineTranscript: (sessionId: string) => request(`/baseline/${sessionId}`),

  sendBaselineMessage: (sessionId: string, message: string) =>
    request(`/baseline/${sessionId}/message`, { method: 'POST', body: JSON.stringify({ message }) }),

  completeBaseline: (sessionId: string) =>
    request(`/baseline/${sessionId}/complete`, { method: 'POST' }),

  // --- checkpoint ---
  getCheckpoint: (sessionId: string) => request(`/checkpoint/${sessionId}`),

  submitCheckpoint: (sessionId: string, answers: Record<string, string>) =>
    request('/checkpoint/submit', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, answers }),
    }),

  getProgress: () => request('/progress/me'),

  getPendingQuizzes: () => request('/progress/quizzes/pending'),

  submitQuiz: (quizId: string, answer: string) =>
    request(`/progress/quizzes/${quizId}/submit`, { method: 'POST', body: JSON.stringify({ answer }) }),

  closeDoubt: (doubtId: string) => request(`/progress/doubts/${doubtId}/close`, { method: 'POST' }),

  submitVoiceClip: (sessionId: string, blob: Blob) => {
    const form = new FormData()
    form.append('file', blob, 'clip.webm')
    return request(`/voice/${sessionId}/submit`, { method: 'POST', body: form })
  },

  // Dictation for asking a question aloud. Replaces the browser's Web Speech
  // API, which sent the learner's audio to Google while HLD 11.4 promised it
  // went to no third party. Returns 503 while the backend transcriber is mocked.
  transcribeClip: (sessionId: string, blob: Blob) => {
    const form = new FormData()
    form.append('file', blob, 'clip.webm')
    return request(`/voice/${sessionId}/transcribe`, { method: 'POST', body: form })
  },

  getComparativeReport: () => request('/progress/comparative-report'),
}

export { BASE_URL }
