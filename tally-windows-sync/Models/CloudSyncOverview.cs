using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace TallySyncApp.Models;

public sealed class CloudSyncHistoryEntry
{
    [JsonProperty("id")] public string Id { get; set; } = "";
    [JsonProperty("company_id")] public string CompanyId { get; set; } = "";
    [JsonIgnore] public string CompanyName { get; set; } = "";
    [JsonProperty("sync_type")] public string SyncType { get; set; } = "";
    [JsonProperty("status")] public string Status { get; set; } = "";
    [JsonProperty("started_at")] public DateTimeOffset? StartedAt { get; set; }
    [JsonProperty("completed_at")] public DateTimeOffset? CompletedAt { get; set; }
    [JsonProperty("ledgers_synced")] public int LedgersSynced { get; set; }
    [JsonProperty("vouchers_synced")] public int VouchersSynced { get; set; }
    [JsonProperty("sales_synced")] public int SalesSynced { get; set; }
    [JsonProperty("purchases_synced")] public int PurchasesSynced { get; set; }
    [JsonProperty("stock_synced")] public int StockSynced { get; set; }
    [JsonProperty("total_records")] public int TotalRecords { get; set; }
    [JsonProperty("error_message")] public string? Error { get; set; }
    [JsonIgnore] public long RecordsSynced => (long)LedgersSynced + VouchersSynced + SalesSynced + PurchasesSynced + StockSynced;
    [JsonIgnore] public DateTime? LocalStartedAt => StartedAt?.LocalDateTime;
    [JsonIgnore] public string DurationText => StartedAt.HasValue
        ? $"{Math.Max(0, ((CompletedAt ?? DateTimeOffset.UtcNow) - StartedAt.Value).TotalSeconds):N0}s" : "—";
    [JsonIgnore] public bool IsSuccessful => CompletedAt.HasValue &&
        (Status.Equals("completed", StringComparison.OrdinalIgnoreCase) || Status.Equals("success", StringComparison.OrdinalIgnoreCase) || Status.Equals("successful", StringComparison.OrdinalIgnoreCase));
}

public sealed class CloudSyncOverview
{
    public long VoucherCount { get; set; }
    public long LedgerCount { get; set; }
    public long StockCount { get; set; }
    public long RecordsSynced => VoucherCount + LedgerCount + StockCount;
    public DateTimeOffset? LastSuccessfulSync { get; set; }
    public List<CloudSyncHistoryEntry> History { get; set; } = new();
}

// Only acknowledged uploads belong in the cloud history counters.
public sealed class CloudSyncProgress
{
    public string HistoryId { get; init; } = "";
    public int Ledgers { get; private set; }
    public int Vouchers { get; private set; }
    public int Sales { get; private set; }
    public int Purchases { get; private set; }
    public int Stock { get; private set; }
    public int Total => Ledgers + Vouchers + Sales + Purchases + Stock;
    public void AddStandalone(string table, int count)
    {
        if (table == "ledgers") Ledgers += count;
        if (table == "stock_items") Stock += count;
    }
    public void AddCompletedVoucherBatch(int vouchers, int sales, int purchases)
    { Vouchers += vouchers; Sales += sales; Purchases += purchases; }
}
