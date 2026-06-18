-- Device tokens for FCM push notifications
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT DEFAULT 'android',
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, company_id)
);

DO $$ BEGIN EXECUTE 'ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "auth_all device_tokens" ON device_tokens FOR ALL USING (auth.role() = 'authenticated'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_insert device_tokens" ON device_tokens FOR INSERT WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_device_tokens_company ON device_tokens(company_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Notifications history table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT DEFAULT 'general',
  metadata JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN EXECUTE 'ALTER TABLE notifications ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "auth_all notifications" ON notifications FOR ALL USING (auth.role() = 'authenticated'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_insert notifications" ON notifications FOR INSERT WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_notifications_company ON notifications(company_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Add last_sync_at to companies if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'last_sync_at'
  ) THEN
    ALTER TABLE companies ADD COLUMN last_sync_at TIMESTAMPTZ;
  END IF;
END $$;
