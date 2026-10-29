-- Authenticated users can read only their own subscription; only the verified
-- administrator may manage license records. No user may self-activate a plan.
drop policy if exists "license_user_read_own" on public.user_licenses;
drop policy if exists "license_admin_manage" on public.user_licenses;
create policy "license_user_read_own" on public.user_licenses
    for select to authenticated using ((select auth.uid()) = user_id);

create policy "license_admin_manage" on public.user_licenses
    for all to authenticated
    using ((select auth.jwt() ->> 'email') = 'lovneetrathi@gmail.com')
    with check ((select auth.jwt() ->> 'email') = 'lovneetrathi@gmail.com');
