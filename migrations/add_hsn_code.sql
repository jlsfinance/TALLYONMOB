-- Add hsn_code to sales_items and purchase_items if not exists
alter table sales_items add column if not exists hsn_code text;
alter table purchase_items add column if not exists hsn_code text;

-- Add hsn_code to stock if not exists
alter table stock add column if not exists hsn_code text;

-- Ensure indexes for performance
create index if not exists idx_sales_items_hsn on sales_items(hsn_code);
create index if not exists idx_purchase_items_hsn on purchase_items(hsn_code);
