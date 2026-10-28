-- Draft only: requires review and application to the intended Supabase project.
create table if not exists public.party_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  company_id text not null,
  party_ledger_id text not null,
  party_name text not null,
  message text not null check (length(trim(message)) between 1 and 1000),
  due_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.party_reminders enable row level security;
create policy party_reminders_select on public.party_reminders for select to authenticated
using (user_id = (select auth.uid()) and company_id in (select id from public.companies where owner_id = (select auth.uid())));
create policy party_reminders_insert on public.party_reminders for insert to authenticated
with check (user_id = (select auth.uid()) and company_id in (select id from public.companies where owner_id = (select auth.uid())));
grant select, insert on public.party_reminders to authenticated;
create index if not exists party_reminders_due_user on public.party_reminders (user_id, company_id, due_at);
notify pgrst, 'reload schema';
