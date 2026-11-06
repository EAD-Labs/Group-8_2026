# AI KYRO — Metacognitive AI Scaffold

A simulated classroom that replaces the chat box: instead of reading one fluent answer, the learner watches — and joins — a conversation between a teacher, a basic student and an advanced student, then is *measured* on whether the understanding lasted. Built for ET 617 against the HLD v5.0 (see `docs/HLD-TRACEABILITY.md`).

**The user journey (HLD §5.1)** — Topic Setup → verified knowledge → 3-persona class with gated hints and blocking blanks → ask as the third student → mandatory checkpoint → concept ladder, doubt log, points and badges → delayed retention quiz (3–5 days later) → transfer. Plus a comparative study against a plain-chat baseline. Everything except live verification of *new* topics works without an AI key.

| Doc | What it is |
|---|---|
| `docs/CHANGES.md` | every change made to the original app, grouped by feature, with how to switch off or remove each |
| `docs/DEMO-SCRIPT.md` | 8-minute click-by-click demo of the whole journey (screenshots in `docs/demo-screens/`) |
| `docs/HLD-TRACEABILITY.md` | every HLD test case → implementation, evidence, status, and what is still open |
| `docs/DEPLOY.md` | environment variables, hosting, what to lock down before sharing the URL, pilot logistics |
| `e2e/README.md` | how to run the browser tests |


This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/37c92582-a38c-4530-b13c-4112076fa03d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Run locally

Requires Node.js 22.12 or newer (22 LTS recommended).

```sh
npm install        # or: bun install
npm run dev        # http://localhost:8080
```

Use Chrome or Edge for voice input. AI features (graded feedback, teacher answers, AI-built classes)
need `LOVABLE_API_KEY` in the environment, e.g. `LOVABLE_API_KEY=... npm run dev`. Without it the app
still works using the built-in rubric grader and the offline class builder.

Checks: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## What is in here

- Three classrooms (Dr Rao / Prof. Meera / Prof. Kabir) with different avatars and an animated smart board
- Narrated lessons with a distinct voice per person, and spoken answers
- Typed or spoken answers are assessed; mastery and points are saved
- Upload PDF / PPTX / DOCX / TXT / MD / PNG / JPG: read on-device, used to ground answers, or turned into a class
- Scans, handwriting and diagrams: pages are rendered to images and sent to an AI vision model
  (`/api/read-page`). Without AI, printed scans fall back to offline OCR (tesseract.js, downloads its
  language data on first use); handwriting and figures are skipped and the app says why

## Handwriting & diagrams (AI key)

Set ONE of these where the server runs (e.g. in the same terminal before `npm run dev`):

```sh
ANTHROPIC_API_KEY=sk-ant-...   # direct Claude (recommended); model claude-sonnet-5-5,
                               # override with ANTHROPIC_VISION_MODEL=...
LOVABLE_API_KEY=...            # Lovable AI gateway; override the model with VISION_MODEL=...
```

Then check it works **before** uploading real notes (with the app running):

```sh
npm run check:vision                      # reads a built-in sample page
npm run check:vision -- ./my-page.jpg     # or one of your own pages
```

Tips for handwriting: scan or photograph flat, in good light, at 150 dpi or more; dark pen on
plain paper works best. Anything the model cannot read is marked `[illegible]`, never guessed.
- Honours "reduce motion"; shows a fallback if WebGL is unavailable

## Languages

A language picker in the top bar switches the whole classroom. 12 languages: English, हिन्दी, मराठी,
বাংলা, தமிழ், తెలుగు, ગુજરાતી, ಕನ್ನಡ, മലയാളം, ਪੰਜਾਬੀ, Español, Français.

- **Interface** — Hindi and Marathi are bundled (`src/lib/i18n/hi.ts`, `mr.ts`; hand-translated, please have a
  native speaker review them). Every other language is translated by the AI the first time it is chosen
  and cached in the browser.
- **Lessons** — built-in and custom modules are translated by the AI on first use (cached). Lesson
  structure, labels and prompts come from the dictionary, so a translated lesson has exactly the same
  turns as the English one and your progress carries over. Equations are never translated.
- **Teacher answers, grading feedback and AI-built classes** are written in the chosen language.
- **Voice** — narration and dictation use that language (`hi-IN`, `ta-IN`, …). If the device has no voice
  for it, narration is switched off with a message rather than reading it with an English voice.
- **Handwriting / scans** — the AI reader transcribes any script as written; offline OCR also loads that
  language's tesseract pack.
- Without an AI key, a language that is not bundled falls back to English with an explanation.

Add a language: add a row to `src/lib/i18n/registry.ts` (and optionally a dictionary file typed `Dict`).
Known limits: labels drawn on the 3D smart board (e.g. "HEAT / Q") and the teachers' names stay in English.

AI keys: `ANTHROPIC_API_KEY` alone now powers everything (answers, grading, class building, translation,
handwriting); `LOVABLE_API_KEY` still works too.

## Settings, themes and the classroom

Everything that used to sit on the front screen now lives in **Settings** (sidebar → Settings, or the gear icons):

| Setting | What it does |
| --- | --- |
| Theme | System / Light / Dark. Dark mode also turns the 3D classrooms into an evening scene. |
| Animations | Follow the OS, always reduce, or full. Reduced motion stops the camera and effects moving. |
| Language | 12 languages for the interface, lessons, teacher answers, voice and dictation. |
| Classroom | *Automatic* (picked from the subject) or always the Green Smart Board Hall, Tiered Lecture Theatre or Seminar Studio. Name tags and the class transcript can be hidden. |
| Voice & pace | Narrate lessons aloud, and lesson speed. |
| Pop-up questions | On your turn the question pops up over the classroom. Switch off to answer in the side panel only. (The pop-up also has "Answer later" and "Don't pop up questions".) |
| Graphics | Auto / Low / Medium / High, plus a switch for visual effects (dust, light shafts, glows, speaker spotlight). Auto picks Low on phones and low-core devices. |
| Data | Download your progress (JSON), reset progress, remove uploaded materials, clear saved translations, reset settings. |

Settings are stored in the browser (`kyro_settings_v1`).

### Asking a doubt

The **Ask a doubt** bar sits under the classroom with a gold border and a hand icon, and it stays on screen as you scroll (above the phone navigation on small screens). On a learner's first visit a speech bubble points at it ("Stuck on anything? Ask Dr Rao a doubt here…") until they tap *Got it* or use the bar; on later visits it pulses briefly when the classroom opens. Three one-tap starters ("Explain that again, simply", "Give me an example", "Why does this happen?") fill the box. The lesson stage height adapts to the screen so the bar is always visible without scrolling. (Reduced-motion users get no pulsing.)

### Enlarged class

The yellow **Enlarge class** button on the classroom (or the **F** key) makes the class fill the whole window with the *Ask a doubt* bar docked underneath, so you can follow the lesson and ask at the same time. In this view: the question pop-up still appears over the class; if pop-ups are off (or you chose "Answer later") a pulsing **Your turn** pill opens the side panel; **Transcript** shows or hides the discussion; **Full screen** switches on the browser's own full screen. **Esc** or the exit button (always at the top) leaves it. Settings → Classroom → *Open classes enlarged* starts every class this way.

## Review, retention and the report card

* **Review** (sidebar) runs short quizzes built from the lessons themselves, in the lesson's language: definition match, example → concept, true/false, fill-in-the-blank and a free-text "in your own words" question (graded by AI when a key is set, by a built-in rubric otherwise). Modes: *Due reviews*, *Mixed practice*, *Concept check*; session length is a setting.
* **Spaced repetition** (SM-2 style, `src/lib/srs.ts`): a good result pushes a concept's next review further out (1 → 3 → longer days), a poor one brings it back tomorrow. Checkpoint, teach-back and transfer answers in class feed the same schedule.
* **Report card** shows only what you have really done: overall mastery, streak, retention (review-quiz average, last 30 days), what is due, a 30-day memory forecast (forgetting curve), a 12-week activity heatmap, mastery by module and Bloom level, every concept with its next review date, a doubt log with the specific gaps feedback found, and recent activity. "Print / save as PDF" prints a clean version.
* Built-in lessons no longer ship invented starting mastery numbers: a concept shows 0% until you attempt it.

## 3D classrooms

Three rooms with procedural textures, furniture, windows with scenery, animated clock/fans/curtains, day and night lighting, dust and light-shaft effects, a spotlight ring on whoever is speaking, seated students (a seated pose computed from the character rig) whose heads turn toward the speaker and nod while they talk. Board text is drawn with the browser's own text engine (`Text3D.tsx`), so no fonts are downloaded and Indic scripts shape correctly; the scene works fully offline.

## Using the classroom from the keyboard

| Key | Action |
|---|---|
| Space or K | Play / pause |
| → or L / ← or J | Next / previous line |
| Shift + → / Shift + ← | Next / previous doubt |
| M | Read aloud on / off |
| R | Replay this line |
| / | Ask a doubt |
| F (Esc to leave) | Enlarge the class |
| 0 or Home | Back to the start |
| ? | Show the list of shortcuts |

The class plays by itself (Settings → Play the class automatically) and stops only where you need to answer. Read aloud is on by default and stays on for the whole lecture.

## Hands-free class (voice)

Open the class once with a click; after that the teacher runs it by voice. Answer out loud when asked (quiz options by letter — “option b” — or by their words; blanks by the word; check-ins by the choice). When the teacher pauses between lines you can say: **pause**, **continue**, **repeat**, **next**, **go back**, **slower**, **faster**, **stop hands free**, or **“I have a doubt …”** (or simply ask your question). Needs Chrome or Edge and a microphone. Settings → Hands-free class, or H.

## Full lessons

With Settings → Lesson depth → Full (default), each class includes the AI's own in-depth lesson on the topic — the same explanation it would give in a chat — spoken turn by turn between the class's questions. It needs the app's AI; without it the short verified class runs.

## Tests

```bash
npm test          # logic: HLD rules, verification engine, speech signal, study statistics, quiz, scheduling, analytics, settings
npm run lint
npm run build
npm run test:e2e  # real-browser tests (needs `npm run dev` running on :8080; see e2e/README.md)
```
* `npm test` needs no browser. `npm run test:e2e` drives the app end to end: the full user journey, keyboard-only use, the comparative study, the speech signal, and an axe-core accessibility scan of every screen in both themes.
* Colour contrast is enforced by `node scripts/a11y-contrast.mjs` (regenerates a block at the end of `src/styles.css`); re-run it after changing colours.

## My Thinking journal

The classroom toolbar includes **My Thinking**, a three-stage reflection journal for prior knowledge/predictions, in-lesson understanding/confusion/realizations, and post-lesson reflection/self-assessment/next steps. Entries autosave on every edit and are scoped to the signed-in learner (or a stable anonymous browser ID), module, and concept.

**Persistence note:** reflections currently use browser local storage. They survive refreshes in the same browser profile, but do not synchronize between devices/browsers and are removed if that browser's site data is cleared. Signed-in reflections are not yet written to Supabase.

For local development, use Node.js **22.12 or newer (22 LTS recommended)**:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:8080`). Run `npm test` for the project unit suite and `npm run build` for a production build.
