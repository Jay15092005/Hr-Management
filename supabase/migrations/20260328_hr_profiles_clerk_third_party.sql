-- Clerk third-party auth: user ids are strings (e.g. user_...), not UUIDs, and do not exist in auth.users.
-- Drop FK to auth.users and use JWT sub for RLS.

DROP POLICY IF EXISTS "hr_profiles_select_own" ON public.hr_profiles;
DROP POLICY IF EXISTS "hr_profiles_update_own" ON public.hr_profiles;
DROP POLICY IF EXISTS "hr_profiles_insert_own" ON public.hr_profiles;

ALTER TABLE public.hr_profiles DROP CONSTRAINT IF EXISTS hr_profiles_id_fkey;

ALTER TABLE public.hr_profiles ALTER COLUMN id TYPE TEXT USING id::text;

CREATE POLICY "hr_profiles_select_own"
  ON public.hr_profiles FOR SELECT TO authenticated
  USING (id = (auth.jwt()->>'sub'));

CREATE POLICY "hr_profiles_update_own"
  ON public.hr_profiles FOR UPDATE TO authenticated
  USING (id = (auth.jwt()->>'sub'))
  WITH CHECK (id = (auth.jwt()->>'sub'));

CREATE POLICY "hr_profiles_insert_own"
  ON public.hr_profiles FOR INSERT TO authenticated
  WITH CHECK (id = (auth.jwt()->>'sub'));
