-- LK parity: party-wise Outstanding (receivable/payable) snapshot per sync.
-- Desktop replaces the whole company snapshot each sync (delete-then-insert),
-- so cleared/settled balances never linger as stale rows.
create table if not exists public.outstanding_bills (
  id uuid primary key,
  company_id text not null,        -- companies.id is text (uuid-as-string) in this schema
  ledger_name text not null,
  direction text not null,          -- 'receivable' (party owes us) | 'payable' (we owe party)
  amount numeric not null default 0,
  owner_id uuid,
  updated_at timestamptz not null default now()
);

alter table public.outstanding_bills enable row level security;

drop policy if exists "outstanding_bills_owner_all" on public.outstanding_bills;
create policy "outstanding_bills_owner_all" on public.outstanding_bills
  for all to authenticated
  using (
    company_id in (select c.id from public.companies c where c.owner_id = auth.uid())
  )
  with check (
    company_id in (select c.id from public.companies c where c.owner_id = auth.uid())
  );

grant select, insert, update, delete on public.outstanding_bills to authenticated;
notify pgrst, 'reload schema';
