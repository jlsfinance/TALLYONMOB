create or replace function public.admin_filtered_user_directory(
 p_search text default '', p_limit integer default 50, p_offset integer default 0,
 p_mode text default 'users', p_filter text default 'all'
) returns table(user_id uuid, email text, full_name text, phone text, registered_at timestamptz,
 last_active_at timestamptz, account_status text, company_names text, company_count bigint,
 license_type text, status text, expiry timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare v_source_offset integer := 0; v_skip integer := p_offset; v_total integer; v_matched integer; v_emitted integer := 0; v_added integer;
begin
 if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
   raise exception 'Not authorized' using errcode = '42501';
 end if;
 if p_limit not between 1 and 100 or p_offset < 0 or p_mode not in ('users','companies') or
    (p_mode='users' and p_filter not in ('all','ACTIVE','TRIAL','EXPIRED','NONE')) or
    (p_mode='companies' and p_filter not in ('all','none','linked')) then raise exception 'Invalid filter'; end if;
 loop
   select count(*), count(*) filter (where p_filter='all' or
      (p_mode='users' and d.status=p_filter) or
      (p_mode='companies' and ((p_filter='none' and d.company_count=0) or (p_filter='linked' and d.company_count>0))))
   into v_total, v_matched from public.admin_list_temporary_licenses(p_search,100,v_source_offset) d;
   exit when v_total = 0;
   if v_skip >= v_matched then v_skip := v_skip - v_matched;
   else
     return query select d.* from public.admin_list_temporary_licenses(p_search,100,v_source_offset) d
       where p_filter='all' or (p_mode='users' and d.status=p_filter) or
       (p_mode='companies' and ((p_filter='none' and d.company_count=0) or (p_filter='linked' and d.company_count>0)))
       offset v_skip limit (p_limit-v_emitted);
     get diagnostics v_added = row_count;
     v_emitted := v_emitted + v_added; v_skip := 0;
   end if;
   exit when v_emitted >= p_limit or v_total < 100;
   v_source_offset := v_source_offset + 100;
 end loop;
end;
$$;
revoke all on function public.admin_filtered_user_directory(text, integer, integer, text, text) from public, anon;
grant execute on function public.admin_filtered_user_directory(text, integer, integer, text, text) to authenticated;
