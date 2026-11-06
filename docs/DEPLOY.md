# Deployment notes

The app is a TanStack Start project (React + TypeScript, server routes under `src/routes/api/`). It is connected to Lovable, whose build targets Cloudflare via Nitro.

## Option A — publish from Lovable (simplest)
1. Push this repo to the connected GitHub branch (do not rewrite published history).
2. In Lovable, add the secrets below under **Cloud → Secrets**, then **Publish**. The published URL is the “public URL” the HLD requires.

## Option B — any Node/edge host that supports Nitro
`npm install && npm run build`, then deploy the build output with the Nitro preset for your host (Vercel, Netlify, Cloudflare, Node). Set the same environment variables on the host.

## Environment variables (server side only — never `VITE_*`)
**Nothing new.** The app uses the AI it already used: `ANTHROPIC_API_KEY` (or `LOVABLE_API_KEY` for the Lovable AI gateway), with the optional `ANTHROPIC_MODEL` / `ANTHROPIC_BASE_URL` overrides. The new verification of typed topics goes through that same AI (draft, then review by the same model; confidence is capped at *medium*). With no AI configured, the 10 pilot topics still work (pre-verified) and only *new* topics report “No AI providers are configured”.

## Before sharing the URL with the pilot cohort
* **The AI routes are unauthenticated** (`/api/chat`, `/api/assess`, `/api/verify`, …) and spend your keys. Add sign-in checks, per-user rate limits and a spending cap first.
* Verified records for new topics are cached in the learner's browser and in server memory; on serverless hosts the server cache does not persist between instances. (Persisting to the `verified_records` table is a small follow-up if you want a shared cache.)
* Learner progress lives in the browser; signed-in progress syncs to Supabase (`concept_mastery`, `assessment_attempts`, `profiles`). The HLD learner-model extras (ladder, doubts, study runs) are browser-side and exported as files for the pilot.
* Tell participants (HLD §11.4) that questions asked in the plain-chat condition and any new topic go to the configured AI providers.

## Pilot logistics (HLD §6.3)
Give each participant a number (1, 2, 3 …). *Settings → Comparative study → Join* assigns one of four Bloom-matched pairs (balanced in blocks of 8) and which concept is learned in the classroom versus plain chat. After the 3-day delay they take the tests and download a study file; load all files in *Settings → Evaluation report*. **Get the TA/instructor difficulty check on the four pairs (decision D-03) before the graded pilot.**
