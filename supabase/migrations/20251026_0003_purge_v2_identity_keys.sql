-- P1 v2 (LiveKeeping parity: identity = GUID + VT/VN + AlterId, server-side diff)
-- v1's guid-only matching never matched real data because cloud voucher rows historically
-- have guid NULL (the desktop model never carried Tally's GUID). LK solves the same diff
-- server-side (getMissingVoucherAlterIds / getDeletedVouchersDetail) keyed by ALTER ID.
--
-- This v2:
--   1. receives the client's Tally voucher index as jsonb keys: [{g: guid, t: type, v: number, a: alterId}]
--   2. backfills guid on older NULL-guid rows identified by VT+VN or by AlterId (LK parity)
--   3. deletes cloud vouchers absent from the index by ANY identity:
--      - guid known & not in Tally's guid set, OR
--      - guid unknown & neither (VT,VN) nor AlterId appears in Tally's index
--   4. keeps the mass-wipe safety cap from v1
drop function if exists public.purge_deleted_vouchers(text, jsonb);

create or replace function public.purge_deleted_vouchers(p_company_id text, p_keys jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys jsonb := '[]'::jsonb;
  v_guids text[] := '{}';
  v_doomed text[] := '{}';
  v_doomed_count bigint := 0;
  v_total bigint := 0;
  v_purged integer := 0;
begin
  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id and c.owner_id = auth.uid()
  ) then
    raise exception 'company not owned by current user' using errcode = '42501';
  end if;

  v_keys := coalesce(p_keys, '[]'::jsonb);
  if coalesce(jsonb_array_length(v_keys), 0) = 0 then
    return 0;  -- empty Tally index: never act, it would wipe everything
  end if;

  select coalesce(array_agg(btrim(k->>'g')), '{}') into v_guids
  from jsonb_array_elements(v_keys) k
  where coalesce(btrim(k->>'g'), '') <> '';

  -- Backfill: stamp Tally's GUID on historical NULL-guid rows matched by
  -- (voucher_type, voucher_number) or by AlterId
  update public.vouchers v
     set guid = k->>'g'
    from (
      select k->>'g' as g, btrim(k->>'t') as t, btrim(k->>'v') as vn,
             btrim(coalesce(k->>'a', '')) as a
      from jsonb_array_elements(v_keys) k
      where coalesce(btrim(k->>'g'), '') <> ''
    ) s
   where v.company_id = p_company_id
     and (v.guid is null or btrim(v.guid) = '')
     and (
           (v.voucher_type = s.t and v.voucher_number = s.vn)
        or (s.a <> '' and btrim(coalesce(v.alter_id, '')) = s.a)
     );

  select count(*) into v_total from public.vouchers where company_id = p_company_id;

  select coalesce(array_agg(v.id), '{}'), count(*) into v_doomed, v_doomed_count
  from public.vouchers v
  where v.company_id = p_company_id
    and (
      (v.guid is not null and btrim(v.guid) <> '' and not (btrim(v.guid) = any (v_guids)))
      or
      (
        (v.guid is null or btrim(v.guid) = '')
        and not exists (
          select 1 from jsonb_array_elements(v_keys) k
          where (k->>'t' = v.voucher_type and k->>'v' = v.voucher_number)
             or (coalesce(btrim(k->>'a'), '') <> ''
                 and btrim(k->>'a') = btrim(coalesce(v.alter_id, ''))
                 and btrim(coalesce(v.alter_id, '')) <> '')
        )
      )
    );

  if v_doomed_count = 0 then return 0; end if;

  -- safety: truncation guard - if over half the company disappears in one purge,
  -- Tally's export was probably partial. Never mass-wipe on a bad export.
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
  -- approval_items) go automatically.
  delete from public.vouchers where id = any (v_doomed) and company_id = p_company_id;
  get diagnostics v_purged = row_count;
  return v_purged;
end;
$$;

grant execute on function public.purge_deleted_vouchers(text, jsonb) to authenticated;
revoke execute on function public.purge_deleted_vouchers(text, jsonb) from anon;

notify pgrst, 'reload schema';
