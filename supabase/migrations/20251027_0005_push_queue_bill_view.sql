-- Server->connector push channel (LK SignalR flow parity, Supabase-native).
-- Web dashboard inserts a row; the connector consumes it each sync cycle (realtime
-- ws subscriber comes later - same table, transport swap only) and acks status.
create table if not exists public.tally_push_queue (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  action text not null,             -- 'sync' | 'import_voucher'
  payload jsonb,
  status text not null default 'pending',   -- pending | done | failed
  error text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.tally_push_queue enable row level security;

drop policy if exists "tally_push_queue_owner_all" on public.tally_push_queue;
create policy "tally_push_queue_owner_all" on public.tally_push_queue
  for all to authenticated
  using (
    company_id in (select c.id from public.companies c where c.owner_id = auth.uid())
  )
  with check (
    company_id in (select c.id from public.companies c where c.owner_id = auth.uid())
  );

grant select, insert, update, delete on public.tally_push_queue to authenticated;

-- realtime push channel (postgres_changes) - table must be in the publication
alter publication supabase_realtime add table public.tally_push_queue;

-- Bill-wise outstanding ageing (LK bill view parity) from already-synced data.
-- security_invoker keeps company-RLS of bill_allocations applied per viewer.
create or replace view public.v_outstanding_bills
with (security_invoker = true) as
select
  b.company_id,
  b.voucher_id,
  v.voucher_type,
  v.voucher_number,
  v.voucher_date,
  b.ledger_name,
  b.name  as bill_name,
  b.bill_type,
  b.amount,
  b.bill_date,
  b.due_date,
  b.is_advance,
  (current_date - b.bill_date) as age_days,
  case
    when current_date - b.bill_date <= 30 then '0-30'
    when current_date - b.bill_date <= 60 then '31-60'
    when current_date - b.bill_date <= 90 then '61-90'
    else '90+'
  end as age_bucket
from public.bill_allocations b
left join public.vouchers v on v.id = b.voucher_id
where coalesce(abs(b.amount), 0) > 0;

grant select on public.v_outstanding_bills to authenticated;

notify pgrst, 'reload schema';
