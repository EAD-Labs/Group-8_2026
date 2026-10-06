# AI KYRO — Metacognitive AI Scaffold

Working scaffold for the ET 617 project, built off HLD v2.5 (the comparative-
pairing scheme in §6.4/§16 D-03 matches the client's earlier D-03 email, now
formalized in the agreed HLD). Not a finished product — a real, running
skeleton with mocked AI calls so you can develop against it before the D1
voice spike and real LLM keys are ready, and so it's easy to change as the
HLD changes.

## What's actually implemented

- **Auth** — signup/login (JWT). Signup assigns a counterbalanced topic pair
  and platform/plain-chat condition per learner, per HLD §6.4 / D-03.
- **D-03 tracking** — `GET /topics/d03-status` and
  `POST /topics/pairs/{pair_id}/mark-reviewed` track whether each graded
  pair has had its TA/instructor difficulty check; the Dashboard shows an
  "open" banner until all four are reviewed, matching the decision log in
  HLD §16 (D-03 is explicitly still OPEN as of v2.5).
- **Part 1 — Verified Knowledge Engine** — parallel mock "providers" generate
  an answer, a placeholder disagreement/adjudication pass reconciles them,
  result is cached per concept.
- **Part 2 — Simulated Classroom** — a templated teacher/basic-student/
  advanced-student dialogue is built from the verified record and streamed
  to the frontend over SSE, with hint-reveal, fill-in-blank, and a
  learner-as-third-student question box.
- **Part 3 — Measurement Layer** — concept state ladder (not_started →
  introduced → checkpoint_passed → retained, with demotion), doubt log,
  retention-quiz scheduling, and a stub comparative-report endpoint.
- **Voice path** — fully wired end to end now, not just the backend: the
  Classroom screen records a real clip via `MediaRecorder`, submits it,
  and shows the coverage score / hesitation flags. Still running against a
  mock transcriber until the D1 feasibility spike (HLD 10.6) picks
  AI4Bharat vs. Whisper — swap the transcriber, not the UI, when that's
  ready. Mic permission or transcription failures always fall back to a
  clear message telling the learner to type instead — voice is never a
  hard blocker, per HLD 10.6's degradation requirement.
- **Voice Q&A** — separate from the teach-back scoring above: the question
  box in the Classroom has a mic button (Web Speech API `SpeechRecognition`,
  client-side, no backend round trip) so you can *ask* a question by voice,
  and a "Read aloud" toggle that has the browser's speech synthesis speak
  each AI turn as it streams in (plus a per-message speaker icon to replay
  any single line). Both degrade silently to text-only in browsers that
  don't support the Web Speech API (Safari mostly) — the mic/toggle simply
  don't render.
- **Points & badges** — real, not stubbed: checkpoints (+10), retention
  checks (+15), transfer problems (+20), and closing a doubt (+5) all award
  points server-side; a small badge catalog (`measurement_service.
  BADGE_CATALOG`) awards on milestones (first checkpoint, 5 questions asked,
  3 retentions passed, first transfer solved). Per HLD 13.1, nothing is
  awarded for revealing a hint or for time spent.
- **Retention checks & transfer problems now have a screen** — `/quizzes`
  lists what's due. Transfer problems are available immediately after a
  checkpoint pass; retention checks unlock only on their scheduled date
  (backend enforces this — HLD 6.6 "never on the day the concept was
  learned"). A passed transfer problem also bumps the recorded Bloom level.
- **Open-topic exploration** — `POST /classroom/start-freeform` (Topic
  Setup screen: "Ask about anything") lets a learner type any topic, not
  just the pilot's fixed concept list. This runs the same teacher/student
  classroom pipeline but is always tagged `general_use` — it never enters
  the graded platform-vs-plain-chat comparison, since the HLD scopes that
  comparison to the two pilot modules and treats open-topic support as
  future work ("out of scope for this build").
- **Screens** — Login, Dashboard, Topic Setup, Classroom, Checkpoint,
  Progress, matching the HLD 9.2 navigation map.

Everything above is functional end to end against SQLite with `llm_mode:
mock` — you can run it today with zero API keys.

## What's deliberately stubbed, so you know where to dig in later

| Area | File | What's stubbed |
|---|---|---|
| Real LLM calls | ~~`backend/app/services/llm_providers.py`~~ | done — real Anthropic + OpenAI calls over plain `httpx`. Add your keys and see "Turning on real AI" below |
| Disagreement detection / adjudication | ~~`backend/app/services/verification_engine.py`~~ | done in live mode — a judge LLM call reconciles the providers' answers; falls back to naive first-answer-wins in mock mode or if the judge call fails |
| Answer scoring | ~~`backend/app/services/grading_service.py`~~ | done in live mode — an LLM judges checkpoint/quiz answers against the verified explanation; falls back to non-empty-passes in mock mode |
| Dialogue content | ~~`backend/app/services/dialogue_orchestrator.py`~~ | done in live mode — each of the 7 turns is generated live, grounded in the verified explanation and building on prior turns; falls back to fixed templates in mock mode |
| Real speech models | `backend/app/services/speech_signal_service.py` | mock transcript/timing — wire in after the D1 spike; UI/recording already works |
| Points/badges | ~~`backend/app/routers/progress.py`~~ | done — real point values and a small badge catalog, see `measurement_service.py` |
| Comparative report aggregation | `backend/app/services/measurement_service.py::comparative_report` | needs real queries once pilot data exists |
| Voice capture UI | ~~`frontend/src/pages/Classroom.tsx`~~ | done — records via `MediaRecorder`, submits, shows score |

## Turning on real AI

The whole pipeline (verification, adjudication, classroom dialogue, and
grading) runs on real providers once you add keys. It's not all-or-nothing:

1. `cp backend/.env.example backend/.env`
2. Fill in `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` (one is enough to
   turn everything on; two enables actual cross-provider checking).
3. Set `LLM_MODE=live` in that same `.env` file.
4. Restart the backend.

What changes, concretely:
- **Verification** (`verification_engine.py`) — with two keys, both
  providers actually answer, and a judge call reconciles disagreements
  into one verified explanation with a real confidence score. With one
  key, that provider's answer is used directly.
- **Classroom dialogue** (`dialogue_orchestrator.py`) — all 7 turns
  (teacher intro, student doubts, hint, blank, boundary case, wrap-up) are
  generated live, each grounded in the verified explanation and aware of
  what was said earlier in the same lesson, instead of fixed templates.
- **Grading** (`grading_service.py`) — checkpoints and quizzes are judged
  against the verified explanation for actual understanding, not just
  "did you type something."

Every one of these has a per-call try/except that falls back to the mock
behavior on failure (bad key, rate limit, network blip) — a flaky API call
degrades that one turn/grade, it doesn't crash the session. Model names are
settings (`anthropic_model` / `openai_model` in `config.py`), not
hardcoded, since provider lineups move fast — check the docs links in
`.env.example` if a model name stops working.

## Where to make changes as the HLD changes

- **Pilot content, Bloom levels, topic pairs** → edit
  `backend/app/content/modules.json` only. Nothing else needs to change —
  the loader, the assignment logic, and every route read from this file.
- **Which providers / whether voice is on / DB location** →
  `backend/app/config.py`. One settings object, not scattered constants.
- **Data model** → `backend/app/models.py`, mapped 1:1 to HLD 8.2/8.3
  entities, with comments pointing back at the relevant HLD section.

## Running it

### Backend
```
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Uses SQLite by default (`aikyro_dev.db`, auto-created) — no C compiler or
extra system packages needed. Swap `database_url` in `app/config.py` (or a
`.env` file) for Postgres when ready — the HLD calls for managed Postgres in
the actual deployment. When you do that, install
`pip install -r requirements-postgres.txt` instead (adds `psycopg2-binary`,
which needs a compiler on some platforms — see that file's comment if the
build fails on Windows).

Interactive API docs: http://localhost:8000/docs

### Frontend
```
cd frontend
npm install
npm run dev
```
Runs on http://localhost:5173, points at the backend on :8000
(override with `VITE_API_URL` in a `.env` file).

## Suggested next steps, in HLD order

1. Add API keys and flip `LLM_MODE=live` (see "Turning on real AI" above),
   then actually read through some real generated dialogue/grading output
   and tune the prompts in `dialogue_orchestrator.py` / `grading_service.py`
   — they're solid starting points, not final-tuned.
2. Run the D1 voice feasibility spike (HLD 10.6); wire the winner into
   `speech_signal_service.py`.
3. Get the client's TA/instructor difficulty sanity-check on the four
   `graded_pairs` in `modules.json` (D-03, HLD §16 — explicitly still OPEN
   in v2.5) and call `POST /topics/pairs/{pair_id}/mark-reviewed` for each
   once confirmed.
4. Move off SQLite to managed Postgres for anything beyond local dev.

## Design system

Sidebar app shell (not a top-nav SaaS layout), cobalt/ink/amber palette,
Source Serif 4 for headings + Inter for body — see `tailwind.config.js` for
the token names (`cobalt`, `amber`, `ink`, `paper`, plus the four persona
colors `teacher`/`basic`/`advanced`/`learner`). Change the palette there,
not by hunting for hex codes across components.

## Still-honest gaps (not built)

- **Accessibility (HLD §11.2)** — no WCAG pass done; keyboard nav mostly
  works because it's plain semantic HTML, but nothing's been audited.
- **Offline graceful-failure (HLD §11.6)** — a dropped connection currently
  just errors out, no retry/resync.
- **Real speech transcription** — voice recording/scoring UI is real, the
  transcriber behind it is still mock until the D1 spike (see table above).
- **Live mode is untested against real API responses** — I built and
  verified every live-mode code path (adjudication, dialogue generation,
  grading) against mocked provider calls, since I don't have API keys to
  test with. The logic is sound, but real model output is messier than a
  mock — expect to tune the judge/grading prompts once you're actually
  looking at Claude/GPT responses, especially the JSON-verdict parsing if a
  model wraps its answer differently than expected.
- **Comparative report aggregation** — still returns `null`s until pilot
  data exists and the real aggregation queries are written.
