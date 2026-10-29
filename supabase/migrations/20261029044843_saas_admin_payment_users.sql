create or replace function public.admin_payment_users(p_user_ids uuid[])
returns table(user_id uuid, email text, full_name text)
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if coalesce(cardinality(p_user_ids), 0) > 1000 then raise exception 'Too many user IDs'; end if;
    return query select u.id, coalesce(u.email, '')::text, coalesce(p.full_name, '')::text
      from auth.users u left join public.user_profiles p on p.id = u.id
      where u.id = any(coalesce(p_user_ids, array[]::uuid[]));
end;
$$;
revoke all on function public.admin_payment_users(uuid[]) from public, anon;
grant execute on function public.admin_payment_users(uuid[]) to authenticated;
