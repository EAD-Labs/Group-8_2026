# Group-8_2026 — AI KYRO

Course repository for the ET 617 project *Metacognitive AI Scaffold*.

**Client:** Dr. Balamurali A R, AI KYRO
**Contract:** HLD v5.0 (signed at §17)

The application lives in [`aikyro/`](aikyro/). Two documents there, and only
there — this file deliberately carries no detail of its own, because the previous
copy here drifted out of date against the one next to the code.

| Document | What it covers |
|---|---|
| [`aikyro/README.md`](aikyro/README.md) | What's implemented, how to run it, what's stubbed, known limits |
| [`aikyro/PROJECT.md`](aikyro/PROJECT.md) | How the system is put together and why, status against the HLD's acceptance criteria, open questions for the client |

## Quick start

Needs Python 3.10+ and Node 18+. Runs on mocks with no API keys.

```bash
cd aikyro/backend && python -m venv .venv && source .venv/bin/activate \
  && pip install -r requirements.txt -r requirements-dev.txt \
  && alembic upgrade head && uvicorn app.main:app --reload
```

```bash
cd aikyro/frontend && npm install && npm run dev
```

Then open http://localhost:5173. Tests: `cd aikyro/backend && python -m pytest`.

## Conventions

- `main` tracks `origin/main`. Branch per deliverable, merge on milestone review.
- Content changes go in `aikyro/backend/app/content/modules.json`, not in code.
- Model calls go through `services/llm_providers`, never a provider SDK.
- Secrets stay in `.env`, server-side only, never committed.
