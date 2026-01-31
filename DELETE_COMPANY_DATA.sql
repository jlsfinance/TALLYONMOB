-- ⚠️ WARNING: This will PERMANENTLY DELETE all data for this company
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/lcsehcwocqvxrrgbhmcz/sql/new

-- Step 1: Find and show all company IDs in the database
SELECT DISTINCT company_id FROM companies;
SELECT DISTINCT company_id FROM ledgers LIMIT 5;
SELECT DISTINCT company_id FROM vouchers LIMIT 5;
SELECT DISTINCT company_id FROM stock LIMIT 5;

-- Step 2: DELETE ALL DATA (Uncomment and run after confirming company_id)
-- Replace 'YOUR_COMPANY_ID' with the actual company_id from Step 1

-- Delete vouchers
DELETE FROM vouchers WHERE company_id LIKE '%MAHESHWARI%';

-- Delete ledgers
DELETE FROM ledgers WHERE company_id LIKE '%MAHESHWARI%';

-- Delete stock
DELETE FROM stock WHERE company_id LIKE '%MAHESHWARI%';

-- Delete sales
DELETE FROM sales WHERE company_id LIKE '%MAHESHWARI%';

-- Delete purchases
DELETE FROM purchases WHERE company_id LIKE '%MAHESHWARI%';

-- Delete the company itself
DELETE FROM companies WHERE id LIKE '%MAHESHWARI%';

-- Delete sync metadata
DELETE FROM sync_metadata WHERE company_id LIKE '%MAHESHWARI%';

-- Verify deletion
SELECT 'Companies', COUNT(*) FROM companies WHERE id LIKE '%MAHESHWARI%'
UNION ALL
SELECT 'Ledgers', COUNT(*) FROM ledgers WHERE company_id LIKE '%MAHESHWARI%'
UNION ALL
SELECT 'Vouchers', COUNT(*) FROM vouchers WHERE company_id LIKE '%MAHESHWARI%'
UNION ALL
SELECT 'Stock', COUNT(*) FROM stock WHERE company_id LIKE '%MAHESHWARI%';

-- Should all return 0 counts
