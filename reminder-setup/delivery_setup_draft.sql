-- Draft setup for review; apply only to the project containing party_reminders.
create table if not exists public.reminder_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id text not null,
  endpoint text not null check (length(endpoint) between 10 and 2048),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, company_id, endpoint)
);
alter table public.reminder_push_subscriptions enable row level security;
drop policy if exists reminder_push_owner on public.reminder_push_subscriptions;
create policy reminder_push_owner on public.reminder_push_subscriptions for all to authenticated
using (user_id = (select auth.uid()) and company_id in (select id from public.companies where owner_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and company_id in (select id from public.companies where owner_id = (select auth.uid())));
grant select, insert, update, delete on public.reminder_push_subscriptions to authenticated;

create table if not exists public.reminder_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.party_reminders(id) on delete cascade,
  channel text not null check (channel in ('telegram','push')),
  event_type text not null check (event_type in ('created','due')),
  available_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  last_error text,
  sent_at timestamptz,
  unique (reminder_id, channel, event_type)
);
alter table public.reminder_delivery_jobs enable row level security;
revoke all on public.reminder_delivery_jobs from anon, authenticated;
create index if not exists reminder_delivery_pending on public.reminder_delivery_jobs (status, available_at);
create or replace function public.queue_party_reminder_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reminder_delivery_jobs(reminder_id,channel,event_type,available_at)
  values (new.id,'telegram','created',now()), (new.id,'push','created',now()),
         (new.id,'telegram','due',new.due_at), (new.id,'push','due',new.due_at);
  return new;
end $$;
revoke all on function public.queue_party_reminder_events() from public, anon, authenticated;
drop trigger if exists party_reminders_enqueue on public.party_reminders;
create trigger party_reminders_enqueue after insert on public.party_reminders for each row execute function public.queue_party_reminder_events();

create or replace function public.claim_reminder_jobs(batch_size integer default 25)
returns setof public.reminder_delivery_jobs language plpgsql security definer set search_path = '' as $$
begin
  return query
  with picked as (
    select id from public.reminder_delivery_jobs
    where available_at <= now() and attempts < 8
      and (status = 'pending' or (status = 'processing' and claimed_at < now() - interval '5 minutes'))
    order by available_at, id for update skip locked limit least(greatest(batch_size, 1), 50)
  )
  update public.reminder_delivery_jobs j set status = 'processing', claimed_at = now(), attempts = j.attempts + 1
  from picked where j.id = picked.id returning j.*;
end $$;
revoke all on function public.claim_reminder_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_reminder_jobs(integer) to service_role;
notify pgrst, 'reload schema';
-- Backfill future reminders only. Historical reminders are not sent retroactively.
insert into public.reminder_delivery_jobs(reminder_id,channel,event_type,available_at)
select r.id, channel, 'due', r.due_at
from public.party_reminders r cross join (values ('telegram'),('push')) channels(channel)
where r.due_at > now()
on conflict (reminder_id, channel, event_type) do nothing;
