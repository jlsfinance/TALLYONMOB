-- FRAUD & ANOMALY DETECTION SUITE
-- Run this in Supabase SQL Editor to create the analysis views

-- 1. DUPLICATE VOUCHER DETECTOR
-- Findings: Two different voucher records sharing the same Number and Company (and Party)
-- Risk: Double counting of sales, inflated revenue, or data sync ghosting
CREATE OR REPLACE VIEW view_fraud_duplicate_vouchers AS
SELECT 
    s1.company_id,
    s1.invoice_number,
    s1.invoice_date,
    s1.net_amount,
    s1.party_ledger_name,
    count(*) as duplicate_count,
    array_agg(s1.voucher_id) as conflicting_voucher_ids
FROM sales s1
WHERE s1.is_cancelled = false 
GROUP BY 
    s1.company_id, 
    s1.invoice_number, 
    s1.invoice_date, 
    s1.net_amount,
    s1.party_ledger_name
HAVING count(*) > 1;


-- 2. BACKDATED ENTRY MONITOR
-- Findings: High value invoices (> 10,000) entered/synced more than 7 days after invoice date
-- Risk: Tax evasion, period shifting, or "adjustment" entries logic
-- Note: Requires reliable 'created_at' timestamp from Supabase
CREATE OR REPLACE VIEW view_fraud_backdated_entries AS
SELECT 
    invoice_number,
    party_ledger_name,
    invoice_date,
    created_at as synced_at,
    net_amount,
    (created_at::date - invoice_date) as delay_days
FROM sales
WHERE 
    net_amount > 10000 
    AND (created_at::date - invoice_date) > 7
    AND is_cancelled = false
ORDER BY delay_days DESC;


-- 3. PRICE DEVIATION (UNDER-BILLING)
-- Findings: Sales where Item Rate is < 80% of average monthly rate for that item
-- Risk: Selling to friends/family at low rates, cash skimming
CREATE OR REPLACE VIEW view_fraud_price_deviation AS
WITH MonthlyAvg AS (
    SELECT 
        s.company_id,
        si.stock_item_name,
        date_trunc('month', s.invoice_date) as sale_month,
        avg(si.rate) as avg_rate,
        stddev(si.rate) as std_rate
    FROM sales_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE si.rate > 0 AND s.is_cancelled = false
    GROUP BY 1, 2, 3
)
SELECT 
    s.invoice_number,
    s.invoice_date,
    s.party_ledger_name,
    si.stock_item_name,
    si.rate as sold_rate,
    round(ma.avg_rate, 2) as monthly_avg_rate,
    round(((ma.avg_rate - si.rate) / ma.avg_rate * 100), 1) as discount_percent_deviation
FROM sales_items si
JOIN sales s ON si.sale_id = s.id
JOIN MonthlyAvg ma ON 
    ma.company_id = s.company_id 
    AND ma.stock_item_name = si.stock_item_name 
    AND ma.sale_month = date_trunc('month', s.invoice_date)
WHERE 
    si.rate < (ma.avg_rate * 0.8) -- Trigger if price is 20% lower than average
    AND si.amount > 1000 -- Ignore trivial small items
ORDER BY discount_percent_deviation DESC;
