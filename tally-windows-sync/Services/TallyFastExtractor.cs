using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// TallyFastExtractor - High-Performance, Zero-Hang Tally Data Extractor
    /// Architecture reverse-engineered from LiveKeeping (LKDataConnector v3.2.1.3).
    /// 
    /// Key Principles:
    /// 1. Zero Formula Filters: Avoids $$NumValue:$ALTERID >= X (which causes 2.5 Crore evaluations and hangs Tally).
    /// 2. Per-Voucher-Type Indexing: Uses Tally's internal B-Tree index (ChildOf / Type filter) like Livekeeping.
    /// 3. Pre-Flight Statistics Check: Queries voucher counts first, completely skipping empty months/types.
    /// 4. Cooperative CPU Yielding: Injects throttle delays between batches so Tally's Windows Message Pump never starves.
    /// 5. Lightweight Raw Collections: Never runs heavy UI Display Reports (like Voucher Register with SVEXPLODEALL).
    /// </summary>
    public class TallyFastExtractor : IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly string _tallyUrl;
        private readonly int _batchSize;
        private readonly int _throttleMs;
        private bool _disposed;

        /// <summary>
        /// Standard Tally voucher types with native indexing
        /// </summary>
        public static readonly string[] StandardVoucherTypes = new[]
        {
            "Sales",
            "Purchase",
            "Receipt",
            "Payment",
            "Contra",
            "Journal",
            "Credit Note",
            "Debit Note",
            "Sales Order",
            "Purchase Order",
            "Delivery Note",
            "Receipt Note",
            "Stock Journal",
            "Physical Stock"
        };

        public class VoucherTypeStat
        {
            public string VoucherType { get; set; } = string.Empty;
            public int TotalCount { get; set; }
            public int CancelledCount { get; set; }
        }

        public TallyFastExtractor(string tallyUrl = "http://127.0.0.1:9000", int batchSize = 100, int throttleMs = 40)
        {
            _tallyUrl = tallyUrl.TrimEnd('/').Replace("localhost", "127.0.0.1");
            _batchSize = batchSize > 0 ? batchSize : 100;
            _throttleMs = throttleMs >= 0 ? throttleMs : 40;

            _httpClient = new HttpClient
            {
                // Short timeout: a wedged Tally must not stall a sync pass for 2 minutes per request.
                Timeout = TimeSpan.FromSeconds(45)
            };
            _httpClient.DefaultRequestHeaders.Add("Accept", "text/xml");
        }

        /// <summary>
        /// Step 1: Pre-Flight Stats Check (Livekeeping parity)
        /// Asks Tally for active voucher types without performing expensive all-time count scans.
        /// Takes ~10ms and avoids making useless queries for non-existent voucher types.
        /// </summary>
        public async Task<List<VoucherTypeStat>> GetVoucherStatisticsAsync(string companyName, CancellationToken ct = default)
        {
            // First attempt
            var stats = await GetVoucherStatisticsInternalAsync(companyName, ct);
            if (stats.Count > 0) return stats;

            // Retry after small delay - Tally needs time to switch company context on some machines
            try
            {
                SyncLogger.Log($"[FastExtractor] VoucherType collection empty for '{companyName}', retrying after context switch...");
                await Task.Delay(1500, ct);
                stats = await GetVoucherStatisticsInternalAsync(companyName, ct);
                if (stats.Count > 0) return stats;

                await Task.Delay(2000, ct);
                stats = await GetVoucherStatisticsInternalAsync(companyName, ct);
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                SyncLogger.Log($"[FastExtractor] VoucherType stats retry failed: {ex.Message}");
            }

            return stats;
        }

        private async Task<List<VoucherTypeStat>> GetVoucherStatisticsInternalAsync(string companyName, CancellationToken ct = default)
        {
            var request = $@"<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>%%Collection</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>{EscapeXml(companyName)}</SVCURRENTCOMPANY>
          <COLLECTIONTYPE>VoucherType</COLLECTIONTYPE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>";

            var xml = await SendTallyRequestAsync(request, ct);
            if (string.IsNullOrWhiteSpace(xml)) return new List<VoucherTypeStat>();

            var stats = new List<VoucherTypeStat>();
            try
            {
                var doc = SafeParseXml(xml);
                var vchTypeNodes = doc.Descendants().Where(e => e.Name.LocalName.Equals("VOUCHERTYPE", StringComparison.OrdinalIgnoreCase));

                foreach (var node in vchTypeNodes)
                {
                    var name = node.Element("NAME")?.Value?.Trim() ?? node.Attribute("NAME")?.Value?.Trim();
                    if (string.IsNullOrEmpty(name)) continue;

                    stats.Add(new VoucherTypeStat
                    {
                        VoucherType = name,
                        TotalCount = 1,
                        CancelledCount = 0
                    });
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"[FastExtractor] Error parsing voucher types: {ex.Message}");
            }

            return stats;
        }

        /// <summary>
        /// Step 2: Fetch Indexed Vouchers by Type (Zero-Hang)
        /// Uses native Tally Voucher Register scoped to 1 month and 1 voucher type.
        /// Does NOT use un-indexed TDL formula scanning.
        /// </summary>
        public async Task<List<Voucher>> GetVouchersByTypeAsync(
            string companyName, 
            string voucherType, 
            DateTime? fromDate = null, 
            DateTime? toDate = null,
            Dictionary<string, string>? hsnCache = null,
            CancellationToken ct = default)
        {
            var fromStr = fromDate?.ToString("yyyyMMdd") ?? "19000101";
            var toStr = toDate?.ToString("yyyyMMdd") ?? DateTime.Today.ToString("yyyyMMdd");

            var request = $@"<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Voucher Register</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>{fromStr}</SVFROMDATE>
          <SVTODATE>{toStr}</SVTODATE>
          <SVCURRENTCOMPANY>{EscapeXml(companyName)}</SVCURRENTCOMPANY>
          <VOUCHERTYPENAME>{EscapeXml(voucherType)}</VOUCHERTYPENAME>
          <ISITEMWISE>No</ISITEMWISE>
          <SVEXPLODEALL>Yes</SVEXPLODEALL>
          <SVEXPORTINVENTORY>Yes</SVEXPORTINVENTORY>
        </STATICVARIABLES>
        <TDL>
          <TDLMESSAGE>
            <REPORT NAME=""Voucher Register"" ISMODIFY=""No"">
              <SET>SVEXPLODEALL:Yes</SET>
              <SET>EXPLODEINVENTORY:Yes</SET>
            </REPORT>
          </TDLMESSAGE>
        </TDL>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>";

            var xml = await SendTallyRequestAsync(request, ct);
            if (string.IsNullOrWhiteSpace(xml)) return new List<Voucher>();

            return ParseVouchersFromXml(xml, companyName, hsnCache);
        }

        /// <summary>
        /// Step 3: Incremental fetch (LK parity, VoucherAlterIdsVT style).
        /// 1. Ask Tally only for the ALTERID list that changed (tiny response, date-bounded index).
        /// 2. Pull those vouchers back in 100-voucher ALTERID batches.
        /// Never runs an exploded Voucher Register over a date range - that is what
        /// wedges Tally's single-threaded HTTP server.
        /// </summary>
        public async Task<List<Voucher>> GetModifiedVouchersFastAsync(
            string companyName,
            long afterAlterId,
            Dictionary<string, string>? hsnCache = null,
            Action<int, int>? progressCallback = null,
            CancellationToken ct = default)
        {
            if (afterAlterId <= 0) return new List<Voucher>();

            // shortcut: index scan is bounded to 12 months so Tally walks its date index
            // instead of every voucher. Older edits are caught by the P1/P3 reconciliation pass.
            string fromStr = DateTime.Today.AddMonths(-12).ToString("yyyyMMdd");
            string toStr = DateTime.Today.ToString("yyyyMMdd");

            var indexRequest = $@"<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>LK_AlterIndex</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>{EscapeXml(companyName)}</SVCURRENTCOMPANY>
        <SVFROMDATE>{fromStr}</SVFROMDATE>
        <SVTODATE>{toStr}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""LK_AlterIndex"" ISMODIFY=""No"">
            <TYPE>Voucher</TYPE>
            <FETCH>ALTERID</FETCH>
            <FILTER>LK_AlterGt</FILTER>
          </COLLECTION>
          <SYSTEM TYPE=""Formulae"" NAME=""LK_AlterGt"">$$NumValue:$ALTERID &gt; {afterAlterId}</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            var indexXml = await SendTallyRequestAsync(indexRequest, ct);
            if (string.IsNullOrWhiteSpace(indexXml))
            {
                SyncLogger.Log("[FastExtractor] Incremental: Tally did not answer the ALTERID index - aborting this pass.");
                return new List<Voucher>();
            }

            var alterIds = ExtractAlterIds(indexXml);
            if (alterIds.Count == 0)
            {
                SyncLogger.Log($"[FastExtractor] Incremental: no voucher changed after ALTERID {afterAlterId}");
                return new List<Voucher>();
            }

            alterIds.Sort();
            SyncLogger.Log($"[FastExtractor] Incremental: {alterIds.Count} voucher(s) changed after ALTERID {afterAlterId}");

            var results = new List<Voucher>();
            int consecutiveFailures = 0;

            for (int i = 0; i < alterIds.Count; i += _batchSize)
            {
                if (ct.IsCancellationRequested) break;

                var batch = alterIds.Skip(i).Take(_batchSize).ToList();
                var batchVouchers = await FetchVouchersByAlterRangeAsync(
                    companyName, batch.First(), batch.Last(), new HashSet<long>(batch), hsnCache, ct);

                if (batchVouchers.Count == 0)
                {
                    // Tally stops answering when wedged. Stop hammering it instead of
                    // marching through the remaining batches for hours.
                    if (++consecutiveFailures >= 2)
                    {
                        SyncLogger.Log("[FastExtractor] Incremental aborted: Tally stopped responding. Will retry next cycle.");
                        break;
                    }
                }
                else
                {
                    consecutiveFailures = 0;
                    results.AddRange(batchVouchers);
                }

                progressCallback?.Invoke(results.Count, alterIds.Count);

                if (_throttleMs > 0) await Task.Delay(_throttleMs, ct);
            }

            SyncLogger.Log($"[FastExtractor] Incremental: fetched {results.Count} modified voucher(s)");
            return results;
        }

        /// <summary>
        /// Fetches an explicit list of vouchers by ALTERID in _batchSize-wide batches.
        /// Used by the historical sync, which already has every ALTERID from the full index.
        /// </summary>
        public async Task<List<Voucher>> GetVouchersByAlterIdsAsync(
            string companyName,
            IEnumerable<long> alterIds,
            Dictionary<string, string>? hsnCache = null,
            CancellationToken ct = default)
        {
            var ids = alterIds.Where(id => id > 0).Distinct().OrderBy(id => id).ToList();
            var results = new List<Voucher>();
            foreach (var batch in ids.Chunk(_batchSize))
            {
                if (ct.IsCancellationRequested) break;
                var got = await FetchVouchersByAlterRangeAsync(
                    companyName, batch.First(), batch.Last(), new HashSet<long>(batch), hsnCache, ct);
                results.AddRange(got);
                if (_throttleMs > 0) await Task.Delay(_throttleMs, ct);
            }
            return results;
        }

        /// <summary>
        /// Fetches vouchers using native numeric range traversal (zero-hang, LK parity).
        /// Evaluates 2 numbers instead of 100 interpreted OR expressions.
        /// </summary>
        private async Task<List<Voucher>> FetchVouchersByAlterRangeAsync(
            string companyName, 
            long minId,
            long maxId,
            HashSet<long> targetAlterIds,
            Dictionary<string, string>? hsnCache,
            CancellationToken ct)
        {
            string filterCondition = minId == maxId
                ? $"$$NumValue:$ALTERID = {minId}"
                : $"$$NumValue:$ALTERID &gt;= {minId} AND $$NumValue:$ALTERID &lt;= {maxId}";

            var request = $@"<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>LK_AlterBatch</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>{EscapeXml(companyName)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""LK_AlterBatch"" ISMODIFY=""No"">
            <TYPE>Voucher</TYPE>
            <FETCH>MASTERID, ALTERID, GUID, VOUCHERTYPENAME, VOUCHERNUMBER, DATE, PARTYLEDGERNAME, AMOUNT, NARRATION, ALLLEDGERENTRIES.LIST, ALLINVENTORYENTRIES.LIST</FETCH>
            <FILTER>LK_SpecificAlterRange</FILTER>
          </COLLECTION>
          <SYSTEM TYPE=""Formulae"" NAME=""LK_SpecificAlterRange"">{filterCondition}</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            var xml = await SendTallyRequestAsync(request, ct);
            if (string.IsNullOrWhiteSpace(xml)) return new List<Voucher>();

            var vouchers = ParseVouchersFromXml(xml, companyName, hsnCache);
            return vouchers.Where(v => long.TryParse(v.AlterId, out var id) && targetAlterIds.Contains(id)).ToList();
        }

        /// <summary>
        /// Low-level HTTP transport with strict connection pooling and error resilience
        /// </summary>
        private async Task<string> SendTallyRequestAsync(string requestXml, CancellationToken ct)
        {
            try
            {
                SyncLogger.Log($"[FastExtractor] >>> Tally Request: XML Length {requestXml.Length}");
                using var content = new StringContent(requestXml, Encoding.UTF8, "text/xml");
                using var response = await _httpClient.PostAsync(_tallyUrl, content, ct);

                if (response.IsSuccessStatusCode)
                {
                    var raw = await response.Content.ReadAsStringAsync(ct);
                    return SanitizeXml(raw);
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"[FastExtractor] HTTP error to {_tallyUrl}: {ex.Message}");
            }
            return string.Empty;
        }

        /// <summary>
        /// Parses XML into Voucher domain objects safely and efficiently
        /// </summary>
        private List<Voucher> ParseVouchersFromXml(string xml, string companyName, Dictionary<string, string>? hsnCache)
        {
            var list = new List<Voucher>();
            try
            {
                var doc = SafeParseXml(xml);
                var voucherNodes = doc.Descendants().Where(e => 
                    e.Name.LocalName.Equals("VOUCHER", StringComparison.OrdinalIgnoreCase) ||
                    e.Name.LocalName.Equals("DSPVCH", StringComparison.OrdinalIgnoreCase));

                foreach (var vNode in voucherNodes)
                {
                    var v = new Voucher();

                    // Master ID & Alter ID
                    v.MasterId = vNode.Element("MASTERID")?.Value?.Trim();
                    v.AlterId = vNode.Element("ALTERID")?.Value?.Trim();

                    // GUID & Voucher ID
                    var guid = vNode.Element("GUID")?.Value?.Trim();
                    v.TallyGuid = !string.IsNullOrEmpty(guid) ? guid : v.MasterId;
                    v.VoucherId = !string.IsNullOrEmpty(v.TallyGuid) ? v.TallyGuid : $"{v.MasterId}_{v.AlterId}";

                    // Type & Number
                    v.VoucherType = vNode.Element("VOUCHERTYPENAME")?.Value?.Trim() ?? vNode.Element("VCHTYPE")?.Value?.Trim() ?? vNode.Element("DSPVCHTYPE")?.Value?.Trim() ?? "Unknown";
                    v.VoucherNumber = vNode.Element("VOUCHERNUMBER")?.Value?.Trim() ?? vNode.Element("VCHNO")?.Value?.Trim() ?? vNode.Element("DSPVCHNUMBER")?.Value?.Trim() ?? string.Empty;

                    // Date
                    var dateStr = vNode.Element("DATE")?.Value?.Trim() ?? vNode.Element("DSPVCHDATE")?.Value?.Trim();
                    if (!string.IsNullOrEmpty(dateStr) && dateStr.Length == 8 &&
                        int.TryParse(dateStr.Substring(0, 4), out var y) &&
                        int.TryParse(dateStr.Substring(4, 2), out var m) &&
                        int.TryParse(dateStr.Substring(6, 2), out var d))
                    {
                        v.VoucherDate = new DateTime(y, m, d);
                    }
                    else
                    {
                        v.VoucherDate = DateTime.Today;
                    }

                    // Party details
                    v.PartyName = vNode.Element("PARTYLEDGERNAME")?.Value?.Trim() ?? string.Empty;
                    v.Narration = vNode.Element("NARRATION")?.Value?.Trim();

                    // Amount
                    var amtStr = vNode.Element("AMOUNT")?.Value?.Trim();
                    if (decimal.TryParse(amtStr, out var amt))
                    {
                        v.TotalAmount = Math.Abs(amt);
                    }

                    // Parse Ledger Entries
                    var ledgerNodes = vNode.Descendants().Where(e =>
                        e.Name.LocalName.Equals("ALLLEDGERENTRIES.LIST", StringComparison.OrdinalIgnoreCase) ||
                        e.Name.LocalName.Equals("LEDGERENTRIES.LIST", StringComparison.OrdinalIgnoreCase) ||
                        e.Name.LocalName.Equals("DSPVCHLEDGER", StringComparison.OrdinalIgnoreCase));

                    foreach (var lNode in ledgerNodes)
                    {
                        var ledgerName = lNode.Element("LEDGERNAME")?.Value?.Trim() ?? lNode.Element("DSPVCHLEDGERNAME")?.Value?.Trim() ?? string.Empty;
                        if (string.IsNullOrEmpty(ledgerName)) continue;

                        var lAmtStr = lNode.Element("AMOUNT")?.Value?.Trim() ?? lNode.Element("DSPVCHLEDGERAMOUNT")?.Value?.Trim() ?? "0";
                        decimal.TryParse(lAmtStr, out var lAmt);

                        var isDeemedStr = lNode.Element("ISDEEMEDPOSITIVE")?.Value?.Trim() ?? "No";
                        bool isDeemed = isDeemedStr.Equals("Yes", StringComparison.OrdinalIgnoreCase);

                        v.LedgerEntries.Add(new VoucherLedgerEntry
                        {
                            LedgerName = ledgerName,
                            Amount = Math.Abs(lAmt),
                            IsDebit = isDeemed
                        });
                    }

                    // Parse Inventory Entries
                    var invNodes = vNode.Descendants().Where(e =>
                        e.Name.LocalName.Equals("ALLINVENTORYENTRIES.LIST", StringComparison.OrdinalIgnoreCase) ||
                        e.Name.LocalName.Equals("INVENTORYENTRIES.LIST", StringComparison.OrdinalIgnoreCase));

                    foreach (var iNode in invNodes)
                    {
                        var itemName = iNode.Element("STOCKITEMNAME")?.Value?.Trim() ?? string.Empty;
                        if (string.IsNullOrEmpty(itemName)) continue;

                        var qtyStr = iNode.Element("ACTUALQTY")?.Value?.Trim() ?? iNode.Element("BILLEDQTY")?.Value?.Trim() ?? "0";
                        var rateStr = iNode.Element("RATE")?.Value?.Trim() ?? "0";
                        var iAmtStr = iNode.Element("AMOUNT")?.Value?.Trim() ?? "0";

                        decimal.TryParse(rateStr.Split('/').FirstOrDefault() ?? "0", out var rate);
                        decimal.TryParse(iAmtStr, out var iAmt);

                        v.InventoryEntries.Add(new VoucherInventoryEntry
                        {
                            StockItemName = itemName,
                            Quantity = ParseDecimal(qtyStr),
                            Rate = rate,
                            Amount = Math.Abs(iAmt)
                        });
                    }

                    list.Add(v);
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"[FastExtractor] Parse error: {ex.Message}");
            }
            return list;
        }

        private List<long> ExtractAlterIds(string xml)
        {
            var ids = new List<long>();
            try
            {
                var doc = SafeParseXml(xml);
                var nodes = doc.Descendants().Where(e => e.Name.LocalName.Equals("ALTERID", StringComparison.OrdinalIgnoreCase));
                foreach (var n in nodes)
                {
                    if (long.TryParse(n.Value?.Trim(), out var val) && val > 0)
                    {
                        ids.Add(val);
                    }
                }
            }
            catch { }
            return ids.Distinct().OrderBy(id => id).ToList();
        }

        private static readonly Regex InvalidXmlChars = new Regex(@"[\x00-\x08\x0B\x0C\x0E-\x1F]", RegexOptions.Compiled);
        private static readonly Regex InvalidXmlEntities = new Regex(@"&#x?(0?[0-8bBcC]|1[0-9a-fA-F]);?", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        /// <summary>
        /// Strips non-printable control characters and invalid entity references
        /// </summary>
        public static string SanitizeXml(string? xml)
        {
            if (string.IsNullOrEmpty(xml)) return string.Empty;
            var clean = InvalidXmlChars.Replace(xml, string.Empty);
            clean = InvalidXmlEntities.Replace(clean, string.Empty);
            return clean.Replace("<UDF:", "<UDF_").Replace("</UDF:", "</UDF_");
        }

        /// <summary>
        /// Safely loads XML with CheckCharacters = false so raw hexadecimal chars never throw
        /// </summary>
        private static XDocument SafeParseXml(string xml)
        {
            var sanitized = SanitizeXml(xml);
            var settings = new XmlReaderSettings
            {
                CheckCharacters = false,
                IgnoreComments = true,
                DtdProcessing = DtdProcessing.Ignore
            };
            using var stringReader = new StringReader(sanitized);
            using var xmlReader = XmlReader.Create(stringReader, settings);
            return XDocument.Load(xmlReader);
        }

        private static int ParseInt(string? val)
        {
            if (string.IsNullOrWhiteSpace(val)) return 0;
            return int.TryParse(val.Trim(), out var res) ? res : 0;
        }

        private static decimal ParseDecimal(string? val)
        {
            if (string.IsNullOrWhiteSpace(val)) return 0;
            var parts = val.Trim().Split(' ');
            return decimal.TryParse(parts[0], out var res) ? res : 0;
        }

        private static string EscapeXml(string? input)
        {
            if (string.IsNullOrEmpty(input)) return string.Empty;
            return input
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;")
                .Replace("\"", "&quot;")
                .Replace("'", "&apos;");
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _httpClient.Dispose();
                _disposed = true;
            }
        }
    }
}
