-- Phase 11: company-scoped, idempotent delete propagation.
-- Compatible with the existing TEXT company_id schema. No rows are hard-deleted.

ALTER TABLE IF EXISTS public.ledgers
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.stock_items
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.voucher_ledger_entries
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.voucher_stock_entries
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE public.ledgers SET is_deleted = FALSE WHERE is_deleted IS NULL;
UPDATE public.stock_items SET is_deleted = FALSE WHERE is_deleted IS NULL;
UPDATE public.voucher_ledger_entries SET is_deleted = FALSE WHERE is_deleted IS NULL;
UPDATE public.voucher_stock_entries SET is_deleted = FALSE WHERE is_deleted IS NULL;

-- deleted_records already exists in this project; keep its existing TEXT company_id contract.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deleted_records_company_entity
  ON public.deleted_records(company_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_deleted_records_company_synced
  ON public.deleted_records(company_id, synced);

CREATE OR REPLACE FUNCTION public.prevent_deleted_record_resurrection()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.master_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.deleted_records d
    WHERE d.company_id = NEW.company_id
      AND d.entity_id = NEW.master_id
      AND d.entity_type = TG_ARGV[0]
  ) THEN
    NEW.is_deleted := TRUE;
    NEW.deleted_at := COALESCE(NEW.deleted_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_voucher_resurrection ON public.vouchers;
CREATE TRIGGER prevent_voucher_resurrection
BEFORE INSERT OR UPDATE ON public.vouchers
FOR EACH ROW EXECUTE FUNCTION public.prevent_deleted_record_resurrection('voucher');

DROP TRIGGER IF EXISTS prevent_ledger_resurrection ON public.ledgers;
CREATE TRIGGER prevent_ledger_resurrection
BEFORE INSERT OR UPDATE ON public.ledgers
FOR EACH ROW EXECUTE FUNCTION public.prevent_deleted_record_resurrection('ledger');

DROP TRIGGER IF EXISTS prevent_stock_item_resurrection ON public.stock_items;
CREATE TRIGGER prevent_stock_item_resurrection
BEFORE INSERT OR UPDATE ON public.stock_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_deleted_record_resurrection('stock_item');
