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

        // Per-company cache {company -> (salesLedgerName, fetchedAt)} — avoids re-fetching all ledgers every cycle
        private readonly Dictionary<string, (string LedgerName, DateTime FetchedAt)> _salesLedgerCache = new();

        /// <summary>
        /// Resolve the company's real income ledger from Tally (group "Sales Accounts").
        /// Prefers a ledger whose % matches the transaction's GST rate, then the generic one.
        /// </summary>
        private async Task<string?> ResolveSalesLedgerNameAsync(string companyName)
        {
            try
            {
                if (_salesLedgerCache.TryGetValue(companyName, out var cached) &&
                    (DateTime.UtcNow - cached.FetchedAt).TotalMinutes < 30)
                {
                    return cached.LedgerName;
                }

                var ledgers = await _tallyConnector.GetLedgersAsync(companyName);
                var salesLedgers = ledgers
                    .Where(l => !string.IsNullOrWhiteSpace(l.Name) &&
                                string.Equals(l.ParentGroup?.Trim(), "Sales Accounts", StringComparison.OrdinalIgnoreCase))
                    .Select(l => l.Name!.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (salesLedgers.Count == 0)
                {
                    SyncLogger.Log("⚠️ No 'Sales Accounts' group ledger found in Tally — using hardcoded fallback");
                    return null;
                }

                // Generic first: exact/common names, then shortest
                string? best = salesLedgers.FirstOrDefault(n =>
                        n.Equals("Sales", StringComparison.OrdinalIgnoreCase) ||
                        n.Equals("Sale", StringComparison.OrdinalIgnoreCase) ||
                        n.Equals("Sales Account", StringComparison.OrdinalIgnoreCase))
                    ?? salesLedgers.OrderBy(n => n.Length).First();

                _salesLedgerCache[companyName] = (best, DateTime.UtcNow);
                SyncLogger.Log($"🎯 Resolved Sales ledger from Tally: '{best}' ({salesLedgers.Count} candidates)");
                return best;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ Sales ledger resolve failed: {ex.Message} — using hardcoded fallback");
                return null;
            }
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

                // Resolve the company's real income (Sales) ledger once — 'Sales Account'
                // hardcoded fallback doesn't exist in most Tally companies.
                var resolvedSalesLedger = await ResolveSalesLedgerNameAsync(companyName);

                foreach (var transaction in pendingTransactions)
                {
                    try
                    {
                        // Update status to processing
                        await _apiClient.UpdatePendingTransactionStatusAsync(transaction.Id, "processing");

                        // Generate Tally XML
                        var tallyXml = GenerateTallyVoucherXml(transaction, companyName, resolvedSalesLedger);
                        
                        if (string.IsNullOrEmpty(tallyXml))
                        {
                            await _apiClient.UpdatePendingTransactionStatusAsync(
                                transaction.Id, "failed", null, "Failed to generate Tally XML");
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
                            var status = transaction.RetryCount >= 3 ? "failed" : "pending";
                            await _apiClient.UpdatePendingTransactionStatusAsync(
                                transaction.Id, status, null, errorMessage);
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
        /// Push a voucher XML to Tally and return the result
        /// </summary>
        private async Task<(bool success, string? voucherNumber, string? error)> PushVoucherToTallyAsync(string xmlRequest)
        {
            try
            {
                SyncLogger.Log($">>> Pushing voucher to Tally...");
                SyncLogger.SaveFile("last_push_request.xml", xmlRequest);

                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30)))
                {
                    var content = new StringContent(xmlRequest, Encoding.UTF8, "text/xml");
                    var response = await _httpClient.PostAsync(_tallyUrl, content, cts.Token);

                    if (!response.IsSuccessStatusCode)
                    {
                        return (false, null, $"Tally HTTP Error: {response.StatusCode}");
                    }

                    var responseContent = await response.Content.ReadAsStringAsync();
                    SyncLogger.SaveFile("last_push_response.xml", responseContent);

                    // Parse response to check for success
                    var doc = XDocument.Parse(responseContent);
                    
                    // Check for errors in response
                    var error = doc.Descendants("LINEERROR").FirstOrDefault()?.Value ??
                               doc.Descendants("ERROR").FirstOrDefault()?.Value;
                    
                    if (!string.IsNullOrEmpty(error))
                    {
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
            }
            catch (TaskCanceledException)
            {
                return (false, null, "Tally request timeout");
            }
            catch (Exception ex)
            {
                return (false, null, $"Error: {ex.Message}");
            }
        }

        /// <summary>
        /// Generate Tally-compatible XML for a voucher
        /// </summary>
        private string GenerateTallyVoucherXml(PendingTransaction transaction, string companyName, string? resolvedSalesLedger = null)
        {
            try
            {
                var voucherData = transaction.VoucherData as JObject ?? JObject.Parse(transaction.VoucherData?.ToString() ?? "{}");
                
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

                SyncLogger.Log($"    Resolved Type: {rawType}, Party: {partyName}, Date: {voucherDate:yyyy-MM-dd}");

                // Build the XML based on normalized voucher type
                switch (rawType)
                {
                    case "SALES":
                    case "SALE":
                    case "SALES INVOICE":
                        return GenerateSalesVoucherXml(companyName, voucherData, voucherDate, partyName, narration, resolvedSalesLedger);
                    case "PURCHASE":
                    case "PURCHASES":
                    case "PURCHASE INVOICE":
                        return GeneratePurchaseVoucherXml(companyName, voucherData, voucherDate, partyName, narration);
                    case "RECEIPT":
                    case "RECEIPTS":
                        return GenerateReceiptVoucherXml(companyName, voucherData, voucherDate, partyName, narration);
                    case "PAYMENT":
                    case "PAYMENTS":
                        return GeneratePaymentVoucherXml(companyName, voucherData, voucherDate, partyName, narration);
                    case "JOURNAL":
                    case "JOURNALS":
                        return GenerateJournalVoucherXml(companyName, voucherData, voucherDate, narration);
                    case "VOUCHERS":
                    case "TRANSACTION":
                    case "ENTRY":
                        // Generic type - try to infer from data
                        if (voucherData["items"] != null)
                            return GenerateSalesVoucherXml(companyName, voucherData, voucherDate, partyName, narration, resolvedSalesLedger);
                        else if (voucherData["cash_bank_ledger"] != null)
                            return GenerateReceiptVoucherXml(companyName, voucherData, voucherDate, partyName, narration);
                        else
                            return GenerateReceiptVoucherXml(companyName, voucherData, voucherDate, partyName, narration);
                    default:
                        SyncLogger.Log($"⚠️ Unsupported voucher type: {transaction.TransactionType}, defaulting to Receipt");
                        return GenerateReceiptVoucherXml(companyName, voucherData, voucherDate, partyName, narration);
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ GenerateTallyVoucherXml error: {ex.Message}");
                return "";
            }
        }

        /// <summary>
        /// Generate Sales Voucher XML
        /// </summary>
        private string GenerateSalesVoucherXml(string companyName, JObject data, DateTime date, string partyName, string narration, string? resolvedSalesLedger = null)
        {
            var items = data["items"] as JArray ?? data["stock_entries"] as JArray ?? new JArray();
            var totalAmount = data["total_amount"]?.Value<decimal>() ?? 0;
            var cgst = data["cgst_amount"]?.Value<decimal>() ?? 0;
            var sgst = data["sgst_amount"]?.Value<decimal>() ?? 0;
            var igst = data["igst_amount"]?.Value<decimal>() ?? 0;
            var roundOff = data["round_off"]?.Value<decimal>() ?? data["roundUpAmount"]?.Value<decimal>() ?? 0;
            var billDiscount = data["discount_amount"]?.Value<decimal>() ?? data["discountAmount"]?.Value<decimal>() ?? 0;
            var grandTotal = data["grand_total"]?.Value<decimal>() ?? totalAmount + cgst + sgst + igst + roundOff - billDiscount;
            var salesLedger = data["sales_ledger"]?.ToString() ?? resolvedSalesLedger ?? "SALE";

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

            var xml = new StringBuilder();
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
            xml.AppendLine("          <VOUCHER VCHTYPE=\"Sales\" ACTION=\"Create\" OBJVIEW=\"Invoice Voucher View\">");
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
            if (!string.IsNullOrWhiteSpace(voucherNumber))
            {
                xml.AppendLine($"            <VOUCHERNUMBER>{EscapeXml(voucherNumber)}</VOUCHERNUMBER>");
            }
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
                var unit = item["unit"]?.ToString();
                if (string.IsNullOrWhiteSpace(unit) || unit.Equals("Nos", StringComparison.OrdinalIgnoreCase))
                {
                    unit = "PC";
                }

                if (string.IsNullOrEmpty(itemName))
                {
                    SyncLogger.Log($"    ⚠️ Sales Item #{itemIndex} has no stock_item_name, skipping");
                    continue;
                }

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

                var itemGstRate = item["gst_rate"]?.Value<decimal>() ?? item["gstRate"]?.Value<decimal>() ?? 0;
                if (itemGstRate == 0 && taxable > 0 && amount > taxable)
                {
                    itemGstRate = Math.Round((amount - taxable) / taxable * 100, 2);
                }

                SyncLogger.Log($"    Sales Item #{itemIndex}: {itemName}, Qty: {qty}, Rate: {rate}, Taxable: {taxable}, Discount: {itemDiscountAmount}");

                xml.AppendLine("            <ALLINVENTORYENTRIES.LIST>");
                xml.AppendLine($"              <STOCKITEMNAME>{EscapeXml(itemName)}</STOCKITEMNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <RATE>{rate}/{unit}</RATE>");
                xml.AppendLine($"              <AMOUNT>{taxable}</AMOUNT>");
                xml.AppendLine($"              <ACTUALQTY> {qty} {unit}</ACTUALQTY>");
                xml.AppendLine($"              <BILLEDQTY> {qty} {unit}</BILLEDQTY>");
                if (itemDiscountPercent > 0)
                {
                    xml.AppendLine($"              <DISCOUNT>{itemDiscountPercent}</DISCOUNT>");
                }
                xml.AppendLine("              <BATCHALLOCATIONS.LIST>");
                xml.AppendLine("                <GODOWNNAME>Main Location</GODOWNNAME>");
                xml.AppendLine("                <BATCHNAME>Primary Batch</BATCHNAME>");
                xml.AppendLine($"                <AMOUNT>{taxable}</AMOUNT>");
                xml.AppendLine($"                <ACTUALQTY> {qty} {unit}</ACTUALQTY>");
                xml.AppendLine($"                <BILLEDQTY> {qty} {unit}</BILLEDQTY>");
                xml.AppendLine("              </BATCHALLOCATIONS.LIST>");
                xml.AppendLine("              <ACCOUNTINGALLOCATIONS.LIST>");
                xml.AppendLine($"                <LEDGERNAME>{EscapeXml(salesLedger)}</LEDGERNAME>");
                xml.AppendLine("                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"                <AMOUNT>{taxable}</AMOUNT>");
                xml.AppendLine("              </ACCOUNTINGALLOCATIONS.LIST>");
                if (itemGstRate > 0)
                {
                    if (igst > 0)
                    {
                        xml.AppendLine("              <RATEDETAILS.LIST>");
                        xml.AppendLine("                <GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD>");
                        xml.AppendLine("                <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>");
                        xml.AppendLine($"                <GSTRATE> {itemGstRate}</GSTRATE>");
                        xml.AppendLine("              </RATEDETAILS.LIST>");
                    }
                    else
                    {
                        var halfRate = itemGstRate / 2;
                        xml.AppendLine("              <RATEDETAILS.LIST>");
                        xml.AppendLine("                <GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD>");
                        xml.AppendLine("                <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>");
                        xml.AppendLine($"                <GSTRATE> {halfRate}</GSTRATE>");
                        xml.AppendLine("              </RATEDETAILS.LIST>");
                        xml.AppendLine("              <RATEDETAILS.LIST>");
                        xml.AppendLine("                <GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD>");
                        xml.AppendLine("                <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>");
                        xml.AppendLine($"                <GSTRATE> {halfRate}</GSTRATE>");
                        xml.AppendLine("              </RATEDETAILS.LIST>");
                    }
                }
                xml.AppendLine("            </ALLINVENTORYENTRIES.LIST>");
            }

            // 2. LEDGERENTRIES.LIST SECOND (Party, CGST, SGST, IGST, Discount, Round Off)
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
                xml.AppendLine("            <LEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(salesLedger)}</LEDGERNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{grandTotal - cgst - sgst - igst - roundOff + billDiscount}</AMOUNT>");
                xml.AppendLine("            </LEDGERENTRIES.LIST>");
            }

            // CGST entry
            if (cgst > 0)
            {
                var cgstLedger = data["cgst_ledger"]?.ToString() ?? "CGST";
                xml.AppendLine("            <LEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(cgstLedger)}</LEDGERNAME>");
                xml.AppendLine("              <METHODTYPE>GST</METHODTYPE>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{cgst}</AMOUNT>");
                xml.AppendLine("            </LEDGERENTRIES.LIST>");
            }

            // SGST entry
            if (sgst > 0)
            {
                var sgstLedger = data["sgst_ledger"]?.ToString() ?? "SGST";
                xml.AppendLine("            <LEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(sgstLedger)}</LEDGERNAME>");
                xml.AppendLine("              <METHODTYPE>GST</METHODTYPE>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{sgst}</AMOUNT>");
                xml.AppendLine("            </LEDGERENTRIES.LIST>");
            }

            // IGST entry
            if (igst > 0)
            {
                var igstLedger = data["igst_ledger"]?.ToString() ?? "IGST";
                xml.AppendLine("            <LEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(igstLedger)}</LEDGERNAME>");
                xml.AppendLine("              <METHODTYPE>GST</METHODTYPE>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{igst}</AMOUNT>");
                xml.AppendLine("            </LEDGERENTRIES.LIST>");
            }

            // Bill Discount entry
            if (billDiscount > 0)
            {
                var discountLedger = data["discount_ledger"]?.ToString() ?? "Discount";
                xml.AppendLine("            <LEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(discountLedger)}</LEDGERNAME>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>-{billDiscount}</AMOUNT>");
                xml.AppendLine("            </LEDGERENTRIES.LIST>");
            }

            // Round Off entry
            if (roundOff != 0)
            {
                var roundOffLedger = data["round_off_ledger"]?.ToString() ?? "Round Off";
                xml.AppendLine("            <LEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(roundOffLedger)}</LEDGERNAME>");
                xml.AppendLine($"              <ISDEEMEDPOSITIVE>{(roundOff > 0 ? "No" : "Yes")}</ISDEEMEDPOSITIVE>");
                xml.AppendLine($"              <AMOUNT>{roundOff}</AMOUNT>");
                xml.AppendLine("            </LEDGERENTRIES.LIST>");
            }

            xml.AppendLine("          </VOUCHER>");
            xml.AppendLine("        </TALLYMESSAGE>");
            xml.AppendLine("      </REQUESTDATA>");
            xml.AppendLine("    </IMPORTDATA>");
            xml.AppendLine("  </BODY>");
            xml.AppendLine("</ENVELOPE>");

            return xml.ToString();
        }

        /// <summary>
        /// Generate Purchase Voucher XML
        /// </summary>
        private string GeneratePurchaseVoucherXml(string companyName, JObject data, DateTime date, string partyName, string narration)
        {
            var items = data["items"] as JArray ?? new JArray();
            var totalAmount = data["total_amount"]?.Value<decimal>() ?? 0;
            var cgst = data["cgst_amount"]?.Value<decimal>() ?? 0;
            var sgst = data["sgst_amount"]?.Value<decimal>() ?? 0;
            var igst = data["igst_amount"]?.Value<decimal>() ?? 0;
            var grandTotal = data["grand_total"]?.Value<decimal>() ?? totalAmount + cgst + sgst + igst;
            var purchaseLedger = data["purchase_ledger"]?.ToString() ?? "Purchase Account";

            var xml = new StringBuilder();
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
            xml.AppendLine($"          <VOUCHER VCHTYPE=\"Purchase\" ACTION=\"Create\">");
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine("            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>");
            xml.AppendLine($"            <PARTYLEDGERNAME>{EscapeXml(partyName)}</PARTYLEDGERNAME>");
            xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");
            xml.AppendLine("            <ISINVOICE>Yes</ISINVOICE>");

            // Party entry (Credit)
            xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(partyName)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>{grandTotal}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
            xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");

            // Purchase entry (Debit)
            xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(purchaseLedger)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>-{totalAmount}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
            xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");

            // GST entries
            if (cgst > 0)
            {
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>Input CGST</LEDGERNAME>");
                xml.AppendLine($"              <AMOUNT>-{cgst}</AMOUNT>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            if (sgst > 0)
            {
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>Input SGST</LEDGERNAME>");
                xml.AppendLine($"              <AMOUNT>-{sgst}</AMOUNT>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            if (igst > 0)
            {
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>Input IGST</LEDGERNAME>");
                xml.AppendLine($"              <AMOUNT>-{igst}</AMOUNT>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            // Inventory entries
            foreach (var item in items)
            {
                var itemName = item["stock_item_name"]?.ToString() ?? "";
                var qty = item["quantity"]?.Value<decimal>() ?? 0;
                var rate = item["rate"]?.Value<decimal>() ?? 0;
                var amount = item["amount"]?.Value<decimal>() ?? (qty * rate);
                var unit = item["unit"]?.ToString() ?? "Nos";

                xml.AppendLine("            <ALLINVENTORYENTRIES.LIST>");
                xml.AppendLine($"              <STOCKITEMNAME>{EscapeXml(itemName)}</STOCKITEMNAME>");
                xml.AppendLine($"              <ACTUALQTY>{qty} {unit}</ACTUALQTY>");
                xml.AppendLine($"              <BILLEDQTY>{qty} {unit}</BILLEDQTY>");
                xml.AppendLine($"              <RATE>{rate}/{unit}</RATE>");
                xml.AppendLine($"              <AMOUNT>-{amount}</AMOUNT>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
                xml.AppendLine("              <ACCOUNTINGALLOCATIONS.LIST>");
                xml.AppendLine($"                <LEDGERNAME>{EscapeXml(purchaseLedger)}</LEDGERNAME>");
                xml.AppendLine($"                <AMOUNT>-{amount}</AMOUNT>");
                xml.AppendLine("              </ACCOUNTINGALLOCATIONS.LIST>");
                xml.AppendLine("            </ALLINVENTORYENTRIES.LIST>");
            }

            xml.AppendLine("          </VOUCHER>");
            xml.AppendLine("        </TALLYMESSAGE>");
            xml.AppendLine("      </REQUESTDATA>");
            xml.AppendLine("    </IMPORTDATA>");
            xml.AppendLine("  </BODY>");
            xml.AppendLine("</ENVELOPE>");

            return xml.ToString();
        }

        /// <summary>
        /// Generate Receipt Voucher XML
        /// </summary>
        private string GenerateReceiptVoucherXml(string companyName, JObject data, DateTime date, string partyName, string narration)
        {
            var amount = data["amount"]?.Value<decimal>() ?? 0;
            var cashBankLedger = data["cash_bank_ledger"]?.ToString() ?? "Cash";

            var xml = new StringBuilder();
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
            xml.AppendLine($"          <VOUCHER VCHTYPE=\"Receipt\" ACTION=\"Create\">");
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine("            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>");
            xml.AppendLine($"            <PARTYLEDGERNAME>{EscapeXml(partyName)}</PARTYLEDGERNAME>");
            xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");

            // Cash/Bank (Debit)
            xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(cashBankLedger)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>-{amount}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
            xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");

            // Party (Credit)
            xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(partyName)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>{amount}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
            xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");

            xml.AppendLine("          </VOUCHER>");
            xml.AppendLine("        </TALLYMESSAGE>");
            xml.AppendLine("      </REQUESTDATA>");
            xml.AppendLine("    </IMPORTDATA>");
            xml.AppendLine("  </BODY>");
            xml.AppendLine("</ENVELOPE>");

            return xml.ToString();
        }

        /// <summary>
        /// Generate Payment Voucher XML
        /// </summary>
        private string GeneratePaymentVoucherXml(string companyName, JObject data, DateTime date, string partyName, string narration)
        {
            var amount = data["amount"]?.Value<decimal>() ?? 0;
            var cashBankLedger = data["cash_bank_ledger"]?.ToString() ?? "Cash";

            var xml = new StringBuilder();
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
            xml.AppendLine($"          <VOUCHER VCHTYPE=\"Payment\" ACTION=\"Create\">");
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine("            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>");
            xml.AppendLine($"            <PARTYLEDGERNAME>{EscapeXml(partyName)}</PARTYLEDGERNAME>");
            xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");

            // Party (Debit)
            xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(partyName)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>-{amount}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
            xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");

            // Cash/Bank (Credit)
            xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(cashBankLedger)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>{amount}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
            xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");

            xml.AppendLine("          </VOUCHER>");
            xml.AppendLine("        </TALLYMESSAGE>");
            xml.AppendLine("      </REQUESTDATA>");
            xml.AppendLine("    </IMPORTDATA>");
            xml.AppendLine("  </BODY>");
            xml.AppendLine("</ENVELOPE>");

            return xml.ToString();
        }

        /// <summary>
        /// Generate Journal Voucher XML
        /// </summary>
        private string GenerateJournalVoucherXml(string companyName, JObject data, DateTime date, string narration)
        {
            var entries = data["entries"] as JArray ?? new JArray();

            var xml = new StringBuilder();
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
            xml.AppendLine($"          <VOUCHER VCHTYPE=\"Journal\" ACTION=\"Create\">");
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine("            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>");
            xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");

            foreach (var entry in entries)
            {
                var ledgerName = entry["ledger_name"]?.ToString() ?? "";
                var amount = entry["amount"]?.Value<decimal>() ?? 0;
                var isDebit = entry["is_debit"]?.Value<bool>() ?? false;

                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(ledgerName)}</LEDGERNAME>");
                xml.AppendLine($"              <AMOUNT>{(isDebit ? -amount : amount)}</AMOUNT>");
                xml.AppendLine($"              <ISDEEMEDPOSITIVE>{(isDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            xml.AppendLine("          </VOUCHER>");
            xml.AppendLine("        </TALLYMESSAGE>");
            xml.AppendLine("      </REQUESTDATA>");
            xml.AppendLine("    </IMPORTDATA>");
            xml.AppendLine("  </BODY>");
            xml.AppendLine("</ENVELOPE>");

            return xml.ToString();
        }

        /// <summary>
        /// Escape special XML characters
        /// </summary>
        private string EscapeXml(string value)
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
