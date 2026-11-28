using System;
using System.Collections.Generic;
using System.IO;
using TallySyncApp.Models;
using TallySyncApp.Services;

namespace TallySyncApp.Tests
{
    public class CompanyCardsAndLauncherTests
    {
        [Fact]
        public void BuildCards_SortsOpenBeforeClosed_AndMergesCloudSyncAndWarnings()
        {
            var openCompanies = new List<Company>
            {
                new()
                {
                    Id = "open-1",
                    Name = "Alpha Traders",
                    DataPath = @"C:\TallyData\10001",
                    FinancialYearStart = new DateTime(2025, 4, 1),
                    FinancialYearEnd = new DateTime(2026, 3, 31),
                },
            };

            var cloudCompanies = new List<CloudCompanySummary>
            {
                new() { Id = "open-1", Name = "Alpha Traders", LastSyncAt = DateTimeOffset.UtcNow.AddMinutes(-5) },
                new() { Id = "closed-2", Name = "Beta Exports", LastSyncAt = DateTimeOffset.UtcNow.AddHours(-2) },
                new() { Id = "closed-3", Name = "Gamma Stores", LastSyncAt = DateTimeOffset.UtcNow.AddDays(-1) },
            };

            var history = new List<CloudSyncHistoryEntry>
            {
                new()
                {
                    CompanyId = "open-1",
                    CompanyName = "Alpha Traders",
                    Status = "completed",
                    StartedAt = DateTimeOffset.UtcNow.AddMinutes(-6),
                    CompletedAt = DateTimeOffset.UtcNow.AddMinutes(-5),
                    VouchersSynced = 12,
                },
                new()
                {
                    CompanyId = "closed-3",
                    CompanyName = "Gamma Stores",
                    Status = "failed",
                    StartedAt = DateTimeOffset.UtcNow.AddMinutes(-3),
                    Error = "Same-name cloud company already exists",
                },
            };

            var pendingNotifs = new List<(string NotificationType, string CompanyId, string Description, int RetryCount)>
            {
                ("not_synced", "Alpha Traders", "Duplicate voucher GUID skipped", 1),
            };

            var cards = CompanyCardMerger.BuildCards(openCompanies, cloudCompanies, history, pendingNotifs);

            Assert.Equal(3, cards.Count);
            Assert.Equal("Alpha Traders", cards[0].Name);
            Assert.True(cards[0].IsOpenInTally);
            Assert.True(cards[0].CanSyncCompany);
            Assert.Equal("Open in Tally", cards[0].OpenBadgeText);
            Assert.Equal("FY 2025-26", cards[0].FinancialYearText);
            Assert.True(cards[0].HasWarning);
            Assert.Contains("Duplicate voucher GUID skipped", cards[0].WarningTooltip);

            Assert.Equal("Beta Exports", cards[1].Name);
            Assert.False(cards[1].IsOpenInTally);
            Assert.False(cards[1].CanSyncCompany);
            Assert.Equal("Closed", cards[1].OpenBadgeText);
            Assert.False(cards[1].HasWarning);

            Assert.Equal("Gamma Stores", cards[2].Name);
            Assert.False(cards[2].IsOpenInTally);
            Assert.True(cards[2].HasWarning);
            Assert.Contains("Same-name cloud company already exists", cards[2].WarningTooltip);
        }

        [Fact]
        public void BuildCards_PreservesActiveSyncingStateAcrossRefresh()
        {
            var openCompanies = new List<Company>
            {
                new() { Id = "comp-1", Name = "Active Co" },
            };

            var existing = new List<CompanyCardItem>
            {
                new()
                {
                    CompanyId = "comp-1",
                    Name = "Active Co",
                    IsSyncing = true,
                    ProgressPercent = 64,
                    ProgressMessage = "Syncing vouchers: 64/100",
                },
            };

            var merged = CompanyCardMerger.BuildCards(
                openCompanies,
                Array.Empty<CloudCompanySummary>(),
                Array.Empty<CloudSyncHistoryEntry>(),
                Array.Empty<(string, string, string, int)>(),
                existing);

            var card = Assert.Single(merged);
            Assert.True(card.IsSyncing);
            Assert.False(card.CanSyncCompany);
            Assert.Equal(64, card.ProgressPercent);
            Assert.Equal("Syncing vouchers: 64/100", card.ProgressMessage);
            Assert.Equal("Syncing", card.SyncStateLabel);
        }

        [Fact]
        public void TallyProcessLauncher_BuildWebDashboardUrl_HandlesReleaseDebugAndCompanyId()
        {
            Assert.Equal(
                "https://tallyonmob.vercel.app/?companyId=comp%201",
                TallyProcessLauncher.BuildWebDashboardUrl("https://tallyonmob.vercel.app/subscription", "comp 1", isDebug: false));

            Assert.Equal(
                "http://127.0.0.1:3011/",
                TallyProcessLauncher.BuildWebDashboardUrl(null, null, isDebug: true));
        }

        [Fact]
        public void TallyProcessLauncher_ResolveDataFolderPath_AndFindExecutable_HandleLocalPaths()
        {
            var tempRoot = Path.Combine(Path.GetTempPath(), "syncora-launcher-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempRoot);
            var fakeExe = Path.Combine(tempRoot, "tally.exe");
            File.WriteAllText(fakeExe, "stub");

            try
            {
                Assert.Equal(fakeExe, TallyProcessLauncher.FindTallyExecutable(fakeExe));
                Assert.Equal(tempRoot, TallyProcessLauncher.ResolveDataFolderPath(tempRoot, null));
                Assert.Equal(tempRoot, TallyProcessLauncher.ResolveDataFolderPath(Path.Combine(tempRoot, "Company.900"), null));
            }
            finally
            {
                try { Directory.Delete(tempRoot, true); } catch { }
            }
        }
    }
}
