-- Create cheating_detections table for storing interview monitoring events
-- Migration: 20250215_cheating_detections.sql

CREATE TABLE IF NOT EXISTS cheating_detections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id UUID REFERENCES interview_configurations(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  violation_type TEXT NOT NULL CHECK (violation_type IN ('eyes_away', 'multiple_faces', 'head_turned', 'low_attention')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_cheating_detections_interview ON cheating_detections(interview_id);
CREATE INDEX IF NOT EXISTS idx_cheating_detections_room ON cheating_detections(room_id);
CREATE INDEX IF NOT EXISTS idx_cheating_detections_timestamp ON cheating_detections(timestamp);
CREATE INDEX IF NOT EXISTS idx_cheating_detections_violation_type ON cheating_detections(violation_type);

-- Add RLS policies
ALTER TABLE cheating_detections ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own interview detections
CREATE POLICY "Users can view cheating detections for their interviews"
  ON cheating_detections
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow service role to insert detection events
CREATE POLICY "Service role can insert cheating detections"
  ON cheating_detections
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- Add comment for documentation
COMMENT ON TABLE cheating_detections IS 'Stores real-time cheating detection events during interviews';
COMMENT ON COLUMN cheating_detections.violation_type IS 'Type of violation detected: eyes_away, multiple_faces, head_turned, low_attention';
COMMENT ON COLUMN cheating_detections.severity IS 'Severity level: low, medium, high';
COMMENT ON COLUMN cheating_detections.confidence IS 'Detection confidence score between 0 and 1';
COMMENT ON COLUMN cheating_detections.metadata IS 'Additional detection data like attention score, gaze direction, etc.';
