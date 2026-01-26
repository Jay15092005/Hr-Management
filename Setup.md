# 🚀 HR Management System - Setup Guide

This guide will help you set up the HR Management System with VideoSDK interview scheduling.

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Supabase account
- VideoSDK account
- Resend account (for email sending)
- Google Gemini API key (for AI scoring)

---

## 🔧 Environment Variables Setup

Create a `.env` file in the root directory with the following variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://fvsywwknwfeyvxvjlmmd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2c3l3d2tud2ZleXZ4dmpsbW1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjg0OTIsImV4cCI6MjA4NDc0NDQ5Mn0.AJ4c8W7OaAP0RuoJlxfY4cAvxsGyMm7f-qmdZyB31-Y

# Backend/Server-side only (DO NOT expose in frontend)
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2c3l3d2tud2ZleXZ4dmpsbW1kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTE2ODQ5MiwiZXhwIjoyMDg0NzQ0NDkyfQ.Vj93IqqP7c_2xGDRUKxmzedOXyfuchkNcAWpdP_9A40

# Project ID (for reference)
VITE_SUPABASE_PROJECT_ID=fvsywwknwfeyvxvjlmmd

# Google Gemini API Key
VITE_GEMINI_API_KEY=AIzaSyBOEc_n9mcIpsfeAmHsLHcS3pjVWmOa3dE

# Optional: Specify Gemini model (default: gemini-2.5-flash)
# Options: gemini-2.5-flash (fast, cost-effective) or gemini-2.5-pro (more powerful)
VITE_GEMINI_MODEL=gemini-2.5-flash

# Resend API Key (for email sending)
# Get your API key from: https://resend.com/api-keys
RESEND_API_KEY=re_Zrv66vmv_HoYSU2XcsT7FDtrSjqHd8quS

VITE_VIDEOSDK_API_KEY=cda74377-c6f8-464a-b7d2-9387c987e491
VITE_VIDEOSDK_SECRET=ea90f73abcf16af8dbc7c15b7c21d3a62d41f692aafa70aa3e6ae0c7c7e4f585
```

### 🔐 Getting Your API Keys

#### Supabase
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to Settings → API
4. Copy `Project URL` → `VITE_SUPABASE_URL`
5. Copy `anon public` key → `VITE_SUPABASE_ANON_KEY`
6. Copy `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (for Edge Functions)

#### VideoSDK
1. Go to [VideoSDK Dashboard](https://app.videosdk.live)
2. Navigate to API Keys section
3. Copy `API Key` → `VITE_VIDEOSDK_API_KEY`
4. Copy `Secret` → `VITE_VIDEOSDK_SECRET`

#### Resend
1. Go to [Resend Dashboard](https://resend.com/api-keys)
2. Create a new API key
3. Copy the key → `RESEND_API_KEY`

#### Google Gemini
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key → `VITE_GEMINI_API_KEY`

---

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Jay15092005/Hr-Management.git
   cd Hr-Management
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env`
   - Fill in all required API keys (see above)

---

## 🗄️ Database Setup

### 1. Run Migrations

The project uses Supabase for the database. Run the migrations:

```bash
# Make sure you're logged in to Supabase CLI
supabase login

# Link to your project
supabase link --project-ref fvsywwknwfeyvxvjlmmd

# Run migrations
supabase db push
```

### 2. Enable Extensions

In Supabase Dashboard → Database → Extensions, enable:
- `pg_cron` (for scheduled jobs)

### 3. Set Up Cron Jobs

The cron jobs are set up via the migration file. They will:
- Send interview link emails 5 minutes before interviews
- Activate interview rooms at the scheduled time

---

## 🚀 Running the Application

### Development Mode

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Production Build

```bash
npm run build
npm run preview
```

---

## 📧 Edge Functions Setup

### Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy send-selection-email --project-ref fvsywwknwfeyvxvjlmmd
supabase functions deploy send-interview-link-email --project-ref fvsywwknwfeyvxvjlmmd
supabase functions deploy create-interview-room --project-ref fvsywwknwfeyvxvjlmmd
```

### Set Edge Function Secrets

In Supabase Dashboard → Edge Functions → Settings, add these secrets:
- `VIDEOSDK_API_KEY` - Your VideoSDK API key
- `VIDEOSDK_SECRET` - Your VideoSDK secret
- `RESEND_API_KEY` - Your Resend API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

---

## 🧪 Testing

### Test Interview Scheduling

1. Upload a resume
2. Create a job description
3. Review candidates in HR Review
4. Select a candidate
5. Schedule an interview for 2-3 minutes in the future
6. Check that Email 1 is sent immediately
7. Wait for Email 2 (5 minutes before)
8. Wait for room activation (at T-0)
9. Test joining the interview room

---

## 📚 Documentation

- **VideoSDK Setup**: See `VIDEOSDK_SETUP.md`
- **API Verification**: See `VIDEOSDK_API_VERIFICATION.md`
- **Implementation Check**: See `VIDEOSDK_IMPLEMENTATION_CHECK.md`

---

## 🐛 Troubleshooting

### Edge Functions Not Working
- Check that all secrets are set in Supabase Dashboard
- Verify Edge Functions are deployed
- Check Edge Function logs in Supabase Dashboard

### Cron Jobs Not Running
- Verify `pg_cron` extension is enabled
- Check cron job status: `SELECT * FROM cron.job;`
- Review cron job run history

### VideoSDK Room Not Created
- Verify VideoSDK API credentials are correct
- Check Edge Function logs
- Ensure JWT token generation is working

### Emails Not Sending
- Verify Resend API key is correct
- Check Edge Function logs
- Verify email addresses are valid

---

## 📝 Project Structure

```
Hr-Management/
├── src/
│   ├── components/          # React components
│   ├── lib/                 # Supabase client
│   └── utils/               # Utility functions
├── supabase/
│   ├── functions/          # Edge Functions
│   └── migrations/          # Database migrations
├── .env                     # Environment variables (not in git)
├── .env.example            # Environment template
└── package.json            # Dependencies
```

---

## 🔒 Security Notes

- **Never commit `.env` file** - It's already in `.gitignore`
- **Never expose service role keys** in frontend code
- **Keep API keys secure** - Use environment variables
- **Use Supabase RLS** for database security

---

## 📞 Support

For issues or questions:
- Check the documentation files in the project
- Review Supabase Dashboard logs
- Check Edge Function logs

---

**Last Updated**: 2025-01-25  
**Version**: 1.0.0
