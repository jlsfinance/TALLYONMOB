-- Fix: guard_license_updates references non-existent column trial_ends_at
create or replace function public.guard_license_updates()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if (current_setting('request.jwt.claims', true)::jsonb ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
        if (NEW.expiry_date is distinct from OLD.expiry_date)
           or (NEW.status is distinct from OLD.status)
           or (NEW.plan_id is distinct from OLD.plan_id) then
            raise exception 'License fields are immutable for non-admin' using errcode = '42501';
        end if;
    end if;
    return NEW;
end $$;

drop trigger if exists trg_guard_license_updates on public.user_licenses;
create trigger trg_guard_license_updates
    before update on public.user_licenses
    for each row execute function public.guard_license_updates();

notify pgrst, 'reload schema';
