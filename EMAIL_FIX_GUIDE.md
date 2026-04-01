# Email and Interview Scheduling Issues - Quick Fix Guide

## Issue 1: Email Sending Failed (500 Error)

**Error**: `Edge Function returned a non-2xx status code`

### Root Cause
Missing `CONFIRM_INTERVIEW_SECRET` environment variable in Supabase Edge Function secrets.

### Fix Applied
Added `CONFIRM_INTERVIEW_SECRET` to `.env` file. However, this needs to be added to **Supabase Edge Function secrets** as well.

---

## How to Fix Permanently

### Step 1: Add Secret to Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/fvsywwknwfeyvxvjlmmd
2. Navigate to **Edge Functions** → **Secrets**
3. Add the following secrets:

```bash
CONFIRM_INTERVIEW_SECRET=hr_interview_secret_key_2024_secure_token_signing
RESEND_API_KEY=re_Zrv66vmv_HoYSU2XcsT7FDtrSjqHd8quS
SUPABASE_URL=https://fvsywwknwfeyvxvjlmmd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2c3l3d2tud2ZleXZ4dmpsbW1kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTE2ODQ5MiwiZXhwIjoyMDg0NzQ0NDkyfQ.Vj93IqqP7c_2xGDRUKxmzedOXyfuchkNcAWpdP_9A40
```

### Step 2: Redeploy Edge Functions

After adding secrets, redeploy the affected Edge Functions:

```bash
# In your terminal
cd supabase/functions

# Deploy send-selection-email
supabase functions deploy send-selection-email

# Deploy save-cheating-detection (if needed)
supabase functions deploy save-cheating-detection
```

---

## Issue 2: 406 Error on interview_configurations Query

**Error**: `Failed to load resource: the server responded with a status of 406`

### Root Cause
This is a **content negotiation error** - the API is returning data in a format the client doesn't accept.

### Possible Causes:
1. **Missing Accept header**: The request might not have the correct `Accept: application/json` header
2. **RLS Policy**: Row Level Security might be blocking the query
3. **Invalid query**: The query syntax might be incorrect

### Fix

Check the query in your code. The error is from:
```
/rest/v1/interview_configurations?select=*&candidate_selection_id=eq.db7bdf0f-d823-41ef-aa60-37c05c6420d7
```

This should work. The 406 error suggests an RLS issue. Check if the user has permission to read `interview_configurations`.

---

## Quick Workaround (If Supabase Secrets Can't Be Added Now)

If you can't add Supabase secrets immediately, you can modify the Edge Function to handle missing secrets gracefully:

### Option 1: Disable Secure Links Temporarily

Edit `supabase/functions/send-selection-email/index.ts`:

```typescript
// Around line 197, wrap the secure link generation in a try-catch
let pickTimeSection = '';
if (candidateSelectionId && confirmBaseUrl && confirmSecret) {
  try {
    const scheduleToken = await signScheduleToken(candidateSelectionId);
    // ... rest of the code
  } catch (error) {
    console.warn('[send-selection-email] Failed to generate secure links:', error);
    // Fallback: send email without secure links
    pickTimeSection = '\n\nPlease contact HR to schedule your interview.';
  }
}
```

### Option 2: Use Default Secret

Modify the Edge Function to use a default secret if not set:

```typescript
// Line 5
const confirmSecret = Deno.env.get("CONFIRM_INTERVIEW_SECRET") || "default_secret_key_change_me";
```

**⚠️ Warning**: This is less secure but will allow emails to send.

---

## Testing the Fix

After adding the secrets and redeploying:

1. **Test Email Sending**:
   - Select a candidate in the HR app
   - Click "Select" button
   - Check if email sends successfully
   - Check candidate's email inbox

2. **Check Supabase Logs**:
   - Go to Supabase Dashboard → Edge Functions → Logs
   - Look for `send-selection-email` function logs
   - Verify no errors

3. **Test Scheduling Links**:
   - Click on a scheduling link in the email
   - Verify it redirects correctly
   - Confirm the interview slot

---

## Summary

**Immediate Actions**:
1. ✅ Added `CONFIRM_INTERVIEW_SECRET` to local `.env` file
2. ⏳ Need to add secrets to Supabase Dashboard
3. ⏳ Need to redeploy Edge Functions

**After completing these steps**, the email sending should work correctly.
