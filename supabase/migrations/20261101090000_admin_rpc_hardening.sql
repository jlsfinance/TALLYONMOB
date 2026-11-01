-- Lock down admin/licensing RPCs that were executable by anon (public key) with no caller check.
-- Originals are kept as *_impl (execute revoked) so behaviour is unchanged; each public name becomes
-- a thin guard wrapper using the same admin check as admin_company_detail().
-- Not touched: get_company_owner_email, validate_user_license, find_missing_vouchers,
-- purge_deleted_vouchers, try_claim_tally_serial (the connector calls these with the anon key).

begin;

do $$
declare
  f record;
begin
  for f in
    select * from (values
      ('assign_license', 'text,text,integer,text,text'),
      ('extend_license', 'uuid,integer'),
      ('update_license_status', 'uuid,text'),
      ('bind_tally_serial', 'uuid,text,boolean'),
      ('transfer_tally_serial', 'uuid,text,uuid,text'),
      ('get_admin_users', ''),
      ('get_admin_stats', ''),
      ('get_user_by_email', 'text')
    ) as t(name, args)
  loop
    if to_regprocedure(format('public.%I(%s)', f.name, f.args)) is not null
       and to_regprocedure(format('public.%I(%s)', f.name || '_impl', f.args)) is null then
      execute format('alter function public.%I(%s) rename to %I', f.name, f.args, f.name || '_impl');
      execute format('revoke execute on function public.%I(%s) from public, anon, authenticated, service_role',
                     f.name || '_impl', f.args);
    end if;
  end loop;
end $$;

-- The originals relied on the caller's search_path (the wrappers set it to ''), so pin it.
alter function public.assign_license_impl(text,text,integer,text,text) set search_path = public;
alter function public.extend_license_impl(uuid,integer) set search_path = public;
alter function public.update_license_status_impl(uuid,text) set search_path = public;
alter function public.bind_tally_serial_impl(uuid,text,boolean) set search_path = public;
alter function public.transfer_tally_serial_impl(uuid,text,uuid,text) set search_path = public;
alter function public.get_admin_users_impl() set search_path = public;
alter function public.get_admin_stats_impl() set search_path = public;
alter function public.get_user_by_email_impl(text) set search_path = public;

create or replace function public.assign_license(p_email text, p_plan_slug text, p_duration_days integer default 30, p_mobile text default null, p_tally_serial text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return public.assign_license_impl(p_email, p_plan_slug, p_duration_days, p_mobile, p_tally_serial);
end $$;

create or replace function public.extend_license(p_license_id uuid, p_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return public.extend_license_impl(p_license_id, p_days);
end $$;

create or replace function public.update_license_status(p_license_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return public.update_license_status_impl(p_license_id, p_status);
end $$;

create or replace function public.bind_tally_serial(p_user_id uuid, p_tally_serial text, p_admin_override boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return public.bind_tally_serial_impl(p_user_id, p_tally_serial, p_admin_override);
end $$;

create or replace function public.transfer_tally_serial(p_license_id uuid, p_new_tally_serial text, p_admin_id uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return public.transfer_tally_serial_impl(p_license_id, p_new_tally_serial, p_admin_id, p_reason);
end $$;

create or replace function public.get_admin_users()
returns setof public.user_licenses language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query select * from public.get_admin_users_impl();
end $$;

create or replace function public.get_admin_stats()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return public.get_admin_stats_impl();
end $$;

create or replace function public.get_user_by_email(p_email text)
returns table(user_id uuid, email text) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query select * from public.get_user_by_email_impl(p_email);
end $$;

revoke execute on function public.assign_license(text,text,integer,text,text) from public, anon;
revoke execute on function public.extend_license(uuid,integer) from public, anon;
revoke execute on function public.update_license_status(uuid,text) from public, anon;
revoke execute on function public.bind_tally_serial(uuid,text,boolean) from public, anon;
revoke execute on function public.transfer_tally_serial(uuid,text,uuid,text) from public, anon;
revoke execute on function public.get_admin_users() from public, anon;
revoke execute on function public.get_admin_stats() from public, anon;
revoke execute on function public.get_user_by_email(text) from public, anon;

grant execute on function public.assign_license(text,text,integer,text,text) to authenticated;
grant execute on function public.extend_license(uuid,integer) to authenticated;
grant execute on function public.update_license_status(uuid,text) to authenticated;
grant execute on function public.bind_tally_serial(uuid,text,boolean) to authenticated;
grant execute on function public.transfer_tally_serial(uuid,text,uuid,text) to authenticated;
grant execute on function public.get_admin_users() to authenticated;
grant execute on function public.get_admin_stats() to authenticated;
grant execute on function public.get_user_by_email(text) to authenticated;

notify pgrst, 'reload schema';

commit;
