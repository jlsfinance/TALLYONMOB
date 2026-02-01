-- Add delete tracking columns to vouchers table
ALTER TABLE vouchers 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for filtering deleted vouchers
CREATE INDEX IF NOT EXISTS idx_vouchers_is_deleted ON vouchers(company_id, is_deleted);

-- Add comment for documentation
COMMENT ON COLUMN vouchers.is_deleted IS 'Soft delete flag - marks voucher as deleted in Tally';
COMMENT ON COLUMN vouchers.deleted_at IS 'Timestamp when voucher was detected as deleted';
