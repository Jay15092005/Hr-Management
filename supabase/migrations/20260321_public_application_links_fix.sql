-- Fix ownership mismatch for legacy jobs and add per-link requirement/detail fields

ALTER TABLE public.job_application_links
  ADD COLUMN IF NOT EXISTS custom_requirements TEXT,
  ADD COLUMN IF NOT EXISTS additional_details TEXT;

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

  -- Legacy compatibility: if job row predates owner_id backfill, claim it for current HR.
  UPDATE public.job_descriptions
  SET owner_id = NEW.owner_id
  WHERE id = NEW.job_description_id AND owner_id IS NULL;

  SELECT owner_id INTO job_owner FROM public.job_descriptions WHERE id = NEW.job_description_id;
  IF job_owner IS NULL OR NEW.owner_id IS DISTINCT FROM job_owner THEN
    RAISE EXCEPTION 'job_description ownership mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_application_link(p_slug TEXT)
RETURNS TABLE (
  link_id UUID,
  slug TEXT,
  title TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN,
  is_expired BOOLEAN,
  custom_requirements TEXT,
  additional_details TEXT,
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
    l.custom_requirements,
    l.additional_details,
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
