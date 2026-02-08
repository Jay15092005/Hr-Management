-- Add must-have and nice-to-have matched skills to resume_scores
ALTER TABLE resume_scores
  ADD COLUMN IF NOT EXISTS must_have_matched_skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nice_to_have_matched_skills jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN resume_scores.must_have_matched_skills IS 'Job must-have skills that the resume shows';
COMMENT ON COLUMN resume_scores.nice_to_have_matched_skills IS 'Job nice-to-have skills that the resume shows';
