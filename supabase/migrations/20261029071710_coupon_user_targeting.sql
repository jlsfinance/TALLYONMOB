alter table public.coupons add column if not exists audience text not null default 'global';
alter table public.coupons drop constraint if exists coupons_audience_check;
alter table public.coupons add constraint coupons_audience_check check (audience in ('global','specific'));

create table if not exists public.coupon_target_users (
    coupon_id uuid not null references public.coupons(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    primary key (coupon_id, user_id)
);
alter table public.coupon_target_users enable row level security;
revoke all on public.coupon_target_users from anon, authenticated;
grant select on public.coupon_target_users to authenticated;
drop policy if exists coupon_targets_own_select on public.coupon_target_users;
create policy coupon_targets_own_select on public.coupon_target_users for select to authenticated
  using (user_id = (select auth.uid()) or (select auth.jwt() ->> 'email') = 'lovneetrathi@gmail.com');

drop policy if exists c_anon_select on public.coupons;
create policy c_anon_select on public.coupons for select to anon using (is_active and audience='global');
drop policy if exists user_read_active_coupons on public.coupons;
create policy user_read_active_coupons on public.coupons for select to authenticated using (
  (select auth.jwt() ->> 'email') = 'lovneetrathi@gmail.com' or
  (is_active and (audience='global' or exists (
      select 1 from public.coupon_target_users t where t.coupon_id = coupons.id and t.user_id = (select auth.uid())
  )))
);

create or replace function public.admin_set_coupon_audience(p_coupon_id uuid, p_audience text, p_emails text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_expected integer;
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_audience not in ('global','specific') or coalesce(cardinality(p_emails),0)>500 then raise exception 'Invalid audience'; end if;
  perform 1 from public.coupons where id=p_coupon_id for update;
  if not found then raise exception 'Coupon not found'; end if;
  if p_audience='specific' then
    select count(distinct lower(trim(e))) into v_expected from unnest(coalesce(p_emails,array[]::text[])) e where trim(e)<>'';
    if v_expected=0 then raise exception 'Select at least one user'; end if;
    select count(distinct lower(u.email)) into v_count from auth.users u
      where lower(u.email) in (select lower(trim(e)) from unnest(p_emails) e where trim(e)<>'');
    if v_count<>v_expected then raise exception 'One or more user emails were not found'; end if;
  end if;
  delete from public.coupon_target_users where coupon_id=p_coupon_id;
  if p_audience='specific' then
    insert into public.coupon_target_users(coupon_id,user_id)
      select p_coupon_id,u.id from auth.users u where lower(u.email) in (select lower(trim(e)) from unnest(p_emails) e where trim(e)<>'');
  end if;
  update public.coupons set audience=p_audience where id=p_coupon_id;
  return jsonb_build_object('audience',p_audience,'users',coalesce(v_count,0));
end;
$$;
revoke all on function public.admin_set_coupon_audience(uuid, text, text[]) from public, anon;
grant execute on function public.admin_set_coupon_audience(uuid, text, text[]) to authenticated;

create or replace function public.admin_create_targeted_coupon(
  p_code text, p_discount_type text, p_discount_value numeric, p_usage_limit integer,
  p_audience text, p_emails text[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_code,''))) not between 1 and 80 or p_discount_type not in ('flat','percentage')
     or p_discount_value is null or p_discount_value <= 0
     or (p_discount_type='percentage' and p_discount_value > 100)
     or (p_usage_limit is not null and p_usage_limit < 1) then raise exception 'Invalid coupon details'; end if;
  insert into public.coupons(code,discount_type,discount_value,usage_limit,is_active,audience)
    values (upper(trim(p_code)),p_discount_type,p_discount_value,p_usage_limit,false,'global') returning id into v_id;
  perform public.admin_set_coupon_audience(v_id,p_audience,p_emails);
  update public.coupons set is_active=true where id=v_id;
  return v_id;
end;
$$;
revoke all on function public.admin_create_targeted_coupon(text, text, numeric, integer, text, text[]) from public, anon;
grant execute on function public.admin_create_targeted_coupon(text, text, numeric, integer, text, text[]) to authenticated;

create or replace function public.admin_get_coupon_target_emails(p_coupon_id uuid)
returns table(email text) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query select u.email::text from public.coupon_target_users t join auth.users u on u.id=t.user_id
    where t.coupon_id=p_coupon_id order by u.email;
end;
$$;
revoke all on function public.admin_get_coupon_target_emails(uuid) from public, anon;
grant execute on function public.admin_get_coupon_target_emails(uuid) to authenticated;
