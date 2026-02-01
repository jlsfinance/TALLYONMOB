-- Android Dashboard Stats RPC
-- Returns JSON with Total Sales, Outstanding, and Top Items for a Company

create or replace function get_dashboard_stats(
  company_id_param text
)
returns json
language plpgsql
security definer -- Access to tables
as $$
declare
  result json;
  month_start date := date_trunc('month', current_date);
  last_month_start date := date_trunc('month', current_date - interval '1 month');
  last_month_end date := date_trunc('month', current_date) - interval '1 day';
begin
  select json_build_object(
    'sales_this_month', (
       select coalesce(sum(net_amount), 0) 
       from sales 
       where company_id = company_id_param 
       and invoice_date >= month_start
       and is_cancelled = false
    ),
    'sales_last_month', (
       select coalesce(sum(net_amount), 0) 
       from sales 
       where company_id = company_id_param 
       and invoice_date between last_month_start and last_month_end
       and is_cancelled = false
    ),
    'total_outstanding', (
       select coalesce(sum(closing_balance), 0) 
       from ledgers 
       where company_id = company_id_param 
       and closing_balance != 0 
       and (parent_group ilike '%Sundry Debtor%' or parent_group ilike '%Sundry Creditor%')
    ),
    'recent_invoices', (
       select json_agg(t) from (
         select invoice_number, invoice_date, party_ledger_name, net_amount
         from sales
         where company_id = company_id_param
         order by invoice_date desc
         limit 5
       ) t
    ),
    'top_items', (
       select json_agg(t) from (
         select stock_item_name, sum(amount) as value
         from sales_items si
         join sales s on si.sale_id = s.id
         where s.company_id = company_id_param
         and s.invoice_date >= month_start
         group by stock_item_name
         order by value desc
         limit 5
       ) t
    )
  ) into result;
  
  return result;
end;
$$;
