-- ============================================
-- Migration: Create pending_transactions table
-- Purpose: Store Web/Mobile-created vouchers that
--          need to be pushed to Tally by the Windows sync app
-- Two-Way Sync: Reverse sync pipeline
--
-- Column naming matches Windows Sync App models (ApiClient.cs):
--   transaction_type  → PendingTransaction.TransactionType
--   voucher_data      → PendingTransaction.VoucherData
--   error_message     → PendingTransaction.ErrorMessage
--   tally_voucher_number → PendingTransaction.TallyVoucherNumber
-- ============================================

-- Create the table
CREATE TABLE IF NOT EXISTS pending_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL DEFAULT 'Sales',
    voucher_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'synced', 'failed')),
    error_message TEXT,
    tally_voucher_number TEXT,
    synced_at TIMESTAMPTZ,
    created_by TEXT,
    retry_count INTEGER DEFAULT 0,
    tally_master_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_pending_transactions_company_status
    ON pending_transactions (company_id, status);

CREATE INDEX IF NOT EXISTS idx_pending_transactions_status
    ON pending_transactions (status);

CREATE INDEX IF NOT EXISTS idx_pending_transactions_created_at
    ON pending_transactions (created_at DESC);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_pending_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pending_transactions_updated_at
    ON pending_transactions;

CREATE TRIGGER trg_pending_transactions_updated_at
    BEFORE UPDATE ON pending_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_pending_transactions_updated_at();

-- Row-Level Security (optional, enabled if desired)
ALTER TABLE pending_transactions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own company's transactions
CREATE POLICY "Users can insert pending transactions for their company"
    ON pending_transactions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id IN (
            SELECT id FROM companies WHERE owner_id = auth.uid()
        )
    );

-- Allow authenticated users to view their own company's transactions
CREATE POLICY "Users can view pending transactions for their company"
    ON pending_transactions
    FOR SELECT
    TO authenticated
    USING (
        company_id IN (
            SELECT id FROM companies WHERE owner_id = auth.uid()
        )
    );

-- Allow service role full access (needed by Windows Sync App)
CREATE POLICY "Service role can manage all pending transactions"
    ON pending_transactions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow anon role to insert and read (for public API endpoints)
CREATE POLICY "Anon can insert pending transactions"
    ON pending_transactions
    FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "Anon can read pending transactions"
    ON pending_transactions
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "Anon can update pending transactions"
    ON pending_transactions
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- ============================================
-- Usage Commands:
--
-- To check pending count:
--   SELECT COUNT(*) FROM pending_transactions WHERE status = 'pending';
--
-- To view recent failed transactions:
--   SELECT * FROM pending_transactions
--   WHERE status = 'failed'
--   ORDER BY updated_at DESC
--   LIMIT 10;
--
-- To reset a stuck transaction back to pending:
--   UPDATE pending_transactions
--   SET status = 'pending', error_message = NULL
--   WHERE id = '<uuid>'
--   AND status IN ('processing', 'failed');
--
-- To delete old synced transactions:
--   DELETE FROM pending_transactions
--   WHERE status = 'synced'
--   AND created_at < NOW() - INTERVAL '30 days';
-- ============================================
