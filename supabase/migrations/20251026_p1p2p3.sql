-- P1/P2/P3 sync-parity (LiveKeeping parity items: deletion propagation, license guard, missing-voucher repair)
--
-- P1  purge_deleted_vouchers(p_company_id, p_guids)
--     Client posts Tally's current voucher GUID index; every cloud voucher whose GUID is
--     absent gets deleted (with its SET-NULL-FK children). Doomed-children tables chosen from
--     information_schema FK map: sales/purchases/bank_allocations/bill_allocations/
--     tds_tcs_entries/payment_links/email_queue (SET NULL), voucher_entries/
--     voucher_ledger_entries/voucher_stock_entries/approval_items (CASCADE - automatic).
--     Returns purged voucher count; -1 = safety guard skipped the purge.
create or replace function public.purge_deleted_vouchers(p_company_id text, p_guids jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guids text[] := '{}';
  v_doomed text[] := '{}';
  v_doomed_count integer := 0;
  v_total integer := 0;
  v_purged integer := 0;
begin
  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id and c.owner_id = auth.uid()
  ) then
    raise exception 'company not owned by current user' using errcode = '42501';
  end if;

  -- never act on an empty index: it would mark every cloud voucher as deleted
  if coalesce(jsonb_array_length(p_guids), 0) = 0 then return 0; end if;

  select coalesce(array_agg(v), '{}') into v_guids
  from jsonb_array_elements_text(p_guids) v;

  select count(*) into v_total
  from public.vouchers
  where company_id = p_company_id
    and guid is not null and length(trim(guid)) > 0;

  if v_total = 0 then return 0; end if;

  select coalesce(array_agg(id), '{}'), count(*) into v_doomed, v_doomed_count
  from public.vouchers
  where company_id = p_company_id
    and guid is not null and length(trim(guid)) > 0
    and not (trim(guid) = any (v_guids));

  if v_doomed_count = 0 then return 0; end if;

  -- safety: truncation guard - if over half the matched cloud vouchers are missing from
  -- Tally's index on a big company, the export was probably partial. Never mass-wipe.
  if v_total > 200 and v_doomed_count * 2 > v_total then
    return -1;
  end if;

  delete from public.sales            where voucher_id = any (v_doomed) and company_id = p_company_id;
  delete from public.purchases        where voucher_id = any (v_doomed) and company_id = p_company_id;
  delete from public.bank_allocations where voucher_id = any (v_doomed) and company_id = p_company_id;
  delete from public.bill_allocations where voucher_id = any (v_doomed) and company_id = p_company_id;
  delete from public.tds_tcs_entries  where voucher_id = any (v_doomed) and company_id = p_company_id;
  delete from public.payment_links    where voucher_id = any (v_doomed) and company_id = p_company_id;
  delete from public.email_queue      where voucher_id = any (v_doomed) and company_id = p_company_id;

  -- CASCADE children (voucher_entries, voucher_ledger_entries, voucher_stock_entries,
  -- approval_items) are removed automatically with the voucher rows.
  delete from public.vouchers where id = any (v_doomed) and company_id = p_company_id;
  get diagnostics v_purged = row_count;
  return v_purged;
end;
$$;

-- P2: 1 Tally serial = 1 user (license guard). Desktop calls this every sync cycle.
create table if not exists public.tally_serial_bindings (
  tally_serial text primary key,
  user_id uuid not null,
  device_id text not null default 'unknown',
  device_name text not null default '',
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tally_serial_bindings enable row level security;

drop policy if exists "serial_owner_select" on public.tally_serial_bindings;
create policy "serial_owner_select" on public.tally_serial_bindings
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.try_claim_tally_serial(p_tally_serial text, p_device_id text, p_device_name text default null)
returns table (claim_result text, bound_user uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_serial text := nullif(trim(p_tally_serial), '');
  v_row public.tally_serial_bindings%rowtype;
begin
  if v_user is null then
    claim_result := 'no_auth'; bound_user := null; return;
  end if;
  if v_serial is null then
    claim_result := 'no_serial'; bound_user := null; return;
  end if;

  select * into v_row from public.tally_serial_bindings where tally_serial = v_serial;

  if found then
    if v_row.user_id = v_user then
      -- same user, possibly another PC: keep the latest device info
      if v_row.device_id is distinct from coalesce(nullif(trim(p_device_id), ''), 'unknown') then
        update public.tally_serial_bindings
          set device_id = coalesce(nullif(trim(p_device_id), ''), 'unknown'),
              device_name = coalesce(p_device_name, ''),
              updated_at = now()
          where tally_serial = v_serial;
      end if;
      claim_result := 'owned'; bound_user := v_user;
    else
      claim_result := 'in_use'; bound_user := v_row.user_id;
    end if;
    return;
  end if;

  insert into public.tally_serial_bindings (tally_serial, user_id, device_id, device_name)
  values (v_serial, v_user, coalesce(nullif(trim(p_device_id), ''), 'unknown'), coalesce(p_device_name, ''))
  on conflict (tally_serial) do nothing;

  select * into v_row from public.tally_serial_bindings where tally_serial = v_serial;
  if not found then
    claim_result := 'error'; bound_user := null;
  elsif v_row.user_id = v_user then
    claim_result := 'owned'; bound_user := v_user;
  else
    claim_result := 'in_use'; bound_user := v_row.user_id;
  end if;
  return;
end;
$$;

-- P3: which of Tally's (voucher_type, voucher_number) pairs are absent in cloud?
create or replace function public.find_missing_vouchers(p_company_id text, p_keys jsonb)
returns table (voucher_type text, voucher_number text)
language sql
stable
security definer
set search_path = public
as $$
  select k->>'t' as voucher_type, k->>'v' as voucher_number
  from jsonb_array_elements(p_keys) k
  where not exists (
          select 1 from public.vouchers v
          where v.company_id = p_company_id
            and v.voucher_type = k->>'t'
            and v.voucher_number = k->>'v'
            and coalesce(v.is_deleted, false) = false
        )
    and exists (
          select 1 from public.companies c
          where c.id = p_company_id and c.owner_id = auth.uid()
        )
    and coalesce(trim(k->>'v'), '') <> ''
$$;

grant execute on function public.purge_deleted_vouchers(text, jsonb) to authenticated;
grant execute on function public.try_claim_tally_serial(text, text, text) to authenticated;
grant execute on function public.find_missing_vouchers(text, jsonb) to authenticated;
revoke execute on function public.purge_deleted_vouchers(text, jsonb) from anon;
revoke execute on function public.try_claim_tally_serial(text, text, text) from anon;
revoke execute on function public.find_missing_vouchers(text, jsonb) from anon;
grant select on public.tally_serial_bindings to authenticated;

notify pgrst, 'reload schema';
