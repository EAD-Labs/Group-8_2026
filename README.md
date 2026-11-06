# AI KYRO — Learn to Think, Not Just Get Answers

Link to Webpage: [**View the AI KYRO Project Introduction**](https://ai-kyro-landing.vercel.app/)

AI KYRO is an AI-supported learning platform designed to make students active participants in their own learning. Instead of simply providing answers, it guides learners through explanations, questions, hints, practice and reflection to help them build lasting understanding.

**Live application:** https://ai-kyro-delta.vercel.app/  
**Project introduction page:** https://ai-kyro-landing.vercel.app/  
**GitHub repository:** https://github.com/EAD-Labs/Group-8_2026

---

## The problem

AI tools make it easy to obtain instant answers, but receiving an answer does not necessarily mean understanding the concept. Students need opportunities to think, attempt problems, make mistakes, receive feedback and revisit what they have learned.

AI KYRO aims to use AI as a learning companion rather than an answer machine.

## What AI KYRO does

- **Interactive AI classroom:** Learn through a guided classroom conversation with different teacher and student personas.
- **Think-first learning:** Respond to questions and try ideas before viewing explanations or hints.
- **Ask doubts:** Ask questions during a lesson and get help in context.
- **Practice and assessment:** Use quick checks, checkpoints and teach-back activities to test understanding.
- **Revision and retention:** Revisit concepts through review quizzes and spaced repetition.
- **Learning progress:** View concept mastery, activity, retention and areas that may need more practice in the report card.
- **Learning materials:** Upload supported documents and images to support lessons and questions.
- **Voice support:** Listen to lessons and interact using speech in supported browsers.
- **Multiple languages:** Use the interface and learning experience in a range of supported languages.

## Who it is for

- **Students and independent learners** who want to understand concepts, practise and identify gaps in their knowledge.
- **Teachers and educators** who want to encourage participation and make learning progress easier to discuss.
- **Schools and institutions** exploring responsible ways to use AI in education.

## Access the application

Open the live application:

**[Launch AI KYRO](https://ai-kyro-delta.vercel.app/)**

For a non-technical overview of the educational problem, intended users and learning journey, visit the **[AI KYRO Project Introduction Page](https://ai-kyro-landing.vercel.app/)**.

## Run the project locally

### Prerequisites

- Node.js **22.12 or newer**
- npm

### Installation

```bash
git clone https://github.com/EAD-Labs/Group-8_2026.git
cd Group-8_2026
npm install
npm run dev
```

Open the local URL printed in your terminal (the development server uses port `8080`).

### AI configuration

Some AI-powered features, such as AI-generated answers, grading, class building, translation and handwriting/image understanding, require a server-side AI provider key.

Configure **one** of the following environment variables in your local environment or deployment platform:

- `ANTHROPIC_API_KEY`
- `LOVABLE_API_KEY`

Keep API keys private. Do not commit `.env` files, API keys or other secrets to GitHub. Without an AI key, the application still supports its built-in offline/fallback learning flows, but some AI-powered features will be unavailable or limited.

## Technology

- React and TypeScript
- TanStack Start and TanStack Router
- Vite
- Tailwind CSS
- Three.js and React Three Fiber for the 3D classroom
- Supabase for supported authentication and data-sync functionality
- AI provider integration for AI-assisted learning features

## Project structure

```text
.
├── src/
│   ├── components/       # Classroom, learning and interface components
│   ├── lib/              # Learning logic, assessment, revision and AI utilities
│   ├── routes/           # Application pages and server API routes
│   └── integrations/     # Supabase and other integrations
├── docs/
│   ├── demo-screens/     # Screenshots showing application features
│   ├── CHANGES.md        # Summary of project changes
│   ├── DEMO-SCRIPT.md    # Guided application demonstration
│   ├── DEPLOY.md         # Deployment and configuration notes
│   └── HLD-TRACEABILITY.md
├── e2e/                  # End-to-end test scripts
├── public/               # Static assets
├── package.json
└── README.md
```

## Project tracking evidence

Screenshots of the team's project management and tracking work (for example, Jira boards, sprint tasks or issue tracking) should be uploaded to:

```text
docs/project-tracking/
```

Please add the actual Jira or project-tracking screenshots to that folder and commit them to this repository. The application screenshots in `docs/demo-screens/` demonstrate product features; they are not a substitute for project-management evidence.

## Testing and quality checks

Run the following commands from the project directory:

```bash
npm test
npm run lint
npm run build
```

For browser-based end-to-end tests, start the development server first and then run:

```bash
npm run test:e2e
```

See [`e2e/README.md`](e2e/README.md) for additional test instructions.

## Additional project documentation

- [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) — step-by-step demonstration guide.
- [`docs/CHANGES.md`](docs/CHANGES.md) — summary of implemented changes.
- [`docs/HLD-TRACEABILITY.md`](docs/HLD-TRACEABILITY.md) — mapping of requirements to implementation and evidence.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — deployment notes and environment configuration.

---

**AI KYRO — Make learning active again.**
