-- Current synced stock snapshot, grouped by one source unit at a time.
-- Runs with caller privileges: existing stock_items RLS continues to apply.
create or replace function public.report_stock_groups(p_company_id text, p_dimension text, p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table(group_name text, unit text, item_count bigint, quantity numeric, stock_value numeric, missing_value_count bigint, total_groups bigint)
language sql stable security invoker set search_path = ''
as $$
  with base as (
    select case when p_dimension = 'category' then nullif(trim(s.stock_category), '') else nullif(trim(s.stock_group), '') end as source_group,
      nullif(trim(coalesce(nullif(s.unit,''), s.base_unit)), '') as source_unit,
      s.current_stock, s.closing_value
    from public.stock_items s
    where s.company_id = p_company_id and s.is_deleted = false
      and p_dimension in ('group','category')
      and p_limit between 1 and 100 and p_offset between 0 and 1000000
  ), grouped as (
    select source_group, source_unit, count(*) as n, case when count(*) filter (where current_stock is null) = 0 then sum(current_stock) else null end as qty,
      case when count(*) filter (where closing_value is null) = 0 then sum(closing_value) else null end as value,
      count(*) filter (where closing_value is null) as missing_values
    from base where p_search = '' or coalesce(source_group,'Not synced') ilike '%' || replace(replace(replace(left(p_search,100), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%'
    group by source_group, source_unit
  )
  select source_group, source_unit, n, qty, value, missing_values, count(*) over()
  from grouped order by source_group nulls last, source_unit nulls last limit p_limit offset p_offset;
$$;
revoke all on function public.report_stock_groups(text,text,text,integer,integer) from public, anon;
grant execute on function public.report_stock_groups(text,text,text,integer,integer) to authenticated;
notify pgrst, 'reload schema';
