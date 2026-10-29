-- Temporary user licensing foundation. Disabled until the application,
-- scheduler, entitlement enforcement, and rollback have all been verified.
-- Existing license and trial rows are never rewritten by this migration.
alter table public.user_licenses
    add column if not exists temporary_license_type text,
    add column if not exists temporary_revoked_at timestamptz;

create table if not exists public.temporary_license_settings (
    singleton boolean primary key default true check (singleton),
    enabled boolean not null default false,
    enabled_at timestamptz,
    updated_at timestamptz not null default now()
);
insert into public.temporary_license_settings (singleton, enabled)
values (true, false) on conflict (singleton) do nothing;
alter table public.temporary_license_settings enable row level security;
revoke all on public.temporary_license_settings from anon, authenticated;

create table if not exists public.temporary_license_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id),
    license_id uuid references public.user_licenses(id),
    event_type text not null check (event_type in ('TRIAL', 'COURTESY', 'ADMIN_GRANTED', 'REVOKED', 'RESTORED', 'EXPIRED')),
    event_key text not null unique,
    previous_expiry timestamptz,
    new_expiry timestamptz,
    actor_id uuid references auth.users(id),
    reason text,
    created_at timestamptz not null default now(),
    acknowledged_at timestamptz,
    claim_until timestamptz,
    claim_id uuid
);
create index if not exists temporary_license_events_user_created_idx
    on public.temporary_license_events (user_id, created_at desc);
alter table public.temporary_license_events enable row level security;
revoke all on public.temporary_license_events from anon, authenticated;
grant select on public.temporary_license_events to authenticated;
drop policy if exists "temporary_license_events_owner_read" on public.temporary_license_events;
create policy "temporary_license_events_owner_read" on public.temporary_license_events
    for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "temporary_license_events_admin_read" on public.temporary_license_events;
create policy "temporary_license_events_admin_read" on public.temporary_license_events
    for select to authenticated using ((select auth.jwt() ->> 'email') = 'lovneetrathi@gmail.com');

-- Enforce one initial grant per account even if requests run concurrently.
create unique index if not exists temporary_license_initial_user_idx
    on public.temporary_license_events (user_id) where event_type = 'TRIAL';

-- Company creation may originate in web or desktop sync. The trigger runs
-- within the same transaction and only considers new users after enablement.
create schema if not exists temporary_licensing_private;
revoke all on schema temporary_licensing_private from public, anon, authenticated;

create or replace function temporary_licensing_private.grant_initial_trial()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_enabled_at timestamptz;
    v_license_id uuid;
    v_now timestamptz := now();
begin
    if new.owner_id is null then return new; end if;
    select enabled_at into v_enabled_at from public.temporary_license_settings
      where singleton and enabled and enabled_at is not null;
    if v_enabled_at is null then return new; end if;
    if not exists (select 1 from auth.users where id = new.owner_id and created_at >= v_enabled_at) then
        return new;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text, 89171));
    -- Existing license/trial means this account must not receive a new trial.
    if exists (select 1 from public.user_licenses where user_id = new.owner_id)
       or exists (select 1 from public.trial_history where user_id = new.owner_id)
       or exists (select 1 from public.temporary_license_events where user_id = new.owner_id and event_type = 'TRIAL') then
        return new;
    end if;
    insert into public.user_licenses (user_id, status, starts_at, expires_at, activation_date, expiry_date, plan_slug, temporary_license_type)
    values (new.owner_id, 'active', v_now, v_now + interval '30 days', v_now, v_now + interval '30 days', 'trial', 'TRIAL')
    returning id into v_license_id;
    insert into public.trial_history (user_id, license_id, trial_used, trial_start, trial_end, status)
    values (new.owner_id, v_license_id, true, v_now, v_now + interval '30 days', 'active');
    insert into public.temporary_license_events (user_id, license_id, event_type, event_key, new_expiry)
    values (new.owner_id, v_license_id, 'TRIAL', 'trial:' || new.owner_id::text, v_now + interval '30 days');
    return new;
end;
$$;
revoke all on function temporary_licensing_private.grant_initial_trial() from public, anon, authenticated;

drop trigger if exists temporary_initial_trial_company on public.companies;
create trigger temporary_initial_trial_company
    after insert or update of owner_id on public.companies
    for each row execute function temporary_licensing_private.grant_initial_trial();

-- Scheduled execution is configured separately only after end-to-end checks.
-- A missed job produces one new 30-day period from server time, not an
-- unbounded loop of historical grants.
create or replace function temporary_licensing_private.renew_due_trials(p_limit integer default 200)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v_record record;
    v_now timestamptz := now();
    v_key text;
    v_total integer := 0;
begin
    if not exists (select 1 from public.temporary_license_settings where singleton and enabled) then return 0; end if;
    for v_record in
        select l.id, l.user_id, coalesce(l.expiry_date, l.expires_at) as old_expiry
        from public.user_licenses l
        where l.temporary_license_type in ('TRIAL', 'COURTESY', 'ADMIN_GRANTED')
          and l.temporary_revoked_at is null and l.status in ('active', 'expired')
          and coalesce(l.expiry_date, l.expires_at) <= v_now
          and not exists (
              select 1 from public.user_licenses other
              where other.user_id = l.user_id and other.id <> l.id and other.status = 'active'
                and (coalesce(other.expiry_date, other.expires_at) is null
                     or coalesce(other.expiry_date, other.expires_at) > v_now)
          )
        order by coalesce(l.expiry_date, l.expires_at), l.id
        limit greatest(1, least(coalesce(p_limit, 200), 1000))
        for update of l skip locked
    loop
        v_key := 'courtesy:' || v_record.id::text || ':' || extract(epoch from v_record.old_expiry)::text;
        insert into public.temporary_license_events
            (user_id, license_id, event_type, event_key, previous_expiry, new_expiry)
        values (v_record.user_id, v_record.id, 'COURTESY', v_key, v_record.old_expiry, v_now + interval '30 days')
        on conflict (event_key) do nothing;
        if found then
            update public.user_licenses set status = 'active', temporary_license_type = 'COURTESY',
                expiry_date = v_now + interval '30 days', expires_at = v_now + interval '30 days', updated_at = v_now
            where id = v_record.id;
            v_total := v_total + 1;
        end if;
    end loop;
    return v_total;
end;
$$;
revoke all on function temporary_licensing_private.renew_due_trials(integer) from public, anon, authenticated;

-- All privileged actions use the authenticated admin identity, not user metadata.
create or replace function public.temporary_license_admin_action(
    p_user_id uuid, p_action text, p_days integer, p_reason text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := auth.uid();
    v_license public.user_licenses%rowtype;
    v_now timestamptz := now();
    v_old_expiry timestamptz;
    v_new_expiry timestamptz;
    v_existing_expiry timestamptz;
    v_has_permanent boolean;
    v_action text := upper(trim(coalesce(p_action, '')));
begin
    if v_actor is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if not exists (select 1 from public.temporary_license_settings where singleton and enabled) then
        raise exception 'Temporary licensing is disabled';
    end if;
    if p_request_id is null then raise exception 'Request ID required'; end if;
    if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
        raise exception 'User not found';
    end if;
    if v_action not in ('EXTEND', 'REVOKE', 'RESTORE') then raise exception 'Invalid action'; end if;
    if v_action in ('EXTEND', 'RESTORE') and (p_days is null or p_days < 1 or p_days > 36500) then
        raise exception 'Duration must be between 1 and 36500 days';
    end if;
    if length(coalesce(p_reason, '')) > 500 then raise exception 'Reason is too long'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 89171));
    if exists (select 1 from public.temporary_license_events where event_key = 'admin:' || p_request_id::text) then
        if not exists (select 1 from public.temporary_license_events where event_key = 'admin:' || p_request_id::text and user_id = p_user_id and actor_id = v_actor) then
            raise exception 'Request ID already used';
        end if;
        return jsonb_build_object('status', 'ALREADY_APPLIED');
    end if;
    select * into v_license from public.user_licenses
      where user_id = p_user_id and temporary_license_type is not null
      order by created_at desc, id desc limit 1 for update;
    if v_license.id is null then
        if v_action = 'REVOKE' then raise exception 'No temporary license found for user'; end if;
        -- Never modify legacy grants: start an additional temporary grant after
        -- the user's latest active finite expiry, or from server time.
        select bool_or(coalesce(expiry_date, expires_at) is null), max(coalesce(expiry_date, expires_at))
          into v_has_permanent, v_existing_expiry from public.user_licenses
          where user_id = p_user_id and status = 'active'
            and (coalesce(expiry_date, expires_at) is null or coalesce(expiry_date, expires_at) > v_now);
        if coalesce(v_has_permanent, false) then raise exception 'An active non-expiring license already exists'; end if;
        insert into public.user_licenses (user_id, status, starts_at, activation_date, temporary_license_type)
          values (p_user_id, 'active', v_now, v_now, 'ADMIN_GRANTED') returning * into v_license;
        v_license.expiry_date := v_existing_expiry;
    end if;
    v_old_expiry := coalesce(v_license.expiry_date, v_license.expires_at);
    if v_action = 'REVOKE' then
        update public.user_licenses set status = 'cancelled', temporary_revoked_at = v_now, updated_at = v_now where id = v_license.id;
    else
        if v_action = 'EXTEND' and v_license.temporary_revoked_at is not null then
            raise exception 'Restore the revoked license before extending it';
        end if;
        v_new_expiry := greatest(coalesce(v_old_expiry, v_now), v_now) + make_interval(days => p_days);
        update public.user_licenses set status = 'active', temporary_revoked_at = null,
            temporary_license_type = 'ADMIN_GRANTED', expiry_date = v_new_expiry,
            expires_at = v_new_expiry, updated_at = v_now where id = v_license.id;
    end if;
    insert into public.temporary_license_events
       (user_id, license_id, event_type, event_key, previous_expiry, new_expiry, actor_id, reason)
    values (p_user_id, v_license.id,
       case v_action when 'EXTEND' then 'ADMIN_GRANTED' when 'RESTORE' then 'RESTORED' else 'REVOKED' end,
       'admin:' || p_request_id::text, v_old_expiry, v_new_expiry, v_actor, nullif(trim(p_reason), ''));
    return jsonb_build_object('status', case when v_action = 'REVOKE' then 'REVOKED' else 'ACTIVE' end,
                              'expiry', v_new_expiry);
end;
$$;
revoke all on function public.temporary_license_admin_action(uuid, text, integer, text, uuid) from public, anon;
grant execute on function public.temporary_license_admin_action(uuid, text, integer, text, uuid) to authenticated;

-- The short claim lease prevents simultaneous tabs showing the same notice.
-- If a tab closes before acknowledgement, a later session can claim it again.
create or replace function public.claim_temporary_license_notice()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.temporary_license_events%rowtype; v_claim uuid := gen_random_uuid();
begin
    if auth.uid() is null then raise exception 'Not authorized' using errcode = '42501'; end if;
    if not exists (select 1 from public.temporary_license_settings where singleton and enabled) then return null; end if;
    select * into v_event from public.temporary_license_events
      where user_id = auth.uid() and event_type in ('TRIAL', 'COURTESY')
        and acknowledged_at is null and (claim_until is null or claim_until < now())
      order by created_at desc, id desc limit 1 for update skip locked;
    if v_event.id is null then return null; end if;
    -- Serialize claims per user; do not claim another notice while one is open.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 89172));
    if exists (select 1 from public.temporary_license_events where user_id = auth.uid() and claim_until > now() and acknowledged_at is null) then return null; end if;
    update public.temporary_license_events set claim_id = v_claim, claim_until = now() + interval '5 minutes' where id = v_event.id;
    return jsonb_build_object('id', v_event.id, 'claim_id', v_claim, 'type', v_event.event_type, 'expiry', v_event.new_expiry, 'server_time', now());
end;
$$;
revoke all on function public.claim_temporary_license_notice() from public, anon;
grant execute on function public.claim_temporary_license_notice() to authenticated;

create or replace function public.acknowledge_temporary_license_notice(p_event_id uuid, p_claim_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_event public.temporary_license_events%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authorized' using errcode = '42501'; end if;
    select * into v_event from public.temporary_license_events where id = p_event_id and user_id = auth.uid()
       and claim_id = p_claim_id and claim_until > now() and acknowledged_at is null for update;
    if v_event.id is null then return false; end if;
    update public.temporary_license_events set acknowledged_at = now(), claim_id = null, claim_until = null
      where user_id = auth.uid() and acknowledged_at is null and event_type = v_event.event_type
        and created_at <= v_event.created_at;
    return true;
end;
$$;
revoke all on function public.acknowledge_temporary_license_notice(uuid, uuid) from public, anon;
grant execute on function public.acknowledge_temporary_license_notice(uuid, uuid) to authenticated;

create or replace function public.get_temporary_license_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_enabled boolean; v_license public.user_licenses%rowtype; v_now timestamptz := now();
begin
    if auth.uid() is null then raise exception 'Not authorized' using errcode = '42501'; end if;
    select enabled into v_enabled from public.temporary_license_settings where singleton;
    if not coalesce(v_enabled, false) then return jsonb_build_object('enabled', false, 'server_time', v_now); end if;
    select * into v_license from public.user_licenses where user_id = auth.uid() and temporary_license_type is not null
      order by case when status = 'active' and coalesce(expiry_date, expires_at) > v_now and temporary_revoked_at is null then 0 else 1 end,
               coalesce(expiry_date, expires_at) desc nulls last, created_at desc, id desc limit 1;
    if v_license.id is null then return jsonb_build_object('enabled', true, 'type', null, 'server_time', v_now); end if;
    return jsonb_build_object('enabled', true, 'type', v_license.temporary_license_type,
      'status', case when v_license.temporary_revoked_at is not null then 'REVOKED'
                     when v_license.status = 'suspended' then 'SUSPENDED'
                     when v_license.status = 'active' and coalesce(v_license.expiry_date, v_license.expires_at) > v_now then 'ACTIVE'
                     else 'EXPIRED' end,
      'expiry', coalesce(v_license.expiry_date, v_license.expires_at), 'server_time', v_now);
end;
$$;
revoke all on function public.get_temporary_license_status() from public, anon;
grant execute on function public.get_temporary_license_status() to authenticated;

-- Keep configuration centralized and retain the first rollout cutoff across
-- disable/re-enable cycles; toggling must never delete license history.
create or replace function public.set_temporary_licensing_enabled(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := now(); v_row public.temporary_license_settings%rowtype;
begin
    if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if p_enabled is null then raise exception 'Enabled flag is required'; end if;
    update public.temporary_license_settings set enabled = p_enabled,
        enabled_at = case when p_enabled then coalesce(enabled_at, v_now) else enabled_at end,
        updated_at = v_now where singleton returning * into v_row;
    return jsonb_build_object('enabled', v_row.enabled, 'enabled_at', v_row.enabled_at);
end;
$$;
revoke all on function public.set_temporary_licensing_enabled(boolean) from public, anon;
grant execute on function public.set_temporary_licensing_enabled(boolean) to authenticated;

