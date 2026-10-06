CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learners manage own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.learning_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('uploading','processing','ready','failed')),
  page_count integer,
  extracted_summary text,
  source_outline jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_materials TO authenticated;
GRANT ALL ON public.learning_materials TO service_role;
ALTER TABLE public.learning_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learners manage own materials" ON public.learning_materials FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX learning_materials_user_created_idx ON public.learning_materials(user_id, created_at DESC);
CREATE TRIGGER learning_materials_updated_at BEFORE UPDATE ON public.learning_materials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  material_id uuid REFERENCES public.learning_materials(id) ON DELETE SET NULL,
  module_slug text NOT NULL,
  concept_slug text NOT NULL,
  dialogue_mode text NOT NULL DEFAULT 'full' CHECK (dialogue_mode IN ('full','reduced')),
  current_stage integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_sessions TO authenticated;
GRANT ALL ON public.learning_sessions TO service_role;
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learners manage own sessions" ON public.learning_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX learning_sessions_user_updated_idx ON public.learning_sessions(user_id, updated_at DESC);
CREATE TRIGGER learning_sessions_updated_at BEFORE UPDATE ON public.learning_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.concept_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_slug text NOT NULL,
  concept_slug text NOT NULL,
  bloom_level text NOT NULL DEFAULT 'remember',
  mastery_score integer NOT NULL DEFAULT 0 CHECK (mastery_score BETWEEN 0 AND 100),
  next_review_at timestamptz,
  doubt_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_slug, concept_slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concept_mastery TO authenticated;
GRANT ALL ON public.concept_mastery TO service_role;
ALTER TABLE public.concept_mastery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learners manage own mastery" ON public.concept_mastery FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX concept_mastery_review_idx ON public.concept_mastery(user_id, next_review_at);
CREATE TRIGGER concept_mastery_updated_at BEFORE UPDATE ON public.concept_mastery FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid REFERENCES public.learning_sessions(id) ON DELETE CASCADE,
  concept_slug text NOT NULL,
  assessment_type text NOT NULL CHECK (assessment_type IN ('prediction','blank','checkpoint','teach_back','transfer','retention')),
  response_text text NOT NULL,
  score integer CHECK (score BETWEEN 0 AND 100),
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_attempts TO authenticated;
GRANT ALL ON public.assessment_attempts TO service_role;
ALTER TABLE public.assessment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learners manage own attempts" ON public.assessment_attempts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX assessment_attempts_user_concept_idx ON public.assessment_attempts(user_id, concept_slug, created_at DESC);

CREATE POLICY "Learners upload own materials" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'learning-materials' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Learners view own materials" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'learning-materials' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Learners update own materials" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'learning-materials' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'learning-materials' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Learners delete own materials" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'learning-materials' AND (storage.foldername(name))[1] = auth.uid()::text);