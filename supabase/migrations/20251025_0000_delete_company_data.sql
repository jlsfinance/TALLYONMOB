-- Cascade company delete: removes ALL company-scoped data, then the company.
-- v2 replaces the earlier boolean allow-list version MIT covers every company-scoped
-- table via run-time discovery (old list missed ~15 tables). Multi-pass loop keeps
-- FK-safe ordering (children removed before parents) without hardcoding table names.
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
  v_owner_id text;
  v_tables text[];
  t text;
  n integer;
  round_deleted integer;
  v_deleted integer := 0;
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

  -- Base tables only (views excluded), discovered at run-time so future
  -- company-scoped tables are covered automatically.
  SELECT array_agg(table_name) INTO v_tables
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name <> 'companies'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = information_schema.tables.table_name
        AND c.column_name = 'company_id'
    );

  -- Delete in rounds: child tables clear first, parents clear in later rounds
  -- once children no longer hold FK references.
  WHILE v_round < 15 LOOP
    round_deleted := 0;
    FOREACH t IN ARRAY v_tables LOOP
      EXECUTE format('DELETE FROM %I WHERE company_id = $1', t) USING p_company_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      round_deleted := round_deleted + COALESCE(n, 0);
    END LOOP;
    v_deleted := v_deleted + round_deleted;
    v_round := v_round + 1;
    EXIT WHEN round_deleted = 0;
  END LOOP;

  DELETE FROM companies WHERE id = p_company_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_company_data(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_company_data(text) TO authenticated;
