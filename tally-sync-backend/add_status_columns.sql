-- Add missing columns to companies table for status tracking
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update existing companies to be active by default if null
UPDATE companies SET is_active = true WHERE is_active IS NULL;
