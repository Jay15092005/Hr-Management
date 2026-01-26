# VideoSDK Interview Scheduling Setup Guide

This document provides setup instructions for the VideoSDK interview scheduling system.

## Overview

The system implements a complete interview scheduling workflow:
1. HR selects candidates and schedules interviews
2. Email 1: Selection confirmation with interview details (sent immediately)
3. Email 2: Join link sent 5 minutes before interview
4. Room creation: VideoSDK room created at interview start time (T-0)
5. Candidate joins interview room

## Prerequisites

1. **VideoSDK Account**: Sign up at https://videosdk.live
2. **VideoSDK API Credentials**: Get your API key and secret from VideoSDK dashboard
3. **Supabase Project**: Already configured
4. **Resend API Key**: Already configured for emails

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

This will install `@videosdk.live/react-sdk` which was added to package.json.

### 2. Configure Environment Variables

Add to your `.env` file:

```env
# VideoSDK Configuration
VITE_VIDEOSDK_API_KEY=your_videosdk_api_key_here
VITE_VIDEOSDK_SECRET=your_videosdk_secret_here

# For Edge Functions (set in Supabase Dashboard)
VIDEOSDK_API_KEY=your_videosdk_api_key_here
VIDEOSDK_SECRET=your_videosdk_secret_here
```

### 3. Run Database Migrations

Execute the migration files in Supabase SQL Editor:

1. **`supabase/migrations/20250125_interview_configurations.sql`**
   - Creates `interview_configurations` table
   - Adds `interview_scheduled` column to `candidate_selections`
   - Creates helper functions

2. **`supabase/migrations/20250125_pg_cron_setup.sql`**
   - Creates cron job functions
   - See `supabase/migrations/README_CRON_SETUP.md` for detailed setup

### 4. Configure Edge Functions

Set environment variables in Supabase Dashboard for Edge Functions:

1. Go to **Project Settings > Edge Functions**
2. Add secrets:
   - `VIDEOSDK_API_KEY`: Your VideoSDK API key
   - `VIDEOSDK_SECRET`: Your VideoSDK secret
   - `RESEND_API_KEY`: Already configured
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key

### 5. Deploy Edge Functions

Deploy the new Edge Functions:

```bash
# Deploy send-interview-link-email function
supabase functions deploy send-interview-link-email

# Deploy create-interview-room function
supabase functions deploy create-interview-room
```

### 6. Set Up pg_cron Jobs

Follow the instructions in `supabase/migrations/README_CRON_SETUP.md` to:
1. Enable pg_cron extension
2. Configure database settings
3. Create cron jobs

**Quick Setup:**

```sql
-- Set project URL and service role key
ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

-- Create cron jobs
SELECT cron.schedule(
  'send-interview-link-email',
  '* * * * *',
  $$SELECT send_interview_link_email_job()$$
);

SELECT cron.schedule(
  'create-interview-room',
  '* * * * *',
  $$SELECT create_interview_room_job()$$
);
```

## Usage

### HR Workflow

1. **Select Candidate**: In HR Review, click "Select" for a candidate
2. **Schedule Interview**: Click "Schedule Interview" button
3. **Configure Interview**:
   - Select interview type (Python, Node.js, etc.)
   - Choose difficulty level
   - Set duration
   - Toggle coding round
   - Select date and time
4. **Save**: Interview is scheduled and Email 1 is sent

### Automated Process

1. **5 Minutes Before Interview**: 
   - pg_cron triggers `send-interview-link-email`
   - Email 2 is sent with join link
   - Room is not yet active

2. **At Interview Start Time (T-0)**:
   - pg_cron triggers `create-interview-room`
   - VideoSDK room is created
   - Room ID is stored in database
   - Status changes to 'active'

3. **Candidate Joins**:
   - Candidate clicks join link from Email 2
   - System validates room is active
   - Candidate joins interview

## VideoSDK Token Generation

**Important**: The current implementation uses the API key directly as a token. For production:

1. Implement proper JWT token generation using VideoSDK's token generation library
2. Create a server-side endpoint to generate tokens
3. Update `InterviewRoom.tsx` to fetch tokens from your API

See VideoSDK documentation: https://docs.videosdk.live/api-reference/realtime-communication/create-room

## Testing

### Test Interview Scheduling

1. Select a candidate in HR Review
2. Schedule an interview for 2-3 minutes in the future
3. Check that Email 1 is sent with interview details
4. Wait for Email 2 (5 minutes before)
5. Wait for room creation (at T-0)
6. Test joining the room

### Manual Testing

You can manually trigger the Edge Functions:

```bash
# Send Email 2
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-interview-link-email \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"interview_id": "INTERVIEW_ID"}'

# Create Room
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-interview-room \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"interview_id": "INTERVIEW_ID"}'
```

## Troubleshooting

### Room Not Created

- Check Edge Function logs in Supabase Dashboard
- Verify VideoSDK API credentials are correct
- Check that interview status is 'scheduled' and scheduled_at is in the past

### Email Not Sent

- Check Resend API key configuration
- Verify Edge Function logs
- Check that `join_link_email_sent` is false in database

### Candidate Cannot Join

- Verify room status is 'active'
- Check that room_id is set in database
- Verify VideoSDK token generation
- Check browser console for errors

### Cron Jobs Not Running

- Verify pg_cron extension is enabled
- Check cron job status: `SELECT * FROM cron.job;`
- Review cron job run history
- Check database logs for errors

## Security Notes

1. **VideoSDK Credentials**: Never expose API keys in frontend code
2. **Token Generation**: Implement server-side token generation for production
3. **Room Validation**: Always validate room before allowing join
4. **Time Windows**: Rooms are only active at scheduled time

## Next Steps

1. Implement proper VideoSDK JWT token generation
2. Add interview room access page/route for candidates
3. Add interview recording functionality (if needed)
4. Add interview completion status updates
5. Add HR dashboard to view active interviews

## Support

- VideoSDK Docs: https://docs.videosdk.live
- Supabase Docs: https://supabase.com/docs
- Project Issues: Check GitHub issues or contact support
