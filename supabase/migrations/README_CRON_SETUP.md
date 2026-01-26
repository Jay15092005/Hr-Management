# pg_cron Setup Instructions

This document explains how to set up automated scheduling for interview emails and room creation.

## Prerequisites

1. **Enable pg_cron extension** in Supabase Dashboard:
   - Go to Database > Extensions
   - Search for "pg_cron"
   - Enable it

2. **Enable http extension** (if using http() function):
   - Go to Database > Extensions
   - Search for "http"
   - Enable it

   OR

   **Enable pg_net extension** (recommended, simpler):
   - Go to Database > Extensions
   - Search for "pg_net"
   - Enable it

## Configuration

### Step 1: Set Environment Variables

Run these SQL commands in Supabase SQL Editor to configure your project URL and service role key:

```sql
-- Replace YOUR_PROJECT_REF with your actual Supabase project reference
-- Replace YOUR_SERVICE_ROLE_KEY with your actual service role key
ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

### Step 2: Create Cron Jobs

Run these SQL commands in Supabase SQL Editor:

```sql
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
```

## Alternative: Using Supabase Edge Functions with External Cron

If pg_cron is not available or you prefer external scheduling, you can:

1. Use a service like Vercel Cron, GitHub Actions, or a simple cron server
2. Call the Edge Functions directly via HTTP:

```bash
# Send Email 2 (5 minutes before)
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-interview-link-email \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"interview_id": "INTERVIEW_ID"}'

# Create Room (at T-0)
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-interview-room \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"interview_id": "INTERVIEW_ID"}'
```

## Testing

To test the functions manually:

```sql
-- Test Email 2 function
SELECT send_interview_link_email_job();

-- Test room creation function
SELECT create_interview_room_job();
```

## Monitoring

Check cron job status:

```sql
-- List all cron jobs
SELECT * FROM cron.job;

-- Check job run history
SELECT * FROM cron.job_run_details 
WHERE jobid IN (
  SELECT jobid FROM cron.job WHERE jobname IN ('send-interview-link-email', 'create-interview-room')
)
ORDER BY start_time DESC
LIMIT 10;
```

## Troubleshooting

1. **Functions not running**: Check that pg_cron extension is enabled
2. **HTTP errors**: Ensure http or pg_net extension is enabled
3. **Edge Function errors**: Check Edge Function logs in Supabase Dashboard
4. **Configuration errors**: Verify app.supabase_url and app.service_role_key are set correctly
