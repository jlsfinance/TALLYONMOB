ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
GRANT ALL ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
NOTIFY pgrst, 'reload schema';
