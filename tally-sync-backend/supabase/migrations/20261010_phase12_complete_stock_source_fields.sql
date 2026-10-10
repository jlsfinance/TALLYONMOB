-- Phase 12: canonical stock fields and complete voucher-line source metadata.
-- Canonical masters table: public.stock_items (used by the Windows sync client and dashboard).
-- public.stock and any historical tally_stock relation are not renamed, copied, or dropped.
-- Additive only: no existing row is updated or deleted by this migration.

ALTER TABLE IF EXISTS public.stock_items
    ADD COLUMN IF NOT EXISTS alias TEXT,
    ADD COLUMN IF NOT EXISTS stock_category TEXT,
    ADD COLUMN IF NOT EXISTS additional_unit TEXT,
    ADD COLUMN IF NOT EXISTS alternate_unit_conversion NUMERIC(18, 6),
    ADD COLUMN IF NOT EXISTS alternate_units JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS opening_value NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS closing_value NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS inward_quantity NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS inward_value NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS outward_quantity NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS outward_value NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS gst_applicable TEXT,
    ADD COLUMN IF NOT EXISTS taxability TEXT,
    ADD COLUMN IF NOT EXISTS gst_details JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE IF EXISTS public.voucher_stock_entries
    ADD COLUMN IF NOT EXISTS billed_quantity NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS actual_quantity NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS billed_unit TEXT,
    ADD COLUMN IF NOT EXISTS actual_unit TEXT,
    ADD COLUMN IF NOT EXISTS godown_name TEXT,
    ADD COLUMN IF NOT EXISTS batch_name TEXT,
    ADD COLUMN IF NOT EXISTS cost_centre TEXT,
    ADD COLUMN IF NOT EXISTS taxability TEXT,
    ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(8, 4),
    ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(8, 4),
    ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS igst_rate NUMERIC(8, 4),
    ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS cess_rate NUMERIC(8, 4),
    ADD COLUMN IF NOT EXISTS cess_amount NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS gst_details JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_stock_items_company_name
    ON public.stock_items(company_id, name);
CREATE INDEX IF NOT EXISTS idx_voucher_stock_entries_company_voucher
    ON public.voucher_stock_entries(company_id, voucher_id);

COMMENT ON TABLE public.stock_items IS
    'Canonical Tally stock-item master table. Legacy stock relations are retained for compatibility.';
COMMENT ON COLUMN public.stock_items.alternate_units IS
    'Source unit metadata from Tally (additional unit and conversion); JSON is retained without lossy normalization.';
COMMENT ON COLUMN public.stock_items.raw_data IS
    'Audit metadata from the source Tally stock-item XML.';
COMMENT ON COLUMN public.voucher_stock_entries.gst_details IS
    'Per-line GST component rates and amounts parsed from Tally where supplied.';
COMMENT ON COLUMN public.voucher_stock_entries.raw_data IS
    'Audit metadata from the source Tally inventory-allocation XML.';
