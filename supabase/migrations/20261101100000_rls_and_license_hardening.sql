-- Round 2: close the remaining findings from the audit.
--   1. get_company_owner_email: no more anonymous owner-email lookup (connector sends its user token).
--   2. validate_user_license: was always failing (ambiguous "status"); qualify columns + only your own license.
--   3. email_queue / payment_links / reminder_logs / lead_followups: replace USING (true) policies with
--      company-scoped ones (contact form keeps its anonymous insert).
--   4. service_role has no business calling the admin wrappers.
-- Re-runnable.

begin;

-- 1) get_company_owner_email ------------------------------------------------
create or replace function public.get_company_owner_email(p_company_id text)
returns text language sql stable security definer set search_path = public as $$
  select u.email::text
  from public.companies c
  join auth.users u on u.id = c.owner_id
  where c.id = p_company_id
    and auth.uid() is not null
    and public.sync_user_can_access_company(p_company_id)
$$;

revoke execute on function public.get_company_owner_email(text) from public, anon;
grant execute on function public.get_company_owner_email(text) to authenticated;

-- 2) validate_user_license ---------------------------------------------------
create or replace function public.validate_user_license(p_user_id uuid, p_tally_serial text default null)
returns table(valid boolean, status text, plan_name text, expiry_date timestamp with time zone, days_left integer, tally_serial_bound text, email_bound text, mobile_bound text)
language plpgsql security definer set search_path = public as $$
declare
    lic record;
    plan record;
begin
    if auth.uid() is null or p_user_id is distinct from auth.uid() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    select ul.* into lic from public.user_licenses ul
    where ul.user_id = p_user_id and ul.status in ('active','suspended')
    order by ul.created_at desc limit 1;

    if not found then
        return query select false, 'no_license'::text, 'None'::text, null::timestamptz, 0, null::text, null::text, null::text;
        return;
    end if;

    if lic.expiry_date < now() then
        update public.user_licenses ul set status = 'expired' where ul.id = lic.id;
        return query select false, 'expired'::text, 'Expired'::text, lic.expiry_date, 0, lic.tally_serial, lic.email, lic.mobile;
        return;
    end if;

    if lic.status = 'suspended' then
        return query select false, 'suspended'::text, 'Suspended'::text, lic.expiry_date, 0, lic.tally_serial, lic.email, lic.mobile;
        return;
    end if;

    if lic.tally_serial is not null and lic.tally_serial <> '' then
        if p_tally_serial is not null and p_tally_serial <> '' then
            if lic.tally_serial <> p_tally_serial then
                return query select false, 'tally_mismatch'::text, 'License Mismatch'::text, lic.expiry_date, 0, lic.tally_serial, lic.email, lic.mobile;
                return;
            end if;
        end if;
    end if;

    select sp.name into plan from public.subscription_plans sp where sp.id = lic.plan_id;

    return query select
        true,
        lic.status,
        coalesce(plan.name, 'Unknown'),
        lic.expiry_date,
        extract(day from lic.expiry_date - now())::integer,
        lic.tally_serial,
        lic.email,
        lic.mobile;
end $$;

-- 3) company-scoped RLS ------------------------------------------------------
drop policy if exists "Allow all for email_queue" on public.email_queue;
drop policy if exists "Allow all for authenticated" on public.email_queue;
drop policy if exists "Allow all for payment_links" on public.payment_links;
drop policy if exists "Allow all for authenticated" on public.payment_links;
drop policy if exists "Allow all for reminder_logs" on public.reminder_logs;
drop policy if exists "Allow all for authenticated" on public.reminder_logs;
drop policy if exists lead_followups_auth on public.lead_followups;

create policy email_queue_owner_read on public.email_queue
    for select to authenticated using (public.sync_user_can_access_company(company_id));
create policy email_queue_owner_write on public.email_queue
    for all to authenticated
    using (public.sync_user_can_write_company(company_id))
    with check (public.sync_user_can_write_company(company_id));
-- website contact form posts without a company
create policy email_queue_contact_insert on public.email_queue
    for insert to anon, authenticated with check (company_id is null);

create policy payment_links_owner_read on public.payment_links
    for select to authenticated using (public.sync_user_can_access_company(company_id));
create policy payment_links_owner_write on public.payment_links
    for all to authenticated
    using (public.sync_user_can_write_company(company_id))
    with check (public.sync_user_can_write_company(company_id));

create policy reminder_logs_owner_read on public.reminder_logs
    for select to authenticated using (public.sync_user_can_access_company(company_id));
create policy reminder_logs_owner_write on public.reminder_logs
    for all to authenticated
    using (public.sync_user_can_write_company(company_id))
    with check (public.sync_user_can_write_company(company_id));

create policy lead_followups_own_read on public.lead_followups
    for select to authenticated using (user_id = auth.uid());
create policy lead_followups_own_insert on public.lead_followups
    for insert to authenticated with check (user_id is null or user_id = auth.uid());
create policy lead_followups_own_update on public.lead_followups
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy lead_followups_own_delete on public.lead_followups
    for delete to authenticated using (user_id = auth.uid());

-- 4) admin wrappers: authenticated only --------------------------------------
revoke execute on function public.validate_user_license(uuid,text) from public, anon;
grant execute on function public.validate_user_license(uuid,text) to authenticated;
revoke execute on function public.assign_license(text,text,integer,text,text) from service_role;
revoke execute on function public.extend_license(uuid,integer) from service_role;
revoke execute on function public.update_license_status(uuid,text) from service_role;
revoke execute on function public.bind_tally_serial(uuid,text,boolean) from service_role;
revoke execute on function public.transfer_tally_serial(uuid,text,uuid,text) from service_role;
revoke execute on function public.get_admin_users() from service_role;
revoke execute on function public.get_admin_stats() from service_role;
revoke execute on function public.get_user_by_email(text) from service_role;

notify pgrst, 'reload schema';

commit;
