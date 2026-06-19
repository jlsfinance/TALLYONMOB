using System;
using System.Collections.Generic;
using System.Linq;

namespace TallySyncApp.Services
{
    public class DataValidationService
    {
        public List<ValidationIssue> ValidateVouchers(List<Models.Voucher> vouchers)
        {
            var issues = new List<ValidationIssue>();

            if (vouchers == null || vouchers.Count == 0) return issues;

            // 1. Check for negative amounts
            foreach (var v in vouchers.Where(v => v.Amount < 0))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Warning,
                    Category = "Negative Amount",
                    Entity = v.VoucherNumber ?? v.Id,
                    Message = $"Voucher has negative amount: {v.Amount:C}",
                    EntityType = "Voucher"
                });
            }

            // 2. Check for future-dated vouchers
            var today = DateTime.Today;
            foreach (var v in vouchers.Where(v => v.VoucherDate > today.AddDays(1)))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Info,
                    Category = "Future Date",
                    Entity = v.VoucherNumber ?? v.Id,
                    Message = $"Voucher dated in future: {v.VoucherDate:dd-MMM-yyyy}",
                    EntityType = "Voucher"
                });
            }

            // 3. Check for very old vouchers (older than current financial year start)
            var fyStart = new DateTime(today.Year, 4, 1);
            if (today.Month < 4) fyStart = fyStart.AddYears(-1);
            foreach (var v in vouchers.Where(v => v.VoucherDate < fyStart.AddYears(-1)))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Warning,
                    Category = "Old Voucher",
                    Entity = v.VoucherNumber ?? v.Id,
                    Message = $"Voucher older than 2 years: {v.VoucherDate:dd-MMM-yyyy}",
                    EntityType = "Voucher"
                });
            }

            // 4. Check for high-value transactions (above 5 lakh)
            const decimal HighValueThreshold = 500000;
            foreach (var v in vouchers.Where(v => Math.Abs(v.Amount) > HighValueThreshold))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Warning,
                    Category = "High Value",
                    Entity = v.VoucherNumber ?? v.Id,
                    Message = $"High value transaction: {v.Amount:C} ({v.VoucherType})",
                    EntityType = "Voucher"
                });
            }

            // 5. Check for duplicate voucher IDs
            var duplicates = vouchers
                .Where(v => !string.IsNullOrEmpty(v.VoucherId))
                .GroupBy(v => v.VoucherId)
                .Where(g => g.Count() > 1);
            foreach (var dup in duplicates)
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Error,
                    Category = "Duplicate",
                    Entity = dup.Key!,
                    Message = $"Duplicate voucher ID found {dup.Count()} times",
                    EntityType = "Voucher"
                });
            }

            // 6. Check for empty narration
            foreach (var v in vouchers.Where(v => string.IsNullOrWhiteSpace(v.Narration) && Math.Abs(v.Amount) > 10000))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Info,
                    Category = "Missing Narration",
                    Entity = v.VoucherNumber ?? v.Id,
                    Message = $"High-value voucher without narration: {v.Amount:C}",
                    EntityType = "Voucher"
                });
            }

            return issues;
        }

        public List<ValidationIssue> ValidateLedgers(List<Models.Ledger> ledgers)
        {
            var issues = new List<ValidationIssue>();

            if (ledgers == null || ledgers.Count == 0) return issues;

            // 1. Check for ledgers with zero balance
            foreach (var l in ledgers.Where(l => l.OpeningBalance == 0 && l.ClosingBalance == 0))
            {
                issues.Add(new ValidationIssue
                {
                    Severity =ValidationSeverity.Info,
                    Category = "Zero Balance",
                    Entity = l.Name,
                    Message = "Ledger with zero opening and closing balance",
                    EntityType = "Ledger"
                });
            }

            // 2. Check for negative closing balance in asset/liability accounts
            foreach (var l in ledgers.Where(l => l.ClosingBalance < 0))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Warning,
                    Category = "Negative Balance",
                    Entity = l.Name,
                    Message = $"Ledger has negative closing balance: {l.ClosingBalance:C}",
                    EntityType = "Ledger"
                });
            }

            // 3. Check for duplicate ledgers
            var duplicates = ledgers
                .Where(l => !string.IsNullOrEmpty(l.Name))
                .GroupBy(l => l.Name, StringComparer.OrdinalIgnoreCase)
                .Where(g => g.Count() > 1);
            foreach (var dup in duplicates)
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Warning,
                    Category = "Duplicate Ledger",
                    Entity = dup.Key,
                    Message = $"Duplicate ledger name found: {dup.Count()} entries",
                    EntityType = "Ledger"
                });
            }

            return issues;
        }

        public List<ValidationIssue> ValidateStockItems(List<Models.StockItem> stockItems)
        {
            var issues = new List<ValidationIssue>();

            if (stockItems == null || stockItems.Count == 0) return issues;

            // 1. Check for negative stock
            foreach (var s in stockItems.Where(s => s.ClosingBalance < 0))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Error,
                    Category = "Negative Stock",
                    Entity = s.Name,
                    Message = $"Negative stock quantity: {s.ClosingBalance} {s.BaseUnit}",
                    EntityType = "StockItem"
                });
            }

            // 2. Check for zero stock items
            foreach (var s in stockItems.Where(s => s.ClosingBalance == 0))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Info,
                    Category = "Zero Stock",
                    Entity = s.Name,
                    Message = "Stock item with zero closing balance",
                    EntityType = "StockItem"
                });
            }

            // 3. Check for items without HSN code
            foreach (var s in stockItems.Where(s => string.IsNullOrWhiteSpace(s.HsnCode) && s.ClosingBalance > 0))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Warning,
                    Category = "Missing HSN",
                    Entity = s.Name,
                    Message = "Active stock item without HSN code",
                    EntityType = "StockItem"
                });
            }

            // 4. Check for items without GST rate
            foreach (var s in stockItems.Where(s => s.GstRate == 0 && s.ClosingBalance > 0))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Warning,
                    Category = "Missing GST",
                    Entity = s.Name,
                    Message = "Active stock item without GST rate configured",
                    EntityType = "StockItem"
                });
            }

            // 5. Check for high-value stock
            const decimal HighValueThreshold = 100000;
            foreach (var s in stockItems.Where(s => Math.Abs(s.ClosingValue) > HighValueThreshold))
            {
                issues.Add(new ValidationIssue
                {
                    Severity = ValidationSeverity.Warning,
                    Category = "High Value Stock",
                    Entity = s.Name,
                    Message = $"High value stock: {s.ClosingValue:C} ({s.ClosingBalance} {s.BaseUnit})",
                    EntityType = "StockItem"
                });
            }

            return issues;
        }

        public List<ValidationIssue> RunAllValidations(
            List<Models.Voucher>? vouchers,
            List<Models.Ledger>? ledgers,
            List<Models.StockItem>? stockItems)
        {
            var allIssues = new List<ValidationIssue>();
            allIssues.AddRange(ValidateVouchers(vouchers ?? []));
            allIssues.AddRange(ValidateLedgers(ledgers ?? []));
            allIssues.AddRange(ValidateStockItems(stockItems ?? []));
            return allIssues;
        }
    }

    public class ValidationIssue
    {
        public ValidationSeverity Severity { get; set; }
        public string Category { get; set; } = "";
        public string Entity { get; set; } = "";
        public string Message { get; set; } = "";
        public string EntityType { get; set; } = "";

        public string SeverityIcon => Severity switch
        {
            ValidationSeverity.Error => "Red",
            ValidationSeverity.Warning => "Orange",
            ValidationSeverity.Info => "Blue",
            _ => "Gray"
        };
    }

    public enum ValidationSeverity
    {
        Info,
        Warning,
        Error
    }
}
