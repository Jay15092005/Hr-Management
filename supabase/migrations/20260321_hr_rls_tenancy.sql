-- HR per-user tenancy: profiles, owner_id on core tables, RLS, candidate join RPCs, storage policies.
-- Apply via Supabase CLI or MCP. Legacy rows with owner_id NULL are invisible to authenticated HR until backfilled.

-- ---------------------------------------------------------------------------
-- 1) HR profile (1:1 with auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.hr_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_profiles_select_own" ON public.hr_profiles;
CREATE POLICY "hr_profiles_select_own"
  ON public.hr_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "hr_profiles_update_own" ON public.hr_profiles;
CREATE POLICY "hr_profiles_update_own"
  ON public.hr_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "hr_profiles_insert_own" ON public.hr_profiles;
CREATE POLICY "hr_profiles_insert_own"
  ON public.hr_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

COMMENT ON TABLE public.hr_profiles IS 'One row per HR user; mirrors auth.users for app use.';

-- Existing users (before this migration)
INSERT INTO public.hr_profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_hr_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.hr_profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_hr_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_hr_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_hr_user();

-- ---------------------------------------------------------------------------
-- 2) Ownership columns + resume storage path (private bucket + signed URLs)
-- ---------------------------------------------------------------------------
ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS storage_object_path TEXT;

ALTER TABLE public.job_descriptions
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users (id) ON DELETE CASCADE;

COMMENT ON COLUMN public.resumes.owner_id IS 'HR user who owns this candidate record; RLS scopes all access.';
COMMENT ON COLUMN public.resumes.storage_object_path IS 'Path in storage bucket resumes/{owner_id}/... for signed URL access.';
COMMENT ON COLUMN public.job_descriptions.owner_id IS 'HR user who owns this job description.';

-- Optional dev backfill: assign orphan rows to the oldest auth user (skip if none)
DO $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF uid IS NOT NULL THEN
    UPDATE public.resumes SET owner_id = uid WHERE owner_id IS NULL;
    UPDATE public.job_descriptions SET owner_id = uid WHERE owner_id IS NULL;
  END IF;
END $$;

-- Default owner from JWT on insert
CREATE OR REPLACE FUNCTION public.set_row_owner_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resumes_set_owner ON public.resumes;
CREATE TRIGGER trg_resumes_set_owner
  BEFORE INSERT ON public.resumes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_row_owner_id();

DROP TRIGGER IF EXISTS trg_job_descriptions_set_owner ON public.job_descriptions;
CREATE TRIGGER trg_job_descriptions_set_owner
  BEFORE INSERT ON public.job_descriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_row_owner_id();

-- Prevent transferring rows between HR users
CREATE OR REPLACE FUNCTION public.prevent_owner_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'owner_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resumes_owner_immutable ON public.resumes;
CREATE TRIGGER trg_resumes_owner_immutable
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_id_change();

DROP TRIGGER IF EXISTS trg_job_descriptions_owner_immutable ON public.job_descriptions;
CREATE TRIGGER trg_job_descriptions_owner_immutable
  BEFORE UPDATE ON public.job_descriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_id_change();

-- Candidate selections must reference resume+job owned by the same HR
CREATE OR REPLACE FUNCTION public.ensure_selection_same_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r_owner UUID;
  j_owner UUID;
BEGIN
  SELECT owner_id INTO r_owner FROM public.resumes WHERE id = NEW.resume_id;
  SELECT owner_id INTO j_owner FROM public.job_descriptions WHERE id = NEW.job_description_id;
  IF r_owner IS NULL OR j_owner IS NULL OR r_owner IS DISTINCT FROM j_owner THEN
    RAISE EXCEPTION 'resume and job_description must exist and belong to the same HR (owner_id)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidate_selections_same_owner ON public.candidate_selections;
CREATE TRIGGER trg_candidate_selections_same_owner
  BEFORE INSERT OR UPDATE ON public.candidate_selections
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_selection_same_owner();

CREATE INDEX IF NOT EXISTS idx_resumes_owner_id ON public.resumes (owner_id);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_owner_id ON public.job_descriptions (owner_id);

-- ---------------------------------------------------------------------------
-- 3) Webhook log table (if missing)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_transcription_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT,
  session_id TEXT,
  event_type TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_transcription_webhooks_room
  ON public.meeting_transcription_webhooks (room_id);

-- ---------------------------------------------------------------------------
-- 4) Candidate join / complete flows (anon-safe, no broad table exposure)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.interview_join_context(p_room_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'status', ic.status,
    'room_id', ic.room_id,
    'candidate_name', r.name,
    'candidate_email', r.email
  )
  INTO result
  FROM public.interview_configurations ic
  INNER JOIN public.candidate_selections cs ON cs.id = ic.candidate_selection_id
  INNER JOIN public.resumes r ON r.id = cs.resume_id
  WHERE ic.room_id = p_room_id
  LIMIT 1;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.interview_join_context(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.interview_join_context(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_interview_by_room(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE public.interview_configurations
  SET status = 'completed', updated_at = NOW()
  WHERE room_id = p_room_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_interview_by_room(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_interview_by_room(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Row Level Security policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_transcription_webhooks ENABLE ROW LEVEL SECURITY;

-- resumes
DROP POLICY IF EXISTS "resumes_select_own" ON public.resumes;
CREATE POLICY "resumes_select_own" ON public.resumes FOR SELECT TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid());

DROP POLICY IF EXISTS "resumes_insert_own" ON public.resumes;
CREATE POLICY "resumes_insert_own" ON public.resumes FOR INSERT TO authenticated
  WITH CHECK (owner_id IS NOT NULL AND owner_id = auth.uid());

DROP POLICY IF EXISTS "resumes_update_own" ON public.resumes;
CREATE POLICY "resumes_update_own" ON public.resumes FOR UPDATE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid())
  WITH CHECK (owner_id IS NOT NULL AND owner_id = auth.uid());

DROP POLICY IF EXISTS "resumes_delete_own" ON public.resumes;
CREATE POLICY "resumes_delete_own" ON public.resumes FOR DELETE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid());

-- job_descriptions
DROP POLICY IF EXISTS "jobs_select_own" ON public.job_descriptions;
CREATE POLICY "jobs_select_own" ON public.job_descriptions FOR SELECT TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid());

DROP POLICY IF EXISTS "jobs_insert_own" ON public.job_descriptions;
CREATE POLICY "jobs_insert_own" ON public.job_descriptions FOR INSERT TO authenticated
  WITH CHECK (owner_id IS NOT NULL AND owner_id = auth.uid());

DROP POLICY IF EXISTS "jobs_update_own" ON public.job_descriptions;
CREATE POLICY "jobs_update_own" ON public.job_descriptions FOR UPDATE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid())
  WITH CHECK (owner_id IS NOT NULL AND owner_id = auth.uid());

DROP POLICY IF EXISTS "jobs_delete_own" ON public.job_descriptions;
CREATE POLICY "jobs_delete_own" ON public.job_descriptions FOR DELETE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid());

-- resume_scores (derive tenant from resume + job)
DROP POLICY IF EXISTS "resume_scores_select_own" ON public.resume_scores;
CREATE POLICY "resume_scores_select_own" ON public.resume_scores FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_scores.resume_id AND r.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = resume_scores.job_description_id AND j.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "resume_scores_insert_own" ON public.resume_scores;
CREATE POLICY "resume_scores_insert_own" ON public.resume_scores FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_scores.resume_id AND r.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = resume_scores.job_description_id AND j.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "resume_scores_update_own" ON public.resume_scores;
CREATE POLICY "resume_scores_update_own" ON public.resume_scores FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_scores.resume_id AND r.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = resume_scores.job_description_id AND j.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_scores.resume_id AND r.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = resume_scores.job_description_id AND j.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "resume_scores_delete_own" ON public.resume_scores;
CREATE POLICY "resume_scores_delete_own" ON public.resume_scores FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_scores.resume_id AND r.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = resume_scores.job_description_id AND j.owner_id = auth.uid())
  );

-- candidate_selections
DROP POLICY IF EXISTS "candidate_selections_select_own" ON public.candidate_selections;
CREATE POLICY "candidate_selections_select_own" ON public.candidate_selections FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = candidate_selections.resume_id AND r.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = candidate_selections.job_description_id AND j.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "candidate_selections_insert_own" ON public.candidate_selections;
CREATE POLICY "candidate_selections_insert_own" ON public.candidate_selections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = candidate_selections.resume_id AND r.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = candidate_selections.job_description_id AND j.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "candidate_selections_update_own" ON public.candidate_selections;
CREATE POLICY "candidate_selections_update_own" ON public.candidate_selections FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = candidate_selections.resume_id AND r.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = candidate_selections.job_description_id AND j.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = candidate_selections.resume_id AND r.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = candidate_selections.job_description_id AND j.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "candidate_selections_delete_own" ON public.candidate_selections;
CREATE POLICY "candidate_selections_delete_own" ON public.candidate_selections FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = candidate_selections.resume_id AND r.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = candidate_selections.job_description_id AND j.owner_id = auth.uid())
  );

-- interview_configurations (tenant via selection → resume owner)
DROP POLICY IF EXISTS "interview_config_select_own" ON public.interview_configurations;
CREATE POLICY "interview_config_select_own" ON public.interview_configurations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.candidate_selections cs
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE cs.id = interview_configurations.candidate_selection_id
        AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "interview_config_insert_own" ON public.interview_configurations;
CREATE POLICY "interview_config_insert_own" ON public.interview_configurations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidate_selections cs
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE cs.id = interview_configurations.candidate_selection_id
        AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "interview_config_update_own" ON public.interview_configurations;
CREATE POLICY "interview_config_update_own" ON public.interview_configurations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.candidate_selections cs
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE cs.id = interview_configurations.candidate_selection_id
        AND r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidate_selections cs
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE cs.id = interview_configurations.candidate_selection_id
        AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "interview_config_delete_own" ON public.interview_configurations;
CREATE POLICY "interview_config_delete_own" ON public.interview_configurations FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.candidate_selections cs
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE cs.id = interview_configurations.candidate_selection_id
        AND r.owner_id = auth.uid()
    )
  );

-- meeting_transcripts (read only for owning HR; writes via Edge Functions / service role)
DROP POLICY IF EXISTS "meeting_transcripts_select_own" ON public.meeting_transcripts;
CREATE POLICY "meeting_transcripts_select_own" ON public.meeting_transcripts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interview_configurations ic
      INNER JOIN public.candidate_selections cs ON cs.id = ic.candidate_selection_id
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE ic.room_id = meeting_transcripts.room_id
        AND r.owner_id = auth.uid()
    )
  );

-- meeting_transcription_webhooks
DROP POLICY IF EXISTS "meeting_webhooks_select_own" ON public.meeting_transcription_webhooks;
CREATE POLICY "meeting_webhooks_select_own" ON public.meeting_transcription_webhooks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interview_configurations ic
      INNER JOIN public.candidate_selections cs ON cs.id = ic.candidate_selection_id
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE ic.room_id = meeting_transcription_webhooks.room_id
        AND r.owner_id = auth.uid()
    )
  );

-- cheating_detections: replace permissive policies
ALTER TABLE public.cheating_detections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view cheating detections for their interviews" ON public.cheating_detections;
DROP POLICY IF EXISTS "Service role can insert cheating detections" ON public.cheating_detections;

DROP POLICY IF EXISTS "cheating_select_own" ON public.cheating_detections;
CREATE POLICY "cheating_select_own" ON public.cheating_detections FOR SELECT TO authenticated
  USING (
    interview_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.interview_configurations ic
      INNER JOIN public.candidate_selections cs ON cs.id = ic.candidate_selection_id
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE ic.id = cheating_detections.interview_id
        AND r.owner_id = auth.uid()
    )
  );

-- Inserts happen from Edge Functions with service role (bypasses RLS). No INSERT policy for authenticated.

-- ---------------------------------------------------------------------------
-- 6) Storage: private resumes bucket + per-user folder policies
-- ---------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'resumes';

DROP POLICY IF EXISTS "resume_objects_insert_own" ON storage.objects;
CREATE POLICY "resume_objects_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "resume_objects_select_own" ON storage.objects;
CREATE POLICY "resume_objects_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "resume_objects_update_own" ON storage.objects;
CREATE POLICY "resume_objects_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "resume_objects_delete_own" ON storage.objects;
CREATE POLICY "resume_objects_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
