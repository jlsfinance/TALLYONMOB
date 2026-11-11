using TallySyncApp.Models;
using TallySyncApp.Services;

public class VoucherPdfHtmlTests
{
    [Fact]
    public void SalesRendersInvoiceWithItemsAndEscapesText()
    {
        var company = new Company { Name = "Mgs & Co", Gstin = "08ABCDE1234F1Z5", Address = "Nimbawas" };
        var voucher = new Voucher
        {
            VoucherType = "Sales",
            VoucherNumber = "42",
            VoucherDate = new DateTime(2026, 11, 10),
            PartyName = "<Ram>",
            TotalAmount = 1180m,
            InventoryEntries = new()
            {
                new() { StockItemName = "Shoe", HsnCode = "6403", Quantity = 2, Unit = "PCS", Rate = 500, Amount = 1000 }
            },
            LedgerEntries = new()
            {
                new() { LedgerName = "Ram", Amount = 1180, IsDebit = true },
                new() { LedgerName = "Sales", Amount = 1000, IsDebit = false },
                new() { LedgerName = "Output CGST", Amount = 90, IsDebit = false },
                new() { LedgerName = "Output SGST", Amount = 90, IsDebit = false }
            }
        };

        string html = VoucherPdfHtml.Build(company, voucher);

        Assert.Contains("TAX INVOICE", html);
        Assert.Contains("GSTIN: 08ABCDE1234F1Z5", html);
        Assert.Contains("Mgs &amp; Co", html);
        Assert.Contains("&lt;Ram&gt;", html);
        Assert.Contains("Shoe", html);
        Assert.Contains("6403", html);
        Assert.Contains("₹1,180.00", html);
        Assert.Contains("Output CGST", html);
    }

    [Fact]
    public void InvoiceSplitsTaxableValueFromTaxLines()
    {
        var voucher = new Voucher
        {
            VoucherType = "Purchase",
            VoucherNumber = "7",
            VoucherDate = new DateTime(2026, 11, 10),
            TotalAmount = 1180m,
            InventoryEntries = new()
            {
                new() { StockItemName = "Shoe", Quantity = 2, Rate = 500, Amount = 1000, TaxRate = 18 }
            },
            LedgerEntries = new()
            {
                new() { LedgerName = "Input IGST", Amount = 180, IsDebit = true }
            }
        };

        string html = VoucherPdfHtml.Build(new Company { Name = "Mgs" }, voucher);

        Assert.Contains("Taxable Value</td><td class='num'>1,000.00", html);
        Assert.Contains("Input IGST</td><td class='num'>180.00", html);
        Assert.Contains("One Thousand One Hundred Eighty Rupees Only", html);
    }

    [Fact]
    public void ReceiptStaysAVoucherWithDebitAndCreditColumns()
    {
        var voucher = new Voucher
        {
            VoucherType = "Receipt",
            VoucherNumber = "1",
            VoucherDate = new DateTime(2026, 11, 10),
            TotalAmount = 500m,
            LedgerEntries = new()
            {
                new() { LedgerName = "HDFC", Amount = 500, IsDebit = true },
                new() { LedgerName = "Ram", Amount = 500, IsDebit = false }
            }
        };

        string html = VoucherPdfHtml.Build(new Company { Name = "Mgs" }, voucher);

        Assert.DoesNotContain("TAX INVOICE", html);
        Assert.Contains("RECEIPT", html);
        Assert.Contains("<td class='num'>500.00</td><td class='num'></td>", html);
        Assert.Contains("<td class='num'></td><td class='num'>500.00</td>", html);
        Assert.Contains("Five Hundred Rupees Only", html);
    }

    [Theory]
    [InlineData(0, "Zero Rupees Only")]
    [InlineData(20498.11, "Twenty Thousand Four Hundred Ninety Eight Rupees and Eleven Paise Only")]
    [InlineData(1500000, "Fifteen Lakh Rupees Only")]
    [InlineData(-75.5, "Minus Seventy Five Rupees and Fifty Paise Only")]
    public void AmountInWordsFollowsIndianGrouping(decimal amount, string expected)
    {
        Assert.Equal(expected, VoucherPdfHtml.AmountInWords(amount));
    }
}
