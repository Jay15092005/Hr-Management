-- Migration: Add interview_configurations table and update candidate_selections
-- Created: 2025-01-25

-- Add interview_scheduled column to candidate_selections table
ALTER TABLE candidate_selections 
ADD COLUMN IF NOT EXISTS interview_scheduled BOOLEAN DEFAULT FALSE;

-- Create interview_configurations table
CREATE TABLE IF NOT EXISTS interview_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_selection_id UUID NOT NULL REFERENCES candidate_selections(id) ON DELETE CASCADE,
  interview_type VARCHAR(50) NOT NULL,
  difficulty_level VARCHAR(20) NOT NULL CHECK (difficulty_level IN ('Easy', 'Medium', 'Hard')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  coding_round BOOLEAN DEFAULT FALSE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  room_id VARCHAR(255),
  room_created_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  join_link_email_sent BOOLEAN DEFAULT FALSE,
  join_link_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_interview_configurations_candidate_selection_id 
  ON interview_configurations(candidate_selection_id);

CREATE INDEX IF NOT EXISTS idx_interview_configurations_scheduled_at 
  ON interview_configurations(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_interview_configurations_status 
  ON interview_configurations(status);

CREATE INDEX IF NOT EXISTS idx_interview_configurations_room_id 
  ON interview_configurations(room_id) WHERE room_id IS NOT NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_interview_configurations_updated_at
  BEFORE UPDATE ON interview_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to get upcoming interviews that need Email 2 (5 minutes before)
CREATE OR REPLACE FUNCTION get_interviews_for_email_link()
RETURNS TABLE (
  id UUID,
  candidate_selection_id UUID,
  scheduled_at TIMESTAMPTZ,
  interview_type VARCHAR,
  difficulty_level VARCHAR,
  duration_minutes INTEGER,
  coding_round BOOLEAN,
  candidate_email VARCHAR,
  candidate_name VARCHAR,
  job_title VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ic.id,
    ic.candidate_selection_id,
    ic.scheduled_at,
    ic.interview_type,
    ic.difficulty_level,
    ic.duration_minutes,
    ic.coding_round,
    r.email AS candidate_email,
    r.name AS candidate_name,
    jd.title AS job_title
  FROM interview_configurations ic
  INNER JOIN candidate_selections cs ON ic.candidate_selection_id = cs.id
  INNER JOIN resumes r ON cs.resume_id = r.id
  INNER JOIN job_descriptions jd ON cs.job_description_id = jd.id
  WHERE ic.status = 'scheduled'
    AND ic.join_link_email_sent = FALSE
    AND ic.scheduled_at > NOW()
    AND ic.scheduled_at <= NOW() + INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Create function to get interviews that need room creation (at T-0)
CREATE OR REPLACE FUNCTION get_interviews_for_room_creation()
RETURNS TABLE (
  id UUID,
  candidate_selection_id UUID,
  scheduled_at TIMESTAMPTZ,
  interview_type VARCHAR,
  difficulty_level VARCHAR,
  duration_minutes INTEGER,
  coding_round BOOLEAN,
  room_id VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ic.id,
    ic.candidate_selection_id,
    ic.scheduled_at,
    ic.interview_type,
    ic.difficulty_level,
    ic.duration_minutes,
    ic.coding_round,
    ic.room_id
  FROM interview_configurations ic
  WHERE ic.status = 'scheduled'
    AND ic.room_id IS NULL
    AND ic.scheduled_at <= NOW()
    AND ic.scheduled_at >= NOW() - INTERVAL '1 minute';
END;
$$ LANGUAGE plpgsql;

-- Add comment to table
COMMENT ON TABLE interview_configurations IS 'Stores interview configuration and scheduling information for selected candidates';
COMMENT ON COLUMN interview_configurations.room_id IS 'VideoSDK room ID, created at interview start time (T-0)';
COMMENT ON COLUMN interview_configurations.join_link_email_sent IS 'Whether Email 2 (join link) has been sent 5 minutes before interview';
