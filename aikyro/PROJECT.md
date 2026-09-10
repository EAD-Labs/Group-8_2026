# AI KYRO — Project Reference

Engineering reference for the ET 617 project *Metacognitive AI Scaffold*.

`README.md` covers how to run the app and what is currently stubbed. This
document covers the parts a README does not: how the system is put together
and why, where it stands against the HLD's acceptance criteria, what is
actually broken, and what order to fix it in.

**Client:** Dr. Balamurali A R, AI KYRO
**Repo:** `github.com/EAD-Labs/Group-8_2026`
**Contract:** HLD (signed at §17). Anything below that contradicts the HLD is
marked as such — it is a proposal to the client, not a silent substitution.

> **Version drift.** Reconciled — `README.md` now follows HLD **v5.0**, as does
> this file.

> **Build status.** The build order in §9 has been executed: the content
> contract, the doubt log, auth on the open endpoints, the stable hash,
> contextual learner answers, checkpoint items from the record, SSE resume,
> reduced mode, the comparative report, Alembic, and a 105-test suite named
> after the criteria in §8. The plain-chat baseline arm (§10) is built. §7 and
> §8 below are annotated with what changed; the open questions in §13 are
> unchanged and still need the client.

---

## 1. Orientation

The product replaces a chat box with a simulated classroom. Three personas —
teacher, basic student, advanced student — work through a concept in a
dialogue the learner watches and can join as a third student. Hints stay
hidden until the learner commits a guess; blanks block progress until filled.
Afterwards a checkpoint runs, and delayed retention and transfer checks follow.

Three parts, sequenced:

| Part | Name | Produces | Status |
|---|---|---|---|
| 1 | Verified Knowledge Engine | one trustworthy record per concept | prose blob, unstructured |
| 2 | Simulated Classroom | the dialogue the learner experiences | working, templated |
| 3 | Learning Measurement Layer | evidence that learning happened | partially wired, doubt log dead |

Part 1 feeds Part 2 feeds Part 3. Part 2 is the only part anyone will judge
by looking at it, and it is the most complete.

---

## 2. Current state, honestly

**Works end to end:** signup and login with JWT; counterbalanced pair and
condition assignment at signup; concept and module listing; session creation;
dialogue generation and persistence; SSE streaming to the Classroom screen;
hint reveal gated on a guess; blocking blanks; learner-as-third-student
questions; checkpoint submission; the concept state ladder with demotion;
retention and transfer scheduling; points and badges; voice clip capture and
submission.

**Runs on mocks:** every LLM call (`llm_mode=mock` by default) and the speech
transcriber (`speech_provider=mock`). The app is fully demoable with zero API
keys, which is a good decision and should be kept.

**Built since:** the structured concept record; misconception identifiers
throughout the content model; a writable doubt log; server-side blank judging;
authentication and ownership on every endpoint; reproducible condition
assignment; contextual learner answers; rubric-conditioned checkpoints derived
from the session; SSE resume; reduced mode; linked questions; the real
comparative report; the in-app plain-chat baseline arm; Alembic migrations; and
a 105-test suite.

**Still not built:** real speech transcription (deferred by decision, see §9);
an accessibility audit; a staging deployment; a pre-registered analysis.

---

## 3. Architecture as built

```
Browser (React 18 + Vite + TS + Tailwind)
  │  fetch + Bearer JWT           EventSource (SSE)
  ▼                                     ▼
FastAPI  ── routers/ ──┬── auth       topics
                       ├── classroom  checkpoint
                       └── progress   voice
                              │
                       services/ ──┬── verification_engine
                                   ├── dialogue_orchestrator
                                   ├── grading_service
                                   ├── measurement_service
                                   ├── speech_signal_service
                                   └── llm_providers  ← every model call
                              │
                      SQLAlchemy 2.0 → SQLite (dev) / PostgreSQL (target)
                              │
                      content/modules.json  ← pilot content, not user data
```

**The one rule worth preserving:** nothing calls a provider SDK directly.
Every model call goes through `services/llm_providers.generate()`. Keep it
that way — it is what makes the provider decision in §6 a config change.

### Request path for a pilot session

1. `POST /classroom/start` with a `concept_id`.
2. `verification_engine.produce_verified_record` — returns the cached record
   if one exists, otherwise generates in parallel across configured providers,
   adjudicates, stores with provenance.
3. `LearningSession` created, carrying the learner's `condition`
   (`platform` / `plain_chat` / `general_use`).
4. `dialogue_orchestrator.build_dialogue` — produces the full turn list **up
   front** and persists it as `DialogueTurn` rows.
5. `GET /classroom/{id}/stream` — replays those stored turns over SSE at
   0.6 s intervals.

Step 4 matters more than it looks. The dialogue is **already pre-generated
and persisted**, not generated live turn by turn. That is the right
architecture: it makes demos deterministic, lets a bad dialogue be fixed by
hand, and reduces "resume after a dropped connection" to "resume from a turn
index". Do not replace it with live generation.

---

## 4. Data model

Defined in `app/models.py`. All ids are UUID strings.

```
User ──┬── LearningSession ──┬── DialogueTurn ── InteractionEvent
       │                     ├── CheckpointResult
       │                     └── VoiceSignalScore
       ├── MasteryRecord          (one per user per concept)
       ├── DoubtLogEntry
       ├── QuizResult             (retention | transfer)
       └── Badge

VerifiedKnowledgeRecord            (shared across learners, cached by concept)
```

Two fields carry more weight than the rest:

- `LearningSession.condition` — the entire comparative study rests on this.
  Every interaction event reaches a condition by joining through its turn to
  its session. Do not add a session path that leaves it unset.
- `User.pilot_condition_map` — the per-concept condition assignment, fixed at
  signup so it cannot drift mid-pilot.

`ConceptState` implements the §6.6 ladder: `not_started → introduced →
checkpoint_passed → retained`, with `demoted` on a failed later check.
`retained` is reachable only through a delayed check, which is what stops a
long session inflating the headline number.

**Migrations:** none. `Base.metadata.create_all` runs at startup. Fine for
SQLite dev, not fine the moment PostgreSQL holds pilot data. Add Alembic
before the first deploy that anyone signs into.

---

## 5. Content model

`app/content/modules.json` holds the pilot content: two modules, five
concepts each, four graded pairs matched by Bloom tier, two concepts excluded
from the graded comparison. `content/loader.py` reads it and performs the
counterbalanced assignment.

Editing this file — not the code — is how content scope changes. That
separation is correct and should be defended.

### The gap: misconceptions are not modelled

The HLD gives every concept a *known learner difficulty* — "confusing system
with surroundings", "reading P(A|B) as P(B|A)", "treating reversible as
runnable backwards". **None of these are in `modules.json`.** The basic
student persona therefore has nothing specific to be confused about, and the
doubt log has nothing to key on.

This is the highest-leverage change available. Proposed shape:

```json
{
  "id": "sign_conventions_work_heat",
  "name": "Sign conventions for work and heat",
  "bloom_level": "apply",
  "misconceptions": [
    {
      "id": "sign_convention_reversed",
      "statement": "Applies the formula without asking which direction is positive",
      "probe": "Work is done BY the gas. Is W positive or negative in your convention?"
    }
  ]
}
```

Once `misconception_id` is an enum drawn from this file rather than free
text, four things follow at once: the basic student's questions become
specific, `DoubtLogEntry.misconception` becomes aggregatable, the client's
third report figure becomes a number rather than a pile of strings, and open
doubts can seed later dialogues as §6.6 requires.

---

## 6. The LLM layer

`services/llm_providers.py`. Two modes, set by `llm_mode`:

- `mock` — canned responses, no keys, everything runs.
- `live` — direct httpx calls to Anthropic and OpenAI REST endpoints.

Providers are listed in `settings.llm_providers`; order is preference for
single-provider tasks (adjudication, grading). Any provider whose key is
missing fails inside its own call and is caught per-provider, so one missing
key degrades one agent rather than the pipeline.

### Provider strategy

The evidence on multi-model verification is specific, and it does not say
what the HLD assumes:

- **Do not run debate rounds.** Unguided multi-agent debate underperforms a
  single model self-correcting while costing 2–3.4× the tokens, through
  sycophantic conformity and plurality voting discarding correct answers.
- **The gains come from model *heterogeneity*, not from rounds** — different
  model *families*, one pass, one adjudication. Same-family agents add
  opinions, not information.
- **Intrinsic self-correction is not a hallucination fix either.** A model
  reviewing its own answer with no external signal often does worse than
  answering once. What removes error is *external* information: the
  prescribed course text, executed arithmetic, or a genuinely different
  model family.

The useful test for any proposed verification step: **does this add
information, or only opinions?**

### Consequence for the one-key situation

With a single key configured, `_adjudicate_live` never runs — it requires
`len(answers) >= 2` — so every record takes the naive first-answer-wins path
and no disagreement is ever recorded. See T1.2 in §8.

Recommended: keep `llm_providers` as the abstraction, but point it at a
gateway (LiteLLM in code, OpenRouter as the endpoint) so one credential
yields multiple model families. This satisfies both the HLD's two-provider
requirement and the practical fact that only one key exists.

### Model tiering

Cost lives almost entirely in when a call runs, not which model runs:

- **Build-time** — record compilation, adjudication, dialogue scripting. Runs
  roughly ten times for the whole pilot. Use the strongest model available;
  cost is irrelevant at this volume.
- **Runtime** — third-student answers, blank checking, checkpoint grading.
  Use the cheapest model that passes grading tests.

---

## 7. Known defects

Ordered by consequence. Each was real and reproducible from the code as it
stood; each now carries a note on how it was resolved and which test holds it
down. The original diagnosis is kept verbatim — it is the record of why the code
looks the way it does now.

### D1 — The doubt log can never be written to *(blocking)* — **FIXED**

`log_doubt` is reachable from exactly one place: the `is_correct is False and
"misconception" in payload` branch in `routers/classroom.py →
record_interaction_event`. The frontend's `submitGuess` in `Classroom.tsx`
calls with `correct = null` and a payload of `{ guess }` — no `is_correct`,
no `misconception`, no `concept_id`.

So the branch never fires, and no `DoubtLogEntry` is ever created. "Doubts
closed per learner" is one of the three figures the client report promises,
and it is the one a plain-chat baseline structurally cannot produce.

Fix requires §5 first: blanks need an expected answer and a
`misconception_id` before a guess can be judged wrong against anything.

**Resolved.** Blanks carry `expected_answers` and a `misconception_id` in
`modules.json`, and judging moved server-side to
`POST /classroom/{id}/blank-attempt`. The frontend sends the guess and no
verdict — it never receives the answer, so the gate is real. Three paths now
write entries: a wrong guess, a reveal without a correct guess, and a missed
checkpoint item. One open entry per (learner, concept, misconception), so the
figure counts difficulties rather than attempts. Held by
`test_D1_*` in `tests/test_part2_classroom.py`.

### D2 — Learner questions ignore the dialogue *(fails T2.6)* — **FIXED**

`dialogue_orchestrator.insert_learner_question` receives only
`verified_text` and the concept name. It never sees the turns so far. T2.6
requires the answer to "refer to the dialogue so far, not a generic
response", and it cannot.

Fix: pass turns `1..n` from the session and instruct the model to answer
within what has been covered and not jump ahead. Small change, directly buys
an acceptance criterion.

**Resolved.** `insert_learner_question` takes `prior_turns` and the learner's
open doubts, and is told not to introduce material the class has not reached.
The mock path satisfies T2.6 by construction — it quotes the most recent
speaker — so a zero-key demo exercises the criterion rather than faking it.
Held by `test_T2_6_*`.

### D3 — Three endpoints have no authentication *(violates §11.3)* — **FIXED**

`GET /classroom/{id}/stream`, `POST /classroom/{id}/question` and
`POST /progress/doubts/{id}/close` take no `get_current_user` dependency and
perform no ownership check. Any caller with a session id can read another
learner's dialogue or post into it; `close_doubt` lets any signed-in user
close another learner's doubt and collect the points.

§11.3 requires ownership "checked server-side on every request". Add the
dependency and filter by `user_id`.

**Resolved.** Every endpoint takes `get_current_user` and filters by `user_id`,
returning 404 rather than 403 so the API is not a membership oracle over session
ids. The SSE stream could not simply take the Bearer token — `EventSource` cannot
send headers — so it authenticates with a 60-second, session-scoped ticket from
`POST /classroom/{id}/stream-ticket`; tokens and tickets are typed so neither
works as the other. Held by eleven `test_D3_*` cases in
`tests/test_cross_cutting.py`.

### D4 — Condition assignment is not reproducible — **FIXED**

`content/loader.assign_pilot_condition` uses `hash(user_id)` to pick a pair.
Python randomises string hashing per process, so the same user id maps to
different pairs across restarts, despite the docstring claiming otherwise.
It survives today only because the result is written to
`User.pilot_condition_map` at signup and never recomputed — a latent trap,
not a working design.

Fix: use a stable digest, e.g. `int(hashlib.sha256(user_id.encode())
.hexdigest(), 16) % len(pairs)`. Also seed the `random.shuffle` from the
user id so condition assignment is reproducible for the pilot analysis.

**Resolved.** Both the pair choice and the within-pair shuffle derive from one
SHA-256 digest of the user id, so the analysis can recompute any learner's
assignment from their id alone. `test_D4_assignment_is_stable_across_processes`
runs it in subprocesses with `PYTHONHASHSEED=random`, which is the only way the
original bug was ever visible.

### D5 — The verified record is an unstructured blob *(fails T1.7)* — **FIXED**

`_build_prompt` asks for a prose explanation, and the record stores
`verified_text` as free text. T1.7 requires content "segmented and
addressable so the dialogue layer can draw on specific points".

Downstream cost: the dialogue layer can only paste the blob into prompts, and
`grading_service` has no rubric to condition on — it grades against a
paragraph. Rubric-conditioned grading measurably outperforms unconditioned
grading, and the rubric should be coming from this record.

Fix: make the record a structured object — claims, worked example,
misconception list, checkpoint items with rubrics, hint ladder, blank
candidates — as Pydantic models. This schema is the contract between all
three parts and is the thing to define first.

**Resolved.** `app/content/schema.py` defines `StructuredConceptRecord`, stored
on `VerifiedKnowledgeRecord.structured`. `verified_text` survives as a *derived*
prose rendering so the classroom board keeps working. Authored fields always win
over compiled ones on merge, because `misconception_id` is an enum the doubt log
groups on and a model must not extend it. Held by `test_T1_7_*`.

### D6 — The Web Speech API contradicts the stated privacy position — **FIXED**

`Classroom.tsx` uses `window.SpeechRecognition / webkitSpeechRecognition` for
voice question input. That is Chrome-only, provides no word timings, and
sends audio to Google — while §11.4 states raw media is "never transmitted to
third parties". The `MediaRecorder` path used for the teach-back clip is the
correct one.

Fix: route voice question input through the same `MediaRecorder` → backend
path, or disclose the browser speech service explicitly in §11.4.

**Resolved** by the first option. `window.SpeechRecognition` is gone from the
codebase; dictation records with `MediaRecorder` and posts to
`POST /voice/{id}/transcribe`. Because the transcriber is still mocked, that
endpoint returns 503 and the UI asks the learner to type — returning the canned
mock string would put words in their mouth. `/voice/status` reports
`transcription_usable` so the mic button is hidden rather than offering something
that cannot work. Text-to-speech is kept: it is a different API and sends
nothing anywhere. The false privacy claim on the Settings screen was corrected.

### D7 — SSE has no resume *(fails T2.10)* — **FIXED**

`stream_dialogue` emits SSE events without ids and ignores `Last-Event-ID`.
On a dropped connection `EventSource` reconnects and replays the dialogue
from turn 0, losing the learner's position.

Fix: set each event's SSE id to the turn index and resume from
`Last-Event-ID + 1`. Cheap, because turns are already persisted.

**Resolved** exactly as described. `Last-Event-ID` is also accepted as a query
parameter for clients not using `EventSource`, a malformed value restarts rather
than dropping the lesson, and `GET /classroom/{id}/turns` lets a client reconcile
after a failed reconnect. Held by `test_T2_10_*`.

### D8 — Smaller items — **ALL FIXED**

- ~~`CORS allow_origins` is hardcoded to `http://localhost:5173`~~ — now
  `settings.cors_allow_origins`, overridable from `.env`. `Last-Event-ID` is
  exposed, or SSE resume would silently degrade across origins.
- ~~`@app.on_event("startup")` is deprecated~~ — replaced with a lifespan
  handler, which also validates `modules.json` before serving a request and
  restricts `create_all` to `env == "dev"`.
- ~~`_score_coverage` does naive substring matching on the concept name only~~ —
  scores against the record's `key_terms`, crediting a multi-word term when its
  head and tail words both appear, and returns which terms were covered.
- ~~`expected_terms` in `routers/voice.py` passes only `[concept["name"]]`~~ —
  reads `key_terms` from the session's structured record.
- ~~No tests exist anywhere in the repo~~ — 105 tests named after the §8
  criteria. Also fixed in passing: Pydantic v1-style `class Config`, a
  repeat-submitted voice clip violating the one-per-session unique constraint,
  and a clip-size guard.

---

## 8. Acceptance criteria status

Assessed against the code as it stands, not against intent. Every row names the
test that holds it, in `backend/tests/`. Run `python -m pytest` to reproduce.

### Part 1 — Verified Knowledge Engine

| Test | Status | Note |
|---|---|---|
| T1.1 record stored with contributing providers | pass | `provenance.providers_used`, plus `providers_attempted` so a degraded record is visible |
| T1.2 disagreement detected, resolved, stored | **xfail** | needs ≥2 model families. The *reason* none was detected is now stored, which is the minimum for reporting it honestly — see below |
| T1.3 incorrect claim does not survive | **skip** | no ground truth to check against; kept in the suite so it stays visible |
| T1.4 cached record returned, no new calls | pass | asserted by monkeypatching `generate` and proving zero calls |
| T1.5 one provider down → lower confidence | pass | degraded record cannot claim confidence 1.0 |
| T1.6 all providers down → recoverable | pass | session, dialogue and checkpoint all survive on authored content |
| T1.7 content segmented and addressable | pass | D5 — addressable by id, with rubrics |

> **T1.2 may be unsatisfiable in principle.** It requires a detected
> inter-agent disagreement. On first-year thermodynamics and probability,
> frontier models from different families will not disagree on the facts. The
> honest routes are to move the disagreement surface from facts to *pedagogy*
> — which misconception to target, how to frame a sign convention, which
> worked example is clearest, where models genuinely differ — or to record
> that no factual disagreement arose and report that as the finding. Raise
> with the client before D2 rather than at it.
>
> **Both routes are now implemented, pending the client's answer.** The
> adjudicator asks for disagreements tagged `factual` or `pedagogical` and
> stores per-surface counts, so a report can state "0 factual, 3 pedagogical"
> rather than showing a pile of strings. When nothing is detected, the reason is
> stored instead — with one provider, that it could not be detected at all.
> `test_T1_2_*` asserts the honest state and xfails with the recorded reason
> rather than being weakened to green. This is a proposal, not a substitution:
> §13 Q1 still needs the client.

### Part 2 — Simulated Classroom

| Test | Status | Note |
|---|---|---|
| T2.1 three personas, correct answer reached | pass | fixed 7-turn spec, Bloom progression asserted |
| T2.2 basic student asks a foundational question | pass | seeded with a named misconception and its probe |
| T2.3 advanced student challenges, not just agrees | pass | boundary turn targets a declared misconception and is put as a question |
| T2.4 reveal blocked until a guess is committed | pass | now enforced by the API (409), not only by the UI |
| T2.5 dialogue does not continue past a blank | pass | `pendingInteractive` freeze; blank arrives with a prompt and no answer |
| T2.6 learner question answered in context | pass | D2 |
| T2.7 reduced mode suppresses basic student | pass | a filter on the spec; hint and blank survive it |
| T2.8 points and badges behave as specified | pass | `BADGE_CATALOG`, `POINTS` |
| T2.9 keyboard reachable | unverified | still needs an a11y pass — see §9 |
| T2.10 resume after connection drop | pass | D7 |

### Part 3 — Measurement Layer

| Test | Status | Note |
|---|---|---|
| T3.1 checkpoint derives from this dialogue | pass | items from the session's record, each graded on its own rubric |
| T3.2 retention quiz scheduled and available | pass | and provably not takeable on the day of learning |
| T3.3 wrong answer re-queues the concept | pass | demote + reschedule |
| T3.4 new question linked to a learned concept | pass | `schedule_linked_question`, from the second passed concept on |
| T3.5 transfer problem in an uncovered situation | pass | prompt explicitly rules out the worked example the class used |
| T3.6 derived scores stored, no raw media | pass | asserted against the model's columns, not just the code path |
| T3.7 declining capture leaves core working | pass | typed fallback throughout |
| T3.8 progress view shows mastery, gaps, points | pass | gaps are real rows now (D1) |
| T3.9 comparative evaluation reportable | pass | real queries, paired deltas, and self-stated caveats |

### Cross-cutting

| Test | Status |
|---|---|
| T0.1 first-time user completes a topic unaided | pass — executed end to end in `test_T0_1_*` |
| T0.2 builds from a clean clone | pass |
| T0.3 contrast meets 4.5:1 | unverified |
| T0.4 client completes a topic on staging | not deployed |

---

## 9. Build order

Sequenced so each step unblocks the next rather than by apparent size.

> **Executed.** Everything numbered below is done, in this order. What remains is
> listed under "Still outstanding" at the end of this section.

**First — the content contract.** Define the structured concept record as
Pydantic models and add misconceptions to `modules.json` (§5, D5). Every
remaining item depends on this existing. Nothing else should start first.

*Done.* `app/content/schema.py`, plus 29 misconceptions, 19 blanks and 19
rubric-bearing checkpoint items across all ten pilot concepts. **All ten are
`content_reviewed: false`** — they were authored for this build and still need a
TA/instructor check before a pilot runs on them.

**Then, in order:**

1. **Doubt log** (D1) — blanks carry expected answers and misconception ids;
   the frontend sends `is_correct` and `misconception_id`; grading writes
   entries. Restores the client's third report figure.
2. **Auth on the open endpoints** (D3) and the stable hash (D4). Both are
   under an hour and one is a security hole.
3. **Contextual learner answers** (D2) — buys T2.6.
4. **Checkpoint items from the record** — buys T3.1, and makes grading
   rubric-conditioned rather than blob-conditioned.
5. **SSE resume** (D7) — buys T2.10.
6. **Reduced mode** (T2.7) — a filter on the turn spec, roughly ten lines.
7. **Comparative report** (T3.9) — real queries over
   `condition × ConceptState × QuizResult`.
8. **Alembic**, before any deploy holding real data.
9. **Tests** — start with the acceptance criteria above as the test names.
   They are already written as test cases; make them executable.

**Still outstanding:**

1. **TA/instructor review of the authored content** (`content_reviewed: false` on
   all ten concepts) and of the four graded pairs (`difficulty_reviewed: false`,
   D-03). Both are tracked by endpoints and surfaced in the report's caveats, but
   neither is a code task — they need the course team.
2. **Accessibility pass** (T2.9, T0.3, §11.2) — keyboard reachability and a 4.5:1
   contrast check. Nothing has been audited.
3. **Staging deployment** (T0.4), taking the two hosting decisions in §10 *before*
   deploying rather than after.
4. **Pre-register the analysis** — the report endpoint already emits the raw
   within-learner paired deltas for it.
5. **Tune the live-mode prompts** against real model output. Every live path was
   verified against mocked calls only.

**Deferred by decision:** speech. The transcriber stays mocked and the
interface stays wired. Note that speech is a *signed* deliverable — D-02
marks it RESOLVED, §13.1 places it in scope, §10.6 commits the D1 spike to a
client review. Deferring the build is a team decision; dropping it needs
client agreement under §17. Cheapest way to keep both: still run the D1
spike, report the result, then defer the build with evidence in hand.

---

## 10. Infrastructure notes

Two hosting decisions worth taking before deployment rather than after:

- **Render's free PostgreSQL expires after 90 days.** Started in late August,
  that lands inside the pilot window. Losing the database mid-pilot ends the
  comparative evaluation and is not recoverable. Use Neon or Supabase, or pay
  for the tier.
- **Render's free web services spin down when idle**, giving a 30–50 s cold
  start — which is the client's first click at a Wednesday review. Budget the
  paid starter tier at least for review weeks.

**Baseline condition.** Build the plain-chat arm *inside this app* rather
than sending learners to ChatGPT. Same login, same timer, same quiz delivery,
just a chat box. Otherwise the equal time budget promised in §6.3 cannot be
enforced, nothing from the control condition is logged, and there is no way
to verify a learner completed it.

**Pre-register the analysis.** Send the client the test (paired Wilcoxon on
the within-learner delta), the target n, and the exclusion rules before data
collection starts. An hour of work, and it is the difference between a result
and a story.

---

## 11. Running it

```bash
# Backend
cd aikyro/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000

# Frontend
cd aikyro/frontend
npm install
npm run dev                            # http://localhost:5173
```

Runs fully on mocks with no keys. To use real models, copy
`backend/.env.example` to `backend/.env`, add a key, set `LLM_MODE=live`.
Never commit `.env` — it is gitignored, keep it that way.

---

## 12. Repository conventions

- Work happens in `Group-8_2026/`. It is the clone of the course repository
  and the only git repository that should exist in this tree.
- `main` tracks `origin/main`. Branch per deliverable (`d3-classroom`,
  `d4-measurement`) and merge on milestone review.
- Content changes go in `modules.json`, not in code.
- Model calls go through `services/llm_providers`, never a provider SDK.
- Secrets stay in `.env`, server-side only.

---

## 13. Open questions for the client

1. **T1.2.** Can the disagreement requirement be reframed toward pedagogical
   rather than factual disagreement, given that frontier models will not
   disagree on first-year material?
2. **Grounding.** Is compiling concept records against the prescribed course
   text acceptable, or is inter-model agreement itself the artifact the
   client wants to see?
3. **API access.** Still listed as *Pending* against a 23 August due date. A
   gateway credential unblocks the multi-family requirement with one key.
4. **Speech.** Confirm that deferring the build — while still running and
   reporting the D1 spike — is acceptable under §17.
5. **D-03.** All four graded pairs still show `difficulty_reviewed: false`.
   The TA/instructor difficulty check is the last thing standing between D-03
   and resolved.
