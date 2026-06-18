-- ============================================================
-- God-Level User Activity Tracking System
-- ============================================================

-- 1. RAW ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id TEXT,
    event_type TEXT NOT NULL,
    event_category TEXT DEFAULT 'general',
    page TEXT DEFAULT '',
    element TEXT DEFAULT '',
    metadata JSONB DEFAULT '{}',
    session_id TEXT,
    device_info JSONB DEFAULT '{}',
    ip_address TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. AGGREGATED STATS (fast dashboard reads)
CREATE TABLE IF NOT EXISTS user_activity_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id TEXT,
    event_type TEXT NOT NULL,
    page TEXT NOT NULL DEFAULT 'global',
    count INTEGER DEFAULT 0,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, company_id, event_type, page)
);

-- 3. USER SESSIONS
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id TEXT,
    session_id TEXT NOT NULL,
    device_info JSONB DEFAULT '{}',
    ip_address TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    last_active_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_ms INTEGER,
    pages_visited TEXT[] DEFAULT '{}',
    total_events INTEGER DEFAULT 0
);

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_company ON user_activity_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON user_activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_page ON user_activity_logs(page);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_session ON user_activity_logs(session_id);

CREATE INDEX IF NOT EXISTS idx_activity_stats_user ON user_activity_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_stats_type ON user_activity_stats(event_type);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started ON user_sessions(started_at DESC);

-- 5. RLS
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_activity_logs" ON user_activity_logs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_activity_stats" ON user_activity_stats FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_user_sessions" ON user_sessions FOR ALL USING (auth.role() = 'authenticated');

-- 6. UPSERT STAT FUNCTION
CREATE OR REPLACE FUNCTION upsert_activity_stat(
    p_user_id UUID,
    p_company_id TEXT,
    p_event_type TEXT,
    p_page TEXT,
    p_count INTEGER
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_activity_stats (user_id, company_id, event_type, page, count, last_seen_at, updated_at)
    VALUES (p_user_id, p_company_id, p_event_type, p_page, p_count, now(), now())
    ON CONFLICT (user_id, company_id, event_type, page)
    DO UPDATE SET
        count = user_activity_stats.count + p_count,
        last_seen_at = now(),
        updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- 7. AUTO-CLEANUP: Delete old raw logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM user_activity_logs WHERE created_at < now() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Reload schema
NOTIFY pgrst, 'reload schema';
