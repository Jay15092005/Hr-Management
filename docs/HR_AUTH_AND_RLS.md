# HR authentication, tenancy, and RLS

## What was added

- **Email OTP (passwordless)** for HR: `/signup`, `/login` (both can create a user via OTP), `/auth/verify-otp`.
- **Per-HR data**: `resumes` and `job_descriptions` have `owner_id` → `auth.users.id`. Triggers set `owner_id` on insert; RLS restricts all related tables to the signed-in user.
- **Private resume files**: uploads go to `resumes/{userId}/...`. Bucket `resumes` is private; the app uses **signed URLs** (`storage_object_path` on `resumes`).
- **Candidate flows** (no HR login): `interview_join_context` and `complete_interview_by_room` RPCs allow anon clients to read minimal interview context and mark completed without opening the whole `interview_configurations` table.

## Supabase dashboard

1. **Authentication → Providers → Email**: enable; configure **OTP** / magic link as you prefer. Set **Email OTP Length** to **6** (must match the app verify page). Keep **“Allow new users to sign up”** (or equivalent) **enabled** — the app uses `shouldCreateUser: true` on sign-in so first-time emails get an OTP instead of “Signups not allowed for OTP”.
2. **Email delivery to all addresses**: If some users receive OTPs and others don’t, see **SMTP / deliverability** (personal Gmail is unreliable). Read **`docs/OTP_EMAIL_DELIVERY.md`**.
3. **URL configuration**: add your site URL and redirect URLs (e.g. `http://localhost:5173` for Vite dev).
4. **Email templates**: ensure OTP emails are enabled so users receive codes; use `{{ .Token }}` (or your provider’s token placeholder) in the template body.

## Migrations

- File: `supabase/migrations/20260321_hr_rls_tenancy.sql`
- Applied to project **HR-Management** via Supabase MCP. Re-run locally with:

  `supabase db push` or paste SQL in the SQL editor if needed.

## Legacy data

- Rows with `owner_id` still `NULL` after migration are **hidden** from authenticated HR until you assign an owner (SQL update). The migration optionally backfills to the **oldest** `auth.users` row when present.

## Forgot password (OTP-only)

There is no password. Use **Sign in** again to receive a new code, or **Resend code** on the verify page.
