using System;
using System.Collections.Generic;
using System.Linq;
using System.Globalization;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using TallySyncApp.Models;

namespace TallySyncApp.Services;

/// <summary>Authenticated, owner-scoped reads only. No service role or local-history fallback.</summary>
public sealed class CloudSyncReader(HttpClient client, string supabaseUrl, string ownerId)
{
    private const string HistoryFields = "id,company_id,sync_type,status,started_at,completed_at,ledgers_synced,vouchers_synced,sales_synced,purchases_synced,stock_synced,total_records,error_message";

    public async Task<CloudSyncOverview> ReadAsync(CancellationToken ct)
    {
        if (!Guid.TryParse(ownerId, out _)) throw new InvalidOperationException("Sign in to load cloud sync history.");
        var companies = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var offset = 0; ; offset += 1000)
        {
            var rows = await ReadRowsAsync<JObject>($"companies?owner_id=eq.{Uri.EscapeDataString(ownerId)}&select=id,name&order=id&limit=1000&offset={offset}", ct);
            foreach (var row in rows)
            {
                var id = row["id"]?.ToString() ?? "";
                if (string.IsNullOrWhiteSpace(id)) throw new InvalidOperationException("Cloud company identifier is missing.");
                companies[id] = row["name"]?.ToString() ?? id;
            }
            if (rows.Count < 1000) break;
        }
        var result = new CloudSyncOverview();
        foreach (var ids in companies.Keys.Chunk(100))
        {
            var filter = "company_id=in.(" + Uri.EscapeDataString(string.Join(",", ids.Select(id => "\"" + id.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""))) + ")";
            var vouchers = CountAsync($"vouchers?{filter}&is_deleted=not.is.true&select=id&limit=1", ct);
            var ledgers = CountAsync($"ledgers?{filter}&select=id&limit=1", ct);
            var stock = CountAsync($"stock_items?{filter}&select=id&limit=1", ct);
            var history = ReadRowsAsync<CloudSyncHistoryEntry>($"sync_history?{filter}&select={HistoryFields}&order=started_at.desc.nullslast&limit=100", ct);
            // Query independently: 100 recent failed runs must not hide an older successful sync.
            var successful = ReadRowsAsync<CloudSyncHistoryEntry>($"sync_history?{filter}&select={HistoryFields}&status=in.(completed,success,successful)&completed_at=not.is.null&order=completed_at.desc&limit=1", ct);
            await Task.WhenAll(vouchers, ledgers, stock, history, successful);
            result.VoucherCount += await vouchers;
            result.LedgerCount += await ledgers;
            result.StockCount += await stock;
            result.History.AddRange(await history);
            var last = (await successful).Where(row => row.IsSuccessful).Select(row => row.CompletedAt).Max();
            if (last.HasValue && (!result.LastSuccessfulSync.HasValue || last > result.LastSuccessfulSync)) result.LastSuccessfulSync = last;
        }
        result.History = result.History.OrderByDescending(row => row.StartedAt).Take(100).ToList();
        foreach (var row in result.History) row.CompanyName = companies.GetValueOrDefault(row.CompanyId, row.CompanyId);
        return result;
    }

    private async Task<List<T>> ReadRowsAsync<T>(string query, CancellationToken ct)
    {
        using var response = await client.GetAsync($"{supabaseUrl.TrimEnd('/')}/rest/v1/{query}", ct);
        response.EnsureSuccessStatusCode();
        return JsonConvert.DeserializeObject<List<T>>(await response.Content.ReadAsStringAsync(ct))
            ?? throw new InvalidOperationException("Cloud sync response was empty or invalid.");
    }

    private async Task<long> CountAsync(string query, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Head, $"{supabaseUrl.TrimEnd('/')}/rest/v1/{query}");
        request.Headers.TryAddWithoutValidation("Prefer", "count=exact");
        using var response = await client.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        // PostgREST sends "0-0/123" rather than the standard HTTP "items 0-0/123".
        // HttpClient's typed ContentRange parser rejects the unitless form.
        if (response.Content.Headers.TryGetValues("Content-Range", out var ranges)
            || response.Headers.TryGetValues("Content-Range", out ranges))
        {
            var raw = ranges.Single();
            var separator = raw.LastIndexOf('/');
            if (separator >= 0 && long.TryParse(raw[(separator + 1)..], NumberStyles.None, CultureInfo.InvariantCulture, out var count))
                return count;
        }
        throw new InvalidOperationException("Supabase did not return the requested record count.");
    }
}
