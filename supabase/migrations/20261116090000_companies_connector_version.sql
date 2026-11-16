-- The connector reports the build that performed a sync, so the web "update available"
-- card only nags users whose last sync really came from an older connector.
-- Additive and nullable: rows synced before this column stay NULL (no card).
alter table public.companies add column if not exists connector_version text;

comment on column public.companies.connector_version is
    'Connector build that performed the last sync (reported by the desktop app). Used by the web update banner.';
