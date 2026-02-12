-- Meeting transcripts per utterance
-- Stores one row per spoken line in a VideoSDK room

CREATE TABLE IF NOT EXISTS meeting_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL,
  session_id text,
  participant_id text,
  participant_name text,
  speaker_label text,
  message text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  raw jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_transcripts_room_at
  ON meeting_transcripts (room_id, at);

COMMENT ON TABLE meeting_transcripts IS 'Per-line meeting transcription captured from VideoSDK (realtime or post-transcription).';
COMMENT ON COLUMN meeting_transcripts.room_id IS 'VideoSDK roomId / meetingId.';
COMMENT ON COLUMN meeting_transcripts.speaker_label IS 'Human-readable speaker label, e.g. AI Agent, Interviewer, Candidate.';
COMMENT ON COLUMN meeting_transcripts.message IS 'Single utterance text, e.g. `Hello Jay, how are you?`.';

