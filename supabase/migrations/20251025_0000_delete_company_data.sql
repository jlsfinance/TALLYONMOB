-- Cascade company delete: removes ALL company-scoped data, then the company.
-- v3: per-table company_id type handling — most tables use text (companies.id is
-- text) but company_payment_settings/customers use uuid; comparing uuid = text
-- raised "operator does not exist". Multi-pass loop keeps FK-safe ordering.
-- Safety: SECURITY DEFINER + owner check (companies.owner_id = auth.uid()).

DROP FUNCTION IF EXISTS public.delete_company_data(text);

CREATE FUNCTION public.delete_company_data(p_company_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
  IF v_owner::text <> auth.uid()::text THEN
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

-- PostgREST caches the DB schema; new/changed RPCs 404 until it reloads
NOTIFY pgrst, 'reload schema';
