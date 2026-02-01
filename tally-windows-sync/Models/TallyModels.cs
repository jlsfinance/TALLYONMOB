using System;
using Newtonsoft.Json;

namespace TallySyncApp.Models
{
    /// <summary>
    /// Represents a Tally Ledger (Party, Bank, Expense, etc.)
    /// </summary>
    /// <summary>
    /// Represents a Tally Ledger (Party, Bank, Expense, etc.)
    /// </summary>
    public class Ledger
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("alias")]
        public string? Alias { get; set; }

        [JsonProperty("parent_group")]
        public string? ParentGroup { get; set; }

        [JsonProperty("ledger_group")]
        public string? LedgerGroup { get; set; }

        [JsonProperty("opening_balance")]
        public decimal OpeningBalance { get; set; }

        [JsonProperty("closing_balance")]
        public decimal ClosingBalance { get; set; }

        [JsonProperty("credit_period")]
        public int? CreditPeriod { get; set; }

        [JsonProperty("credit_limit")]
        public decimal? CreditLimit { get; set; }

        [JsonProperty("address")]
        public string? Address { get; set; }

        [JsonProperty("phone")]
        public string? Phone { get; set; }

        [JsonProperty("email")]
        public string? Email { get; set; }

        [JsonProperty("gstin")]
        public string? Gstin { get; set; }

        [JsonProperty("pan")]
        public string? Pan { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name} ({ParentGroup})";
    }

    /// <summary>
    /// Represents a Tally Voucher (Production-Safe Model)
    /// Matches Supabase schema exactly.
    /// </summary>
    public class Voucher
    {
        [JsonProperty("voucher_id")]
        public string VoucherId { get; set; } = string.Empty;

        [JsonIgnore] // Prevent sending 'id' to Supabase as column doesn't exist
        public string Id { get => VoucherId; set => VoucherId = value; }

        [JsonProperty("company_id")]
        public string CompanyId { get; set; } = string.Empty;

        [JsonProperty("voucher_type")]
        public string VoucherType { get; set; } = string.Empty;

        [JsonProperty("voucher_number")]
        public string VoucherNumber { get; set; } = string.Empty;

        [JsonProperty("voucher_date")]
        public DateTime VoucherDate { get; set; }

        // Legacy compatibility
        [JsonIgnore]
        public DateTime VchDate { get => VoucherDate; set => VoucherDate = value; }

        [JsonProperty("party_name")]
        public string? PartyName { get; set; }

        // Legacy compatibility
        [JsonIgnore]
        public string? PartyLedgerName { get => PartyName; set => PartyName = value; }

        [JsonProperty("narration")]
        public string? Narration { get; set; }

        [JsonProperty("total_amount")]
        public decimal TotalAmount { get; set; }

        // Legacy compatibility
        [JsonIgnore]
        public decimal Amount { get => TotalAmount; set => TotalAmount = value; }

        [JsonProperty("ledger_entries")]
        public List<VoucherLedgerEntry> LedgerEntries { get; set; } = new();

        [JsonProperty("inventory_entries")]
        public List<VoucherInventoryEntry> InventoryEntries { get; set; } = new();

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        [JsonProperty("created_at")]
        public DateTime? CreatedAt { get; set; }

        [JsonProperty("updated_at")]
        public DateTime? UpdatedAt { get; set; }

        public override string ToString() => $"{VoucherType} #{VoucherNumber} - ₹{TotalAmount:N2}";

        /// <summary>
        /// Generates a deterministic ID for UPSERT: company_id*type*number_date
        /// </summary>
        public static string GenerateId(string companyId, string type, string? number, DateTime date)
        {
            string cleanNumber = (number ?? "0").Replace(" ", "").Replace("*", "").Replace("_", "");
            string cleanType = type.Replace(" ", "").ToUpper();
            return $"{companyId}*{cleanType}*{cleanNumber}_{date:yyyyMMdd}";
        }

        public void GenerateDeterministicId(string companyId)
        {
            this.CompanyId = companyId;
            this.VoucherId = GenerateId(companyId, VoucherType, VoucherNumber, VoucherDate);
        }
    }

    public class VoucherLedgerEntry
    {
        [JsonProperty("ledger_name")]
        public string LedgerName { get; set; } = string.Empty;

        [JsonProperty("amount")]
        public decimal Amount { get; set; }

        [JsonProperty("is_debit")]
        public bool IsDebit { get; set; }
    }

    public class VoucherInventoryEntry
    {
        [JsonProperty("stock_item_name")]
        public string StockItemName { get; set; } = string.Empty;

        [JsonProperty("quantity")]
        public decimal Quantity { get; set; }

        [JsonProperty("unit")]
        public string? Unit { get; set; }

        [JsonProperty("rate")]
        public decimal Rate { get; set; }

        [JsonProperty("amount")]
        public decimal Amount { get; set; }

        [JsonProperty("hsn_code")]
        public string? HsnCode { get; set; }

        [JsonProperty("tax_rate")]
        public decimal? TaxRate { get; set; }

        [JsonProperty("taxability")]
        public string? Taxability { get; set; }
    }

    /// <summary>
    /// Voucher line item (debit/credit entry)
    /// </summary>
    public class VoucherEntry
    {
        [JsonProperty("ledgerId")]
        public string? LedgerId { get; set; }

        [JsonProperty("ledgerName")]
        public string LedgerName { get; set; } = string.Empty;

        [JsonProperty("amount")]
        public decimal Amount { get; set; }

        [JsonProperty("isDebit")]
        public bool IsDebit { get; set; }

        [JsonProperty("costCentre")]
        public string? CostCentre { get; set; }
    }

    /// <summary>
    /// Sales Invoice
    /// </summary>
    public class Sale
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("voucher_id")]
        public string? VoucherId { get; set; }

        [JsonProperty("company_id")]
        public string? CompanyId { get; set; }

        [JsonProperty("invoice_number")]
        public string? InvoiceNumber { get; set; }

        [JsonProperty("invoice_date")]
        public DateTime InvoiceDate { get; set; }

        [JsonProperty("party_ledger_id")]
        public string? PartyLedgerId { get; set; }

        [JsonProperty("party_ledger_name")]
        public string PartyLedgerName { get; set; } = string.Empty;

        [JsonProperty("party_gstin")]
        public string? PartyGstin { get; set; }

        [JsonProperty("place_of_supply")]
        public string? PlaceOfSupply { get; set; }

        [JsonProperty("gross_amount")]
        public decimal GrossAmount { get; set; }

        [JsonProperty("discount_amount")]
        public decimal DiscountAmount { get; set; }

        [JsonProperty("taxable_amount")]
        public decimal TaxableAmount { get; set; }

        [JsonProperty("cgst_amount")]
        public decimal CgstAmount { get; set; }

        [JsonProperty("sgst_amount")]
        public decimal SgstAmount { get; set; }

        [JsonProperty("igst_amount")]
        public decimal IgstAmount { get; set; }

        [JsonProperty("cess_amount")]
        public decimal CessAmount { get; set; }

        [JsonProperty("round_off")]
        public decimal RoundOff { get; set; }

        [JsonProperty("net_amount")]
        public decimal NetAmount { get; set; }

        [JsonProperty("is_cancelled")]
        public bool IsCancelled { get; set; }

        [JsonProperty("narration")]
        public string? Narration { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        [JsonIgnore]
        [JsonProperty("items")]
        public List<SaleItem>? Items { get; set; }

        public override string ToString() => $"Sale #{InvoiceNumber} - ₹{NetAmount:N2}";
    }

    /// <summary>
    /// Sales invoice line item
    /// </summary>
    public class SaleItem
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("sale_id")]
        public string? SaleId { get; set; }

        [JsonProperty("company_id")]
        public string? CompanyId { get; set; }

        [JsonProperty("stock_item_id")]
        public string? StockItemId { get; set; }

        [JsonProperty("stock_item_name")]
        public string StockItemName { get; set; } = string.Empty;

        [JsonProperty("quantity")]
        public decimal Quantity { get; set; }

        [JsonProperty("unit")]
        public string? Unit { get; set; }

        [JsonProperty("rate")]
        public decimal Rate { get; set; }

        [JsonProperty("discount_percent")]
        public decimal DiscountPercent { get; set; }

        [JsonProperty("amount")]
        public decimal Amount { get; set; }

        [JsonProperty("tax_rate")]
        public decimal TaxRate { get; set; }

        [JsonProperty("hsn_code")]
        public string? HsnCode { get; set; }
    }

    /// <summary>
    /// Purchase Invoice
    /// </summary>
    public class Purchase
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("voucher_id")]
        public string? VoucherId { get; set; }

        [JsonProperty("company_id")]
        public string? CompanyId { get; set; }

        [JsonProperty("invoice_number")]
        public string? InvoiceNumber { get; set; }

        [JsonProperty("invoice_date")]
        public DateTime InvoiceDate { get; set; }

        [JsonProperty("party_ledger_id")]
        public string? PartyLedgerId { get; set; }

        [JsonProperty("party_ledger_name")]
        public string PartyLedgerName { get; set; } = string.Empty;

        [JsonProperty("party_gstin")]
        public string? PartyGstin { get; set; }

        [JsonProperty("gross_amount")]
        public decimal GrossAmount { get; set; }

        [JsonProperty("discount_amount")]
        public decimal DiscountAmount { get; set; }

        [JsonProperty("taxable_amount")]
        public decimal TaxableAmount { get; set; }

        [JsonProperty("cgst_amount")]
        public decimal CgstAmount { get; set; }

        [JsonProperty("sgst_amount")]
        public decimal SgstAmount { get; set; }

        [JsonProperty("igst_amount")]
        public decimal IgstAmount { get; set; }

        [JsonProperty("cess_amount")]
        public decimal CessAmount { get; set; }

        [JsonProperty("round_off")]
        public decimal RoundOff { get; set; }

        [JsonProperty("net_amount")]
        public decimal NetAmount { get; set; }

        [JsonProperty("is_cancelled")]
        public bool IsCancelled { get; set; }

        [JsonProperty("narration")]
        public string? Narration { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        [JsonIgnore]
        [JsonProperty("items")]
        public List<PurchaseItem>? Items { get; set; }

        public override string ToString() => $"Purchase #{InvoiceNumber} - ₹{NetAmount:N2}";
    }

    /// <summary>
    /// Purchase invoice line item
    /// </summary>
    public class PurchaseItem
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("purchase_id")]
        public string? PurchaseId { get; set; }

        [JsonProperty("company_id")]
        public string? CompanyId { get; set; }

        [JsonProperty("stock_item_id")]
        public string? StockItemId { get; set; }

        [JsonProperty("stock_item_name")]
        public string StockItemName { get; set; } = string.Empty;

        [JsonProperty("quantity")]
        public decimal Quantity { get; set; }

        [JsonProperty("unit")]
        public string? Unit { get; set; }

        [JsonProperty("rate")]
        public decimal Rate { get; set; }

        [JsonProperty("discount_percent")]
        public decimal DiscountPercent { get; set; }

        [JsonProperty("amount")]
        public decimal Amount { get; set; }

        [JsonProperty("tax_rate")]
        public decimal TaxRate { get; set; }

        [JsonProperty("hsn_code")]
        public string? HsnCode { get; set; }
    }

    /// <summary>
    /// Stock Item
    /// </summary>
    public class StockItem
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("alias")]
        public string? Alias { get; set; }

        [JsonProperty("stock_group")]
        public string? StockGroup { get; set; }

        [JsonProperty("stock_category")]
        public string? StockCategory { get; set; }

        [JsonProperty("base_unit")]
        public string? BaseUnit { get; set; }

        [JsonProperty("opening_balance")]
        public decimal OpeningBalance { get; set; }

        [JsonProperty("opening_value")]
        public decimal OpeningValue { get; set; }

        [JsonProperty("inward_quantity")]
        public decimal InwardQuantity { get; set; }

        [JsonProperty("inward_value")]
        public decimal InwardValue { get; set; }

        [JsonProperty("outward_quantity")]
        public decimal OutwardQuantity { get; set; }

        [JsonProperty("outward_value")]
        public decimal OutwardValue { get; set; }

        [JsonProperty("closing_balance")]
        public decimal ClosingBalance { get; set; }

        [JsonProperty("closing_value")]
        public decimal ClosingValue { get; set; }

        [JsonProperty("hsn_code")]
        public string? HsnCode { get; set; }

        [JsonProperty("gst_rate")]
        public decimal GstRate { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name} - {ClosingBalance} {BaseUnit}";
    }

    /// <summary>
    /// Company Information from Tally
    /// </summary>
    public class Company
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("formal_name")]
        public string? FormalName { get; set; }

        [JsonProperty("address")]
        public string? Address { get; set; }

        [JsonProperty("email")]
        public string? Email { get; set; }

        [JsonProperty("phone")]
        public string? Phone { get; set; }

        [JsonProperty("financial_year_start")]
        public DateTime? FinancialYearStart { get; set; }

        [JsonProperty("financial_year_end")]
        public DateTime? FinancialYearEnd { get; set; }

        [JsonProperty("currency_symbol")]
        public string CurrencySymbol { get; set; } = "₹";

        [JsonProperty("owner_id")]
        public string? OwnerId { get; set; }

        public override string ToString() => Name;
    }

    /// <summary>
    /// Pending Transaction - Created on Web/App, needs to be pushed to Tally
    /// </summary>
    public class PendingTransaction
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("company_id")]
        public string CompanyId { get; set; } = string.Empty;

        [JsonProperty("transaction_type")]
        public string TransactionType { get; set; } = string.Empty; // Sales, Purchase, Receipt, Payment, etc.

        [JsonProperty("voucher_data")]
        public dynamic? VoucherData { get; set; } // JSON object with full voucher details

        [JsonProperty("status")]
        public string Status { get; set; } = "pending"; // pending, processing, synced, failed

        [JsonProperty("error_message")]
        public string? ErrorMessage { get; set; }

        [JsonProperty("created_by")]
        public string? CreatedBy { get; set; }

        [JsonProperty("created_at")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("synced_at")]
        public DateTime? SyncedAt { get; set; }

        [JsonProperty("tally_voucher_number")]
        public string? TallyVoucherNumber { get; set; }

        [JsonProperty("tally_master_id")]
        public string? TallyMasterId { get; set; }

        [JsonProperty("retry_count")]
        public int RetryCount { get; set; }
    }
}
