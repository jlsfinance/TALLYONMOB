using System;
using System.IO;
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
            Assert.Contains("राम-राम / नमस्ते Sharma Enterprises जी", caption);
            Assert.Contains("*बिल (Sales) #INV-101*", caption);
            Assert.Contains("27-11-2026", caption);
            Assert.Contains("12,500.50", caption);
            Assert.Contains("धन्यवाद", caption);
            Assert.DoesNotContain("Performance Stats", caption);
        }

        [Fact]
        public void BuildOwnerVoucherCaption_UsesDesiHindiLabels()
        {
            var sales = WhatsAppMessageFormatter.BuildOwnerVoucherCaption(
                "Acme Traders",
                "Sales",
                "INV-102",
                new DateTime(2026, 11, 28),
                "Patel Hardware",
                5400m);
            Assert.Contains("नया बिल (Sales) तैयार — Acme Traders", sales);
            Assert.Contains("Patel Hardware", sales);
            Assert.Contains("#INV-102", sales);
            Assert.Contains("28-11-2026", sales);
            Assert.Contains("5,400.00", sales);

            var receipt = WhatsAppMessageFormatter.BuildOwnerVoucherCaption(
                "Acme Traders",
                "Receipt",
                "RCP-5",
                new DateTime(2026, 11, 28),
                null,
                2000m);
            Assert.Contains("नया रसीद (Receipt) तैयार", receipt);
            Assert.DoesNotContain("पार्टी:", receipt);

            Assert.Equal("पेमेंट स्लिप (Payment)", WhatsAppMessageFormatter.GetDesiHindiVoucherLabel("Payment"));
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

        [Fact]
        public void WhatsAppHelperManager_FindsHelperBundledNodeAndDependencies()
        {
            var tempRoot = Path.Combine(Path.GetTempPath(), "syncora-wa-test-" + Guid.NewGuid().ToString("N"));
            var helperDir = Path.Combine(tempRoot, "whatsapp-notifier");
            var pkgDir = Path.Combine(helperDir, "node_modules", "whatsapp-web.js");
            var authBase = Path.Combine(tempRoot, "localappdata");
            var authDir = Path.Combine(authBase, "Syncora", "whatsapp-auth");

            try
            {
                Directory.CreateDirectory(pkgDir);
                File.WriteAllText(Path.Combine(helperDir, "server.js"), "// test");
                File.WriteAllText(Path.Combine(pkgDir, "package.json"), "{}");
                File.WriteAllText(Path.Combine(helperDir, "node.exe"), "stub");

                Assert.Equal(helperDir, WhatsAppHelperManager.FindHelperDirectory(tempRoot));
                Assert.Equal(Path.Combine(helperDir, "node.exe"), WhatsAppHelperManager.FindNodeExecutable(helperDir));
                Assert.True(WhatsAppHelperManager.HasBundledDependencies(helperDir));
                Assert.False(WhatsAppHelperManager.HasSavedSession(helperDir, authBase));

                Directory.CreateDirectory(Path.Combine(authDir, "session"));
                Assert.True(WhatsAppHelperManager.HasSavedSession(helperDir, authBase));
            }
            finally
            {
                if (Directory.Exists(tempRoot))
                {
                    Directory.Delete(tempRoot, recursive: true);
                }
            }
        }

        [Fact]
        public async System.Threading.Tasks.Task OfflineQueueService_PrunesClosedCompaniesAndCapsNotificationRetries()
        {
            var dbPath = Path.Combine(Path.GetTempPath(), "syncora-notif-test-" + Guid.NewGuid().ToString("N") + ".db");
            try
            {
                using (var queue = new OfflineQueueService(dbPath))
                {
                    await queue.UpsertNotificationAsync("not_synced", "Tera Baap", "GUID error");
                    await queue.UpsertNotificationAsync("not_synced", "Tera Baapp", "Other account error");
                    await queue.UpsertNotificationAsync("not_synced", "Hyhcy1'", "Temp error");
                    await queue.UpsertNotificationAsync("sync_issue", "__session__", "Session issue");

                    var pruned = await queue.PruneClosedCompanyNotificationsAsync(new[] { "Hyhcy1'" });
                    Assert.Equal(2, pruned);

                    var remaining = await queue.GetPendingNotificationsAsync();
                    Assert.Equal(2, remaining.Count);
                    Assert.Contains(remaining, x => x.NotificationType == "not_synced" && x.CompanyId == "Hyhcy1'");
                    Assert.Contains(remaining, x => x.NotificationType == "sync_issue" && x.CompanyId == "__session__");

                    // Re-upserting does not double increment retry_count
                    await queue.UpsertNotificationAsync("not_synced", "Hyhcy1'", "Temp error again");
                    var afterUpsert = await queue.GetPendingNotificationsAsync();
                    Assert.Equal(0, afterUpsert.Find(x => x.CompanyId == "Hyhcy1'").RetryCount);

                    for (int i = 0; i < OfflineQueueService.MaxNotificationRetries; i++)
                    {
                        await queue.IncrementNotificationRetryAsync("not_synced", "Hyhcy1'");
                    }

                    var finalPending = await queue.GetPendingNotificationsAsync();
                    Assert.DoesNotContain(finalPending, x => x.CompanyId == "Hyhcy1'");
                }
            }
            finally
            {
                Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
                if (File.Exists(dbPath))
                {
                    File.Delete(dbPath);
                }
            }
        }
    }
}
