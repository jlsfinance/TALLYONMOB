using System;
using TallySyncApp.Services;

namespace TallySyncApp.Tests
{
    public class WhatsAppNotifierTests
    {
        [Theory]
        [InlineData("9876543210", "919876543210")]
        [InlineData("+91 98765-43210", "919876543210")]
        [InlineData("919876543210", "919876543210")]
        [InlineData("12345", "")]
        [InlineData("", "")]
        [InlineData(null, "")]
        public void NormalizePhone_FormatsIndianAndInternationalNumbers(string? input, string expected)
        {
            Assert.Equal(expected, WhatsAppMessageFormatter.NormalizePhone(input));
        }

        [Theory]
        [InlineData("0141-234567 / 9829012345", "919829012345")]
        [InlineData("9413821007, 011-23456789", "919413821007")]
        [InlineData("+91 98765 43210 | 9122334455", "919876543210")]
        [InlineData("abc / 12345", "")]
        [InlineData(null, "")]
        public void ExtractPrimaryPhone_PrefersIndianMobileFromMultiNumberField(string? input, string expected)
        {
            Assert.Equal(expected, WhatsAppMessageFormatter.ExtractPrimaryPhone(input));
        }

        [Theory]
        [InlineData("Sales", "Sales, Receipt, Credit Note, Payment", true)]
        [InlineData("Sales Invoice", "Sales, Receipt, Credit Note, Payment", true)]
        [InlineData("Receipt", "Sales, Receipt, Credit Note, Payment", true)]
        [InlineData("Credit Note", "Sales, Receipt, Credit Note, Payment", true)]
        [InlineData("Payment", "Sales, Receipt, Credit Note, Payment", true)]
        [InlineData("Journal", "Sales, Receipt, Credit Note, Payment", false)]
        [InlineData("Contra", "Sales, Receipt, Credit Note, Payment", false)]
        [InlineData("Purchase", "Sales, Receipt, Credit Note, Payment", false)]
        [InlineData("Sales", "", false)]
        public void ShouldSendToParty_MatchesConfiguredVoucherTypesOnly(string? voucherType, string? csv, bool expected)
        {
            Assert.Equal(expected, WhatsAppMessageFormatter.ShouldSendToParty(voucherType, csv));
        }

        [Fact]
        public void BuildPartyVoucherCaption_IsCleanAndExcludesSyncStats()
        {
            var caption = WhatsAppMessageFormatter.BuildPartyVoucherCaption(
                "Acme Traders",
                "Sales",
                "INV-101",
                new DateTime(2026, 11, 27),
                "Sharma Enterprises",
                12500.50m);

            Assert.Contains("*Acme Traders*", caption);
            Assert.Contains("Dear Sharma Enterprises,", caption);
            Assert.Contains("*Sales #INV-101*", caption);
            Assert.Contains("27-11-2026", caption);
            Assert.Contains("12,500.50", caption);
            Assert.DoesNotContain("Performance Stats", caption);
        }

        [Fact]
        public void ConvertHtmlToWhatsApp_ConvertsTelegramHtmlTagsCleanly()
        {
            const string input = "✅ <b>Sync Completed: Acme &amp; Co</b>\n• Vouchers: <code>12</code>\n<i>Time: 22:30:00</i>";
            var result = WhatsAppMessageFormatter.ConvertHtmlToWhatsApp(input);

            Assert.Contains("*Sync Completed: Acme & Co*", result);
            Assert.Contains("`12`", result);
            Assert.Contains("_Time: 22:30:00_", result);
            Assert.DoesNotContain("<b>", result);
            Assert.DoesNotContain("<code>", result);
            Assert.DoesNotContain("<i>", result);
        }
    }
}
