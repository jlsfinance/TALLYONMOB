-- Friendly RLS errors: when a company name is already owned by another account,
-- the desktop app shows WHO owns it instead of the raw 42501 PostgREST JSON.
create or replace function public.get_company_owner_email(p_company_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email::text
  from public.companies c
  join auth.users u on u.id = c.owner_id
  where c.id = p_company_id
$$;

grant execute on function public.get_company_owner_email(text) to authenticated;
revoke execute on function public.get_company_owner_email(text) from anon;

notify pgrst, 'reload schema';
