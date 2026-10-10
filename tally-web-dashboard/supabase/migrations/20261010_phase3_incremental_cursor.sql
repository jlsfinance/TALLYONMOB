-- Phase 3: stable resumable Alter ID cursors for every sync module.
-- Safe to apply repeatedly on existing installations.
ALTER TABLE IF EXISTS public.sync_checkpoint
  ADD COLUMN IF NOT EXISTS last_processed_alter_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_sync_checkpoint_company_module_active
  ON public.sync_checkpoint(company_id, module, status, updated_at DESC);

-- Keep sync state and checkpoint reads available to authenticated dashboard users.
DO $$ BEGIN
  GRANT SELECT, INSERT, UPDATE ON public.sync_checkpoint TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
