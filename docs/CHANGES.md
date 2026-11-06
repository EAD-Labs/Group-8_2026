# What changed, and how to remove or switch off any of it

This lists every change made to the project you started with (the AI KYRO classroom app with the Lovable/Claude AI), grouped by feature. For each: **what it is**, **where it lives**, **how to switch it off without touching code** (if possible), and **how to remove it from the code**.

> **The AI is unchanged.** Nothing here adds, swaps or configures an AI provider. Every AI call (chat, assessment, module generation, translation, and the new topic verification) goes through the app's existing `completeText()` in `src/lib/ai-server.ts`, with the same keys you already use (`ANTHROPIC_API_KEY`, or `LOVABLE_API_KEY`). There is **no multi-vendor verification**: that part was dropped.

**Removal difficulty:** ● easy (delete a file / a few lines) ◐ moderate (several wiring points) ○ hard (touches the core — keep unless you must).
Wiring for almost everything is in one place, `src/routes/index.tsx`; search for the names given below.

---

## 1. Interface and settings

| Change | What it does | Switch off | Remove from code |
|---|---|---|---|
| **Settings page** ● | One place for theme, classroom, language, voice, pop-ups, graphics, data, demo tools. The language picker, classroom picker and voice toggle that used to sit on the front screen moved here. | — | `src/components/SettingsPanel.tsx`, `src/lib/settings.ts`; in `index.tsx` remove `SettingsPanel`, `useSettings` and the `"settings"` panel. (Then you must put the pickers back; the old versions were deleted.) |
| **Light / dark mode** ◐ | Theme setting (System/Light/Dark); dark mode also makes the classrooms an evening scene. | Theme → Light | Delete the `.dark{…}` blocks and the `--cNN` variables at the end of `src/styles.css`; drop `night={theme === "dark"}` in `index.tsx`. |
| **Contrast + focus ring** ● | Every text colour lifted to WCAG AA (4.5:1); visible keyboard focus ring everywhere. | — | Delete the `/* a11y-contrast:start … end */` block and the `/* visible keyboard focus */` block at the end of `src/styles.css`. `scripts/a11y-contrast.mjs` regenerates the first. |
| **Pop-up questions** ● | On the learner's turn the question pops over the classroom (blanks, hints, checkpoint too). | Settings → Pop-up questions off (also “Don't pop up questions” on the card) | `.question-popup` markup + `popupOpen`/`answerBox` in `index.tsx`; CSS `.question-popup*`. |
| **Ask-a-doubt bar** ● | Prominent bar with quick-question chips and a first-visit speech bubble; stays on screen. | — (bubble shows once) | In `index.tsx` the `ask-bar` block (revert to the plain `question-bar`); CSS `.ask-*`. |
| **Enlarge class** ● | Class fills the window with the doubt bar underneath; `F` / `Esc`; real full screen. | Settings → Open classes enlarged off | `focus`/`focusPanel` state, the `.enlarge-btn` buttons and `.is-focus` CSS. |
| **Graphics quality + effects** ● | Low/Medium/High (Auto picks), effects on/off, reduced motion. | Settings → Graphics / Visual effects / Animations | `quality`, `effects`, `reduced` props through `ClassroomScene.tsx`; the Settings card. |
| **Language top-up** ● | Translated UI dictionaries now also translate strings added later (previously new strings stayed English forever). | — | `englishToTranslate(lang)` in `src/lib/i18n/index.ts` and its caller in `index.tsx`. |

## 2. 3D classroom ○ (recommended to keep)
Rebuilt rooms with procedural textures, furniture, windows with scenery, clock/fans/curtains, day/night lighting, dust and light-shaft effects, a spotlight ring on the speaker, **seated students** (a seated pose computed from the rig) whose heads turn toward the speaker and nod. Board text is drawn by the browser (`Text3D.tsx`) so nothing is downloaded from a CDN (the old font loader broke the whole scene when offline).
Files: `classroom/{ClassroomScene,rooms,props,vfx,textures,boards,Text3D}.tsx|ts`, `makeSeatedClip` in `avatar-look.ts`, `rooms` changes in `personas.ts`, thumbnails in `public/rooms/`.
Switch off the heavy parts: Settings → Graphics Low / Visual effects off.

## 3. Review, quizzes and the report card ◐
* **Review quizzes** from the lessons themselves (definition, example, true/false, fill-in-the-blank, free recall) with **spaced repetition** — `src/lib/{quiz,srs}.ts`, `ReviewPanel.tsx`. Sidebar “Review”, dashboard Quick Practice cards.
* **Report card on real data only** (mastery, streak, retention, due list, memory forecast, activity heatmap, per-module breakdown, doubt log) — `src/lib/analytics.ts`, `ReportPanel.tsx`.
* **Built-in lessons no longer ship invented starting mastery** (a concept shows 0% until attempted).
Remove: delete those files and the `review`/`progress` wiring (`openReview`, `completeReview`, `reviewPool`, `report` in `index.tsx`), and restore the old progress block from your previous version.

## 4. The HLD build

| Change | What it does | Switch off | Remove from code |
|---|---|---|---|
| **10 verified pilot records replace the old built-in lessons** ○ | The two modules are now 5 + 5 concepts (Module B was 7 with different Bloom levels). Each concept has claims with ids, named misconceptions, 2 blanks, 2 hints, basic/advanced student questions, disagreements, transfer problem. | — | `src/lib/knowledge/seed.ts`, `src/lib/pilot.ts`. The previous lesson text was deleted from `curriculum.ts` (only the `arc()` builder remains, still used for your uploaded material and other languages). To go back, restore `modules` from your earlier `curriculum.ts`. |
| **Dialogue orchestrator** ○ | Builds the class from a record: teacher + basic student + advanced student; **fill-in-the-blank blocks the dialogue; hints need a guess before the answer reveals; mandatory checkpoint drawn from the dialogue**; reduced mode (no basic student). | Settings/Topic Setup → Reduced | `src/lib/{dialogue,session,use-hld}.ts`, `ClassroomCards.tsx`, the `hld`/`answerBox` wiring in `index.tsx`. |
| **Quick-check popups** ● | Multiple-choice and fill-in-the-blank-with-choices questions that pop up during the class (2 in a full class, 1 in reduced mode): first a fill-in-the-blank, then a definition / example / true-false question. Not blocking; first answer is final; +2 points when right, a slip is logged as a named doubt. Built from the same questions as the Review quizzes. | Settings → Pop-up questions off puts them in the side panel; they can always be answered later | `McqCard` in `ClassroomCards.tsx`, `quickChecks()` + `pushCheck` in `src/lib/dialogue.ts`, `answerMcq` in `session.ts`, `mcq()` in `use-hld.ts`, the `"mcq"` branch of `answerBox` in `index.tsx`. To drop them, make `quickChecks()` return `[]`. |
| **Concept ladder, doubt log, points ledger, badges** ◐ | Not started → Exposed → Understood → Retained → Mastered, with demotion; doubts named by misconception, closed only by a later correct answer; points never for revealing; resumable sessions. | — | `src/lib/{mastery,learner}.ts`, `LadderSection` in `HldPanels.tsx` (rendered inside the Report Card). |
| **Delayed retention + demo clock** ● | Retention check 3–5 days after the checkpoint; the demo clock fast-forwards days for a live demo. | Settings → Demo clock → Reset | `src/lib/clock.ts` (replace `nowMs()` with `Date.now()` in the few places it is used); the Settings “Demo clock” row. |
| **Topic Setup screen** ● | Choose a topic, full/reduced dialogue, speech opt-in, retention interval; the dashboard's “Enter class” opens it. | Use the sidebar “Classroom” to bypass | `TopicSetup` in `HldPanels.tsx`; `"setup"` panel; the hero click handler `setPanel("setup")` → `setPanel("classroom")`. |
| **Verified topics from the app's AI** ● | Type a new topic: the app's own AI drafts it, then reviews its own draft and corrects mistakes (shown as “first draft vs review”). Confidence is capped at *medium*. **One AI; no other vendor.** Pilot topics need no AI. | Just don't type a topic | `src/lib/knowledge/{engine,client,store}.ts`, `src/routes/api/verify.ts`; the “Or enter your own topic” block in `TopicSetup`. |
| **Verified knowledge screen** ● | Read each record: provenance, corrections, claims with ids, misconceptions. | — | `KnowledgePanel` in `HldPanels.tsx`; `"knowledge"` panel; the “How verified” toolbar button. |
| **Guided user journey** ● | A checklist card that ticks off from real activity (the demo). | Click “Hide” | `JourneyGuide` in `HldPanels.tsx`; the hero “▶ Start the guided demo” button. |
| **Offline answer for “ask a doubt”** ● | Without AI, the answer comes from the verified record and quotes what was said in the class. | — | `src/lib/ask-local.ts` and its two call sites in `ask()` (without it, the old error message returns). |
| **Speech signal** ● | Optional: when you explain aloud, shows pace, pauses and a gap report. Measured in the browser from loudness only; **no audio recorded or sent**. | Off by default (Topic Setup toggle) | `src/lib/speech-signal.ts`, `SpeechReportCard`, the `meterRef`/`dictate` additions in `index.tsx`. |
| **Comparative study** ● | Learn one concept in the classroom and a matched one in plain chat, tested days later; cohort report with statistics. Hidden under Settings → Demo & evaluation. | Don't open it | `src/lib/study.ts`, `StudyPanels.tsx`; the `"study"`/`"evaluation"` panels; the `mode: "plain"` option in `src/routes/api/chat.ts`; two Settings rows. |
| **AI status endpoint** ● | Settings shows whether the AI is connected. | — | `src/routes/api/status.ts` and the chip in `SettingsPanel.tsx`. |

## 5. Tests, scripts and docs (safe to delete, nothing depends on them)
`tests/` (`npm test`), `e2e/` (`npm run test:e2e`), `scripts/a11y-contrast.mjs`, `docs/`, the added `devDependencies` (`tsx`, `puppeteer-core`, `@sparticuz/chromium`, `axe-core`) and the `public/rooms/` thumbnails.

## 6. Things that behave differently on purpose
* The HLD mechanics (blanks, gated hints, 3-persona dialogue) exist **only for English** lessons. Other languages and your uploaded material still use the older 8-turn lesson flow (their checkpoint is still mandatory).
* Opening a concept now resumes the unfinished session (or starts a fresh one after completion).
* The **Hint** button is kept on ordinary answer boxes (it shows a nudge written for that question, never the answer). The guess-first hint cards are an addition, not a replacement.
* Retention interval default is 3 days (was 1).

## 7. What was deliberately **not** done
No second AI provider, no multi-vendor verification, no server-side speech service, no admin/user-management screens.

## My Thinking journal (2026-11-03)

- Added a real **My Thinking** control to the classroom toolbar. It opens an editable reflection journal without replacing the existing classroom, transcript, ask-a-doubt flow, learner model, or progress screens.
- Captures before-learning prior knowledge, predictions, expected difficulties and confidence; during-learning understanding, confusion, realizations and confidence; and after-learning takeaways, remaining gaps, prediction review, final confidence, self-assessment and next steps.
- Saves each edit immediately in browser local storage. Keys are scoped by authenticated Supabase user ID (or a stable browser-local anonymous learner ID), module slug and concept slug. The storage utility has isolated round-trip, learner/topic separation, corrupt-data and storage-failure tests.
- Limitation: this is browser-local persistence, not cross-device synchronization. Signed-in data is not uploaded to Supabase; clearing site data or switching browsers/devices removes access to that local copy.


## v15 — doubts as part of the class, "My thinking" as a conversation
| Change | What it does | Switch off | Remove from code |
|---|---|---|---|
| **Doubts become class turns** | A doubt is inserted into the class right after the current turn ("YOUR DOUBT"); the teacher's answer appears on the stage and in the transcript; saved with the class (reload keeps it). Asked at a blank/checkpoint, the doubt comes first and that turn still waits. One-tap follow-up: Got it / Not clear — explain differently / Show me an example. A few turns later the teacher comes back to it ("BACK TO YOUR QUESTION"). | — | `src/lib/live-turns.ts`, `DoubtCard` in `src/components/ThinkingChat.tsx`, `ask`/`addBridge` in `src/routes/index.tsx`. |
| **AI answers with memory** | `/api/chat` now sends earlier doubts + answers, the verified notes and the class so far; instructions adapt the answer to the question (no fixed shape); one non-streaming request (an empty reply falls back instead of showing nothing). New `bridge` mode writes the call-back line. Same AI and keys as before. | — | `src/routes/api/chat.ts`. |
| **Offline answers vary and are honest** | Without the AI, answers depend on the kind of question, never repeat a note already used, and say plainly when the notes do not cover it. | — | `src/lib/ask-local.ts`. |
| **My Thinking → three one-tap check-ins** | Before (how much do you know? anything tricky?), during (making sense? → which part → becomes a doubt), after (score vs how you felt, how sure now vs before, what next: practise / next topic / explain again). Every step skippable. The "My Thinking" button shows a recap of the conversation. The 14-field form is no longer shown (`my-thinking.ts` and its test are kept, unused). | Settings → Thinking check-ins | `src/lib/thinking-chat.ts`, `CheckinCard`/`ThinkingSummary` in `ThinkingChat.tsx`, `pushCheckin` in `src/lib/dialogue.ts`. |

**Not yet verified in v15:** a browser test of the check-ins (before/during/after flows); the older browser suites (journey, keyboard, popup, quick checks, accessibility scan, settings, review, library, ask bar) were not re-run on this code; the popup test still expects the old turn order; nothing was tried against the real AI (only a local stand-in).


## v16 — keyboard control, a class that flows, read aloud that stays on, a Today front page
| Change | What it does | Switch off | Remove from code |
|---|---|---|---|
| **No "first thought" question** | Classes (verified lectures and your own material) no longer open with a free-text "what do you already believe?" box; they open with the one-tap check-in. | — | Restore the `kind: "question"` turn in `src/lib/dialogue.ts` and in `arc()` in `src/lib/curriculum.ts`. |
| **Read aloud: one switch, on by default, stays on** | "Read aloud: On/Off" in the class toolbar (M on the keyboard). While on, every line is read as it appears — when the class plays by itself and when you move with keys or buttons. Settings saved by older builds are switched on once (off was only the old default); after that, turning it off is remembered. | Toolbar or M | `toggleVoice` and the playback effect in `src/routes/index.tsx`; `voiceOn` default in `src/lib/settings.ts`. |
| **The class flows by itself** | Opening a class starts it. Each line waits about as long as it takes to read (~230 words/min; 1.5×/2× speed it up). It stops only where you must answer, and carries on by itself after you answer, tap Continue or "Got it". | Settings → Play the class automatically | `continueClass`, the autoplay effect and the playback timing in `src/routes/index.tsx`; `autoPlay` in settings. |
| **YouTube-style keys** | Space/K play-pause · →/L next line · ←/J previous line · Shift+→/← next/previous doubt · M read aloud · R replay line · / ask a doubt · F enlarge · 0/Home start · ? shortcut list. A small sign shows what happened. Keys never act while typing, and → cannot skip a blank or the checkpoint. Toolbar keyboard button opens the list. | — | `keysRef` and the key handler in `src/routes/index.tsx`; `.kbd-toast`/`.shortcuts-sheet` CSS. |
| **Front page = Today** | A to-do list: today's lectures (1–3 per day, kept for the day once planned, ticked off when understood), retention quizzes due today or overdue, a lecture left half-way, open doubts. The hero, module cards, practice cards and lesson rail were removed — the left bar is the way into the classroom. Each task's own button (Start / Resume / Take quiz) opens that exact lecture or quiz. | "Lectures per day" on the page | `src/lib/today.ts`, `src/components/TodayPanel.tsx`, the `today` effect in `src/routes/index.tsx`. |
| **Topic Setup & guided demo moved** | With the front-page hero gone, Topic Setup opens from the classroom toolbar ("New topic") and the guided demo from Settings → Start the guided demo. | — | — |

Also fixed: the classroom toolbar overflowed sideways on phones (it now wraps; read aloud shows as an icon there); `scripts/a11y-contrast.mjs` could delete stylesheet rules written after its generated block — it now replaces only its own block.


## v17 — merged from the team's v14 fixes
These came from a teammate's branch of v14 and were merged into v16.

| Change | What it does | Remove from code |
|---|---|---|
| **Classroom scene memoised** | The whole page is one component, so every keystroke in the doubt box used to re-render the entire 3D scene (measured on v14: 10 keystrokes → 22 scene renders, 140 avatar renders). The scene now re-renders only when the lesson changes. Camera/GL settings are module constants for the same reason. | `memo(...)` and the constants in `src/components/classroom/ClassroomScene.tsx`. |
| **Classroom canvas self-heals** | If the classroom mounted while the page was not being painted (background tab, hidden panel, window still opening), the canvas stayed at its default 300×150 and the room showed as a blank white rectangle. A small guard now re-measures until the canvas has a real size; the canvas is measured with offset sizes so a zoomed page is measured correctly. | `useCanvasSizeGuard` and `RESIZE` in `ClassroomScene.tsx`. |
| **WebGL probe runs once** | `webglAvailable()` ran on every page render and created a real WebGL context each time (half the CPU while typing; browsers keep only a few contexts, which could cost the classroom its own). It is now checked once and the probe's context is released. | `src/components/classroom/SceneBoundary.tsx`. |
| **The class pauses behind a pop-up** | When a question pops up, playback pauses (the transport shows Play) and the 3D room holds still. Merged with v16's behaviour: after answering, the class carries on by itself, and with Read aloud on the question's own line is still read out (the teammate's version also cut narration; v16 keeps read-aloud on for the whole lecture). | The `popupOpen` effect and the `reduced` prop in `src/routes/index.tsx`. |
| **Old first-thought turns never pop up** | Custom lessons saved before the first-thought turn was removed still contain it; it no longer takes over the screen. Its unused translation strings were removed (en/hi/mr). | `NO_POPUP_KINDS` in `src/routes/index.tsx`. |
| **Doubt-bar chips always show** | The quick-question chips used to disappear as soon as you typed, which changed the bar's height and resized the classroom mid-keystroke. They now stay. The doubt box's border is invisible until focused, without the extra glow ring. | The ask bar in `index.tsx`; `.ask-field` in `src/styles.css`. |
| **Unused code and packages removed** | 42 unused UI components, 3 unused Supabase server files and 34 unused npm packages (accordion, dialog, charts, carousel, forms, date picker, …). `package-lock.json` added. | — |
| **Readable formatting** | `src/styles.css`, the tests and the browser tests are formatted with Prettier (the stylesheet was minified one-liners). Formatting only — checked rule by rule. | — |
| **Dev server address** | The browser tests default to `http://127.0.0.1:8080/` (what `npm run dev` serves); `BASE_URL` still overrides it. | — |

| **Front page restored** | The v16 "Today" to-do page was replaced by the previous home page (classroom hero, module cards, practice cards, lesson rail) at the team's request. `src/lib/today.ts` and `TodayPanel.tsx` are kept but unused. | — |


## v18 — a hands-free voice classroom, full lessons, better handwriting reading
| Change | What it does | Switch off | Remove from code |
|---|---|---|---|
| **Hands-free class** | After one click to open the class (a browser needs one gesture for the microphone), no keyboard or mouse: the teacher reads every line, asks every question out loud — check-ins with their choices, quick checks with their options, blanks, hints, the checkpoint, teach-back — listens, puts the spoken answer into the card, reads out the result and carries on. Between lines it pauses briefly to listen: say “pause”, “continue”, “repeat”, “next”, “go back”, “slower”, “faster”, or “I have a doubt…” / just ask a question. A doubt is answered on the stage, read aloud, then “Did that clear it up?” (“got it” / “not clear” / “example”). It listens only while the teacher is silent (so it never hears itself) and stops whenever the class moves. Chrome or Edge. | Settings → Hands-free class, the toolbar “Hands-free” switch, H, or say “stop hands free” | `src/lib/hands-free.ts`; the hands-free block in `src/routes/index.tsx`. |
| **Full lessons (ChatGPT/Claude depth)** | The app asks its own AI (same keys) to teach the topic exactly as it would in a chat — intuition, derivations, worked examples, common mistakes — consistent with the verified notes (or your own notes for classes built from them). The lesson is split into spoken turns under its own headings, equations go on the board, and it is woven in after the class's teaching turns, before the checkpoint, never behind where the learner is. Cached per topic; without the AI the short class runs. | Settings → Lesson depth → Brief | `src/routes/api/teach.ts`, `src/lib/deep-lessons.ts`, the `deep*` code in `index.tsx`. |
| **Handwriting** | Tall pages and photos are read as two overlapping halves at full resolution (~1.7× the detail), photos get a contrast boost, and the reader is instructed for cursive/messy writing and maths. Needs the app's AI (offline OCR cannot read handwriting). | — | `imageTiles`/`readTiles`/`mergeOverlap` in `src/lib/materials.ts`; reader prompt in `src/lib/vision-server.ts`. |

Fixed along the way: pausing re-read the current line and could start a second voice controller for the same question; the turn-keeping logic could fight a turn change and loop (page crash); a check-in answer could be taken before the next question appeared.


## v19 — a user's-eye review: clear evaluation, pilot feedback, fixes
| Change | What it does |
|---|---|
| **Evaluation screen, rebuilt** | Plain-language page: the five things measured (understanding, retention, self-assessment, learner feedback, comparison with plain chat) and where to see each; live results from this device; the pilot report pooled from every tester's file; then the classroom-vs-chatbot study, rewritten without jargon. Reached from the Report Card (“How is learning evaluated?”) and Settings. |
| **Pilot feedback in the class** | The end-of-class check-in asks how useful the class was (1–5) and one thing to improve (spoken or typed, skippable). Each tester downloads one file (answers and progress only — no audio, no names); the Evaluation screen pools them. |
| **Fixes** | A stray yellow pill covered the profile on the home page (desktop and phone) — a CSS name clash with the guided-demo checklist; on phones the guided-demo button sat on top of “Enter class”; a first-time user was greeted “Welcome back”; the Review page told a new user “nicely done” with nothing done; concepts never started offered “Study again” (now “Start”). |


## v20 — evaluating the metacognitive part properly (calibration)
| Change | What it does |
|---|---|
| **Confidence before the score** | At the checkpoint: “How sure are you about your answer? Guessing / Fairly sure / Certain” (one tap, beside the answer). In hands-free mode the teacher asks it out loud. Saved with the score. |
| **Prediction before each retention quiz** | “How many of these do you expect to get right? Only a few / About half / Most of them” (skippable), saved with the result and shown next to it. |
| **Calibration on the Evaluation screen** | Checkpoint confidence vs score (matched / over- / under-confident, average gap in points); whether learners get better at it (earlier vs later classes); retention prediction vs result; how often “Certain” at the checkpoint was followed by passing the quiz days later; the mid-class pulse counts. On this device and pooled from all pilot files. The old post-score question is still shown, labelled “asked after”. |


## v21 — lecture mode: the full lesson on a real board
| Change | What it does |
|---|---|
| **Lecture board** | While the AI's full lesson is taught, the stage shows a large board with the lesson as the AI wrote it — headings, paragraphs, lists, typeset formulas (KaTeX) and drawn graphs — with the part being spoken highlighted and scrolled into view. |
| **Camera and teacher** | In lecture mode the camera frames the teacher up close beside the board instead of the whole class; while a formula or graph is being explained the teacher turns toward the board and gestures at it. |
| **Formulas and graphs from the AI** | The lesson prompt asks for LaTeX formulas and for graphs as small plot specs; formulas are read aloud in words (“T c over T h”). Graph formulas are evaluated by a small safe parser — nothing from the AI is ever run as code. |
| **Fixes** | A display formula could be squeezed to nothing inside the board; a lesson that arrived late could be placed behind the learner (it is now placed from where they are when it arrives). |


## v22 — a calmer, uncluttered classroom
| Change | What it does |
|---|---|
| **Toolbar** | Hands-free and Read aloud are compact on/off icon buttons; My Thinking stays; New topic, How verified, Keyboard shortcuts and classroom settings moved into one “More” (⋯) menu. |
| **Stage** | No “LIVE CLASS” badge or repeated topic name over the room; Course source and Enlarge are small icon buttons in the corner; the hands-free indicator appears only while it is listening; the “full lesson” status moved to the small line under the stage; a smaller caption card. |
| **Doubt bar** | One compact row: no tip bubble, no pulsing border, no extra sentence. |
| **Sidebar** | The decorative “Small steps build big ideas” note is gone. |
