create function public.report_stock_group_items(p_company_id text, p_dimension text, p_group text, p_unit text, p_limit integer default 50, p_offset integer default 0)
returns table(id text, name text, current_stock numeric, unit text, total_items bigint)
language sql stable security invoker set search_path = '' as $$
 select s.id, s.name, s.current_stock, nullif(trim(coalesce(nullif(s.unit,''),s.base_unit)),''), count(*) over()
 from public.stock_items s
 where s.company_id=p_company_id and s.is_deleted=false and p_dimension in ('group','category')
 and (case when p_dimension='category' then nullif(trim(s.stock_category),'') else nullif(trim(s.stock_group),'') end) is not distinct from p_group
 and nullif(trim(coalesce(nullif(s.unit,''),s.base_unit)),'') is not distinct from p_unit
 and p_limit between 1 and 100 and p_offset between 0 and 1000000
 order by s.name,s.id limit p_limit offset p_offset;
$$;
revoke all on function public.report_stock_group_items(text,text,text,text,integer,integer) from public, anon;
grant execute on function public.report_stock_group_items(text,text,text,text,integer,integer) to authenticated;
notify pgrst, 'reload schema';
