-- Keep company deletion atomic; clear large voucher children first.
CREATE OR REPLACE FUNCTION public.delete_company_data(p_company_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET statement_timeout TO '60s'
AS $$
DECLARE
  v_owner uuid;
  r record;
  n bigint;
  round_deleted bigint;
  v_round integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to delete a company' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO v_owner FROM companies WHERE id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the company owner can delete this company' USING ERRCODE = '42501';
  END IF;

  WHILE v_round < 15 LOOP
    round_deleted := 0;
    FOR r IN
      SELECT t.table_name, c.data_type
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON c.table_schema = t.table_schema AND c.table_name = t.table_name
       AND c.column_name = 'company_id'
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        AND t.table_name <> 'companies'
      ORDER BY CASE WHEN t.table_name IN ('voucher_stock_entries','voucher_ledger_entries','bill_allocations','bank_allocations') THEN 0 WHEN t.table_name = 'vouchers' THEN 2 ELSE 1 END, t.table_name
    LOOP
      EXECUTE format('DELETE FROM %I WHERE company_id = $1::%s', r.table_name, r.data_type)
        USING p_company_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      round_deleted := round_deleted + n;
    END LOOP;
    v_round := v_round + 1;
    EXIT WHEN round_deleted = 0;
  END LOOP;

  DELETE FROM companies WHERE id = p_company_id;
  RETURN true;
END;
$$;


REVOKE ALL ON FUNCTION public.delete_company_data(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_company_data(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
