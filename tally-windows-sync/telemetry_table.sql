CREATE TABLE IF NOT EXISTS public.telemetry_events (
    id BIGSERIAL PRIMARY KEY,
    msg TEXT,
    "userId" TEXT,
    description TEXT,
    "requestFrom" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "companyId" TEXT,
    "customerStatus" TEXT,
    "customerSource" TEXT,
    "macAddress" TEXT,
    "sessionId" TEXT,
    "desktopVersion" TEXT,
    "eventType" TEXT,
    level TEXT,
    "correlationId" TEXT,
    data JSONB
);
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert" ON public.telemetry_events;
CREATE POLICY "anon_insert" ON public.telemetry_events FOR INSERT TO anon WITH CHECK (true);
