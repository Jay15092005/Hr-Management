# OTP email delivery (Supabase Auth)

The HR app only calls `supabase.auth.signInWithOtp()` — **it does not choose who receives mail**. Sending is done by **Supabase Auth** using your project’s **email / SMTP** settings.

If one address gets the code and another does not, the problem is almost always **deliverability or provider limits**, not the React app.

## Why the same SMTP can “work for me” but not for another Gmail

When you use **personal Gmail** (`smtp.gmail.com`) as custom SMTP:

- Google may **rate-limit** or block sending depending on volume, recipient, and account security.
- Messages often land in **Spam** or **Promotions** for some recipients.
- Gmail is **not** intended for bulk/transactional mail; Supabase shows a warning for this reason.
- The **sender** is your Gmail address — recipients may see different spam scores.

**This repo cannot fix Gmail’s rules from the frontend.** You fix it by **changing how mail is sent**.

## Fix it properly (recommended for production)

1. **Use a transactional provider** for Auth SMTP (same idea as your Resend usage in edge functions):
   - [Resend](https://resend.com/docs/send-with-supabase-smtp) — SMTP host `smtp.resend.com`, verify domain, use `from` on your domain.
   - Alternatives: SendGrid, Postmark, AWS SES, Mailgun — all support SMTP for Supabase.

2. **Verify your domain** (SPF, DKIM, DMARC) in that provider so **any** recipient is more likely to receive the message.

3. In **Supabase Dashboard → Authentication → Emails**:
   - Point **custom SMTP** at the transactional provider (not personal Gmail).
   - Set **Email OTP Length** to **6** in the dashboard to match the app (the verify page expects exactly **6** digits).

4. **Optional:** Temporarily disable custom SMTP and use **Supabase’s built-in mail** for testing (subject to [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)) — useful to see if the issue is SMTP-specific.

## Quick checks when one address doesn’t receive mail

| Check | Action |
|--------|--------|
| Spam / Promotions | Open **All Mail** and search for the sender or subject. |
| Supabase Auth logs | **Authentication → Logs** (or project logs) for send errors. |
| Rate limits | Wait **60+ seconds** between requests to the same address (your SMTP shows a minimum interval). |
| “Allow signups” | **Authentication → Providers → Email** — new users must be allowed if you use `shouldCreateUser: true`. |

## Friends’ mail IDs

If “works for me but not friend”:

- Ask them to check **spam** and **correct email**.
- **Do not** assume Gmail SMTP will deliver reliably to every domain; use **Resend (or similar) + verified domain** for consistent delivery.
