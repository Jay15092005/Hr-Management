-- Migration: 20250215_update_violation_types.sql
-- Update the check constraint on cheating_detections to allow new violation types

-- Drop the existing check constraint
ALTER TABLE cheating_detections DROP CONSTRAINT IF EXISTS cheating_detections_violation_type_check;

-- Add the new check constraint with expanded types
ALTER TABLE cheating_detections ADD CONSTRAINT cheating_detections_violation_type_check 
  CHECK (violation_type IN (
    'eyes_away', 
    'multiple_faces', 
    'head_turned', 
    'low_attention',
    'tab_switch',
    'fullscreen_exit',
    'mouse_leave',
    'copy_paste',
    'suspicious_audio',
    'multiple_voices'
  ));

-- Add comment for documentation
COMMENT ON COLUMN cheating_detections.violation_type IS 'Type of violation detected: eyes_away, multiple_faces, head_turned, low_attention, tab_switch, fullscreen_exit, mouse_leave, copy_paste, suspicious_audio, multiple_voices';
