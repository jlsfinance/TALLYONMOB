ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
CREATE INDEX IF NOT EXISTS idx_user_profiles_whatsapp_phone ON public.user_profiles (whatsapp_phone);
NOTIFY pgrst, 'reload schema';
