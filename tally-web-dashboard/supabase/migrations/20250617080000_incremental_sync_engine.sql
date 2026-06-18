-- ============================================================
-- Enterprise Incremental Sync Engine — Database Schema
-- ============================================================

-- 1. SYNC STATE — Tracks last sync per company per module
CREATE TABLE IF NOT EXISTS sync_state (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    module TEXT NOT NULL CHECK (module IN ('vouchers', 'ledgers', 'stock_items', 'masters')),
    last_alter_id INTEGER DEFAULT 0,
    last_sync_time TIMESTAMPTZ,
    total_records_synced INTEGER DEFAULT 0,
    status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'syncing', 'paused', 'error')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, module)
);

-- 2. SYNC QUEUE — Pending changes to process
CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('voucher', 'ledger', 'stock_item', 'master')),
    entity_id TEXT,
    operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    last_error TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- 3. SYNC CHECKPOINT — Resume failed syncs from exact position
CREATE TABLE IF NOT EXISTS sync_checkpoint (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sync_session_id TEXT NOT NULL,
    module TEXT NOT NULL,
    current_chunk INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 0,
    last_processed_id TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. SYNC HISTORY — Audit trail of all sync operations
CREATE TABLE IF NOT EXISTS sync_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sync_session_id TEXT NOT NULL,
    module TEXT NOT NULL,
    operation TEXT NOT NULL,
    records_synced INTEGER DEFAULT 0,
    chunks_processed INTEGER DEFAULT 0,
    duration_ms INTEGER,
    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'resumed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. DELETED RECORDS — Soft delete tracking
CREATE TABLE IF NOT EXISTS deleted_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    voucher_number TEXT,
    guid TEXT,
    alter_id INTEGER,
    deleted_at TIMESTAMPTZ DEFAULT now(),
    synced BOOLEAN DEFAULT false
);

-- 6. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_sync_state_company ON sync_state(company_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(company_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_checkpoint_session ON sync_checkpoint(sync_session_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_company ON sync_history(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_records_company ON deleted_records(company_id, synced);
CREATE INDEX IF NOT EXISTS idx_vouchers_alter_id ON vouchers(alter_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_alter_id ON ledgers(alter_id);
