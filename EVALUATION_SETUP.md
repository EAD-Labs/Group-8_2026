# AI KYRO evaluation system

## Included

- Response grading for prediction, checkpoint, teach-back and transfer stages.
- AI rubric grading through the existing Lovable AI gateway.
- Deterministic fallback grading when AI is unavailable.
- Attempt storage in `assessment_attempts` when signed in.
- Local attempt storage in browser `localStorage` so evaluation and Report Card work while signed out.
- Concept mastery updates after non-prediction assessments.
- Event logging in `evaluation_events` when signed in, with local browser persistence for signed-out evaluation.
- One-tap useful/not-useful feedback.
- Report Card metrics: attempts, average score, learning gain, usefulness and weakest concepts.

## Database

Run `supabase/migrations/20261006100000_evaluation_events.sql` in Supabase.

## Local

`npm install` then `npm run dev`.
