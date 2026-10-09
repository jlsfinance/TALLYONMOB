-- TALLYONMOB Phase 3: resumable incremental sync and performance
-- Additive only: no existing rows are deleted or rewritten.

ALTER TABLE public.sync_checkpoint
  ADD COLUMN IF NOT EXISTS records_processed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bytes_processed BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS page_size INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS last_alter_id BIGINT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE public.sync_checkpoint
  ALTER COLUMN current_chunk SET DEFAULT 0,
  ALTER COLUMN total_chunks SET DEFAULT 0,
  ALTER COLUMN status SET DEFAULT 'running',
  ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_sync_checkpoint_company_module_updated
  ON public.sync_checkpoint(company_id, module, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_checkpoint_active
  ON public.sync_checkpoint(company_id, status, updated_at DESC)
  WHERE status IN ('running', 'paused', 'failed');

CREATE INDEX IF NOT EXISTS idx_vouchers_company_alter_id
  ON public.vouchers(company_id, alter_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_company_alter_id
  ON public.ledgers(company_id, alter_id);
CREATE INDEX IF NOT EXISTS idx_stock_company_alter_id
  ON public.stock(company_id, alter_id);
CREATE INDEX IF NOT EXISTS idx_deleted_records_company_entity_alter
  ON public.deleted_records(company_id, entity_type, alter_id);

ALTER TABLE public.sync_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view company sync checkpoints" ON public.sync_checkpoint;
CREATE POLICY "Users can view company sync checkpoints"
  ON public.sync_checkpoint FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = sync_checkpoint.company_id
      AND cu.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Users can view company deleted records" ON public.deleted_records;
CREATE POLICY "Users can view company deleted records"
  ON public.deleted_records FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = deleted_records.company_id
      AND cu.user_id = (SELECT auth.uid())
  ));

COMMENT ON COLUMN public.sync_checkpoint.page_size IS
  'Requested page size for resumable Tally extraction.';
COMMENT ON COLUMN public.sync_checkpoint.last_alter_id IS
  'Highest ALTERID durably acknowledged for this checkpoint.';
COMMENT ON COLUMN public.sync_checkpoint.expires_at IS
  'Optional lease expiry used to recover abandoned sync sessions.';
