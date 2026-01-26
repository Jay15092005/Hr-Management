-- Migration: Set up pg_cron jobs for automated interview scheduling
-- Created: 2025-01-25
-- Note: pg_cron extension must be enabled in Supabase dashboard first

-- Enable pg_cron extension (if not already enabled)
-- This should be done via Supabase dashboard: Database > Extensions > pg_cron
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to send Email 2 (join link) 5 minutes before interview
-- This function calls the Edge Function via HTTP
CREATE OR REPLACE FUNCTION send_interview_link_email_job()
RETURNS void AS $$
DECLARE
  interview_record RECORD;
  edge_function_url TEXT;
  response_status INT;
  response_body TEXT;
BEGIN
  -- Get Supabase project URL from environment or set it manually
  -- Replace YOUR_PROJECT_REF with your actual Supabase project reference
  edge_function_url := current_setting('app.supabase_url', true) || '/functions/v1/send-interview-link-email';
  
  -- If app.supabase_url is not set, use a default pattern
  -- You'll need to replace this with your actual project URL
  IF edge_function_url IS NULL OR edge_function_url = '/functions/v1/send-interview-link-email' THEN
    -- Default pattern: https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-interview-link-email
    -- You should set this via: ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
    RAISE NOTICE 'app.supabase_url not set. Please configure it.';
    RETURN;
  END IF;

  -- Find interviews that need Email 2 sent (5 minutes before)
  FOR interview_record IN
    SELECT id
    FROM interview_configurations
    WHERE status = 'scheduled'
      AND join_link_email_sent = FALSE
      AND scheduled_at > NOW()
      AND scheduled_at <= NOW() + INTERVAL '5 minutes'
  LOOP
    BEGIN
      -- Call Edge Function via HTTP
      SELECT status, content INTO response_status, response_body
      FROM http((
        'POST',
        edge_function_url,
        ARRAY[
          http_header('Content-Type', 'application/json'),
          http_header('Authorization', 'Bearer ' || current_setting('app.service_role_key', true))
        ],
        'application/json',
        json_build_object('interview_id', interview_record.id)::text
      )::http_request);

      IF response_status = 200 THEN
        RAISE NOTICE 'Email 2 sent for interview %', interview_record.id;
      ELSE
        RAISE WARNING 'Failed to send Email 2 for interview %: Status %', interview_record.id, response_status;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error sending Email 2 for interview %: %', interview_record.id, SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create interview room at T-0
CREATE OR REPLACE FUNCTION create_interview_room_job()
RETURNS void AS $$
DECLARE
  interview_record RECORD;
  edge_function_url TEXT;
  response_status INT;
  response_body TEXT;
BEGIN
  -- Get Supabase project URL
  edge_function_url := current_setting('app.supabase_url', true) || '/functions/v1/create-interview-room';
  
  IF edge_function_url IS NULL OR edge_function_url = '/functions/v1/create-interview-room' THEN
    RAISE NOTICE 'app.supabase_url not set. Please configure it.';
    RETURN;
  END IF;

  -- Find interviews that need room creation (at T-0, within 1 minute window)
  FOR interview_record IN
    SELECT id
    FROM interview_configurations
    WHERE status = 'scheduled'
      AND room_id IS NULL
      AND scheduled_at <= NOW()
      AND scheduled_at >= NOW() - INTERVAL '1 minute'
  LOOP
    BEGIN
      -- Call Edge Function via HTTP
      SELECT status, content INTO response_status, response_body
      FROM http((
        'POST',
        edge_function_url,
        ARRAY[
          http_header('Content-Type', 'application/json'),
          http_header('Authorization', 'Bearer ' || current_setting('app.service_role_key', true))
        ],
        'application/json',
        json_build_object('interview_id', interview_record.id)::text
      )::http_request);

      IF response_status = 200 THEN
        RAISE NOTICE 'Room created for interview %', interview_record.id;
      ELSE
        RAISE WARNING 'Failed to create room for interview %: Status %', interview_record.id, response_status;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error creating room for interview %: %', interview_record.id, SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: The actual pg_cron jobs need to be created via Supabase SQL Editor or CLI
-- because pg_cron requires superuser privileges

-- Example pg_cron job creation (run these in Supabase SQL Editor):
/*
-- Schedule Email 2 job to run every minute
SELECT cron.schedule(
  'send-interview-link-email',
  '* * * * *', -- Every minute
  $$SELECT send_interview_link_email_job()$$
);

-- Schedule room creation job to run every minute
SELECT cron.schedule(
  'create-interview-room',
  '* * * * *', -- Every minute
  $$SELECT create_interview_room_job()$$
);
*/

-- Alternative: Use Supabase's built-in pg_net extension for HTTP calls
-- This is simpler and doesn't require http extension
-- But requires pg_net to be enabled

-- Simplified version using pg_net (if available):
/*
CREATE OR REPLACE FUNCTION send_interview_link_email_simple()
RETURNS void AS $$
DECLARE
  interview_record RECORD;
BEGIN
  FOR interview_record IN
    SELECT id
    FROM interview_configurations
    WHERE status = 'scheduled'
      AND join_link_email_sent = FALSE
      AND scheduled_at > NOW()
      AND scheduled_at <= NOW() + INTERVAL '5 minutes'
  LOOP
    -- Use Supabase's net.http_post function
    PERFORM net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/send-interview-link-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := jsonb_build_object('interview_id', interview_record.id)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
*/

COMMENT ON FUNCTION send_interview_link_email_job() IS 'Sends Email 2 (join link) 5 minutes before interview. Called by pg_cron.';
COMMENT ON FUNCTION create_interview_room_job() IS 'Creates VideoSDK room at interview start time (T-0). Called by pg_cron.';
