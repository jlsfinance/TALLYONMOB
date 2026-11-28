using System;
using System.Collections.Generic;
using System.Linq;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Merges currently-open Tally companies with Supabase cloud companies, recent history,
    /// pending failure notifications, and live in-memory sync progress into UI cards.
    /// </summary>
    public static class CompanyCardMerger
    {
        public static List<CompanyCardItem> BuildCards(
            IEnumerable<Company> openTallyCompanies,
            IEnumerable<CloudCompanySummary> cloudCompanies,
            IEnumerable<CloudSyncHistoryEntry> history,
            IEnumerable<(string NotificationType, string CompanyId, string Description, int RetryCount)> pendingNotifications,
            IEnumerable<CompanyCardItem>? existingCards = null)
        {
            var openList = (openTallyCompanies ?? Enumerable.Empty<Company>()).ToList();
            var cloudList = (cloudCompanies ?? Enumerable.Empty<CloudCompanySummary>()).ToList();
            var historyList = (history ?? Enumerable.Empty<CloudSyncHistoryEntry>()).ToList();
            var notifList = (pendingNotifications ?? Enumerable.Empty<(string NotificationType, string CompanyId, string Description, int RetryCount)>()).ToList();
            var prevList = (existingCards ?? Enumerable.Empty<CompanyCardItem>()).ToList();

            var buckets = new List<(Company? Tally, CloudCompanySummary? Cloud)>();

            // 1. Seed with open Tally companies
            foreach (var tc in openList)
            {
                var matchedCloud = FindMatchingCloud(tc, cloudList);
                buckets.Add((tc, matchedCloud));
            }

            // 2. Append closed cloud companies that weren't matched to any open Tally company
            var matchedCloudIds = new HashSet<string>(
                buckets.Where(b => b.Cloud != null).Select(b => b.Cloud!.Id),
                StringComparer.OrdinalIgnoreCase);

            foreach (var cc in cloudList)
            {
                if (!matchedCloudIds.Contains(cc.Id))
                    buckets.Add((null, cc));
            }

            // 3. Build CompanyCardItem for each unique company
            var result = new List<CompanyCardItem>(buckets.Count);
            foreach (var (tally, cloud) in buckets)
            {
                var companyId = !string.IsNullOrWhiteSpace(cloud?.Id) ? cloud!.Id : (tally?.Id ?? string.Empty);
                var name = !string.IsNullOrWhiteSpace(tally?.Name) ? tally!.Name : (cloud?.Name ?? companyId);

                var prev = prevList.FirstOrDefault(p =>
                    (!string.IsNullOrWhiteSpace(companyId) && string.Equals(p.CompanyId, companyId, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(name) && string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase)));

                var compHistory = historyList
                    .Where(h =>
                        (!string.IsNullOrWhiteSpace(companyId) && string.Equals(h.CompanyId, companyId, StringComparison.OrdinalIgnoreCase)) ||
                        (!string.IsNullOrWhiteSpace(name) && string.Equals(h.CompanyName, name, StringComparison.OrdinalIgnoreCase)))
                    .OrderByDescending(h => h.StartedAt ?? DateTimeOffset.MinValue)
                    .ToList();

                var latestHistory = compHistory.FirstOrDefault();
                var latestSuccess = compHistory.FirstOrDefault(h => h.IsSuccessful && h.CompletedAt.HasValue);

                DateTime? lastSyncAt = cloud?.LastSyncAt?.LocalDateTime;
                if (!lastSyncAt.HasValue && latestSuccess?.CompletedAt != null)
                    lastSyncAt = latestSuccess.CompletedAt.Value.LocalDateTime;
                if (!lastSyncAt.HasValue && prev?.LastSyncAt != null)
                    lastSyncAt = prev.LastSyncAt;

                // Pending notifications in OfflineQueueService are keyed by Company.Name (or Id)
                var notif = notifList.FirstOrDefault(n =>
                    (!string.IsNullOrWhiteSpace(name) && string.Equals(n.CompanyId, name, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(companyId) && string.Equals(n.CompanyId, companyId, StringComparison.OrdinalIgnoreCase)));

                bool hasWarning = false;
                string warningTitle = string.Empty;
                string warningMessage = string.Empty;

                if (!string.IsNullOrWhiteSpace(notif.CompanyId))
                {
                    hasWarning = true;
                    warningTitle = $"Attention ({notif.RetryCount + 1}/{OfflineQueueService.MaxNotificationRetries})";
                    warningMessage = string.IsNullOrWhiteSpace(notif.Description) ? "Last sync had an issue." : notif.Description;
                }
                else if (latestHistory != null && !latestHistory.IsSuccessful && !string.IsNullOrWhiteSpace(latestHistory.Error))
                {
                    var failedNewerThanSuccess = !latestSuccess?.CompletedAt.HasValue ?? true;
                    if (latestSuccess?.CompletedAt != null && latestHistory.StartedAt.HasValue)
                        failedNewerThanSuccess = latestHistory.StartedAt.Value > latestSuccess.CompletedAt.Value;

                    if (failedNewerThanSuccess)
                    {
                        hasWarning = true;
                        warningTitle = string.Equals(latestHistory.Status, "partial", StringComparison.OrdinalIgnoreCase)
                            ? "Partial Sync"
                            : "Last Sync Failed";
                        warningMessage = latestHistory.Error!;
                    }
                }
                else if (prev != null && prev.HasWarning && !prev.IsSyncing)
                {
                    hasWarning = prev.HasWarning;
                    warningTitle = prev.WarningTitle;
                    warningMessage = prev.WarningMessage;
                }

                string recordsSummary = latestHistory != null && latestHistory.RecordsSynced > 0
                    ? $"Last run: {latestHistory.RecordsSynced:N0} records"
                    : string.Empty;

                bool isSyncing = prev?.IsSyncing ?? false;
                int progressPercent = isSyncing
                    ? prev!.ProgressPercent
                    : (lastSyncAt.HasValue ? 100 : (prev?.ProgressPercent ?? 0));
                string progressMessage = isSyncing
                    ? prev!.ProgressMessage
                    : (hasWarning ? "Needs attention" : (lastSyncAt.HasValue ? "Up to date" : (tally != null ? "Ready to sync" : "Closed in Tally")));

                result.Add(new CompanyCardItem
                {
                    CompanyId = companyId,
                    Name = name,
                    TallyGuid = tally?.TallyGuid,
                    DataPath = !string.IsNullOrWhiteSpace(tally?.DataPath) ? tally!.DataPath : prev?.DataPath,
                    FinancialYearText = FormatFinancialYear(tally?.FinancialYearStart, tally?.FinancialYearEnd) is { Length: > 0 } fy
                        ? fy
                        : (prev?.FinancialYearText ?? string.Empty),
                    RecordsSummaryText = recordsSummary,
                    IsOpenInTally = tally != null,
                    IsSyncing = isSyncing,
                    ProgressPercent = progressPercent,
                    ProgressMessage = progressMessage,
                    LastSyncAt = lastSyncAt,
                    HasWarning = hasWarning,
                    WarningTitle = warningTitle,
                    WarningMessage = warningMessage,
                });
            }

            return result
                .OrderByDescending(c => c.IsOpenInTally)
                .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static CloudCompanySummary? FindMatchingCloud(Company tally, List<CloudCompanySummary> cloudList)
        {
            if (!string.IsNullOrWhiteSpace(tally.Id))
            {
                var byId = cloudList.FirstOrDefault(c => string.Equals(c.Id, tally.Id, StringComparison.OrdinalIgnoreCase));
                if (byId != null) return byId;
            }

            return cloudList.FirstOrDefault(c => string.Equals(c.Name, tally.Name, StringComparison.OrdinalIgnoreCase));
        }

        public static string FormatFinancialYear(DateTime? start, DateTime? end)
        {
            if (!start.HasValue) return string.Empty;
            if (end.HasValue && end.Value.Year != start.Value.Year)
                return $"FY {start.Value:yyyy}-{end.Value:yy}";
            return $"FY {start.Value:yyyy}-{(start.Value.Year + 1) % 100:00}";
        }
    }
}
