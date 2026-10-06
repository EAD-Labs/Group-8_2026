# AI KYRO: Realistic Metacognitive Classroom

## Goal
Rebuild the prototype as an immersive, participatory classroom that teaches complete topics from trusted content, including a learner’s own slides and documents. Preserve the HLD’s core loop: verified knowledge → guided classroom dialogue → measured learning.

## Experience
- Replace the static classroom image and flat figures with a full-screen 3D classroom using Three.js: teacher, two student personas, learner desk, board, seated classmates, environmental motion, speaking gestures, camera focus changes, and distinct visual speaking states.
- Keep the classroom usable rather than decorative: controls remain accessible, motion can be reduced, and mobile/tablet receives a lighter but complete presentation.
- Let the learner pause, replay, change pace, interrupt, ask by text or voice, inspect the board, and switch between full and reduced dialogue modes.
- Use distinct teacher, foundational-student, and advanced-student voices and synchronized speaking animation where supported.

## Learning Content
- Expand both HLD pilot modules into complete concept sequences rather than definition cards:
  - Thermodynamics: first law and energy accounting, second law and entropy, sign conventions, reversible/irreversible processes, and entropy of the universe.
  - Probability and statistics: conditional probability, Bayes’ theorem, independence, random variables and expectation, sampling distributions, confidence intervals, and correlation versus causation.
- Give every concept a consistent teaching arc: prior-knowledge check, explanation, worked example, misconception challenge, learner prediction, scaffolded hint, application, checkpoint, teach-back, and transfer problem.
- Keep Bloom targets visible in the learning logic, not as labels only. Concepts advance from remember/understand toward apply/analyse with evidence from learner responses.
- Replace keyword-only grading with rubric-based feedback, partial credit, misconception detection, and a persistent doubt log.

## Learn From My Material
- Add a material workspace where learners can upload PDF, PowerPoint, Word, text, and supported image files.
- Extract and organize material into source sections, concepts, equations, diagrams, and likely misconceptions.
- Let learners choose uploaded sources, select a topic or page range, and generate a grounded classroom session.
- Show source references during explanations and answers, clearly distinguish material-grounded statements from supplemental knowledge, and never invent a citation.
- Provide a source viewer beside the lesson so learners can follow their own slides while the classroom teaches them.

## AI and Trust
- Use Lovable AI server-side for content analysis, classroom orchestration, in-context learner questions, grading, and teach-back feedback.
- Build a structured verified knowledge record: claims, definitions, prerequisites, examples, misconceptions, equations, source references, disagreements, resolutions, and confidence.
- Generate dialogue from that record so every important concept is covered and the conversation can adapt to questions without losing the lesson path.
- Stream dialogue and reasoning states into the classroom, preserve progress if interrupted, and surface clear recovery messages.

## Progress and Measurement
- Add required in-class attempts, end-of-topic checkpoints, delayed retention quizzes, transfer tasks, mastery by concept, points, badges, and revision scheduling.
- Support typed and spoken teach-back; retain transcript-derived coverage and hesitation indicators only, not raw recordings.
- Provide a learner dashboard for active courses, uploaded materials, due reviews, mastery, doubt log, and recent sessions.
- Preserve the HLD’s pilot comparison fields so platform-versus-plain-chat outcomes can later be reported without exposing research controls in normal learning screens.

## Technical Details
- Use the existing TanStack Start project, semantic design tokens, Lovable Cloud for accounts, storage, progress, source metadata, and session persistence.
- Use Three.js/React Three Fiber for the classroom and Web Audio timing for speaking animation; lazy-load the 3D scene and provide a performant fallback.
- Process uploaded files on the server, store original materials securely, and index extracted chunks with source/page metadata for grounded retrieval.
- Add guarded server functions for user data and a streaming classroom endpoint for AI turns; keep all keys and prompts server-side.
- Reuse the strongest ideas from the uploaded build, but do not copy its React Router/FastAPI structure into the TanStack app.

## Validation
- Test upload → source selection → generated lesson → learner interruption → checkpoint → teach-back → mastery update end to end.
- Verify the 3D classroom at desktop, tablet, and mobile sizes; check camera framing, animation, controls, keyboard access, reduced motion, and performance.
- Verify grounded answers include correct source references and that unavailable AI/file-processing states preserve the learner’s work.
- Add unique page metadata for every content page and ensure the first screen is the working product, not a marketing page.
