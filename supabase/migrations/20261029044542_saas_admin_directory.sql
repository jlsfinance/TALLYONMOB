-- Admin-only, paginated directory. Never expose auth.users or company secrets
-- through a public view; authorization is checked on the server.
create or replace function public.admin_list_temporary_licenses(
    p_search text default '', p_limit integer default 50, p_offset integer default 0
) returns table (
    user_id uuid, email text, full_name text, phone text, registered_at timestamptz,
    last_active_at timestamptz, account_status text, company_names text,
    company_count bigint, license_type text, status text, expiry timestamptz
) language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if length(coalesce(p_search, '')) > 120 or p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
        raise exception 'Invalid search or pagination';
    end if;
    return query
    select u.id, coalesce(u.email, '')::text, coalesce(p.full_name, '')::text,
           coalesce(p.phone, u.phone, '')::text, u.created_at, u.last_sign_in_at,
           case when u.banned_until > now() then 'BLOCKED' when p.is_active = false then 'INACTIVE' else 'ACTIVE' end,
           coalesce(c.names, '')::text, coalesce(c.n, 0)::bigint,
           coalesce(l.plan_slug, sp.slug, case when t.user_id is not null then 'trial' end)::text,
           case when l.status = 'suspended' then 'SUSPENDED'
                when l.status = 'cancelled' then 'REVOKED'
                when l.status = 'active' and (coalesce(l.expiry_date,l.expires_at) is null or coalesce(l.expiry_date,l.expires_at) > now()) then
                    case when coalesce(l.plan_slug,sp.slug,'') = 'trial' then 'TRIAL' else 'ACTIVE' end
                when l.id is not null then 'EXPIRED'
                when t.user_id is not null and coalesce(t.trial_end,t.ended_at) > now() then 'TRIAL'
                when t.user_id is not null then 'EXPIRED' else 'NONE' end,
           coalesce(l.expiry_date,l.expires_at,t.trial_end,t.ended_at)
    from auth.users u
    left join public.user_profiles p on p.id = u.id
    left join lateral (select string_agg(co.name, ', ' order by co.name) names, count(*) n
                       from public.companies co where co.owner_id = u.id) c on true
    left join lateral (select ul.* from public.user_licenses ul where ul.user_id = u.id
                       order by case when ul.status = 'active' and (coalesce(ul.expiry_date,ul.expires_at) is null or coalesce(ul.expiry_date,ul.expires_at) > now()) then 0 else 1 end,
                                ul.created_at desc, ul.id desc limit 1) l on true
    left join public.subscription_plans sp on sp.id = l.plan_id
    left join lateral (select th.user_id, th.trial_end, th.ended_at from public.trial_history th where th.user_id = u.id
                       order by th.created_at desc, th.id desc limit 1) t on true
    where coalesce(u.email,'') ilike '%' || coalesce(p_search,'') || '%'
       or coalesce(p.full_name,'') ilike '%' || coalesce(p_search,'') || '%'
       or coalesce(c.names,'') ilike '%' || coalesce(p_search,'') || '%'
    order by u.created_at desc nulls last, u.id limit p_limit offset p_offset;
end;
$$;
revoke all on function public.admin_list_temporary_licenses(text, integer, integer) from public, anon;
grant execute on function public.admin_list_temporary_licenses(text, integer, integer) to authenticated;
