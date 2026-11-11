using TallySyncApp.Models;
using TallySyncApp.Services;

public class VoucherPdfHtmlTests
{
    [Fact]
    public void RendersItemsLedgerSplitAndEscapedText()
    {
        var company = new Company { Name = "Mgs & Co" };
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
                new() { LedgerName = "Sales", Amount = 1180, IsDebit = false }
            }
        };

        string html = VoucherPdfHtml.Build(company, voucher);

        Assert.Contains("Mgs &amp; Co", html);
        Assert.Contains("&lt;Ram&gt;", html);
        Assert.Contains("Shoe", html);
        Assert.Contains("6403", html);
        Assert.Contains("Sales", html);
        Assert.Contains("₹1,180.00", html);
    }

    [Fact]
    public void DebitAndCreditLandInTheirOwnColumns()
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

        Assert.Contains("<td class='num'>500.00</td><td class='num'></td>", html);
        Assert.Contains("<td class='num'></td><td class='num'>500.00</td>", html);
    }
}
