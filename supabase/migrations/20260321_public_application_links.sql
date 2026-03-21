-- Public HR-specific application links with expiration

CREATE TABLE IF NOT EXISTS public.job_application_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_description_id UUID NOT NULL REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.job_application_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public.job_application_links(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  candidate_email TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_application_links_owner ON public.job_application_links(owner_id);
CREATE INDEX IF NOT EXISTS idx_job_application_links_slug ON public.job_application_links(slug);
CREATE INDEX IF NOT EXISTS idx_job_application_submissions_owner ON public.job_application_submissions(owner_id);
CREATE INDEX IF NOT EXISTS idx_job_application_submissions_link ON public.job_application_submissions(link_id);

CREATE OR REPLACE FUNCTION public.update_job_application_links_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_application_links_updated_at ON public.job_application_links;
CREATE TRIGGER trg_job_application_links_updated_at
BEFORE UPDATE ON public.job_application_links
FOR EACH ROW
EXECUTE FUNCTION public.update_job_application_links_updated_at();

CREATE OR REPLACE FUNCTION public.set_job_link_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  job_owner UUID;
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;

  SELECT owner_id INTO job_owner FROM public.job_descriptions WHERE id = NEW.job_description_id;
  IF job_owner IS NULL OR NEW.owner_id IS DISTINCT FROM job_owner THEN
    RAISE EXCEPTION 'job_description ownership mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_link_owner ON public.job_application_links;
CREATE TRIGGER trg_job_link_owner
BEFORE INSERT OR UPDATE ON public.job_application_links
FOR EACH ROW
EXECUTE FUNCTION public.set_job_link_owner();

ALTER TABLE public.job_application_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_application_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_links_select_own" ON public.job_application_links;
CREATE POLICY "job_links_select_own"
ON public.job_application_links FOR SELECT TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "job_links_insert_own" ON public.job_application_links;
CREATE POLICY "job_links_insert_own"
ON public.job_application_links FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "job_links_update_own" ON public.job_application_links;
CREATE POLICY "job_links_update_own"
ON public.job_application_links FOR UPDATE TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "job_links_delete_own" ON public.job_application_links;
CREATE POLICY "job_links_delete_own"
ON public.job_application_links FOR DELETE TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "job_submissions_select_own" ON public.job_application_submissions;
CREATE POLICY "job_submissions_select_own"
ON public.job_application_submissions FOR SELECT TO authenticated
USING (owner_id = auth.uid());

-- Public form metadata fetch by slug (safe subset only)
CREATE OR REPLACE FUNCTION public.get_public_application_link(p_slug TEXT)
RETURNS TABLE (
  link_id UUID,
  slug TEXT,
  title TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN,
  is_expired BOOLEAN,
  job_id UUID,
  job_title TEXT,
  job_description TEXT,
  required_skills TEXT[],
  min_experience_years INTEGER,
  location TEXT,
  degree_required TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id AS link_id,
    l.slug,
    l.title,
    l.expires_at,
    l.is_active,
    (NOW() > l.expires_at) AS is_expired,
    j.id AS job_id,
    j.title AS job_title,
    j.description AS job_description,
    j.required_skills,
    j.min_experience_years,
    j.location,
    j.degree_required
  FROM public.job_application_links l
  INNER JOIN public.job_descriptions j ON j.id = l.job_description_id
  WHERE l.slug = p_slug
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_application_link(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_application_link(TEXT) TO anon, authenticated;
