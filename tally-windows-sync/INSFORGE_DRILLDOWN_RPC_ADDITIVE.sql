-- If previous run failed with "current transaction is aborted", run: ROLLBACK;
-- InsForge drill-down RPC migration (additive, non-destructive)
-- Date: 2026-03-03
-- Purpose: stock/ledger/voucher drill-down with running balances for frontend drill-down screens.

-- ---------------------------------------------------------------------------
-- 1) Performance indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_vouchers_company_party_date
    ON public.vouchers (company_id, party_name, voucher_date);

CREATE INDEX IF NOT EXISTS idx_vouchers_company_date
    ON public.vouchers (company_id, voucher_date);

CREATE INDEX IF NOT EXISTS idx_voucher_stock_entries_company_item_voucher
    ON public.voucher_stock_entries (company_id, stock_item_name, voucher_id);

CREATE INDEX IF NOT EXISTS idx_voucher_ledger_entries_company_ledger_voucher
    ON public.voucher_ledger_entries (company_id, ledger_name, voucher_id);

-- ---------------------------------------------------------------------------
-- 2) Stock Item History RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insforge_stock_item_history(
    p_company_id TEXT,
    p_item_name TEXT,
    p_from_date DATE DEFAULT NULL,
    p_to_date DATE DEFAULT NULL,
    p_party TEXT DEFAULT NULL,
    p_voucher_types TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 5000,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    entry_id TEXT,
    voucher_id TEXT,
    voucher_number TEXT,
    voucher_type TEXT,
    voucher_date DATE,
    party_name TEXT,
    quantity NUMERIC,
    qty_in NUMERIC,
    qty_out NUMERIC,
    qty_delta NUMERIC,
    rate NUMERIC,
    amount NUMERIC,
    tax_rate NUMERIC,
    running_stock_balance NUMERIC
)
LANGUAGE sql
STABLE
AS $$
WITH item_opening AS (
    SELECT COALESCE(MAX(si.opening_stock), MAX(si.opening_balance), 0)::NUMERIC AS opening_qty
    FROM public.stock_items si
    WHERE si.company_id = p_company_id
      AND LOWER(TRIM(COALESCE(si.name, ''))) = LOWER(TRIM(COALESCE(p_item_name, '')))
),
base_rows AS (
    SELECT
        vse.id::TEXT AS entry_id,
        v.id::TEXT AS voucher_id,
        v.voucher_number,
        v.voucher_type,
        v.voucher_date,
        v.party_name,
        ABS(COALESCE(vse.quantity, 0))::NUMERIC AS quantity,
        ABS(COALESCE(vse.rate, 0))::NUMERIC AS rate,
        ABS(COALESCE(vse.amount, 0))::NUMERIC AS amount,
        COALESCE(NULLIF(to_jsonb(vse)->>'tax_rate', '')::NUMERIC, NULLIF(to_jsonb(vse)->>'gst_rate', '')::NUMERIC, 0)::NUMERIC AS tax_rate,
        CASE
            WHEN COALESCE(NULLIF(to_jsonb(vse)->>'is_inward', '')::BOOLEAN, FALSE) OR v.voucher_type IN ('Purchase', 'Purchase Invoice') THEN ABS(COALESCE(vse.quantity, 0))::NUMERIC
            ELSE 0::NUMERIC
        END AS qty_in,
        CASE
            WHEN COALESCE(NULLIF(to_jsonb(vse)->>'is_inward', '')::BOOLEAN, FALSE) OR v.voucher_type IN ('Purchase', 'Purchase Invoice') THEN 0::NUMERIC
            ELSE ABS(COALESCE(vse.quantity, 0))::NUMERIC
        END AS qty_out,
        CASE
            WHEN COALESCE(NULLIF(to_jsonb(vse)->>'is_inward', '')::BOOLEAN, FALSE) OR v.voucher_type IN ('Purchase', 'Purchase Invoice') THEN ABS(COALESCE(vse.quantity, 0))::NUMERIC
            ELSE -ABS(COALESCE(vse.quantity, 0))::NUMERIC
        END AS qty_delta
    FROM public.voucher_stock_entries vse
    JOIN public.vouchers v ON v.id = vse.voucher_id
    WHERE vse.company_id = p_company_id
      AND LOWER(TRIM(COALESCE(vse.stock_item_name, ''))) = LOWER(TRIM(COALESCE(p_item_name, '')))
      AND (p_from_date IS NULL OR v.voucher_date >= p_from_date)
      AND (p_to_date IS NULL OR v.voucher_date <= p_to_date)
      AND (p_party IS NULL OR TRIM(COALESCE(v.party_name, '')) ILIKE ('%' || TRIM(p_party) || '%'))
      AND (p_voucher_types IS NULL OR array_length(p_voucher_types, 1) IS NULL OR v.voucher_type = ANY(p_voucher_types))
),
ordered_rows AS (
    SELECT
        b.*,
        (
            (SELECT opening_qty FROM item_opening)
            + SUM(b.qty_delta) OVER (
                ORDER BY b.voucher_date, b.voucher_id, b.entry_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )
        )::NUMERIC AS running_stock_balance
    FROM base_rows b
)
SELECT
    o.entry_id,
    o.voucher_id,
    o.voucher_number,
    o.voucher_type,
    o.voucher_date,
    o.party_name,
    o.quantity,
    o.qty_in,
    o.qty_out,
    o.qty_delta,
    o.rate,
    o.amount,
    o.tax_rate,
    o.running_stock_balance
FROM ordered_rows o
ORDER BY o.voucher_date DESC, o.voucher_id DESC, o.entry_id DESC
LIMIT GREATEST(COALESCE(p_limit, 5000), 0)
OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.insforge_stock_item_history_summary(
    p_company_id TEXT,
    p_item_name TEXT,
    p_from_date DATE DEFAULT NULL,
    p_to_date DATE DEFAULT NULL,
    p_party TEXT DEFAULT NULL,
    p_voucher_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    opening_qty NUMERIC,
    total_in_qty NUMERIC,
    total_out_qty NUMERIC,
    total_in_amount NUMERIC,
    total_out_amount NUMERIC,
    closing_qty NUMERIC
)
LANGUAGE sql
STABLE
AS $$
WITH hist AS (
    SELECT *
    FROM public.insforge_stock_item_history(
        p_company_id,
        p_item_name,
        p_from_date,
        p_to_date,
        p_party,
        p_voucher_types,
        1000000,
        0
    )
),
item_opening AS (
    SELECT COALESCE(MAX(si.opening_stock), MAX(si.opening_balance), 0)::NUMERIC AS opening_qty
    FROM public.stock_items si
    WHERE si.company_id = p_company_id
      AND LOWER(TRIM(COALESCE(si.name, ''))) = LOWER(TRIM(COALESCE(p_item_name, '')))
)
SELECT
    (SELECT opening_qty FROM item_opening) AS opening_qty,
    COALESCE(SUM(h.qty_in), 0)::NUMERIC AS total_in_qty,
    COALESCE(SUM(h.qty_out), 0)::NUMERIC AS total_out_qty,
    COALESCE(SUM(CASE WHEN h.qty_in > 0 THEN h.amount ELSE 0 END), 0)::NUMERIC AS total_in_amount,
    COALESCE(SUM(CASE WHEN h.qty_out > 0 THEN h.amount ELSE 0 END), 0)::NUMERIC AS total_out_amount,
    COALESCE((SELECT h2.running_stock_balance FROM hist h2 ORDER BY h2.voucher_date DESC, h2.voucher_id DESC, h2.entry_id DESC LIMIT 1), (SELECT opening_qty FROM item_opening))::NUMERIC AS closing_qty
FROM hist h;
$$;

-- ---------------------------------------------------------------------------
-- 3) Ledger Item History RPC (for ledger items tab drill-down)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insforge_ledger_item_history(
    p_company_id TEXT,
    p_ledger_name TEXT,
    p_item_name TEXT,
    p_from_date DATE DEFAULT NULL,
    p_to_date DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT 2000,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    entry_id TEXT,
    voucher_id TEXT,
    voucher_number TEXT,
    voucher_type TEXT,
    voucher_date DATE,
    party_name TEXT,
    quantity NUMERIC,
    rate NUMERIC,
    amount NUMERIC,
    qty_delta NUMERIC,
    running_item_qty NUMERIC
)
LANGUAGE sql
STABLE
AS $$
WITH base_rows AS (
    SELECT
        vse.id::TEXT AS entry_id,
        v.id::TEXT AS voucher_id,
        v.voucher_number,
        v.voucher_type,
        v.voucher_date,
        v.party_name,
        ABS(COALESCE(vse.quantity, 0))::NUMERIC AS quantity,
        ABS(COALESCE(vse.rate, 0))::NUMERIC AS rate,
        ABS(COALESCE(vse.amount, 0))::NUMERIC AS amount,
        CASE
            WHEN COALESCE(NULLIF(to_jsonb(vse)->>'is_inward', '')::BOOLEAN, FALSE) OR v.voucher_type IN ('Purchase', 'Purchase Invoice') THEN ABS(COALESCE(vse.quantity, 0))::NUMERIC
            ELSE -ABS(COALESCE(vse.quantity, 0))::NUMERIC
        END AS qty_delta
    FROM public.voucher_stock_entries vse
    JOIN public.vouchers v ON v.id = vse.voucher_id
    WHERE vse.company_id = p_company_id
      AND LOWER(TRIM(COALESCE(vse.stock_item_name, ''))) = LOWER(TRIM(COALESCE(p_item_name, '')))
      AND LOWER(TRIM(COALESCE(v.party_name, ''))) = LOWER(TRIM(COALESCE(p_ledger_name, '')))
      AND (p_from_date IS NULL OR v.voucher_date >= p_from_date)
      AND (p_to_date IS NULL OR v.voucher_date <= p_to_date)
),
ordered_rows AS (
    SELECT
        b.*,
        SUM(b.qty_delta) OVER (
            ORDER BY b.voucher_date, b.voucher_id, b.entry_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::NUMERIC AS running_item_qty
    FROM base_rows b
)
SELECT
    o.entry_id,
    o.voucher_id,
    o.voucher_number,
    o.voucher_type,
    o.voucher_date,
    o.party_name,
    o.quantity,
    o.rate,
    o.amount,
    o.qty_delta,
    o.running_item_qty
FROM ordered_rows o
ORDER BY o.voucher_date DESC, o.voucher_id DESC, o.entry_id DESC
LIMIT GREATEST(COALESCE(p_limit, 2000), 0)
OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- 4) Voucher Context RPC (debit/credit effect + running balance)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insforge_voucher_context(
    p_company_id TEXT,
    p_voucher_id TEXT,
    p_ledger_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    voucher_id TEXT,
    ledger_name TEXT,
    opening_balance NUMERIC,
    debit_effect NUMERIC,
    credit_effect NUMERIC,
    net_effect NUMERIC,
    running_balance_after NUMERIC
)
LANGUAGE sql
STABLE
AS $$
WITH target AS (
    SELECT v.*
    FROM public.vouchers v
    WHERE v.company_id = p_company_id
      AND (v.id = p_voucher_id OR NULLIF(to_jsonb(v)->>'voucher_id', '') = p_voucher_id)
    ORDER BY v.voucher_date DESC, v.id DESC
    LIMIT 1
),
ctx AS (
    SELECT
        t.id::TEXT AS voucher_id,
        COALESCE(NULLIF(p_ledger_name, ''), t.party_name) AS ledger_name,
        ABS(COALESCE(t.grand_total, t.total_amount, 0))::NUMERIC AS amount,
        t.voucher_type,
        t.voucher_date
    FROM target t
),
ledger_opening AS (
    SELECT
        COALESCE(MAX(l.opening_balance), 0)::NUMERIC AS opening_balance
    FROM public.ledgers l
    JOIN ctx c ON l.company_id = p_company_id AND l.name ILIKE c.ledger_name
),
rows_for_running AS (
    SELECT
        v.id::TEXT AS voucher_id,
        v.voucher_date,
        ABS(COALESCE(v.grand_total, v.total_amount, 0))::NUMERIC AS amount,
        v.voucher_type
    FROM public.vouchers v
    JOIN ctx c ON TRUE
    WHERE v.company_id = p_company_id
      AND LOWER(TRIM(COALESCE(v.party_name, ''))) = LOWER(TRIM(COALESCE(c.ledger_name, '')))
      AND COALESCE(v.is_deleted, FALSE) = FALSE
      AND v.voucher_date <= c.voucher_date
),
ordered AS (
    SELECT
        r.*,
        (
            CASE
                WHEN r.voucher_type IN ('Sales', 'Sales Invoice', 'Payment', 'Debit Note') THEN r.amount
                WHEN r.voucher_type IN ('Purchase', 'Purchase Invoice', 'Receipt', 'Credit Note') THEN -r.amount
                ELSE 0::NUMERIC
            END
        ) AS net_effect
    FROM rows_for_running r
),
running AS (
    SELECT
        o.voucher_id,
        (
            (SELECT opening_balance FROM ledger_opening)
            + SUM(o.net_effect) OVER (
                ORDER BY o.voucher_date, o.voucher_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )
        )::NUMERIC AS running_balance_after
    FROM ordered o
)
SELECT
    c.voucher_id,
    c.ledger_name,
    (SELECT opening_balance FROM ledger_opening) AS opening_balance,
    CASE WHEN c.voucher_type IN ('Sales', 'Sales Invoice', 'Payment', 'Debit Note') THEN c.amount ELSE 0::NUMERIC END AS debit_effect,
    CASE WHEN c.voucher_type IN ('Purchase', 'Purchase Invoice', 'Receipt', 'Credit Note') THEN c.amount ELSE 0::NUMERIC END AS credit_effect,
    CASE
        WHEN c.voucher_type IN ('Sales', 'Sales Invoice', 'Payment', 'Debit Note') THEN c.amount
        WHEN c.voucher_type IN ('Purchase', 'Purchase Invoice', 'Receipt', 'Credit Note') THEN -c.amount
        ELSE 0::NUMERIC
    END AS net_effect,
    (SELECT r.running_balance_after FROM running r WHERE r.voucher_id = c.voucher_id ORDER BY r.voucher_id DESC LIMIT 1) AS running_balance_after
FROM ctx c;
$$;

-- ---------------------------------------------------------------------------
-- 5) Grants for RPC access
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.insforge_stock_item_history(TEXT, TEXT, DATE, DATE, TEXT, TEXT[], INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insforge_stock_item_history_summary(TEXT, TEXT, DATE, DATE, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insforge_ledger_item_history(TEXT, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insforge_voucher_context(TEXT, TEXT, TEXT) TO authenticated;

-- Force PostgREST schema cache refresh.
NOTIFY pgrst, 'reload schema';



