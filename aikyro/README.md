# AI KYRO — Metacognitive AI Scaffold

Working implementation for the ET 617 project. Built against HLD **v5.0** —
section numbers in this file follow v5.0, and the comparative-pairing scheme in
§6.4/§16 (D-03) matches the client's D-03 email as formalised in the agreed HLD.

`PROJECT.md` is the engineering reference: how the system is put together and
why, where it stands against the HLD's acceptance criteria, and what order to
work in. This file covers how to run it and what is still stubbed.

Runs end to end on SQLite with `llm_mode: mock` — **zero API keys needed.**

## What's implemented

### The content contract

Every concept has a **structured record** (`backend/app/content/schema.py`) —
claims, a worked example, a hint ladder, misconceptions, fill-in-the-blanks with
accepted answers, and checkpoint items with rubrics. It is the contract between
all three parts, and it is why the dialogue can draw on a specific claim, grading
can condition on a rubric, and the doubt log can key on a misconception id
instead of free text (HLD T1.7).

It merges two halves:

- **Authored** — `backend/app/content/modules.json` holds the misconceptions,
  key terms, blanks and checkpoint rubrics for all ten pilot concepts. These are
  pedagogical decisions, so they stay reviewable content, not code. Editing this
  file — not the code — is how content scope changes.
- **Compiled** — the verification engine generates the claims, worked example and
  hint ladder across providers and adjudicates them.

`misconception_id` is an **enum drawn from the authored file**, and the loader
fails at startup if any blank or checkpoint item references one that isn't
declared. That is what makes doubt-log rows countable.

> **All ten concepts are flagged `content_reviewed: false`.** The
> misconceptions and rubrics were authored for this build and have **not** had a
> TA/instructor check. `GET /topics/content-review-status` lists what's
> outstanding, `POST /topics/concepts/{id}/mark-content-reviewed` clears one,
> and the comparative report names it as a caveat. This is separate from D-03,
> which asks whether two *paired* concepts are equally hard.

### Part 1 — Verified Knowledge Engine

Parallel generation across providers → disagreement detection → adjudication →
confidence → stored with provenance, cached per concept. Nothing calls a provider
SDK directly; every model call goes through `services/llm_providers.generate()`.

No debate rounds: the gains come from model *heterogeneity*, not from rounds, and
unguided multi-agent debate underperforms a single model self-correcting at 2–3.4×
the tokens. The adjudicator asks for disagreements on two surfaces — **factual**
and **pedagogical** — because frontier models from different families will not
disagree on first-year thermodynamics, so a factual-only adjudicator honestly
reports nothing every time (see "Known limits" below, and PROJECT.md §13 Q1).

### Part 2 — Simulated Classroom

Fixed 7-turn spec — teacher, a student who asks the basics, a student who pushes
further — pre-generated and persisted, then replayed over SSE. Pre-generation is
deliberate: demos are deterministic, a bad dialogue can be fixed by hand, and
resume reduces to "resume from a turn index".

- **Personas are seeded with real misconceptions.** The basic student is confused
  about a *named* difficulty from the authored content; the advanced student
  challenges on another (HLD T2.2, T2.3).
- **Blanks are judged server-side.** The browser sends the guess and gets back a
  verdict and a nudge. Accepted answers never leave the server.
- **Hints are gated on a committed guess** — enforced by the API, not just the UI
  (HLD T2.4).
- **Learner questions are answered in context**, given the turns so far and the
  learner's open doubts, and told not to jump ahead of what the class has covered
  (HLD T2.6).
- **Reduced mode** (`dialogue_mode: "reduced"`) suppresses the basic-student
  persona, keeping the gated hint and the blocking blank (HLD T2.7).
- **SSE resumes.** Events carry their turn index as the SSE id and the endpoint
  honours `Last-Event-ID`, so a dropped connection picks up where it left off
  (HLD T2.10).

### Part 3 — Measurement Layer

- **Concept state ladder** — `not_started → introduced → checkpoint_passed →
  retained`, with demotion. `retained` is reachable only through a delayed check,
  so one long session can't inflate the headline number.
- **The doubt log works.** Entries are written from three server-side paths: a
  wrong blank guess, a hint revealed without a correct guess, and a missed
  checkpoint item. Each carries a `misconception_id` from the authored enum, so
  "doubts closed per learner" is a real number and the per-misconception
  breakdown aggregates.
- **Checkpoints derive from the session.** Items come from the structured record
  the dialogue was built from, each graded against its own rubric, with per-item
  feedback (HLD T3.1).
- **Retention, transfer and linked questions.** Transfer prompts explicitly rule
  out the situation the class worked through (T3.5). A second passed concept gets
  a question linking it to an earlier one (T3.4).
- **The comparative report is real** — proportion reaching `retained`, mean
  transfer score, and doubts closed, per arm, over `condition × ConceptState ×
  QuizResult`, plus the within-learner paired deltas the pre-registered test
  consumes. It states its own caveats rather than presenting mock-graded numbers
  as findings.

### The plain-chat baseline arm

The control condition lives **inside this app** (`/baseline/*`, `/plain-chat/:id`).
Same login, same timer, same checkpoint — just a chat box. Sending learners to a
third-party chat product instead would mean the equal time budget of §6.3 can't
be enforced, nothing from the control arm is logged, and there's no way to verify
a learner completed it.

It deliberately has **no personas, no gated hints, no blanks and no doubt log** —
those are the intervention, and simulating them would destroy the contrast. A
concept assigned to one arm is refused by the other endpoint with a 409, because
taking the same concept in both arms is the one error in this design that can't
be fixed afterwards.

### Security

Every endpoint authenticates and checks ownership server-side (HLD 11.3). The SSE
stream is the one exception to Bearer auth, because `EventSource` cannot send
headers: the client exchanges its token for a **60-second, session-scoped ticket**
(`POST /classroom/{id}/stream-ticket`) and passes that on the stream URL. Access
tokens and tickets are typed so neither works as the other.

Condition assignment is reproducible from a user id via SHA-256 — `hash()` is
randomised per process, so the previous implementation silently gave a learner a
different pair after every restart.

### Other

- **Points & badges** — checkpoints (+10), retention (+15), transfer (+20),
  linked (+15), closing a doubt (+5), awarded server-side. Nothing for revealing
  a hint or for time spent (HLD 13.1).
- **Voice** — teach-back clips record via `MediaRecorder`, post to our backend,
  are scored in memory and discarded. Coverage scores against the record's **key
  terms**, not the concept title. See "Known limits" for the transcriber.
- **Open-topic exploration** — `POST /classroom/start-freeform` runs the same
  classroom on any typed topic, always tagged `general_use`, never entering the
  graded comparison.
- **Screens** — Login, Dashboard, Topic Setup, Classroom, Plain Chat, Checkpoint,
  Progress, Quizzes, Settings (HLD 9.2).

## Running it

Requires **Python 3.10+** and **Node 18+** (Vite 5 and TypeScript 5 will not run
on older Node).

### Backend

```bash
cd aikyro/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload          # http://localhost:8000
```

Interactive API docs: http://localhost:8000/docs

SQLite by default (`aikyro_dev.db`). For Postgres, set `DATABASE_URL` in
`backend/.env` and install `requirements-postgres.txt` instead.

### Frontend

```bash
cd aikyro/frontend
npm install
npm run dev                            # http://localhost:5173
```

Override the API origin with `VITE_API_URL` in a `.env` file.

### Tests

```bash
cd aikyro/backend
python -m pytest
```

105 tests, named after the acceptance criteria in `PROJECT.md` §8 — `test_T2_6_*`
is HLD T2.6, and so on. They run on mocks, so they need no keys. Two are
deliberately not green, and say why in their own docstrings: **T1.2** xfails
(needs ≥2 model families) and **T1.3** skips (no ground-truth source). Everything
else passes.

### Database migrations

Alembic owns the schema. `Base.metadata.create_all` still runs at startup when
`env == "dev"`, and nowhere else.

```bash
alembic upgrade head                                  # apply
alembic revision --autogenerate -m "what changed"     # after editing models.py
alembic check                                         # CI guard against drift
```

Upgrading a dev database created before Alembic existed: `alembic stamp head`
first, or it will try to create tables that are already there.

## Turning on real AI

```bash
cp backend/.env.example backend/.env   # add a key, set LLM_MODE=live
```

One key turns everything on; **two different model families** are needed for
cross-provider verification to mean anything. A gateway (LiteLLM in code,
OpenRouter as the endpoint) gives multiple families from one credential, which is
the recommended route given only one key is available — see PROJECT.md §6.

What changes: verification compiles records from real models and adjudicates
them; the classroom's dialogue turns are generated live, grounded in the verified
claims and aware of what was said earlier; grading judges answers against the
rubrics instead of counting keywords. Blank turns stay authored verbatim even in
live mode, because the server judges guesses against answers written for that
exact wording.

Every live path has a per-call fallback to its mock behaviour, so a bad key or a
rate limit degrades one turn or one grade rather than crashing a session.

## Where to make changes

| Change | Where |
|---|---|
| Concepts, Bloom levels, misconceptions, blanks, checkpoint rubrics, topic pairs | `backend/app/content/modules.json` — content, not code |
| The shape of a concept record | `backend/app/content/schema.py` — the contract between all three parts |
| Providers, voice on/off, DB, CORS, time budget, pass threshold | `backend/app/config.py` |
| Data model | `backend/app/models.py`, then `alembic revision --autogenerate` |
| Model calls | `backend/app/services/llm_providers.py` — never a provider SDK elsewhere |
| Palette and type | `frontend/tailwind.config.js` |

## Known limits

- **T1.2 (disagreement detected and resolved) cannot pass as written.** It needs
  a detected inter-agent disagreement; on first-year material, frontier models
  from different families will not disagree on the facts. The adjudicator records
  pedagogical disagreements too, and records *why* none were found when none
  were. Open with the client — PROJECT.md §13 Q1.
- **T1.3 (an incorrect claim does not survive) is untestable.** There is no
  ground-truth source in the system. Needs the prescribed course text, or a
  human-marked set of wrong claims.
- **Mock grading is keyword coverage, not comprehension.** It discriminates
  between answers — which the old "any non-empty answer passes" rule did not, and
  which matters because a constant score would make every report figure 1.0 — but
  it rewards keyword stuffing and cannot assess reasoning. Every figure it
  produces is labelled as such, in the UI and in the report's caveats.
- **Speech transcription is still mocked**, pending the D1 spike (HLD 10.6).
  Teach-back scoring works against the mock transcript; voice *dictation* returns
  503 and the UI asks the learner to type, rather than passing a canned transcript
  off as their words. Deferring the build is a team decision — speech is a signed
  deliverable (D-02 RESOLVED, §13.1 in scope), so dropping it needs client
  agreement under §17.
- **Live mode is untested against real API responses.** Every live path was built
  and verified against mocked provider calls. Expect to tune the judge and
  grading prompts — particularly the JSON parsing — once real model output is in
  front of you.
- **Accessibility (§11.2) has not been audited.** Keyboard nav mostly works
  because the markup is plain semantic HTML; contrast (T0.3) is unverified.
- **No staging deployment (T0.4).** Note the two infrastructure decisions in
  PROJECT.md §10 before deploying: Render's free Postgres expires after 90 days
  (inside the pilot window — losing the database mid-pilot is unrecoverable), and
  free web services cold-start in 30–50 s.
- **The analysis is not pre-registered.** Send the client the test (paired
  Wilcoxon on the within-learner delta), the target n and the exclusion rules
  *before* data collection. The report endpoint emits the raw paired deltas for
  exactly this.

## Design system

Sidebar app shell, cobalt/ink/amber palette, Source Serif 4 headings + Inter
body. Token names live in `frontend/tailwind.config.js` (`cobalt`, `amber`,
`ink`, `paper`, plus persona colours `teacher`/`basic`/`advanced`/`learner`).
Change the palette there rather than hunting hex codes through components.
