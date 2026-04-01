-- Fix: avoid mutating job_descriptions.owner_id during link creation
-- because owner_id has an immutability trigger in this project.

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

  -- Allow legacy jobs with NULL owner_id (do not mutate job row here),
  -- otherwise enforce strict ownership match.
  IF job_owner IS NOT NULL AND NEW.owner_id IS DISTINCT FROM job_owner THEN
    RAISE EXCEPTION 'job_description ownership mismatch';
  END IF;

  RETURN NEW;
END;
$$;
