# HLD traceability — what is built, how it is tested, what is still open

Reference: *High-Level Design (HLD) Document and Contract, v5.0 — Metacognitive AI Scaffold (AI KYRO)*.
Status key: **Done** = implemented and tested; **Partial** = implemented, with a stated gap; **Open** = not done / needs something only the team can provide.
Evidence: `tests/*.test.ts` run with `npm test` (no browser needed); `e2e/*` run with `npm run test:e2e` against a running dev server (see `e2e/README.md`).

## Part 1 — Verified Knowledge Engine (D2)

| ID | Expected result | Status | Evidence / note |
|---|---|---|---|
| T1.1 | Verified record stored; lists who produced it | **Done (single AI)** | `tests/engine.test.ts` and `e2e/live-verify.ts` (real route, streamed progress and UI, against a stand-in for the app's one AI). The record says it was *drafted and reviewed by the same AI*. |
| T1.2 | Disagreement, resolution **and reasoning** stored | **Done (single AI)** | With one AI the “disagreement” is a correction the review pass made to the first draft; both versions, the resolution and the reasoning are stored and shown. Seeded pilot records carry documented textbook conflicts. |
| T1.3 | Incorrect claim does not survive into the record | **Done** | `engine.test.ts`, including a safety net that strips a rejected claim the adjudicator carelessly kept. Real-model error behaviour is untested. |
| T1.4 | Repeated topic served from cache, no provider calls | **Done** | `engine.test.ts` (re-typed topic also hits the cache). Server cache is per-process; the browser also caches live records. |
| T1.5 | One provider down → proceed, lower confidence | **Adapted** | Not applicable with a single AI. Equivalent: if the review pass cannot run, the draft is kept and marked low confidence (`engine.test.ts`). |
| T1.6 | All providers down → recoverable error, retry offered | **Done** | `engine.test.ts`; `e2e/live-verify.ts` stops the vendors and checks the message, the Retry button, that the pilot topics keep working, and that Retry succeeds once they return. |
| T1.7 | Content segmented and addressable | **Done** | Every claim has an id and role; blanks/hints point at claim ids (`engine.test.ts`, `hld.test.ts`). |
| — | ≥2 providers behind a provider-agnostic adapter (HLD §7/§10.3) | **Not used — decision** | The team decided on a single AI (the app's existing one). The multi-vendor adapter was removed. Confidence for new topics is capped at *medium* because a model reviewing itself cannot earn *high*. |
| — | Seeded demo topics (HLD D5) | **Done** | 10 pilot concepts as *seeded-reference* records (authored; their recorded disagreements are documented textbook conflicts, not live model transcripts — they say so). |

## Part 2 — Simulated Classroom (D3)

| ID | Expected result | Status | Evidence / note |
|---|---|---|---|
| T2.1 | Three personas contribute; reasoning reaches the answer | **Done** | `hld.test.ts`; `e2e/journey.ts` (21-turn dialogue). |
| T2.2 | Basic student asks a foundational question | **Done** | `hld.test.ts`. |
| T2.3 | Advanced student probes | **Done** | `hld.test.ts`. |
| T2.4 | Reveal blocked until a guess is committed | **Done** (the plain **Hint** button on ordinary answer boxes is also kept: it shows a nudge, never the answer) | `hld.test.ts`; `e2e/journey.ts` (card hides “Reveal” behind “Commit guess”). |
| — | Quick-check popups (multiple choice / fill-in-the-blank with choices) | **Done (addition)** | `tests/hld.test.ts`, `e2e/quickchecks.ts`: 2 per concept in full class, 1 in reduced; deterministic; non-blocking; +2 points on a correct first answer; a slip opens a named doubt; works by keyboard. Not required by the HLD — added on the team's request. |
| T2.5 | Dialogue does not continue past an unanswered blank | **Done** | `hld.test.ts`; `e2e/journey.ts` (Next arrow disabled). |
| T2.6 | Third-student answer refers to the dialogue so far | **Done** | `e2e/journey.ts` — works without AI (answer cites what Maya said “a moment ago”). With a key the AI receives the dialogue so far; not exercised live. |
| T2.7 | Reduced mode suppresses basic student, shorter | **Partial** | Unit-tested (`hld.test.ts`: 16 vs 21 turns). Mode switch is in Topic Setup; not yet driven in a browser test. |
| T2.8 | Points and badges behave as specified | **Partial** | Points only for guesses-before-reveal, first-try blanks, closed doubts, checkpoint/transfer/retention passes — never for revealing or time (`hld.test.ts`, journey). The HLD does not give badge thresholds, so the ones used (module badge = all concepts Retained and none demoted; 4 participation badges) are our proposal — **confirm with the client**. |
| T2.9 | Keyboard-only path for reveal / fill / ask / submit | **Done** | `e2e/keyboard.mjs` never touches the mouse: Tab reaches navigation; the pop-up answer box, blank input, hint guess box and checkpoint box take focus automatically; Enter submits, Space reveals; the doubt bar and Send are reachable. Disabled controls are skipped (no keyboard trap). Every control reached by Tab shows a visible focus ring (see QA). |
| T2.10 | Connection drop → transcript and answers preserved, dialogue resumes | **Partial** | Reload mid-dialogue resumes at the same turn with points kept (`e2e/journey.ts`). **Open:** no explicit offline banner / automatic re-sync UI. |
| — | Turn-by-turn streaming | **Partial** | Turns are revealed one by one at reading pace; the dialogue is composed from the verified record, not streamed token-by-token from an LLM. |

## Part 3 — Learning Measurement Layer (D4)

| ID | Expected result | Status | Evidence / note |
|---|---|---|---|
| T3.1 | Checkpoint derives from this dialogue | **Done** | Checkpoint quotes the advanced student's actual probe (`hld.test.ts`, journey). Checkpoint is mandatory/blocking. |
| T3.2 | Retention quiz scheduled and available days later | **Done** | Journey: pass checkpoint → “next delayed check in 3 days” → clock +3 days → quiz due → pass → **Retained**. Interval is configurable 3–5 days. The **demo clock** (Settings → Demo & evaluation) fast-forwards time for presentations; it only shifts how the app reads the date. |
| T3.3 | Failed retention check → queued for revision, reappears in a later dialogue | **Partial** | Demotion, “revise” flag and the *Revisiting* opening turn are implemented and unit-tested (`hld.test.ts`); not yet exercised in a browser test. |
| T3.4 | New question linked to a learned concept, which is re-tested in context | **Partial** | Dependent concepts open with a *Building on earlier* recall turn (`hld.test.ts`). Applies to the 10 pilot concepts' declared prerequisites, not to free-typed questions. Not yet browser-tested. |
| T3.5 | Transfer problem applies the concept to a new situation | **Partial** | Every record carries a transfer problem; it is the last turn of the class and part of the delayed test. No separate “generate another transfer problem” button. |
| T3.6 | Speech opt-in → derived scores + gap report; no raw media | **Partial** | `src/lib/speech-signal.ts`: speech rate, pauses, hesitation index, coverage. Computed in the browser from loudness only; **no audio is recorded, stored or sent** (`tests/speech.test.ts`, `e2e/speech.ts`). Differs from the HLD's server-side Whisper-class service: transcription uses the browser's speech recognition (Chrome/Edge). **Open:** not tried with a real microphone/recognizer; the feasibility spike on real accents (HLD §10.6) still needs the team's 18 recordings. Pauses before key terms enter the doubt log (source: voice). |
| T3.7 | Capture declined → everything else works | **Done** | Speech is off by default; typing teach-back works identically. |
| T3.8 | Progress view: mastery, gaps, points, badges | **Done** | Report Card: five-state ladder per concept (Not started → Exposed → Understood → Retained → Mastered, with demotion), target Bloom level, named open doubts, next check date, points, badges. |
| T3.9 | Comparative evaluation reportable for platform vs plain chat | **Partial** | Protocol is built and tested: balanced counterbalanced assignment over the four Bloom-matched pairs, plain-chat baseline with the same time budget, delayed retention + transfer, within-learner paired delta with 95% CI, p-value and effect size (`tests/study.test.ts`, `e2e/study.ts`). **Open:** it needs ≥15 real learners to produce a result, and the pairs still need the TA/instructor difficulty check (decision D-03). Anything labelled SYNTHETIC in the Evaluation screen is demo data, not a result. |
| — | Voice as hands-free input for checkpoints/quizzes | **Partial** | Dictation is available on every free-text answer (Chrome/Edge). Multiple-choice quiz answers are not voice-operated. |
| — | Doubt log names misconceptions and seeds later dialogues | **Done** | `hld.test.ts`, journey (doubts opened by wrong blanks, closed only by a correct answer on a *later* occasion). |

## Cross-cutting (D5)

| ID | Status | Note |
|---|---|---|
| T0.1 First-time user completes a topic unaided | **Open** | Needs a real first-time user; the guided journey panel is there to help (Settings → Start the guided demo, or the dashboard hero). |
| T0.2 Fresh clone builds and runs | **Done** | README; `npm install && npm run build` verified from an unpacked archive. |
| T0.3 Contrast ≥ 4.5:1 | **Done (automated)** | axe-core contrast scan: 0 violations on 13 screens × light/dark (`e2e/a11y.mjs`). Not a substitute for a manual review. |
| T0.4 Client completes a topic on the deployed build | **Open** | Needs deployment (see `DEPLOY.md`). |

## QA — accessibility (HLD §11.2, T0.3, T2.9)
* **Automated:** `e2e/a11y.mjs` runs axe-core (WCAG 2.1 A + AA tags) on 13 screens in light and dark: desk, review, library, report card, settings, classroom, dashboard with the journey guide, topic setup, verified knowledge, study, evaluation, and the classroom blank and hint cards — **0 violations**. The first run found ~40 contrast failures per screen (very small pale-grey text and light accent text in the original design), a button nested inside a button, unnamed progress bars, an unreachable scroll area and a label/visible-text mismatch; all fixed.
* **Colour contrast is enforced by a script**, not by hand: `node scripts/a11y-contrast.mjs` regenerates a block at the end of `src/styles.css` that lifts every text colour rule below 4.5:1 in either theme (keeping hue), using each rule's own background when it has one. Re-run it after changing colours.
* **Keyboard:** `e2e/keyboard.mjs` (see T2.9). It found that the sidebar navigation drew **no focus indicator** (25 of 112 Tab stops); a global `:focus-visible` ring now covers every control (blue on light surfaces, yellow on dark ones).
* **Personas are distinguished by name and position, never by colour alone** (name tag + speaker label on every turn); dialogue turns are announced with their speaker (transcript is a labelled `role=log`; assessments, feedback and blank/hint results are `role=status`).
* **Not covered:** manual screen-reader testing; the 3D classroom is a canvas — its content is available as text in the transcript and speaker card, not from the canvas itself. Please do a manual pass with NVDA/VoiceOver before the client sign-off.

## Acceptance criteria (HLD §14)
Core, UX and Technical items are covered above. **Deployment** (public URL, handover) is **Open** pending the team's hosting. **“Comparative evaluation reportable for ≥15 pilot learners”** is **Open** pending the pilot itself.

## Where the build differs from the HLD (tell the client)
* **Single AI, not multi-vendor verification** (HLD §7, §10.3). New topics are drafted then reviewed by the app's one AI; confidence capped at medium. The 10 pilot topics are pre-verified reference records.
* **Stack.** HLD §7/§10: FastAPI + PostgreSQL. Built on the existing app's stack: TanStack Start (React/TypeScript, server routes) + Supabase (PostgreSQL, auth). Server routes play the backend role; learner progress is stored in the browser and, when signed in, in Supabase.
* **Speech.** Browser-side loudness analysis + browser speech recognition instead of a server-side Whisper-class model (no audio leaves the device — stricter than the HLD's “discard immediately after scoring”).
* **Admin role / user management / class analytics (HLD §4).** Not built. The *Evaluation* screen (cohort report from learners' exported study files) and *Verified knowledge* screen cover content oversight and the pilot report; user management would be done in the Supabase dashboard.
* **Multilingual** is out of scope in the HLD; the older multi-language lesson flow remains for other languages but does **not** have the HLD mechanics (blanks, gated hints).
