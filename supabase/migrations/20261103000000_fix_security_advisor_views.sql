-- Fix Supabase security advisor findings:
--   0002 auth_users_exposed  (admin_dashboard_stats, admin_recent_payments, admin_expiring_licenses)
--   0010 security_definer_view (the same 3 + v_company_summary, v_ledger_balances, v_user_companies)
--
-- The admin views exposed auth.users to anon. They are replaced by guarded
-- SECURITY DEFINER functions (same pattern as get_admin_stats). The reporting
-- v_* views are unused by the app, so they only need security_invoker.

create or replace function public.get_admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
    if not exists (
        select 1 from public.user_profiles up
        where up.id = auth.uid() and up.is_admin
    ) then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    return (
        select jsonb_build_object(
            'total_users', (select count(*) from auth.users),
            'active_users', (
                select count(distinct ul.user_id) from public.user_licenses ul
                where ul.status = 'active' and ul.expiry_date > now()
            ),
            'expired_users', (
                select count(distinct ul.user_id) from public.user_licenses ul
                where ul.status = 'expired' or ul.expiry_date <= now()
            ),
            'trial_users', (
                select count(*) from public.trial_history th where th.trial_used = true
            ),
            'total_revenue', (
                select coalesce(sum(p.total_amount), 0) from public.payments p
                where p.status = 'paid'
            ),
            'mrr', (
                select coalesce(sum(p.total_amount), 0) from public.payments p
                where p.status = 'paid' and p.created_at >= date_trunc('month', now())
            ),
            'arr', (
                select coalesce(sum(p.total_amount), 0) from public.payments p
                where p.status = 'paid' and p.created_at >= date_trunc('year', now())
            )
        )
    );
end;
$function$;

create or replace function public.get_admin_recent_payments(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
    if not exists (
        select 1 from public.user_profiles up
        where up.id = auth.uid() and up.is_admin
    ) then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    return coalesce((
        select jsonb_agg(to_jsonb(t) order by t.created_at desc)
        from (
            select p.*, u.email as user_email, sp.name as plan_name
            from public.payments p
            left join auth.users u on u.id = p.user_id
            left join public.subscription_plans sp on sp.id = p.plan_id
            limit least(greatest(coalesce(p_limit, 100), 1), 1000)
        ) t
    ), '[]'::jsonb);
end;
$function$;

revoke all on function public.get_admin_dashboard_stats() from public, anon;
revoke all on function public.get_admin_recent_payments(int) from public, anon;
grant execute on function public.get_admin_dashboard_stats() to authenticated, service_role;
grant execute on function public.get_admin_recent_payments(int) to authenticated, service_role;

drop view if exists public.admin_dashboard_stats;
drop view if exists public.admin_recent_payments;
drop view if exists public.admin_expiring_licenses;

alter view public.v_company_summary set (security_invoker = true);
alter view public.v_ledger_balances set (security_invoker = true);
alter view public.v_user_companies set (security_invoker = true);
