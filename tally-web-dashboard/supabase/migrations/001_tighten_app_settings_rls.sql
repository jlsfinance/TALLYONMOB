-- Migration: 001_tighten_app_settings_rls
-- Remove permissive ALL policy on app_settings. Restrict write to admin.
-- Admin detection: auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com'

-- Step 1: Drop existing permissive ALL policy (this was the security hole)
DROP POLICY IF EXISTS app_settings_all_auth ON public.app_settings;

-- Step 2: Restrict INSERT to admin only
DROP POLICY IF EXISTS app_settings_insert ON public.app_settings;
CREATE POLICY app_settings_insert ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');

-- Step 3: Restrict UPDATE to admin only
DROP POLICY IF EXISTS app_settings_update ON public.app_settings;
CREATE POLICY app_settings_update ON public.app_settings
  FOR UPDATE TO authenticated
  USING (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');

-- Step 4: Restrict DELETE to admin only
DROP POLICY IF EXISTS app_settings_delete ON public.app_settings;
CREATE POLICY app_settings_delete ON public.app_settings
  FOR DELETE TO authenticated
  USING (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');

-- SELECT remains open to all authenticated (read-only, needed for download URL/version)
-- app_settings_select already exists and is correct
