ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
UPDATE public.user_profiles SET is_admin = TRUE WHERE email = 'lovneetrathi@gmail.com';
GRANT ALL ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
NOTIFY pgrst, 'reload schema';