using System;
using Newtonsoft.Json;

namespace TallySyncApp.Models
{
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

        // Keep explicit id in payload for schemas where vouchers.id is NOT NULL.
        [JsonProperty("id")]
        public string Id { get => VoucherId; set => VoucherId = value; }

        [JsonProperty("company_id")]
        public string CompanyId { get; set; } = string.Empty;

        [JsonProperty("voucher_type")]
        public string VoucherType { get; set; } = string.Empty;

        [JsonProperty("voucher_number")]
        public string VoucherNumber { get; set; } = string.Empty;

        [JsonProperty("voucher_date")]
        public DateTime VoucherDate { get; set; }

        // Legacy compatibility (some backends still enforce NOT NULL vch_date).
        [JsonProperty("vch_date")]
        public DateTime VchDate { get => VoucherDate; set => VoucherDate = value; }

        [JsonProperty("party_name")]
        public string? PartyName { get; set; }

        [JsonProperty("party_gstin")]
        public string? PartyGstin { get; set; }

        [JsonProperty("party_address")]
        public string? PartyAddress { get; set; }

        [JsonProperty("place_of_supply")]
        public string? PlaceOfSupply { get; set; }

        [JsonProperty("party_state")]
        public string? PartyState { get; set; }

        // Legacy compatibility
        [JsonIgnore]
        public string? PartyLedgerName { get => PartyName; set => PartyName = value; }

        [JsonProperty("narration")]
        public string? Narration { get; set; }

        [JsonProperty("total_amount")]
        public decimal TotalAmount { get; set; }

        [JsonProperty("is_invoice")]
        public bool IsInvoice { get; set; }

        [JsonProperty("is_accounting_voucher")]
        public bool IsAccountingVoucher { get; set; }

        [JsonProperty("raw_data")]
        public object? RawData { get; set; }
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

        [JsonIgnore] // Not sent to Supabase directly here, extracted later
        public List<BillAllocation> BillAllocations { get; set; } = new List<BillAllocation>();

        [JsonIgnore] // Not sent to Supabase directly here, extracted later
        public List<BankAllocation> BankAllocations { get; set; } = new List<BankAllocation>();
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

        [JsonProperty("discount_percent")]
        public decimal DiscountPercent { get; set; }

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

        [JsonProperty("rate")]
        public decimal Rate { get; set; }

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

        [JsonProperty("gstin")]
        public string? Gstin { get; set; }

        [JsonProperty("formal_name")]
        public string? FormalName { get; set; }

        [JsonProperty("address")]
        public string? Address { get; set; }

        [JsonProperty("state")]
        public string? State { get; set; }

        [JsonProperty("email")]
        public string? Email { get; set; }

        [JsonProperty("phone")]
        public string? Phone { get; set; }

        [JsonProperty("financial_year_start")]
        public DateTime? FinancialYearStart { get; set; }

        [JsonProperty("financial_year_end")]
        public DateTime? FinancialYearEnd { get; set; }

        [JsonIgnore]
        public DateTime? BooksStartDate { get; set; }

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

        [JsonProperty("updated_at")]
        public DateTime? UpdatedAt { get; set; }

        [JsonProperty("synced_at")]
        public DateTime? SyncedAt { get; set; }

        [JsonProperty("tally_voucher_number")]
        public string? TallyVoucherNumber { get; set; }

        [JsonProperty("tally_master_id")]
        public string? TallyMasterId { get; set; }

        [JsonProperty("retry_count")]
        public int RetryCount { get; set; }
    }

    // =============================================
    // NEW TALLY MASTER DATA MODELS
    // =============================================

    /// <summary>
    /// Ledger Group (Account Group hierarchy)
    /// </summary>
    public class LedgerGroup
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("parent")]
        public string? Parent { get; set; }

        [JsonProperty("is_revenue")]
        public bool IsRevenue { get; set; }

        [JsonProperty("is_deemed_positive")]
        public bool IsDeemedPositive { get; set; }

        [JsonProperty("affects_gross_profit")]
        public bool AffectsGrossProfit { get; set; }

        [JsonProperty("sort_position")]
        public int SortPosition { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name} (Parent: {Parent})";
    }

    /// <summary>
    /// Cost Centre (Department/Branch)
    /// </summary>
    public class CostCentre
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("parent")]
        public string? Parent { get; set; }

        [JsonProperty("category")]
        public string? Category { get; set; }

        [JsonProperty("revenue_ledger_name")]
        public string? RevenueLedgerName { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name}";
    }

    /// <summary>
    /// Godown (Warehouse/Location)
    /// </summary>
    public class Godown
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("parent")]
        public string? Parent { get; set; }

        [JsonProperty("address")]
        public string? Address { get; set; }

        [JsonProperty("has_no_space")]
        public bool HasNoSpace { get; set; }

        [JsonProperty("is_internal")]
        public bool IsInternal { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name}";
    }

    /// <summary>
    /// Stock Group (Category hierarchy for items)
    /// </summary>
    public class TallyStockGroup
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("parent")]
        public string? Parent { get; set; }

        [JsonProperty("is_add_able")]
        public bool IsAddAble { get; set; } = true;

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name}";
    }

    /// <summary>
    /// Stock Category
    /// </summary>
    public class TallyStockCategory
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("parent")]
        public string? Parent { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name}";
    }

    /// <summary>
    /// Currency
    /// </summary>
    public class TallyCurrency
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("symbol")]
        public string? Symbol { get; set; }

        [JsonProperty("formal_name")]
        public string? FormalName { get; set; }

        [JsonProperty("iso_code")]
        public string? IsoCode { get; set; }

        [JsonProperty("decimal_places")]
        public int DecimalPlaces { get; set; } = 2;

        [JsonProperty("in_millions")]
        public bool InMillions { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name} ({Symbol})";
    }

    /// <summary>
    /// Voucher Type (Custom voucher types)
    /// </summary>
    public class TallyVoucherType
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("parent")]
        public string? Parent { get; set; }

        [JsonProperty("numbering_method")]
        public string? NumberingMethod { get; set; }

        [JsonProperty("is_active")]
        public bool IsActive { get; set; } = true;

        [JsonProperty("is_tax_invoice")]
        public bool IsTaxInvoice { get; set; }

        [JsonProperty("prefix")]
        public string? Prefix { get; set; }

        [JsonProperty("suffix")]
        public string? Suffix { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name} ({Parent})";
    }

    /// <summary>
    /// Unit of Measure
    /// </summary>
    public class UnitOfMeasure
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("symbol")]
        public string? Symbol { get; set; }

        [JsonProperty("formal_name")]
        public string? FormalName { get; set; }

        [JsonProperty("is_simple_unit")]
        public bool IsSimpleUnit { get; set; } = true;

        [JsonProperty("base_units")]
        public string? BaseUnits { get; set; }

        [JsonProperty("additional_units")]
        public string? AdditionalUnits { get; set; }

        [JsonProperty("conversion")]
        public decimal Conversion { get; set; }

        [JsonProperty("number_of_decimal_places")]
        public int NumberOfDecimalPlaces { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name} ({Symbol})";
    }

    /// <summary>
    /// Budget
    /// </summary>
    public class TallyBudget
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("budget_for")]
        public string? BudgetFor { get; set; }

        [JsonProperty("from_date")]
        public DateTime? FromDate { get; set; }

        [JsonProperty("to_date")]
        public DateTime? ToDate { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }

        public override string ToString() => $"{Name}";
    }

    /// <summary>
    /// Bank Allocation (cheque/bank details per voucher)
    /// </summary>
    public class BankAllocation
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("voucher_id")]
        public string? VoucherId { get; set; }

        [JsonProperty("bank_name")]
        public string? BankName { get; set; }

        [JsonProperty("instrument_number")]
        public string? InstrumentNumber { get; set; }

        [JsonProperty("instrument_date")]
        public DateTime? InstrumentDate { get; set; }

        [JsonProperty("bank_party_name")]
        public string? BankPartyName { get; set; }

        [JsonProperty("transaction_type")]
        public string? TransactionType { get; set; }

        [JsonProperty("ifsc_code")]
        public string? IfscCode { get; set; }

        [JsonProperty("account_number")]
        public string? AccountNumber { get; set; }

        [JsonProperty("amount")]
        public decimal Amount { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } = "pending";
    }

    /// <summary>
    /// Bill Allocation (bill-wise outstanding)
    /// </summary>
    public class BillAllocation
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("voucher_id")]
        public string? VoucherId { get; set; }

        [JsonProperty("ledger_name")]
        public string LedgerName { get; set; } = string.Empty;

        [JsonProperty("bill_type")]
        public string? BillType { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("amount")]
        public decimal Amount { get; set; }

        [JsonProperty("bill_date")]
        public DateTime? BillDate { get; set; }

        [JsonProperty("due_date")]
        public DateTime? DueDate { get; set; }

        [JsonProperty("is_advance")]
        public bool IsAdvance { get; set; }

        [JsonProperty("bill_credit_period")]
        public string? BillCreditPeriod { get; set; }
    }

    /// <summary>
    /// GST Detail (per-voucher GST breakup)
    /// </summary>
    public class GstDetail
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("voucher_id")]
        public string? VoucherId { get; set; }

        [JsonProperty("voucher_number")]
        public string? VoucherNumber { get; set; }

        [JsonProperty("voucher_date")]
        public DateTime? VoucherDate { get; set; }

        [JsonProperty("voucher_type")]
        public string? VoucherType { get; set; }

        [JsonProperty("party_name")]
        public string? PartyName { get; set; }

        [JsonProperty("party_gstin")]
        public string? PartyGstin { get; set; }

        [JsonProperty("place_of_supply")]
        public string? PlaceOfSupply { get; set; }

        [JsonProperty("hsn_code")]
        public string? HsnCode { get; set; }

        [JsonProperty("item_name")]
        public string? ItemName { get; set; }

        [JsonProperty("taxable_value")]
        public decimal TaxableValue { get; set; }

        [JsonProperty("cgst_rate")]
        public decimal CgstRate { get; set; }

        [JsonProperty("cgst_amount")]
        public decimal CgstAmount { get; set; }

        [JsonProperty("sgst_rate")]
        public decimal SgstRate { get; set; }

        [JsonProperty("sgst_amount")]
        public decimal SgstAmount { get; set; }

        [JsonProperty("igst_rate")]
        public decimal IgstRate { get; set; }

        [JsonProperty("igst_amount")]
        public decimal IgstAmount { get; set; }

        [JsonProperty("cess_rate")]
        public decimal CessRate { get; set; }

        [JsonProperty("cess_amount")]
        public decimal CessAmount { get; set; }

        [JsonProperty("gst_return_type")]
        public string? GstReturnType { get; set; }
    }

    /// <summary>
    /// Price List Entry
    /// </summary>
    public class PriceListEntry
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("price_list_name")]
        public string PriceListName { get; set; } = string.Empty;

        [JsonProperty("stock_item_name")]
        public string StockItemName { get; set; } = string.Empty;

        [JsonProperty("rate")]
        public decimal Rate { get; set; }

        [JsonProperty("unit")]
        public string? Unit { get; set; }

        [JsonProperty("from_date")]
        public DateTime? FromDate { get; set; }

        [JsonProperty("to_date")]
        public DateTime? ToDate { get; set; }

        [JsonProperty("discount_percent")]
        public decimal DiscountPercent { get; set; }
    }

    /// <summary>
    /// Debit/Credit Note
    /// </summary>
    public class DebitCreditNote
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("voucher_id")]
        public string? VoucherId { get; set; }

        [JsonProperty("note_type")]
        public string NoteType { get; set; } = string.Empty;

        [JsonProperty("note_number")]
        public string? NoteNumber { get; set; }

        [JsonProperty("note_date")]
        public DateTime? NoteDate { get; set; }

        [JsonProperty("party_name")]
        public string? PartyName { get; set; }

        [JsonProperty("party_gstin")]
        public string? PartyGstin { get; set; }

        [JsonProperty("original_invoice_number")]
        public string? OriginalInvoiceNumber { get; set; }

        [JsonProperty("original_invoice_date")]
        public DateTime? OriginalInvoiceDate { get; set; }

        [JsonProperty("reason")]
        public string? Reason { get; set; }

        [JsonProperty("taxable_amount")]
        public decimal TaxableAmount { get; set; }

        [JsonProperty("cgst_amount")]
        public decimal CgstAmount { get; set; }

        [JsonProperty("sgst_amount")]
        public decimal SgstAmount { get; set; }

        [JsonProperty("igst_amount")]
        public decimal IgstAmount { get; set; }

        [JsonProperty("total_amount")]
        public decimal TotalAmount { get; set; }

        [JsonProperty("narration")]
        public string? Narration { get; set; }

        [JsonProperty("master_id")]
        public string? MasterId { get; set; }

        [JsonProperty("alter_id")]
        public string? AlterId { get; set; }
    }
}





