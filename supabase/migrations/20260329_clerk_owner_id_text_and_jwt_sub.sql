-- Clerk user ids are strings (user_...), not UUIDs. auth.uid() casts sub to uuid and fails (22P02).
-- Store owner_id as TEXT and use (auth.jwt()->>'sub') in RLS and triggers.

-- ---------------------------------------------------------------------------
-- 1) Drop dependent triggers (before column type change)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_resumes_set_owner ON public.resumes;
DROP TRIGGER IF EXISTS trg_job_descriptions_set_owner ON public.job_descriptions;
DROP TRIGGER IF EXISTS trg_resumes_owner_immutable ON public.resumes;
DROP TRIGGER IF EXISTS trg_job_descriptions_owner_immutable ON public.job_descriptions;
DROP TRIGGER IF EXISTS trg_candidate_selections_same_owner ON public.candidate_selections;
DROP TRIGGER IF EXISTS trg_job_link_owner ON public.job_application_links;

-- ---------------------------------------------------------------------------
-- 2) Drop RLS policies that reference owner_id / auth.uid (keep hr_profiles_* as-is)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "resumes_select_own" ON public.resumes;
DROP POLICY IF EXISTS "resumes_insert_own" ON public.resumes;
DROP POLICY IF EXISTS "resumes_update_own" ON public.resumes;
DROP POLICY IF EXISTS "resumes_delete_own" ON public.resumes;

DROP POLICY IF EXISTS "jobs_select_own" ON public.job_descriptions;
DROP POLICY IF EXISTS "jobs_insert_own" ON public.job_descriptions;
DROP POLICY IF EXISTS "jobs_update_own" ON public.job_descriptions;
DROP POLICY IF EXISTS "jobs_delete_own" ON public.job_descriptions;

DROP POLICY IF EXISTS "resume_scores_select_own" ON public.resume_scores;
DROP POLICY IF EXISTS "resume_scores_insert_own" ON public.resume_scores;
DROP POLICY IF EXISTS "resume_scores_update_own" ON public.resume_scores;
DROP POLICY IF EXISTS "resume_scores_delete_own" ON public.resume_scores;

DROP POLICY IF EXISTS "candidate_selections_select_own" ON public.candidate_selections;
DROP POLICY IF EXISTS "candidate_selections_insert_own" ON public.candidate_selections;
DROP POLICY IF EXISTS "candidate_selections_update_own" ON public.candidate_selections;
DROP POLICY IF EXISTS "candidate_selections_delete_own" ON public.candidate_selections;

DROP POLICY IF EXISTS "interview_config_select_own" ON public.interview_configurations;
DROP POLICY IF EXISTS "interview_config_insert_own" ON public.interview_configurations;
DROP POLICY IF EXISTS "interview_config_update_own" ON public.interview_configurations;
DROP POLICY IF EXISTS "interview_config_delete_own" ON public.interview_configurations;

DROP POLICY IF EXISTS "meeting_transcripts_select_own" ON public.meeting_transcripts;
DROP POLICY IF EXISTS "meeting_webhooks_select_own" ON public.meeting_transcription_webhooks;
DROP POLICY IF EXISTS "cheating_select_own" ON public.cheating_detections;

DROP POLICY IF EXISTS "resume_objects_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "resume_objects_select_own" ON storage.objects;
DROP POLICY IF EXISTS "resume_objects_update_own" ON storage.objects;
DROP POLICY IF EXISTS "resume_objects_delete_own" ON storage.objects;

DROP POLICY IF EXISTS "job_links_select_own" ON public.job_application_links;
DROP POLICY IF EXISTS "job_links_insert_own" ON public.job_application_links;
DROP POLICY IF EXISTS "job_links_update_own" ON public.job_application_links;
DROP POLICY IF EXISTS "job_links_delete_own" ON public.job_application_links;
DROP POLICY IF EXISTS "job_submissions_select_own" ON public.job_application_submissions;

-- ---------------------------------------------------------------------------
-- 3) Drop FKs to auth.users on owner_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_owner_id_fkey;
ALTER TABLE public.job_descriptions DROP CONSTRAINT IF EXISTS job_descriptions_owner_id_fkey;
ALTER TABLE public.job_application_links DROP CONSTRAINT IF EXISTS job_application_links_owner_id_fkey;
ALTER TABLE public.job_application_submissions DROP CONSTRAINT IF EXISTS job_application_submissions_owner_id_fkey;

-- ---------------------------------------------------------------------------
-- 4) Widen owner_id to TEXT (UUIDs become text with hyphens)
-- ---------------------------------------------------------------------------
ALTER TABLE public.resumes
  ALTER COLUMN owner_id TYPE TEXT USING owner_id::text
;
ALTER TABLE public.job_descriptions
  ALTER COLUMN owner_id TYPE TEXT USING owner_id::text
;
ALTER TABLE public.job_application_links
  ALTER COLUMN owner_id TYPE TEXT USING owner_id::text
;
ALTER TABLE public.job_application_submissions
  ALTER COLUMN owner_id TYPE TEXT USING owner_id::text
;

-- ---------------------------------------------------------------------------
-- 5) Trigger functions (use JWT sub, not auth.uid())
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_row_owner_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_id IS NULL AND (auth.jwt()->>'sub') IS NOT NULL THEN
    NEW.owner_id := (auth.jwt()->>'sub');
  END IF;
  RETURN NEW;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.ensure_selection_same_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r_owner TEXT;
  j_owner TEXT;
BEGIN
  SELECT owner_id INTO r_owner FROM public.resumes WHERE id = NEW.resume_id;
  SELECT owner_id INTO j_owner FROM public.job_descriptions WHERE id = NEW.job_description_id;
  IF r_owner IS NULL OR j_owner IS NULL OR r_owner IS DISTINCT FROM j_owner THEN
    RAISE EXCEPTION 'resume and job_description must exist and belong to the same HR (owner_id)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_job_link_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  job_owner TEXT;
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := (auth.jwt()->>'sub');
  END IF;

  SELECT owner_id INTO job_owner FROM public.job_descriptions WHERE id = NEW.job_description_id;

  IF job_owner IS NOT NULL AND NEW.owner_id IS DISTINCT FROM job_owner THEN
    RAISE EXCEPTION 'job_description ownership mismatch';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Recreate triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_resumes_set_owner
  BEFORE INSERT ON public.resumes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_row_owner_id();

CREATE TRIGGER trg_job_descriptions_set_owner
  BEFORE INSERT ON public.job_descriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_row_owner_id();

CREATE TRIGGER trg_resumes_owner_immutable
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_id_change();

CREATE TRIGGER trg_job_descriptions_owner_immutable
  BEFORE UPDATE ON public.job_descriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_id_change();

CREATE TRIGGER trg_candidate_selections_same_owner
  BEFORE INSERT OR UPDATE ON public.candidate_selections
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_selection_same_owner();

CREATE TRIGGER trg_job_link_owner
  BEFORE INSERT OR UPDATE ON public.job_application_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_job_link_owner();

-- ---------------------------------------------------------------------------
-- 7) RLS policies: (auth.jwt()->>'sub')
-- ---------------------------------------------------------------------------
CREATE POLICY "resumes_select_own" ON public.resumes FOR SELECT TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "resumes_insert_own" ON public.resumes FOR INSERT TO authenticated
  WITH CHECK (owner_id IS NOT NULL AND owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "resumes_update_own" ON public.resumes FOR UPDATE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = (auth.jwt()->>'sub'))
  WITH CHECK (owner_id IS NOT NULL AND owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "resumes_delete_own" ON public.resumes FOR DELETE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "jobs_select_own" ON public.job_descriptions FOR SELECT TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "jobs_insert_own" ON public.job_descriptions FOR INSERT TO authenticated
  WITH CHECK (owner_id IS NOT NULL AND owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "jobs_update_own" ON public.job_descriptions FOR UPDATE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = (auth.jwt()->>'sub'))
  WITH CHECK (owner_id IS NOT NULL AND owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "jobs_delete_own" ON public.job_descriptions FOR DELETE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "resume_scores_select_own" ON public.resume_scores FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_scores.resume_id AND r.owner_id = (auth.jwt()->>'sub'))
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = resume_scores.job_description_id AND j.owner_id = (auth.jwt()->>'sub'))
  );

CREATE POLICY "resume_scores_insert_own" ON public.resume_scores FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_scores.resume_id AND r.owner_id = (auth.jwt()->>'sub'))
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = resume_scores.job_description_id AND j.owner_id = (auth.jwt()->>'sub'))
  );

CREATE POLICY "resume_scores_update_own" ON public.resume_scores FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_scores.resume_id AND r.owner_id = (auth.jwt()->>'sub'))
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = resume_scores.job_description_id AND j.owner_id = (auth.jwt()->>'sub'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_scores.resume_id AND r.owner_id = (auth.jwt()->>'sub'))
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = resume_scores.job_description_id AND j.owner_id = (auth.jwt()->>'sub'))
  );

CREATE POLICY "resume_scores_delete_own" ON public.resume_scores FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_scores.resume_id AND r.owner_id = (auth.jwt()->>'sub'))
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = resume_scores.job_description_id AND j.owner_id = (auth.jwt()->>'sub'))
  );

CREATE POLICY "candidate_selections_select_own" ON public.candidate_selections FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = candidate_selections.resume_id AND r.owner_id = (auth.jwt()->>'sub'))
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = candidate_selections.job_description_id AND j.owner_id = (auth.jwt()->>'sub'))
  );

CREATE POLICY "candidate_selections_insert_own" ON public.candidate_selections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = candidate_selections.resume_id AND r.owner_id = (auth.jwt()->>'sub'))
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = candidate_selections.job_description_id AND j.owner_id = (auth.jwt()->>'sub'))
  );

CREATE POLICY "candidate_selections_update_own" ON public.candidate_selections FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = candidate_selections.resume_id AND r.owner_id = (auth.jwt()->>'sub'))
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = candidate_selections.job_description_id AND j.owner_id = (auth.jwt()->>'sub'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = candidate_selections.resume_id AND r.owner_id = (auth.jwt()->>'sub'))
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = candidate_selections.job_description_id AND j.owner_id = (auth.jwt()->>'sub'))
  );

CREATE POLICY "candidate_selections_delete_own" ON public.candidate_selections FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = candidate_selections.resume_id AND r.owner_id = (auth.jwt()->>'sub'))
    AND EXISTS (SELECT 1 FROM public.job_descriptions j WHERE j.id = candidate_selections.job_description_id AND j.owner_id = (auth.jwt()->>'sub'))
  );

CREATE POLICY "interview_config_select_own" ON public.interview_configurations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.candidate_selections cs
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE cs.id = interview_configurations.candidate_selection_id
        AND r.owner_id = (auth.jwt()->>'sub')
    )
  );

CREATE POLICY "interview_config_insert_own" ON public.interview_configurations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidate_selections cs
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE cs.id = interview_configurations.candidate_selection_id
        AND r.owner_id = (auth.jwt()->>'sub')
    )
  );

CREATE POLICY "interview_config_update_own" ON public.interview_configurations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.candidate_selections cs
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE cs.id = interview_configurations.candidate_selection_id
        AND r.owner_id = (auth.jwt()->>'sub')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidate_selections cs
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE cs.id = interview_configurations.candidate_selection_id
        AND r.owner_id = (auth.jwt()->>'sub')
    )
  );

CREATE POLICY "interview_config_delete_own" ON public.interview_configurations FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.candidate_selections cs
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE cs.id = interview_configurations.candidate_selection_id
        AND r.owner_id = (auth.jwt()->>'sub')
    )
  );

CREATE POLICY "meeting_transcripts_select_own" ON public.meeting_transcripts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interview_configurations ic
      INNER JOIN public.candidate_selections cs ON cs.id = ic.candidate_selection_id
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE ic.room_id = meeting_transcripts.room_id
        AND r.owner_id = (auth.jwt()->>'sub')
    )
  );

CREATE POLICY "meeting_webhooks_select_own" ON public.meeting_transcription_webhooks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interview_configurations ic
      INNER JOIN public.candidate_selections cs ON cs.id = ic.candidate_selection_id
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE ic.room_id = meeting_transcription_webhooks.room_id
        AND r.owner_id = (auth.jwt()->>'sub')
    )
  );

CREATE POLICY "cheating_select_own" ON public.cheating_detections FOR SELECT TO authenticated
  USING (
    interview_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.interview_configurations ic
      INNER JOIN public.candidate_selections cs ON cs.id = ic.candidate_selection_id
      INNER JOIN public.resumes r ON r.id = cs.resume_id
      WHERE ic.id = cheating_detections.interview_id
        AND r.owner_id = (auth.jwt()->>'sub')
    )
  );

CREATE POLICY "resume_objects_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = (auth.jwt()->>'sub')
  );

CREATE POLICY "resume_objects_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = (auth.jwt()->>'sub')
  );

CREATE POLICY "resume_objects_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = (auth.jwt()->>'sub')
  )
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = (auth.jwt()->>'sub')
  );

CREATE POLICY "resume_objects_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = (auth.jwt()->>'sub')
  );

CREATE POLICY "job_links_select_own"
ON public.job_application_links FOR SELECT TO authenticated
USING (owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "job_links_insert_own"
ON public.job_application_links FOR INSERT TO authenticated
WITH CHECK (owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "job_links_update_own"
ON public.job_application_links FOR UPDATE TO authenticated
USING (owner_id = (auth.jwt()->>'sub'))
WITH CHECK (owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "job_links_delete_own"
ON public.job_application_links FOR DELETE TO authenticated
USING (owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "job_submissions_select_own"
ON public.job_application_submissions FOR SELECT TO authenticated
USING (owner_id = (auth.jwt()->>'sub'));
