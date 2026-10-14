CREATE TABLE public.evaluation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid REFERENCES public.learning_sessions(id) ON DELETE CASCADE,
  module_slug text NOT NULL,
  concept_slug text NOT NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_events TO authenticated;
GRANT ALL ON public.evaluation_events TO service_role;
ALTER TABLE public.evaluation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learners manage own evaluation events" ON public.evaluation_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX evaluation_events_user_concept_idx ON public.evaluation_events(user_id, concept_slug, created_at DESC);
CREATE INDEX evaluation_events_type_idx ON public.evaluation_events(user_id, event_type, created_at DESC);
