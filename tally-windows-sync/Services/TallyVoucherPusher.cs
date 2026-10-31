using System.Net.Http;
using System.Text;
using System.Xml.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Two-Way Sync: Pushes pending transactions from Cloud to Tally
    /// Creates vouchers in Tally from transactions created on Phone/Web
    /// </summary>
    public class TallyVoucherPusher
    {
        private readonly TallyConnector _tallyConnector;
        private readonly ApiClient _apiClient;
        private readonly string _tallyUrl;
        private readonly HttpClient _httpClient;

        public TallyVoucherPusher(TallyConnector tallyConnector, ApiClient apiClient, string tallyUrl = "http://localhost:9000")
        {
            _tallyConnector = tallyConnector;
            _apiClient = apiClient;
            _tallyUrl = tallyUrl;
            _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        }

        /// <summary>Per-company masters cache: ledgers + stock item units, refreshed every 30 min.</summary>
        private sealed class CompanyContext
        {
            public List<Ledger> Ledgers = new();
            public DateTime LedgersAt = DateTime.MinValue;
            public Dictionary<string, string> StockUnits = new(StringComparer.OrdinalIgnoreCase);
            public Dictionary<string, decimal> StockGstRates = new(StringComparer.OrdinalIgnoreCase);
            public DateTime UnitsAt = DateTime.MinValue;
        }

        private readonly Dictionary<string, CompanyContext> _companyCache = new(StringComparer.OrdinalIgnoreCase);
        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(30);

        private async Task<CompanyContext> GetContextAsync(string companyName)
        {
            if (!_companyCache.TryGetValue(companyName, out var ctx))
            {
                ctx = new CompanyContext();
                _companyCache[companyName] = ctx;
            }

            if ((DateTime.UtcNow - ctx.LedgersAt) > CacheTtl)
            {
                try
                {
                    ctx.Ledgers = await _tallyConnector.GetLedgersAsync(companyName) ?? new List<Ledger>();
                    ctx.LedgersAt = DateTime.UtcNow;
                }
                catch (Exception ex)
                {
                    SyncLogger.Log($"⚠️ Ledger fetch failed for {companyName}: {ex.Message}");
                }
            }

            if ((DateTime.UtcNow - ctx.UnitsAt) > CacheTtl)
            {
                try
                {
                    var items = await _tallyConnector.GetStockItemsAsync(companyName) ?? new List<StockItem>();
                    ctx.StockUnits = items
                        .Where(i => !string.IsNullOrWhiteSpace(i.Name) && !string.IsNullOrWhiteSpace(i.BaseUnit))
                        .GroupBy(i => i.Name!.Trim(), StringComparer.OrdinalIgnoreCase)
                        .ToDictionary(g => g.Key, g => g.First().BaseUnit!.Trim(), StringComparer.OrdinalIgnoreCase);

                    // Only items with GST details in the master — their rate (even 0 = exempt) wins
                    // over whatever the web form sent.
                    ctx.StockGstRates = items
                        .Where(i => i.GstApplicable && !string.IsNullOrWhiteSpace(i.Name))
                        .GroupBy(i => i.Name!.Trim(), StringComparer.OrdinalIgnoreCase)
                        .ToDictionary(g => g.Key, g => g.First().GstRate, StringComparer.OrdinalIgnoreCase);
                    ctx.UnitsAt = DateTime.UtcNow;
                }
                catch (Exception ex)
                {
                    SyncLogger.Log($"⚠️ Stock unit fetch failed for {companyName}: {ex.Message}");
                }
            }

            return ctx;
        }

        /// <summary>
        /// Pick a real ledger from the company. Exact preferred name wins; otherwise the first
        /// ledger in the group whose name contains every mustContain and none of mustNotContain.
        /// </summary>
        private static string? FindLedger(CompanyContext ctx, string? preferred, string? group,
            string[]? mustContain = null, string[]? mustNotContain = null)
        {
            if (!string.IsNullOrWhiteSpace(preferred))
            {
                var exact = ctx.Ledgers.FirstOrDefault(l =>
                    string.Equals(l.Name?.Trim(), preferred.Trim(), StringComparison.OrdinalIgnoreCase));
                if (exact != null) return exact.Name!.Trim();
            }

            var candidates = ctx.Ledgers.Where(l => !string.IsNullOrWhiteSpace(l.Name)).ToList();
            if (!string.IsNullOrWhiteSpace(group))
            {
                var inGroup = candidates
                    .Where(l => string.Equals(l.ParentGroup?.Trim(), group, StringComparison.OrdinalIgnoreCase))
                    .ToList();
                if (inGroup.Count > 0) candidates = inGroup;
                else if (mustContain == null) return null; // group missing — never guess an unrelated ledger
            }

            if (mustContain != null)
            {
                candidates = candidates
                    .Where(l => mustContain.All(k => l.Name!.IndexOf(k, StringComparison.OrdinalIgnoreCase) >= 0))
                    .ToList();
            }

            if (mustNotContain != null)
            {
                candidates = candidates
                    .Where(l => mustNotContain.All(k => l.Name!.IndexOf(k, StringComparison.OrdinalIgnoreCase) < 0))
                    .ToList();
            }

            return candidates.OrderBy(l => l.Name!.Length).FirstOrDefault()?.Name?.Trim();
        }

        /// <summary>
        /// Unit for a stock line. "PC"/"Nos" are never sent — company units are often pcs/SS/THR,
        /// and a unit that does not exist in Tally rejects the whole voucher.
        /// </summary>
        private static string ResolveUnit(CompanyContext ctx, string itemName, string? provided)
        {
            if (IsUsableUnit(provided)) return provided!.Trim();
            return ctx.StockUnits.TryGetValue(itemName.Trim(), out var masterUnit) && IsUsableUnit(masterUnit) ? masterUnit : "";
        }

        private static bool IsUsableUnit(string? unit)
        {
            if (string.IsNullOrWhiteSpace(unit)) return false;
            var u = unit.Trim();
            return !u.Equals("Nos", StringComparison.OrdinalIgnoreCase)
                && !u.Equals("PC", StringComparison.OrdinalIgnoreCase)
                && u.IndexOf("Not Applicable", StringComparison.OrdinalIgnoreCase) < 0
                && u.IndexOf("&#4;", StringComparison.OrdinalIgnoreCase) < 0;
        }

        private static string Qty(decimal qty, string unit) => string.IsNullOrEmpty(unit) ? $" {qty}" : $" {qty} {unit}";
        private static string Rate(decimal rate, string unit) => string.IsNullOrEmpty(unit) ? $"{rate}" : $"{rate}/{unit}";

        /// <summary>
        /// Stable Tally identity for a pending transaction, so a retry alters the same voucher
        /// instead of creating a duplicate (same idea as LiveKeeping's Vouchers.guid).
        /// </summary>
        private static string ResolveVoucherGuid(PendingTransaction transaction)
        {
            if (Guid.TryParse(transaction.Id, out _)) return transaction.Id;
            SyncLogger.Log($"⚠️ Pending transaction id '{transaction.Id}' is not a GUID — using a random identity (retry may duplicate).");
            return Guid.NewGuid().ToString();
        }

        /// <summary>
        /// Party ledger must exist in Tally before the voucher can reference it. Creates it under
        /// Sundry Debtors / Creditors; never alters an existing ledger.
        /// </summary>
        private async Task<string> EnsurePartyLedgerAsync(string companyName, CompanyContext ctx, string partyName, string parentGroup)
        {
            if (string.IsNullOrWhiteSpace(partyName)) return partyName;

            var existing = ctx.Ledgers.FirstOrDefault(l =>
                string.Equals(l.Name?.Trim(), partyName.Trim(), StringComparison.OrdinalIgnoreCase));
            if (existing != null) return existing.Name!.Trim();

            // Ledger list unavailable — let Tally report the missing ledger instead of guessing.
            if (ctx.Ledgers.Count == 0) return partyName;

            var xml = $@"<?xml version=""1.0"" encoding=""utf-8""?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES><SVCURRENTCOMPANY>{EscapeXml(companyName)}</SVCURRENTCOMPANY></STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF=""TallyUDF"">
          <LEDGER NAME=""{EscapeXml(partyName)}"" ACTION=""Create"">
            <PARENT>{EscapeXml(parentGroup)}</PARENT>
            <ISBILLWISEON>Yes</ISBILLWISEON>
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>";

            var (doc, _, error) = await PostXmlToTallyAsync(xml);
            var created = doc?.Descendants("CREATED").FirstOrDefault()?.Value;

            if (string.IsNullOrEmpty(error) && created == "1")
            {
                ctx.Ledgers.Add(new Ledger { Name = partyName.Trim(), ParentGroup = parentGroup });
                SyncLogger.Log($"➕ Created ledger '{partyName}' under {parentGroup}");
            }
            else
            {
                SyncLogger.Log($"⚠️ Could not create ledger '{partyName}': {error ?? $"created={created}"}");
            }

            return partyName.Trim();
        }

        /// <summary>
        /// Process all pending transactions for a company
        /// </summary>
        public async Task<(int synced, int failed)> ProcessPendingTransactionsAsync(string companyId, string companyName)
        {
            int synced = 0;
            int failed = 0;

            try
            {
                SyncLogger.Log($"🔄 Checking pending transactions for {companyName}...");
                
                var pendingTransactions = await _apiClient.GetPendingTransactionsAsync(companyId);
                
                if (pendingTransactions.Count == 0)
                {
                    SyncLogger.Log("✅ No pending transactions to sync.");
                    return (0, 0);
                }

                SyncLogger.Log($"📦 Found {pendingTransactions.Count} pending transactions to push to Tally");

                // Masters are fetched once per cycle; generators resolve real ledger/unit names from it.
                var context = await GetContextAsync(companyName);

                foreach (var transaction in pendingTransactions)
                {
                    try
                    {
                        // Update status to processing
                        if (!await _apiClient.TryClaimPendingTransactionAsync(companyId, transaction.Id))
                        {
                            SyncLogger.Log($"⚠️ Pending transaction {transaction.Id} was not claimed; import skipped.");
                            continue;
                        }

                        // Generate Tally XML
                        var (tallyXml, generateError) = await GenerateTallyVoucherXmlAsync(transaction, companyName, context);
                        
                        if (string.IsNullOrEmpty(tallyXml))
                        {
                            await _apiClient.UpdatePendingTransactionStatusAsync(
                                transaction.Id, "failed", null,
                                generateError ?? "Unsupported voucher type or edit; no voucher was sent to Tally. Verify the entry before retrying.");
                            failed++;
                            continue;
                        }

                        // Push to Tally
                        var (success, voucherNumber, errorMessage) = await PushVoucherToTallyAsync(tallyXml);

                        if (success)
                        {
                            await _apiClient.UpdatePendingTransactionStatusAsync(
                                transaction.Id, "synced", voucherNumber);
                            SyncLogger.Log($"✅ Transaction synced: {transaction.TransactionType} → Tally #{voucherNumber}");
                            synced++;
                        }
                        else
                        {
                            transaction.RetryCount++;
                            // A failed/timeout response may still mean Tally imported the voucher.
                            // Never retry automatically until an operator has checked Tally.
                            var status = "failed";
                            await _apiClient.UpdatePendingTransactionStatusAsync(
                                transaction.Id, status, null, errorMessage, transaction.RetryCount);
                            SyncLogger.Log($"❌ Failed to push transaction: {errorMessage}");
                            failed++;
                        }

                        // Small delay between transactions
                        await Task.Delay(500);
                    }
                    catch (Exception ex)
                    {
                        await _apiClient.UpdatePendingTransactionStatusAsync(
                            transaction.Id, "failed", null, ex.Message);
                        failed++;
                    }
                }

                SyncLogger.Log($"📊 Push complete: {synced} synced, {failed} failed");
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ ProcessPendingTransactionsAsync error: {ex.Message}");
            }

            return (synced, failed);
        }

        /// <summary>
        /// Post an XML request to Tally and return the parsed response plus any LINEERROR.
        /// </summary>
        private async Task<(XDocument? Doc, string? Body, string? Error)> PostXmlToTallyAsync(string xmlRequest)
        {
            try
            {
                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30)))
                {
                    var content = new StringContent(xmlRequest, Encoding.UTF8, "text/xml");
                    var response = await _httpClient.PostAsync(_tallyUrl, content, cts.Token);

                    if (!response.IsSuccessStatusCode)
                    {
                        return (null, null, $"Tally HTTP Error: {response.StatusCode}");
                    }

                    var body = await response.Content.ReadAsStringAsync();
                    var doc = XDocument.Parse(body);

                    var error = doc.Descendants("LINEERROR").FirstOrDefault()?.Value ??
                               doc.Descendants("ERROR").FirstOrDefault()?.Value;

                    return (doc, body, string.IsNullOrEmpty(error) ? null : error);
                }
            }
            catch (TaskCanceledException)
            {
                return (null, null, "Tally request timeout");
            }
            catch (Exception ex)
            {
                return (null, null, $"Error: {ex.Message}");
            }
        }

        /// <summary>
        /// Push a voucher XML to Tally and return the result
        /// </summary>
        private async Task<(bool success, string? voucherNumber, string? error)> PushVoucherToTallyAsync(string xmlRequest)
        {
            try
            {
                SyncLogger.Log($">>> Pushing voucher to Tally...");
                SyncLogger.SaveFile("last_push_request.xml", xmlRequest);

                var (doc, body, error) = await PostXmlToTallyAsync(xmlRequest);

                if (doc == null)
                {
                    return (false, null, error);
                }

                if (body != null) SyncLogger.SaveFile("last_push_response.xml", body);

                // Check for errors in response
                if (!string.IsNullOrEmpty(error))
                {
                    // Educational-mode Tally rejects mid-month imports with this misleading
                    // "date missing" LINEERROR even when DATE is correct and present.
                    if (error.Contains("Voucher date is missing", StringComparison.OrdinalIgnoreCase))
                    {
                        return (false, null,
                            "Tally EDUCATIONAL MODE: import sirf 1st / 2nd / last day of month ko allow karta hai. " +
                            "Tally me license karo, ya dashboard order ki date month ke 1/2/last day pe rakho. " +
                            $"(Tally Error: {error})");
                    }
                    return (false, null, $"Tally Error: {error}");
                }

                // Check for success indicators — Tally returns LASTVCHID "0" even on
                // rejection, so it must never be treated as proof of success.
                var created = doc.Descendants("CREATED").FirstOrDefault()?.Value;
                var altered = doc.Descendants("ALTERED").FirstOrDefault()?.Value;

                if (created == "1" || altered == "1")
                {
                    var voucherNumber = doc.Descendants("LASTVCHID").FirstOrDefault()?.Value;
                    return (true, string.IsNullOrWhiteSpace(voucherNumber) || voucherNumber == "0" ? "OK" : voucherNumber, null);
                }

                var exceptions = doc.Descendants("EXCEPTIONS").FirstOrDefault()?.Value ?? "0";
                return (false, null, $"Tally import rejected the voucher (exceptions={exceptions})");
            }
            catch (Exception ex)
            {
                return (false, null, $"Error: {ex.Message}");
            }
        }

        /// <summary>
        /// Generate Tally-compatible XML for a voucher
        /// </summary>
        private async Task<(string Xml, string? Error)> GenerateTallyVoucherXmlAsync(
            PendingTransaction transaction, string companyName, CompanyContext ctx)
        {
            try
            {
                var voucherData = transaction.VoucherData as JObject ?? JObject.Parse(transaction.VoucherData?.ToString() ?? "{}");
                if (string.Equals(transaction.TransactionType, "VOUCHER_EDIT", StringComparison.OrdinalIgnoreCase) || voucherData.Value<bool?>("is_modification") == true)
                {
                    SyncLogger.Log("⚠️ Voucher modification is not imported until an existing Tally identity can be verified.");
                    return ("", "Voucher edit is not supported yet; create the voucher again instead.");
                }
                
                // Log raw data for debugging
                SyncLogger.Log($">>> GenerateTallyVoucherXml for ID={transaction.Id}, Type={transaction.TransactionType}");
                SyncLogger.Log($"    Company: {companyName}");
                
                // Normalize voucher type - database may store table names like "VOUCHERS"
                var rawType = transaction.TransactionType?.Trim().ToUpper() ?? "";
                
                // Try to get actual type from voucher data first
                var typeFromData = voucherData["voucher_type_name"]?.ToString() ??
                                   voucherData["voucher_type"]?.ToString() ??
                                   voucherData["type"]?.ToString();
                
                if (!string.IsNullOrEmpty(typeFromData))
                {
                    rawType = typeFromData.Trim().ToUpper();
                }
                
                var voucherDate = DateTime.Parse(voucherData["voucher_date"]?.ToString() ?? DateTime.Now.ToString("yyyy-MM-dd"));
                var partyName = voucherData["party_name"]?.ToString() ?? "";
                var narration = voucherData["narration"]?.ToString() ?? "";
                var guid = ResolveVoucherGuid(transaction);

                SyncLogger.Log($"    Resolved Type: {rawType}, Party: {partyName}, Date: {voucherDate:yyyy-MM-dd}");

                // Build the XML based on normalized voucher type
                switch (rawType)
                {
                    case "SALES":
                    case "SALE":
                    case "SALES INVOICE":
                    {
                        var salesLedger = FindLedger(ctx, voucherData["sales_ledger"]?.ToString(), "Sales Accounts");
                        if (salesLedger == null)
                            return ("", "Tally me 'Sales Accounts' group me koi ledger nahi mila. Pehle Tally me sales ledger banao.");
                        var party = await EnsurePartyLedgerAsync(companyName, ctx, partyName, "Sundry Debtors");
                        return GenerateSalesVoucherXml(companyName, voucherData, voucherDate, party, narration, salesLedger, ctx, guid);
                    }
                    case "PURCHASE":
                    case "PURCHASES":
                    case "PURCHASE INVOICE":
                    {
                        var purchaseLedger = FindLedger(ctx, voucherData["purchase_ledger"]?.ToString(), "Purchase Accounts");
                        if (purchaseLedger == null)
                            return ("", "Tally me 'Purchase Accounts' group me koi ledger nahi mila. Pehle Tally me purchase ledger banao.");
                        var party = await EnsurePartyLedgerAsync(companyName, ctx, partyName, "Sundry Creditors");
                        return GeneratePurchaseVoucherXml(companyName, voucherData, voucherDate, party, narration, purchaseLedger, ctx, guid);
                    }
                    case "CREDIT NOTE":
                    case "CREDITNOTE":
                    case "CREDIT MEMO":
                    {
                        var salesLedger = FindLedger(ctx, voucherData["sales_ledger"]?.ToString(), "Sales Accounts");
                        if (salesLedger == null)
                            return ("", "Tally me 'Sales Accounts' group me koi ledger nahi mila. Pehle Tally me sales ledger banao.");
                        var party = await EnsurePartyLedgerAsync(companyName, ctx, partyName, "Sundry Debtors");
                        return GenerateCreditNoteVoucherXml(companyName, voucherData, voucherDate, party, narration, salesLedger, ctx, guid);
                    }
                    case "DEBIT NOTE":
                    case "DEBITNOTE":
                    case "DEBIT MEMO":
                    {
                        var purchaseLedger = FindLedger(ctx, voucherData["purchase_ledger"]?.ToString(), "Purchase Accounts");
                        if (purchaseLedger == null)
                            return ("", "Tally me 'Purchase Accounts' group me koi ledger nahi mila. Pehle Tally me purchase ledger banao.");
                        var party = await EnsurePartyLedgerAsync(companyName, ctx, partyName, "Sundry Creditors");
                        return GenerateDebitNoteVoucherXml(companyName, voucherData, voucherDate, party, narration, purchaseLedger, ctx, guid);
                    }
                    case "RECEIPT":
                    case "RECEIPTS":
                    {
                        var cashBank = ResolveCashBankLedger(ctx, voucherData);
                        var party = await EnsurePartyLedgerAsync(companyName, ctx, partyName, "Sundry Debtors");
                        return GenerateMoneyVoucherXml(companyName, "Receipt", voucherData, voucherDate, party, narration, cashBank, ctx, guid);
                    }
                    case "PAYMENT":
                    case "PAYMENTS":
                    {
                        var cashBank = ResolveCashBankLedger(ctx, voucherData);
                        var party = await EnsurePartyLedgerAsync(companyName, ctx, partyName, "Sundry Creditors");
                        return GenerateMoneyVoucherXml(companyName, "Payment", voucherData, voucherDate, party, narration, cashBank, ctx, guid);
                    }
                    case "CONTRA":
                    {
                        var party = await EnsurePartyLedgerAsync(companyName, ctx, partyName, "Sundry Debtors");
                        return GenerateContraVoucherXml(companyName, voucherData, voucherDate, narration, party, ctx, guid);
                    }
                    case "JOURNAL":
                    case "JOURNALS":
                        return GenerateJournalVoucherXml(companyName, voucherData, voucherDate, narration, ctx, guid);
                    case "VOUCHERS":
                    case "TRANSACTION":
                    case "ENTRY":
                        // Generic type - try to infer from data
                        if (voucherData["items"] != null || voucherData["stock_entries"] != null)
                        {
                            var salesLedger = FindLedger(ctx, voucherData["sales_ledger"]?.ToString(), "Sales Accounts");
                            if (salesLedger == null)
                                return ("", "Tally me 'Sales Accounts' group me koi ledger nahi mila. Pehle Tally me sales ledger banao.");
                            var party = await EnsurePartyLedgerAsync(companyName, ctx, partyName, "Sundry Debtors");
                            return GenerateSalesVoucherXml(companyName, voucherData, voucherDate, party, narration, salesLedger, ctx, guid);
                        }
                        else if (voucherData["cash_bank_ledger"] != null)
                        {
                            var cashBank = ResolveCashBankLedger(ctx, voucherData);
                            var party = await EnsurePartyLedgerAsync(companyName, ctx, partyName, "Sundry Debtors");
                            return GenerateMoneyVoucherXml(companyName, "Receipt", voucherData, voucherDate, party, narration, cashBank, ctx, guid);
                        }
                        else
                        {
                            SyncLogger.Log("⚠️ Cannot infer voucher type safely; import skipped.");
                            return ("", "Voucher type infer nahi ho paya; Tally me kuch nahi bheja gaya.");
                        }
                    default:
                        SyncLogger.Log($"⚠️ Unsupported voucher type: {transaction.TransactionType}; import skipped.");
                        return ("", $"Voucher type '{transaction.TransactionType}' Tally push ke liye supported nahi hai.");
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ GenerateTallyVoucherXml error: {ex.Message}");
                return ("", $"Voucher XML banate waqt error: {ex.Message}");
            }
        }

        /// <summary>Cash-in-Hand / Bank Accounts ledger for money vouchers.</summary>
        private static string? ResolveCashBankLedger(CompanyContext ctx, JObject data)
        {
            var exact = FindLedgerExact(ctx, data["cash_bank_ledger"]?.ToString());
            if (exact != null) return exact;

            return FindLedger(ctx, null, "Cash-in-Hand", new[] { "Cash" })
                ?? FindLedger(ctx, null, "Bank Accounts", new[] { "Bank" });
        }

        private static string? FindLedgerExact(CompanyContext ctx, string? name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            return ctx.Ledgers
                .FirstOrDefault(l => string.Equals(l.Name?.Trim(), name.Trim(), StringComparison.OrdinalIgnoreCase))
                ?.Name?.Trim();
        }

        // ---------------------------------------------------------------- envelope helpers

        private static void AppendEnvelopeStart(StringBuilder xml, string companyName, string voucherType, string? objView, string guid)
        {
            xml.AppendLine("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
            xml.AppendLine("<ENVELOPE>");
            xml.AppendLine("  <HEADER>");
            xml.AppendLine("    <TALLYREQUEST>Import Data</TALLYREQUEST>");
            xml.AppendLine("  </HEADER>");
            xml.AppendLine("  <BODY>");
            xml.AppendLine("    <IMPORTDATA>");
            xml.AppendLine("      <REQUESTDESC>");
            xml.AppendLine("        <REPORTNAME>Vouchers</REPORTNAME>");
            xml.AppendLine("        <STATICVARIABLES>");
            xml.AppendLine($"          <SVCURRENTCOMPANY>{EscapeXml(companyName)}</SVCURRENTCOMPANY>");
            xml.AppendLine("        </STATICVARIABLES>");
            xml.AppendLine("      </REQUESTDESC>");
            xml.AppendLine("      <REQUESTDATA>");
            xml.AppendLine("        <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
            var view = string.IsNullOrEmpty(objView) ? "" : $" OBJVIEW=\"{objView}\"";
            xml.AppendLine($"          <VOUCHER VCHTYPE=\"{EscapeXml(voucherType)}\" ACTION=\"Create\" REMOTEID=\"{EscapeXml(guid)}\"{view}>");
        }

        private static void AppendEnvelopeEnd(StringBuilder xml)
        {
            xml.AppendLine("          </VOUCHER>");
            xml.AppendLine("        </TALLYMESSAGE>");
            xml.AppendLine("      </REQUESTDATA>");
            xml.AppendLine("    </IMPORTDATA>");
            xml.AppendLine("  </BODY>");
            xml.AppendLine("</ENVELOPE>");
        }

        /// <summary>Identity block Tally needs to recognise a re-push as the same voucher.</summary>
        private static void AppendIdentity(StringBuilder xml, string guid, string voucherType, string? voucherNumber)
        {
            // Web sends "MOBILE-<ts>" style numbers; Tally only accepts numeric here.
            if (!string.IsNullOrWhiteSpace(voucherNumber) && voucherNumber.Trim().All(char.IsDigit))
            {
                xml.AppendLine($"            <VOUCHERNUMBER>{EscapeXml(voucherNumber.Trim())}</VOUCHERNUMBER>");
            }
            xml.AppendLine("            <NUMBERINGSTYLE>Auto Retain</NUMBERINGSTYLE>");
            xml.AppendLine($"            <GUID>{guid}</GUID>");
            xml.AppendLine($"            <VCHSTATUSVOUCHERTYPE>{EscapeXml(voucherType)}</VCHSTATUSVOUCHERTYPE>");
        }

        // ---------------------------------------------------------------- generators

        /// <summary>
        /// Generate Sales Voucher XML
        /// </summary>
        private (string Xml, string? Error) GenerateSalesVoucherXml(string companyName, JObject data, DateTime date,
            string partyName, string narration, string salesLedger, CompanyContext ctx, string guid)
        {
            var items = data["items"] as JArray ?? data["stock_entries"] as JArray ?? new JArray();
            var totalAmount = data["total_amount"]?.Value<decimal>() ?? 0;
            var cgst = data["cgst_amount"]?.Value<decimal>() ?? 0;
            var sgst = data["sgst_amount"]?.Value<decimal>() ?? 0;
            var igst = data["igst_amount"]?.Value<decimal>() ?? 0;
            var roundOff = data["round_off"]?.Value<decimal>() ?? data["roundUpAmount"]?.Value<decimal>() ?? 0;
            var billDiscount = data["discount_amount"]?.Value<decimal>() ?? data["discountAmount"]?.Value<decimal>() ?? 0;
            var grandTotal = data["grand_total"]?.Value<decimal>() ?? totalAmount + cgst + sgst + igst + roundOff - billDiscount;

            // Fallback for party name: In Tally, default cash ledger is "Cash", not "Cash Customer"
            if (string.IsNullOrWhiteSpace(partyName) || partyName.Equals("Cash Customer", StringComparison.OrdinalIgnoreCase))
            {
                partyName = "Cash";
            }

            SyncLogger.Log($">>> Generating Sales XML:");
            SyncLogger.Log($"    Party: {partyName}, Date: {date:yyyyMMdd}, Total: {totalAmount}, GrandTotal: {grandTotal}");
            SyncLogger.Log($"    Items count: {items.Count}, CGST: {cgst}, SGST: {sgst}, IGST: {igst}, Discount: {billDiscount}");

            // Also check for alternative field names used by web dashboard
            if (cgst == 0 && sgst == 0 && igst == 0)
            {
                // Try alternative field names used by some frontends
                var totalCgst = data["totalCgst"]?.Value<decimal>() ?? 0;
                var totalSgst = data["totalSgst"]?.Value<decimal>() ?? 0;
                var totalIgst = data["totalIgst"]?.Value<decimal>() ?? 0;
                if (totalCgst > 0 || totalSgst > 0 || totalIgst > 0)
                {
                    SyncLogger.Log($"    Found alternative GST field names: CGST={totalCgst}, SGST={totalSgst}, IGST={totalIgst}");
                    cgst = totalCgst;
                    sgst = totalSgst;
                    igst = totalIgst;
                }
                else
                {
                    // Create-voucher payload only carries a single gst_amount — assume intra-state split
                    var gstAmount = data["gst_amount"]?.Value<decimal>() ?? 0;
                    if (gstAmount > 0)
                    {
                        cgst = Math.Round(gstAmount / 2, 2);
                        sgst = gstAmount - cgst;
                        SyncLogger.Log($"    GST amount {gstAmount} split evenly CGST={cgst} / SGST={sgst}");
                    }
                }
            }

            // Recalculate grandTotal if it's zero and we have components
            if (grandTotal == 0)
            {
                var subtotal = data["subtotal"]?.Value<decimal>() ?? data["taxable_amount"]?.Value<decimal>() ?? 0;
                if (subtotal > 0)
                    totalAmount = subtotal;
                grandTotal = totalAmount + cgst + sgst + igst + roundOff - billDiscount;
                SyncLogger.Log($"    Recalculated grandTotal: {grandTotal} (subtotal={totalAmount}, tax={cgst + sgst + igst}, discount={billDiscount})");
            }

            var voucherNumber = data["voucher_number"]?.ToString() ?? data["invoiceNumber"]?.ToString() ?? "";
            var state = data["state"]?.ToString() ?? data["place_of_supply"]?.ToString() ?? "Rajasthan";
            var country = data["country"]?.ToString() ?? "India";
            var placeOfSupply = data["place_of_supply"]?.ToString() ?? state;
            var gstRegType = data["gst_registration_type"]?.ToString() ?? "Regular";

            var gstError = ValidateItemGst(ctx, items, cgst, sgst, igst);
            if (gstError != null) return ("", gstError);

            var tax = ResolveTaxLedgers(ctx, data, isInput: false, cgst, sgst, igst);
            if (tax.Error != null) return ("", tax.Error);

            var xml = new StringBuilder();
            AppendEnvelopeStart(xml, companyName, "Sales", "Invoice Voucher View", guid);
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine($"            <VCHSTATUSDATE>{date:yyyyMMdd}</VCHSTATUSDATE>");
            xml.AppendLine($"            <GSTREGISTRATIONTYPE>{EscapeXml(gstRegType)}</GSTREGISTRATIONTYPE>");
            xml.AppendLine("            <VATDEALERTYPE>Regular</VATDEALERTYPE>");
            xml.AppendLine($"            <STATENAME>{EscapeXml(state)}</STATENAME>");
            xml.AppendLine($"            <COUNTRYOFRESIDENCE>{EscapeXml(country)}</COUNTRYOFRESIDENCE>");
            xml.AppendLine($"            <PLACEOFSUPPLY>{EscapeXml(placeOfSupply)}</PLACEOFSUPPLY>");
            xml.AppendLine("            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>");
            xml.AppendLine($"            <PARTYNAME>{EscapeXml(partyName)}</PARTYNAME>");
            xml.AppendLine($"            <PARTYLEDGERNAME>{EscapeXml(partyName)}</PARTYLEDGERNAME>");
            AppendIdentity(xml, guid, "Sales", voucherNumber);
            xml.AppendLine($"            <BASICBUYERNAME>{EscapeXml(partyName)}</BASICBUYERNAME>");
            xml.AppendLine($"            <PARTYMAILINGNAME>{EscapeXml(partyName)}</PARTYMAILINGNAME>");
            xml.AppendLine($"            <CONSIGNEEMAILINGNAME>{EscapeXml(partyName)}</CONSIGNEEMAILINGNAME>");
            xml.AppendLine($"            <CONSIGNEESTATENAME>{EscapeXml(state)}</CONSIGNEESTATENAME>");
            xml.AppendLine($"            <CMPGSTSTATE>{EscapeXml(state)}</CMPGSTSTATE>");
            xml.AppendLine($"            <CONSIGNEECOUNTRYNAME>{EscapeXml(country)}</CONSIGNEECOUNTRYNAME>");
            xml.AppendLine($"            <BASICBASEPARTYNAME>{EscapeXml(partyName)}</BASICBASEPARTYNAME>");
            if (!string.IsNullOrWhiteSpace(narration))
            {
                xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");
            }
            xml.AppendLine("            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>");
            xml.AppendLine("            <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>");
            xml.AppendLine($"            <EFFECTIVEDATE>{date:yyyyMMdd}</EFFECTIVEDATE>");
            xml.AppendLine("            <ISINVOICE>Yes</ISINVOICE>");

            // 1. ALLINVENTORYENTRIES.LIST FIRST (as per reference accepted XML #1661)
            int itemIndex = 0;
            foreach (var item in items)
            {
                itemIndex++;
                var itemName = item["stock_item_name"]?.ToString() ?? item["description"]?.ToString() ?? item["item_name"]?.ToString() ?? "";
                var qty = item["quantity"]?.Value<decimal>() ?? item["qty"]?.Value<decimal>() ?? 0;
                var rate = item["rate"]?.Value<decimal>() ?? 0;
                var amount = item["amount"]?.Value<decimal>() ?? (qty * rate);

                if (string.IsNullOrEmpty(itemName))
                {
                    SyncLogger.Log($"    ⚠️ Sales Item #{itemIndex} has no stock_item_name, skipping");
                    continue;
                }

                var unit = ResolveUnit(ctx, itemName, item["unit"]?.ToString());

                // Item discount
                var itemDiscountAmount = item["discount_amount"]?.Value<decimal>() ?? item["discountAmount"]?.Value<decimal>() ?? 0;
                var itemDiscountPercent = item["discount_value"]?.Value<decimal>() ?? item["discountPercent"]?.Value<decimal>() ?? 0;
                if (itemDiscountAmount == 0 && itemDiscountPercent > 0 && (qty * rate) > 0)
                {
                    itemDiscountAmount = Math.Round((qty * rate * itemDiscountPercent) / 100, 2);
                }
                else if (itemDiscountAmount > 0 && itemDiscountPercent == 0 && (qty * rate) > 0)
                {
                    itemDiscountPercent = Math.Round((itemDiscountAmount / (qty * rate)) * 100, 2);
                }

                // Taxable value of item (net of item discount)
                var taxable = item["taxable_amount"]?.Value<decimal>() ?? item["base_amount"]?.Value<decimal>() ?? (qty > 0 && rate > 0 ? (qty * rate - itemDiscountAmount) : amount);
                if (taxable <= 0 && amount > 0) taxable = amount;

                var itemGstRate = ItemGstRate(ctx, item);

                SyncLogger.Log($"    Sales Item #{itemIndex}: {itemName}, Qty: {qty}, Rate: {rate}, Taxable: {taxable}, Discount: {itemDiscountAmount}");

                xml.AppendLine("            <ALLINVENTORYENTRIES.LIST>");
                xml.AppendLine($"              <STOCKITEMNAME>{EscapeXml(itemName)}</STOCKITEMNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <RATE>{Rate(rate, unit)}</RATE>");
                xml.AppendLine($"              <AMOUNT>{taxable}</AMOUNT>");
                xml.AppendLine($"              <ACTUALQTY>{Qty(qty, unit)}</ACTUALQTY>");
                xml.AppendLine($"              <BILLEDQTY>{Qty(qty, unit)}</BILLEDQTY>");
                if (itemDiscountPercent > 0)
                {
                    xml.AppendLine($"              <DISCOUNT>{itemDiscountPercent}</DISCOUNT>");
                }
                xml.AppendLine("              <BATCHALLOCATIONS.LIST>");
                xml.AppendLine("                <GODOWNNAME>Main Location</GODOWNNAME>");
                xml.AppendLine("                <BATCHNAME>Primary Batch</BATCHNAME>");
                xml.AppendLine($"                <AMOUNT>{taxable}</AMOUNT>");
                xml.AppendLine($"                <ACTUALQTY>{Qty(qty, unit)}</ACTUALQTY>");
                xml.AppendLine($"                <BILLEDQTY>{Qty(qty, unit)}</BILLEDQTY>");
                xml.AppendLine("              </BATCHALLOCATIONS.LIST>");
                xml.AppendLine("              <ACCOUNTINGALLOCATIONS.LIST>");
                xml.AppendLine($"                <LEDGERNAME>{EscapeXml(salesLedger)}</LEDGERNAME>");
                xml.AppendLine("                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"                <AMOUNT>{taxable}</AMOUNT>");
                xml.AppendLine("              </ACCOUNTINGALLOCATIONS.LIST>");
                AppendItemGstRates(xml, itemGstRate, igst > 0);
                xml.AppendLine("            </ALLINVENTORYENTRIES.LIST>");
            }

            // 2. LEDGERENTRIES.LIST SECOND (Party, then tax/discount/round off)
            // Party entry (Debit)
            xml.AppendLine("            <LEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(partyName)}</LEDGERNAME>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
            xml.AppendLine("              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>");
            xml.AppendLine($"              <AMOUNT>-{grandTotal}</AMOUNT>");
            xml.AppendLine("            </LEDGERENTRIES.LIST>");

            // With items, the sales ledger sits inside each item's accounting allocation
            // (a separate entry would double count).
            if (items.Count == 0)
            {
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(salesLedger)}</LEDGERNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{grandTotal - cgst - sgst - igst - roundOff + billDiscount}</AMOUNT>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            AppendTaxEntries(xml, tax, debit: false, cgst, sgst, igst);

            // Bill Discount entry
            if (billDiscount > 0)
            {
                var discountLedger = FindLedger(ctx, data["discount_ledger"]?.ToString(), null, new[] { "Discount" });
                if (discountLedger == null)
                    return ("", "Tally me 'Discount' ledger nahi mila; bill discount ke bina voucher balance nahi hoga.");
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(discountLedger)}</LEDGERNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>-{billDiscount}</AMOUNT>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            // Round Off entry
            if (roundOff != 0)
            {
                var roundOffLedger = FindLedger(ctx, data["round_off_ledger"]?.ToString(), null, new[] { "Round" });
                if (roundOffLedger == null)
                    return ("", "Tally me 'Round Off' ledger nahi mila; round off ke bina voucher balance nahi hoga.");
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(roundOffLedger)}</LEDGERNAME>");
                xml.AppendLine($"              <ISDEEMEDPOSITIVE>{(roundOff > 0 ? "No" : "Yes")}</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{roundOff}</AMOUNT>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            AppendEnvelopeEnd(xml);
            return (xml.ToString(), null);
        }

        /// <summary>
        /// Generate Purchase Voucher XML (invoice view with inventory, like Tally's own export)
        /// </summary>
        private (string Xml, string? Error) GeneratePurchaseVoucherXml(string companyName, JObject data, DateTime date,
            string partyName, string narration, string purchaseLedger, CompanyContext ctx, string guid)
        {
            var items = data["items"] as JArray ?? data["stock_entries"] as JArray ?? new JArray();
            var totalAmount = data["total_amount"]?.Value<decimal>() ?? 0;
            var cgst = data["cgst_amount"]?.Value<decimal>() ?? 0;
            var sgst = data["sgst_amount"]?.Value<decimal>() ?? 0;
            var igst = data["igst_amount"]?.Value<decimal>() ?? 0;
            var grandTotal = data["grand_total"]?.Value<decimal>() ?? totalAmount + cgst + sgst + igst;

            if (cgst == 0 && sgst == 0 && igst == 0)
            {
                var gstAmount = data["gst_amount"]?.Value<decimal>() ?? 0;
                if (gstAmount > 0)
                {
                    cgst = Math.Round(gstAmount / 2, 2);
                    sgst = gstAmount - cgst;
                }
            }

            var voucherNumber = data["voucher_number"]?.ToString() ?? "";
            var state = data["state"]?.ToString() ?? data["place_of_supply"]?.ToString() ?? "Rajasthan";
            var country = data["country"]?.ToString() ?? "India";
            var placeOfSupply = data["place_of_supply"]?.ToString() ?? state;
            var gstRegType = data["gst_registration_type"]?.ToString() ?? "Regular";

            var gstError = ValidateItemGst(ctx, items, cgst, sgst, igst);
            if (gstError != null) return ("", gstError);

            var tax = ResolveTaxLedgers(ctx, data, isInput: true, cgst, sgst, igst);
            if (tax.Error != null) return ("", tax.Error);

            var xml = new StringBuilder();
            AppendEnvelopeStart(xml, companyName, "Purchase", "Invoice Voucher View", guid);
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine($"            <VCHSTATUSDATE>{date:yyyyMMdd}</VCHSTATUSDATE>");
            xml.AppendLine($"            <GSTREGISTRATIONTYPE>{EscapeXml(gstRegType)}</GSTREGISTRATIONTYPE>");
            xml.AppendLine("            <VATDEALERTYPE>Regular</VATDEALERTYPE>");
            xml.AppendLine($"            <STATENAME>{EscapeXml(state)}</STATENAME>");
            xml.AppendLine($"            <COUNTRYOFRESIDENCE>{EscapeXml(country)}</COUNTRYOFRESIDENCE>");
            xml.AppendLine($"            <PLACEOFSUPPLY>{EscapeXml(placeOfSupply)}</PLACEOFSUPPLY>");
            xml.AppendLine("            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>");
            xml.AppendLine($"            <PARTYNAME>{EscapeXml(partyName)}</PARTYNAME>");
            xml.AppendLine($"            <PARTYLEDGERNAME>{EscapeXml(partyName)}</PARTYLEDGERNAME>");
            AppendIdentity(xml, guid, "Purchase", voucherNumber);
            xml.AppendLine($"            <BASICBUYERNAME>{EscapeXml(partyName)}</BASICBUYERNAME>");
            xml.AppendLine($"            <PARTYMAILINGNAME>{EscapeXml(partyName)}</PARTYMAILINGNAME>");
            xml.AppendLine($"            <CONSIGNEESTATENAME>{EscapeXml(state)}</CONSIGNEESTATENAME>");
            xml.AppendLine($"            <CONSIGNEECOUNTRYNAME>{EscapeXml(country)}</CONSIGNEECOUNTRYNAME>");
            xml.AppendLine($"            <BASICBASEPARTYNAME>{EscapeXml(partyName)}</BASICBASEPARTYNAME>");
            if (!string.IsNullOrWhiteSpace(narration))
            {
                xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");
            }
            xml.AppendLine("            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>");
            xml.AppendLine("            <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>");
            xml.AppendLine($"            <EFFECTIVEDATE>{date:yyyyMMdd}</EFFECTIVEDATE>");
            xml.AppendLine("            <ISINVOICE>Yes</ISINVOICE>");

            // Inventory lines (Debit purchase ledger, credit party below)
            foreach (var item in items)
            {
                var itemName = item["stock_item_name"]?.ToString() ?? item["item_name"]?.ToString() ?? item["description"]?.ToString() ?? "";
                if (string.IsNullOrEmpty(itemName)) continue;

                var qty = item["quantity"]?.Value<decimal>() ?? item["qty"]?.Value<decimal>() ?? 0;
                var rate = item["rate"]?.Value<decimal>() ?? 0;
                var amount = item["amount"]?.Value<decimal>() ?? (qty * rate);
                var taxable = item["taxable_amount"]?.Value<decimal>() ?? amount;
                var unit = ResolveUnit(ctx, itemName, item["unit"]?.ToString());

                var itemGstRate = ItemGstRate(ctx, item);

                xml.AppendLine("            <ALLINVENTORYENTRIES.LIST>");
                xml.AppendLine($"              <STOCKITEMNAME>{EscapeXml(itemName)}</STOCKITEMNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <RATE>{Rate(rate, unit)}</RATE>");
                xml.AppendLine($"              <AMOUNT>-{taxable}</AMOUNT>");
                xml.AppendLine($"              <ACTUALQTY>{Qty(qty, unit)}</ACTUALQTY>");
                xml.AppendLine($"              <BILLEDQTY>{Qty(qty, unit)}</BILLEDQTY>");
                xml.AppendLine("              <BATCHALLOCATIONS.LIST>");
                xml.AppendLine("                <GODOWNNAME>Main Location</GODOWNNAME>");
                xml.AppendLine("                <BATCHNAME>Primary Batch</BATCHNAME>");
                xml.AppendLine($"                <AMOUNT>-{taxable}</AMOUNT>");
                xml.AppendLine($"                <ACTUALQTY>{Qty(qty, unit)}</ACTUALQTY>");
                xml.AppendLine($"                <BILLEDQTY>{Qty(qty, unit)}</BILLEDQTY>");
                xml.AppendLine("              </BATCHALLOCATIONS.LIST>");
                xml.AppendLine("              <ACCOUNTINGALLOCATIONS.LIST>");
                xml.AppendLine($"                <LEDGERNAME>{EscapeXml(purchaseLedger)}</LEDGERNAME>");
                xml.AppendLine("                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"                <AMOUNT>-{taxable}</AMOUNT>");
                xml.AppendLine("              </ACCOUNTINGALLOCATIONS.LIST>");
                AppendItemGstRates(xml, itemGstRate, igst > 0);
                xml.AppendLine("            </ALLINVENTORYENTRIES.LIST>");
            }

            // Purchase ledger without inventory lines
            if (items.Count == 0)
            {
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(purchaseLedger)}</LEDGERNAME>");
                xml.AppendLine($"              <AMOUNT>-{totalAmount}</AMOUNT>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            // Party entry (Credit)
            xml.AppendLine("            <LEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(partyName)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>{grandTotal}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
            xml.AppendLine("              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>");
            xml.AppendLine("            </LEDGERENTRIES.LIST>");

            AppendTaxEntries(xml, tax, debit: true, cgst, sgst, igst);

            AppendEnvelopeEnd(xml);
            return (xml.ToString(), null);
        }

        /// <summary>
        /// Credit Note = sales return: stock and sales ledger are debited, party is credited.
        /// </summary>
        private (string Xml, string? Error) GenerateCreditNoteVoucherXml(string companyName, JObject data, DateTime date,
            string partyName, string narration, string salesLedger, CompanyContext ctx, string guid)
        {
            var items = data["items"] as JArray ?? data["stock_entries"] as JArray ?? new JArray();
            var totalAmount = data["total_amount"]?.Value<decimal>() ?? 0;
            var cgst = data["cgst_amount"]?.Value<decimal>() ?? 0;
            var sgst = data["sgst_amount"]?.Value<decimal>() ?? 0;
            var igst = data["igst_amount"]?.Value<decimal>() ?? 0;
            var grandTotal = data["grand_total"]?.Value<decimal>() ?? totalAmount + cgst + sgst + igst;

            if (cgst == 0 && sgst == 0 && igst == 0)
            {
                var gstAmount = data["gst_amount"]?.Value<decimal>() ?? 0;
                if (gstAmount > 0)
                {
                    cgst = Math.Round(gstAmount / 2, 2);
                    sgst = gstAmount - cgst;
                }
            }

            var gstError = ValidateItemGst(ctx, items, cgst, sgst, igst);
            if (gstError != null) return ("", gstError);

            var tax = ResolveTaxLedgers(ctx, data, isInput: false, cgst, sgst, igst);
            if (tax.Error != null) return ("", tax.Error);

            var xml = new StringBuilder();
            AppendEnvelopeStart(xml, companyName, "Credit Note", "Invoice Voucher View", guid);
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine($"            <VCHSTATUSDATE>{date:yyyyMMdd}</VCHSTATUSDATE>");
            xml.AppendLine("            <VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>");
            xml.AppendLine($"            <PARTYNAME>{EscapeXml(partyName)}</PARTYNAME>");
            xml.AppendLine($"            <PARTYLEDGERNAME>{EscapeXml(partyName)}</PARTYLEDGERNAME>");
            AppendIdentity(xml, guid, "Credit Note", data["voucher_number"]?.ToString());
            if (!string.IsNullOrWhiteSpace(narration))
            {
                xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");
            }
            xml.AppendLine("            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>");
            xml.AppendLine("            <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>");
            xml.AppendLine($"            <EFFECTIVEDATE>{date:yyyyMMdd}</EFFECTIVEDATE>");
            xml.AppendLine("            <ISINVOICE>Yes</ISINVOICE>");

            foreach (var item in items)
            {
                var itemName = item["stock_item_name"]?.ToString() ?? item["item_name"]?.ToString() ?? item["description"]?.ToString() ?? "";
                if (string.IsNullOrEmpty(itemName)) continue;

                var qty = item["quantity"]?.Value<decimal>() ?? item["qty"]?.Value<decimal>() ?? 0;
                var rate = item["rate"]?.Value<decimal>() ?? 0;
                var amount = item["amount"]?.Value<decimal>() ?? (qty * rate);
                var taxable = item["taxable_amount"]?.Value<decimal>() ?? amount;
                var unit = ResolveUnit(ctx, itemName, item["unit"]?.ToString());

                xml.AppendLine("            <ALLINVENTORYENTRIES.LIST>");
                xml.AppendLine($"              <STOCKITEMNAME>{EscapeXml(itemName)}</STOCKITEMNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <RATE>{Rate(rate, unit)}</RATE>");
                xml.AppendLine($"              <AMOUNT>-{taxable}</AMOUNT>");
                xml.AppendLine($"              <ACTUALQTY>{Qty(qty, unit)}</ACTUALQTY>");
                xml.AppendLine($"              <BILLEDQTY>{Qty(qty, unit)}</BILLEDQTY>");
                xml.AppendLine("              <BATCHALLOCATIONS.LIST>");
                xml.AppendLine("                <GODOWNNAME>Main Location</GODOWNNAME>");
                xml.AppendLine("                <BATCHNAME>Primary Batch</BATCHNAME>");
                xml.AppendLine($"                <AMOUNT>-{taxable}</AMOUNT>");
                xml.AppendLine($"                <ACTUALQTY>{Qty(qty, unit)}</ACTUALQTY>");
                xml.AppendLine($"                <BILLEDQTY>{Qty(qty, unit)}</BILLEDQTY>");
                xml.AppendLine("              </BATCHALLOCATIONS.LIST>");
                xml.AppendLine("              <ACCOUNTINGALLOCATIONS.LIST>");
                xml.AppendLine($"                <LEDGERNAME>{EscapeXml(salesLedger)}</LEDGERNAME>");
                xml.AppendLine("                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"                <AMOUNT>-{taxable}</AMOUNT>");
                xml.AppendLine("              </ACCOUNTINGALLOCATIONS.LIST>");
                AppendItemGstRates(xml, ItemGstRate(ctx, item), igst > 0);
                xml.AppendLine("            </ALLINVENTORYENTRIES.LIST>");
            }

            if (items.Count == 0)
            {
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(salesLedger)}</LEDGERNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>-{totalAmount}</AMOUNT>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            // Party (Credit)
            xml.AppendLine("            <LEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(partyName)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>{grandTotal}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
            xml.AppendLine("              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>");
            xml.AppendLine("            </LEDGERENTRIES.LIST>");

            // Output tax reversal (Debit)
            AppendTaxEntries(xml, tax, debit: true, cgst, sgst, igst);

            AppendEnvelopeEnd(xml);
            return (xml.ToString(), null);
        }

        /// <summary>
        /// Debit Note = purchase return: purchase ledger and input tax are credited, party is debited.
        /// </summary>
        private (string Xml, string? Error) GenerateDebitNoteVoucherXml(string companyName, JObject data, DateTime date,
            string partyName, string narration, string purchaseLedger, CompanyContext ctx, string guid)
        {
            var items = data["items"] as JArray ?? data["stock_entries"] as JArray ?? new JArray();
            var totalAmount = data["total_amount"]?.Value<decimal>() ?? 0;
            var cgst = data["cgst_amount"]?.Value<decimal>() ?? 0;
            var sgst = data["sgst_amount"]?.Value<decimal>() ?? 0;
            var igst = data["igst_amount"]?.Value<decimal>() ?? 0;
            var grandTotal = data["grand_total"]?.Value<decimal>() ?? totalAmount + cgst + sgst + igst;

            if (cgst == 0 && sgst == 0 && igst == 0)
            {
                var gstAmount = data["gst_amount"]?.Value<decimal>() ?? 0;
                if (gstAmount > 0)
                {
                    cgst = Math.Round(gstAmount / 2, 2);
                    sgst = gstAmount - cgst;
                }
            }

            var gstError = ValidateItemGst(ctx, items, cgst, sgst, igst);
            if (gstError != null) return ("", gstError);

            var tax = ResolveTaxLedgers(ctx, data, isInput: true, cgst, sgst, igst);
            if (tax.Error != null) return ("", tax.Error);

            var xml = new StringBuilder();
            AppendEnvelopeStart(xml, companyName, "Debit Note", "Invoice Voucher View", guid);
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine($"            <VCHSTATUSDATE>{date:yyyyMMdd}</VCHSTATUSDATE>");
            xml.AppendLine("            <VOUCHERTYPENAME>Debit Note</VOUCHERTYPENAME>");
            xml.AppendLine($"            <PARTYNAME>{EscapeXml(partyName)}</PARTYNAME>");
            xml.AppendLine($"            <PARTYLEDGERNAME>{EscapeXml(partyName)}</PARTYLEDGERNAME>");
            AppendIdentity(xml, guid, "Debit Note", data["voucher_number"]?.ToString());
            if (!string.IsNullOrWhiteSpace(narration))
            {
                xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");
            }
            xml.AppendLine("            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>");
            xml.AppendLine("            <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>");
            xml.AppendLine($"            <EFFECTIVEDATE>{date:yyyyMMdd}</EFFECTIVEDATE>");
            xml.AppendLine("            <ISINVOICE>Yes</ISINVOICE>");

            foreach (var item in items)
            {
                var itemName = item["stock_item_name"]?.ToString() ?? item["item_name"]?.ToString() ?? item["description"]?.ToString() ?? "";
                if (string.IsNullOrEmpty(itemName)) continue;

                var qty = item["quantity"]?.Value<decimal>() ?? item["qty"]?.Value<decimal>() ?? 0;
                var rate = item["rate"]?.Value<decimal>() ?? 0;
                var amount = item["amount"]?.Value<decimal>() ?? (qty * rate);
                var taxable = item["taxable_amount"]?.Value<decimal>() ?? amount;
                var unit = ResolveUnit(ctx, itemName, item["unit"]?.ToString());

                xml.AppendLine("            <ALLINVENTORYENTRIES.LIST>");
                xml.AppendLine($"              <STOCKITEMNAME>{EscapeXml(itemName)}</STOCKITEMNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <RATE>{Rate(rate, unit)}</RATE>");
                xml.AppendLine($"              <AMOUNT>{taxable}</AMOUNT>");
                xml.AppendLine($"              <ACTUALQTY>{Qty(qty, unit)}</ACTUALQTY>");
                xml.AppendLine($"              <BILLEDQTY>{Qty(qty, unit)}</BILLEDQTY>");
                xml.AppendLine("              <BATCHALLOCATIONS.LIST>");
                xml.AppendLine("                <GODOWNNAME>Main Location</GODOWNNAME>");
                xml.AppendLine("                <BATCHNAME>Primary Batch</BATCHNAME>");
                xml.AppendLine($"                <AMOUNT>{taxable}</AMOUNT>");
                xml.AppendLine($"                <ACTUALQTY>{Qty(qty, unit)}</ACTUALQTY>");
                xml.AppendLine($"                <BILLEDQTY>{Qty(qty, unit)}</BILLEDQTY>");
                xml.AppendLine("              </BATCHALLOCATIONS.LIST>");
                xml.AppendLine("              <ACCOUNTINGALLOCATIONS.LIST>");
                xml.AppendLine($"                <LEDGERNAME>{EscapeXml(purchaseLedger)}</LEDGERNAME>");
                xml.AppendLine("                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"                <AMOUNT>{taxable}</AMOUNT>");
                xml.AppendLine("              </ACCOUNTINGALLOCATIONS.LIST>");
                AppendItemGstRates(xml, ItemGstRate(ctx, item), igst > 0);
                xml.AppendLine("            </ALLINVENTORYENTRIES.LIST>");
            }

            if (items.Count == 0)
            {
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(purchaseLedger)}</LEDGERNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{totalAmount}</AMOUNT>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            // Party (Debit)
            xml.AppendLine("            <LEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(partyName)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>-{grandTotal}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
            xml.AppendLine("              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>");
            xml.AppendLine("            </LEDGERENTRIES.LIST>");

            // Input tax reversal (Credit)
            AppendTaxEntries(xml, tax, debit: false, cgst, sgst, igst);

            AppendEnvelopeEnd(xml);
            return (xml.ToString(), null);
        }

        private sealed class TaxLedgerNames
        {
            public string? Cgst;
            public string? Sgst;
            public string? Igst;
            public string? Error;
        }

        /// <summary>
        /// Tax ledgers must already exist in Tally with the right name; a plain auto-created
        /// "SGST" would be a non-GST ledger and corrupt the GST reports.
        /// </summary>
        private static TaxLedgerNames ResolveTaxLedgers(CompanyContext ctx, JObject data, bool isInput,
            decimal cgst, decimal sgst, decimal igst)
        {
            var result = new TaxLedgerNames();

            // Companies name these ledgers any way they like ("CGST", "Input CGST", "Output CGST").
            // Tally's GST reports classify tax by duty head + Dr/Cr, not by name, so the plain
            // "CGST"/"SGST"/"IGST" ledger is used first; Input/Output variants are the fallback.
            string? Resolve(string? preferred, string duty)
            {
                return FindLedger(ctx, preferred, "Duties & Taxes", new[] { duty }, new[] { "Input", "Output" })
                       ?? FindLedger(ctx, preferred, "Duties & Taxes", new[] { duty, isInput ? "Input" : "Output" })
                       ?? FindLedger(ctx, preferred, "Duties & Taxes", new[] { duty });
            }

            if (cgst > 0)
            {
                result.Cgst = Resolve(data["cgst_ledger"]?.ToString(), "CGST");
                if (result.Cgst == null)
                {
                    result.Error = "Tally me CGST ledger nahi mila (Duties & Taxes group). " +
                                   "Pehle Tally me GST ledger banao, phir retry karo.";
                    return result;
                }
            }

            if (sgst > 0)
            {
                result.Sgst = Resolve(data["sgst_ledger"]?.ToString(), "SGST");
                if (result.Sgst == null)
                {
                    result.Error = "Tally me SGST ledger nahi mila (Duties & Taxes group). " +
                                   "Pehle Tally me GST ledger banao, phir retry karo.";
                    return result;
                }
            }

            if (igst > 0)
            {
                result.Igst = Resolve(data["igst_ledger"]?.ToString(), "IGST");
                if (result.Igst == null)
                {
                    result.Error = "Tally me IGST ledger nahi mila (Duties & Taxes group). " +
                                   "Pehle Tally me GST ledger banao, phir retry karo.";
                    return result;
                }
            }

            return result;
        }

        /// <summary>
        /// GST rate of an item line: the explicit rate, else derived from taxable value vs amount.
        /// </summary>
        private static decimal ItemGstRate(CompanyContext ctx, JToken item)
        {
            var name = item["stock_item_name"]?.ToString() ?? item["item_name"]?.ToString() ?? item["description"]?.ToString() ?? "";
            if (!string.IsNullOrWhiteSpace(name) && ctx.StockGstRates.TryGetValue(name.Trim(), out var masterRate))
                return masterRate;

            var rate = item["gst_rate"]?.Value<decimal>() ?? item["gstRate"]?.Value<decimal>() ?? 0;
            if (rate > 0) return rate;

            var amount = item["amount"]?.Value<decimal>() ?? 0;
            var taxable = item["taxable_amount"]?.Value<decimal>() ?? amount;
            return taxable > 0 && amount > taxable ? Math.Round((amount - taxable) / taxable * 100, 2) : 0;
        }

        /// <summary>
        /// Tax totals from the item lines. When an item's rate comes from the Tally master the tax
        /// must follow it — an exempt/0% item cannot post 18% just because the form said so.
        /// </summary>
        private static string? ValidateItemGst(CompanyContext ctx, JArray items, decimal cgst, decimal sgst, decimal igst)
        {
            if (items.Count == 0) return null;

            var usedMasterRate = false;
            var tax = 0m;
            foreach (var item in items)
            {
                var name = item["stock_item_name"]?.ToString() ?? item["item_name"]?.ToString() ?? item["description"]?.ToString() ?? "";
                usedMasterRate |= !string.IsNullOrWhiteSpace(name) && ctx.StockGstRates.ContainsKey(name.Trim());

                var rate = ItemGstRate(ctx, item);
                if (rate <= 0) continue;

                var taxable = item["taxable_amount"]?.Value<decimal>() ?? item["amount"]?.Value<decimal>() ?? 0;
                tax += Math.Round(taxable * rate / 100, 2);
            }

            if (!usedMasterRate) return null;

            var sent = cgst + sgst + igst;
            return Math.Abs(tax - sent) > 1
                ? $"Item master ke GST rate se tax ₹{tax} banta hai, voucher me ₹{sent} hai. " +
                  "Item ka GST rate Tally me ya form ka GST% theek karo."
                : null;
        }

        /// <summary>
        /// Item-level GST rate. Tally takes the tax from these lines, not from the tax ledger
        /// entries, so an item without them is treated as unregistered in the GST reports.
        /// </summary>
        private static void AppendItemGstRates(StringBuilder xml, decimal itemGstRate, bool interState)
        {
            if (itemGstRate <= 0) return;

            void Rate(string head, decimal rate)
            {
                xml.AppendLine("              <RATEDETAILS.LIST>");
                xml.AppendLine($"                <GSTRATEDUTYHEAD>{head}</GSTRATEDUTYHEAD>");
                xml.AppendLine("                <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>");
                xml.AppendLine($"                <GSTRATE>{rate}</GSTRATE>");
                xml.AppendLine("              </RATEDETAILS.LIST>");
            }

            if (interState)
            {
                Rate("IGST", itemGstRate);
            }
            else
            {
                Rate("CGST", itemGstRate / 2);
                Rate("SGST/UTGST", itemGstRate / 2);
            }
        }

        /// <summary>
        /// Tax entries. Sales/purchase debit their tax side, returns credit it.
        /// </summary>
        private static void AppendTaxEntries(StringBuilder xml, TaxLedgerNames tax, bool debit,
            decimal cgst, decimal sgst, decimal igst)
        {
            void Entry(string name, decimal amount)
            {
                // Invoice vouchers reject the whole import (EXCEPTIONS=1) when a tax line is
                // in ALLLEDGERENTRIES.LIST; Tally's own export uses LEDGERENTRIES.LIST.
                xml.AppendLine("            <LEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(name)}</LEDGERNAME>");
                xml.AppendLine("              <METHODTYPE>GST</METHODTYPE>");
                xml.AppendLine($"              <ISDEEMEDPOSITIVE>{(debit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{(debit ? "-" : "")}{amount}</AMOUNT>");
                xml.AppendLine("            </LEDGERENTRIES.LIST>");
            }

            if (cgst > 0 && tax.Cgst != null) Entry(tax.Cgst, cgst);
            if (sgst > 0 && tax.Sgst != null) Entry(tax.Sgst, sgst);
            if (igst > 0 && tax.Igst != null) Entry(tax.Igst, igst);
        }

        /// <summary>
        /// Receipt/Payment. Uses the web's ledger entries when present (Tally needs the real
        /// Dr/Cr lines); otherwise falls back to cash/bank ↔ party for the given amount.
        /// </summary>
        private (string Xml, string? Error) GenerateMoneyVoucherXml(string companyName, string voucherType, JObject data,
            DateTime date, string partyName, string narration, string? cashBankLedger, CompanyContext ctx, string guid)
        {
            var entries = ResolveLedgerEntries(ctx, data);
            if (entries.Error != null) return ("", entries.Error);

            var amount = entries.List.Count >= 2
                ? entries.List.Where(e => e.IsDebit).Sum(e => e.Amount)
                : data["amount"]?.Value<decimal>() ?? data["grand_total"]?.Value<decimal>() ?? data["total_amount"]?.Value<decimal>() ?? 0;

            if (amount <= 0)
                return ("", $"{voucherType} amount 0 hai. Ledger entries me debit/credit amount daalo, phir retry karo.");

            // In the entries path the party is the entry opposite the cash/bank side.
            var party = partyName;
            if (entries.List.Count >= 2)
            {
                party = entries.List
                    .FirstOrDefault(e => string.Equals(e.Ledger, partyName?.Trim(), StringComparison.OrdinalIgnoreCase))?.Ledger
                    ?? entries.List.FirstOrDefault(e => e.IsDebit == (voucherType == "Payment"))?.Ledger
                    ?? partyName;
            }

            var xml = new StringBuilder();
            AppendEnvelopeStart(xml, companyName, voucherType, "Accounting Voucher View", guid);
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine($"            <VCHSTATUSDATE>{date:yyyyMMdd}</VCHSTATUSDATE>");
            xml.AppendLine($"            <VOUCHERTYPENAME>{EscapeXml(voucherType)}</VOUCHERTYPENAME>");
            xml.AppendLine($"            <PARTYLEDGERNAME>{EscapeXml(party)}</PARTYLEDGERNAME>");
            AppendIdentity(xml, guid, voucherType, data["voucher_number"]?.ToString());
            xml.AppendLine("            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>");
            xml.AppendLine("            <HASCASHFLOW>Yes</HASCASHFLOW>");
            xml.AppendLine("            <ISINVOICE>No</ISINVOICE>");
            xml.AppendLine($"            <EFFECTIVEDATE>{date:yyyyMMdd}</EFFECTIVEDATE>");
            if (!string.IsNullOrWhiteSpace(narration))
            {
                xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");
            }

            if (entries.List.Count >= 2)
            {
                foreach (var entry in entries.List)
                {
                    xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                    xml.AppendLine($"              <LEDGERNAME>{EscapeXml(entry.Ledger)}</LEDGERNAME>");
                    // Tally rejects the whole import (EXCEPTIONS=1) when AMOUNT precedes ISDEEMEDPOSITIVE.
                    xml.AppendLine($"              <ISDEEMEDPOSITIVE>{(entry.IsDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
                    xml.AppendLine("              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>");
                    xml.AppendLine($"              <AMOUNT>{(entry.IsDebit ? "-" : "")}{entry.Amount}</AMOUNT>");
                    xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
                }
            }
            else if (string.IsNullOrWhiteSpace(cashBankLedger))
            {
                return ("", "Tally me Cash/Bank ledger nahi mila (Cash-in-Hand / Bank Accounts). Pehle Tally me ledger banao.");
            }
            else if (voucherType == "Receipt")
            {
                // Cash/Bank (Debit), Party (Credit) — Tally's own export shape.
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(cashBankLedger)}</LEDGERNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine("              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>");
                xml.AppendLine($"              <AMOUNT>-{amount}</AMOUNT>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");

                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(party)}</LEDGERNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine("              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>");
                xml.AppendLine($"              <AMOUNT>{amount}</AMOUNT>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }
            else
            {
                // Payment: Party (Debit), Cash/Bank (Credit).
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(party)}</LEDGERNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine("              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>");
                xml.AppendLine($"              <AMOUNT>-{amount}</AMOUNT>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");

                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(cashBankLedger)}</LEDGERNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine("              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>");
                xml.AppendLine($"              <AMOUNT>{amount}</AMOUNT>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            AppendEnvelopeEnd(xml);
            return (xml.ToString(), null);
        }

        private sealed class MoneyEntry
        {
            public string Ledger = "";
            public decimal Amount;
            public bool IsDebit;
        }

        /// <summary>
        /// Dr/Cr lines sent by the web form. A zero or unbalanced set is rejected before import,
        /// because Tally only answers EXCEPTIONS=1 for those.
        /// </summary>
        private static (List<MoneyEntry> List, string? Error) ResolveLedgerEntries(CompanyContext ctx, JObject data)
        {
            var arr = data["ledger_entries"] as JArray ?? data["entries"] as JArray ?? new JArray();
            var list = new List<MoneyEntry>();

            foreach (var e in arr)
            {
                var name = e["ledger_name"]?.ToString()?.Trim();
                var amount = e["amount"]?.Value<decimal>() ?? 0;
                if (string.IsNullOrWhiteSpace(name) || amount <= 0) continue;

                list.Add(new MoneyEntry
                {
                    Ledger = name,
                    Amount = amount,
                    IsDebit = e["is_debit"]?.Value<bool>() ??
                              string.Equals(e["type"]?.ToString(), "Dr", StringComparison.OrdinalIgnoreCase),
                });
            }

            if (list.Count >= 2)
            {
                var missing = list.Select(x => x.Ledger)
                    .Where(n => ctx.Ledgers.Count > 0 &&
                                !ctx.Ledgers.Any(l => string.Equals(l.Name?.Trim(), n, StringComparison.OrdinalIgnoreCase)))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (missing.Count > 0)
                    return (list, $"Tally me ye ledger nahi mile: {string.Join(", ", missing)}");

                var dr = list.Where(x => x.IsDebit).Sum(x => x.Amount);
                var cr = list.Where(x => !x.IsDebit).Sum(x => x.Amount);
                if (Math.Abs(dr - cr) > 0.01m)
                    return (list, $"Ledger entries balance nahi hain (Dr {dr} vs Cr {cr}).");
            }

            return (list, null);
        }

        /// <summary>
        /// Contra (bank/cash transfer). Bank side carries a BANKALLOCATIONS.LIST like Tally's own export.
        /// </summary>
        private (string Xml, string? Error) GenerateContraVoucherXml(string companyName, JObject data, DateTime date,
            string narration, string partyName, CompanyContext ctx, string guid)
        {
            var entries = data["ledger_entries"] as JArray ?? data["entries"] as JArray ?? new JArray();
            if (entries.Count < 2)
                return ("", "Contra ke liye do ledger entries chahiye (jisme se paisa gaya aur jisme aaya).");

            var missing = entries
                .Select(e => e["ledger_name"]?.ToString())
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Where(n => ctx.Ledgers.Count > 0 &&
                            !ctx.Ledgers.Any(l => string.Equals(l.Name?.Trim(), n!.Trim(), StringComparison.OrdinalIgnoreCase)))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (missing.Count > 0)
                return ("", $"Tally me ye ledger nahi mile: {string.Join(", ", missing)}");

            var transferMode = data["transfer_mode"]?.ToString() ?? "NEFT";
            var favouring = data["payment_favouring"]?.ToString() ?? "Self";

            var xml = new StringBuilder();
            AppendEnvelopeStart(xml, companyName, "Contra", "Accounting Voucher View", guid);
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine($"            <VCHSTATUSDATE>{date:yyyyMMdd}</VCHSTATUSDATE>");
            xml.AppendLine("            <VOUCHERTYPENAME>Contra</VOUCHERTYPENAME>");
            if (!string.IsNullOrWhiteSpace(partyName))
                xml.AppendLine($"            <PARTYLEDGERNAME>{EscapeXml(partyName)}</PARTYLEDGERNAME>");
            AppendIdentity(xml, guid, "Contra", data["voucher_number"]?.ToString());
            xml.AppendLine("            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>");
            xml.AppendLine($"            <EFFECTIVEDATE>{date:yyyyMMdd}</EFFECTIVEDATE>");
            if (!string.IsNullOrWhiteSpace(narration))
            {
                xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");
            }

            foreach (var entry in entries)
            {
                var ledgerName = entry["ledger_name"]?.ToString() ?? "";
                var amount = entry["amount"]?.Value<decimal>() ?? 0;
                var isDebit = entry["is_debit"]?.Value<bool>() ??
                              string.Equals(entry["type"]?.ToString(), "Dr", StringComparison.OrdinalIgnoreCase);

                var ledger = ctx.Ledgers.FirstOrDefault(l =>
                    string.Equals(l.Name?.Trim(), ledgerName.Trim(), StringComparison.OrdinalIgnoreCase));
                var isBank = string.Equals(ledger?.ParentGroup?.Trim(), "Bank Accounts", StringComparison.OrdinalIgnoreCase);

                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(ledgerName)}</LEDGERNAME>");
                xml.AppendLine($"              <ISDEEMEDPOSITIVE>{(isDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{(isDebit ? "-" : "")}{amount}</AMOUNT>");
                if (isBank)
                {
                    xml.AppendLine("              <BANKALLOCATIONS.LIST>");
                    xml.AppendLine($"                <DATE>{date:yyyyMMdd}</DATE>");
                    xml.AppendLine("                <TRANSACTIONTYPE>Inter Bank Transfer</TRANSACTIONTYPE>");
                    xml.AppendLine($"                <PAYMENTFAVOURING>{EscapeXml(favouring)}</PAYMENTFAVOURING>");
                    xml.AppendLine($"                <TRANSFERMODE>{EscapeXml(transferMode)}</TRANSFERMODE>");
                    xml.AppendLine($"                <AMOUNT>{(isDebit ? "-" : "")}{amount}</AMOUNT>");
                    xml.AppendLine("              </BANKALLOCATIONS.LIST>");
                }
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            AppendEnvelopeEnd(xml);
            return (xml.ToString(), null);
        }

        /// <summary>
        /// Generate Journal Voucher XML
        /// </summary>
        private (string Xml, string? Error) GenerateJournalVoucherXml(string companyName, JObject data, DateTime date,
            string narration, CompanyContext ctx, string guid)
        {
            var entries = data["entries"] as JArray ?? data["ledger_entries"] as JArray ?? new JArray();
            if (entries.Count < 2)
                return ("", "Journal ke liye kam se kam do ledger entries chahiye.");

            var missing = entries
                .Select(e => e["ledger_name"]?.ToString())
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Where(n => ctx.Ledgers.Count > 0 &&
                            !ctx.Ledgers.Any(l => string.Equals(l.Name?.Trim(), n!.Trim(), StringComparison.OrdinalIgnoreCase)))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (missing.Count > 0)
                return ("", $"Tally me ye ledger nahi mile: {string.Join(", ", missing)}");

            var xml = new StringBuilder();
            AppendEnvelopeStart(xml, companyName, "Journal", "Accounting Voucher View", guid);
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine($"            <VCHSTATUSDATE>{date:yyyyMMdd}</VCHSTATUSDATE>");
            xml.AppendLine("            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>");
            AppendIdentity(xml, guid, "Journal", data["voucher_number"]?.ToString());
            xml.AppendLine("            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>");
            xml.AppendLine($"            <EFFECTIVEDATE>{date:yyyyMMdd}</EFFECTIVEDATE>");
            if (!string.IsNullOrWhiteSpace(narration))
            {
                xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");
            }

            foreach (var entry in entries)
            {
                var ledgerName = entry["ledger_name"]?.ToString() ?? "";
                var amount = entry["amount"]?.Value<decimal>() ?? 0;
                var isDebit = entry["is_debit"]?.Value<bool>() ?? string.Equals(entry["type"]?.ToString(), "Dr", StringComparison.OrdinalIgnoreCase);

                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(ledgerName)}</LEDGERNAME>");
                xml.AppendLine($"              <ISDEEMEDPOSITIVE>{(isDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{(isDebit ? "-" : "")}{amount}</AMOUNT>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            AppendEnvelopeEnd(xml);
            return (xml.ToString(), null);
        }

        /// <summary>
        /// Escape special XML characters
        /// </summary>
        private static string EscapeXml(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            return value
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;")
                .Replace("\"", "&quot;")
                .Replace("'", "&apos;");
        }
    }
}
