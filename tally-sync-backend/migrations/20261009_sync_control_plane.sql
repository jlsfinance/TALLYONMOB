-- TALLYONMOB Phase 2: device registration, health, idempotency, conflicts
-- Additive migration. Run in Supabase SQL Editor before enabling the new endpoints.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS sync_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    name TEXT,
    platform TEXT DEFAULT 'windows',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    last_seen_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    device_token_hash TEXT,
    device_token_issued_at TIMESTAMPTZ,
    last_token_seen_at TIMESTAMPTZ,
    token_revoked_at TIMESTAMPTZ,
    UNIQUE(company_id, device_id)
);

ALTER TABLE public.sync_devices
  ADD COLUMN IF NOT EXISTS device_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS device_token_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_token_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_revoked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    device_id TEXT,
    data_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_records INTEGER NOT NULL DEFAULT 0,
    failed_records INTEGER NOT NULL DEFAULT 0,
    conflict_records INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS sync_idempotency (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    device_id TEXT,
    idempotency_key TEXT NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    device_id TEXT,
    data_type TEXT NOT NULL,
    record_id TEXT NOT NULL,
    conflict_type TEXT NOT NULL DEFAULT 'stale_update',
    local_version JSONB,
    incoming_version JSONB,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
    resolution TEXT,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_devices_company_status ON sync_devices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_devices_last_seen ON sync_devices(company_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_devices_token_hash ON sync_devices(device_token_hash) WHERE device_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_sync_device_revocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'revoked' AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'DEVICE_REVOKED';
  END IF;
  IF NEW.status = 'revoked' THEN
    NEW.revoked_at = COALESCE(NEW.revoked_at, NOW());
    NEW.token_revoked_at = COALESCE(NEW.token_revoked_at, NOW());
    NEW.device_token_hash = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sync_device_revocation ON public.sync_devices;
CREATE TRIGGER trg_enforce_sync_device_revocation
  BEFORE UPDATE ON public.sync_devices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sync_device_revocation();
CREATE INDEX IF NOT EXISTS idx_sync_runs_company_started ON sync_runs(company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_company_status ON sync_conflicts(company_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_record ON sync_conflicts(company_id, data_type, record_id);

ALTER TABLE sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;

-- Backend uses the Supabase service role for connector writes. These policies allow
-- authenticated dashboard users to read their company's operational telemetry.
DROP POLICY IF EXISTS "Users can view company sync devices" ON sync_devices;
CREATE POLICY "Users can view company sync devices" ON sync_devices FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM company_users cu WHERE cu.company_id = sync_devices.company_id AND cu.user_id = auth.uid()
));

DROP POLICY IF EXISTS "Company admins can revoke sync devices" ON sync_devices;
CREATE POLICY "Company admins can revoke sync devices" ON sync_devices FOR UPDATE TO authenticated
USING (EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.company_id = sync_devices.company_id
      AND cu.user_id = auth.uid()
      AND cu.role IN ('owner', 'admin')
))
WITH CHECK (status = 'revoked');

DROP POLICY IF EXISTS "Users can view company sync runs" ON sync_runs;
CREATE POLICY "Users can view company sync runs" ON sync_runs FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM company_users cu WHERE cu.company_id = sync_runs.company_id AND cu.user_id = auth.uid()
));

DROP POLICY IF EXISTS "Users can view company sync conflicts" ON sync_conflicts;
CREATE POLICY "Users can view company sync conflicts" ON sync_conflicts FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM company_users cu WHERE cu.company_id = sync_conflicts.company_id AND cu.user_id = auth.uid()
));
