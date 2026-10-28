create table public.report_favourites (
  user_id uuid not null references auth.users(id) on delete cascade,
  report_key text not null check (length(report_key) between 1 and 160),
  created_at timestamptz not null default now(),
  primary key (user_id, report_key)
);
alter table public.report_favourites enable row level security;
revoke all on public.report_favourites from anon;
grant select, insert, delete on public.report_favourites to authenticated;
create policy report_favourites_select on public.report_favourites for select to authenticated using (user_id = (select auth.uid()));
create policy report_favourites_insert on public.report_favourites for insert to authenticated with check (user_id = (select auth.uid()));
create policy report_favourites_delete on public.report_favourites for delete to authenticated using (user_id = (select auth.uid()));
notify pgrst, 'reload schema';
