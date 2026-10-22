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

                foreach (var transaction in pendingTransactions)
                {
                    try
                    {
                        // Update status to processing
                        await _apiClient.UpdatePendingTransactionStatusAsync(transaction.Id, "processing");

                        // Generate Tally XML
                        var tallyXml = GenerateTallyVoucherXml(transaction, companyName);
                        
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

                    // Get created voucher number
                    var voucherNumber = doc.Descendants("LASTVCHID").FirstOrDefault()?.Value ??
                                       doc.Descendants("VOUCHERNUMBER").FirstOrDefault()?.Value ??
                                       doc.Descendants("ALTERID").FirstOrDefault()?.Value;

                    // Check for success indicators
                    var created = doc.Descendants("CREATED").FirstOrDefault()?.Value;
                    var altered = doc.Descendants("ALTERED").FirstOrDefault()?.Value;
                    
                    if (created == "1" || altered == "1" || !string.IsNullOrEmpty(voucherNumber))
                    {
                        return (true, voucherNumber ?? "OK", null);
                    }

                    return (false, null, "Tally did not confirm voucher creation");
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
        private string GenerateTallyVoucherXml(PendingTransaction transaction, string companyName)
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
                        return GenerateSalesVoucherXml(companyName, voucherData, voucherDate, partyName, narration);
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
                            return GenerateSalesVoucherXml(companyName, voucherData, voucherDate, partyName, narration);
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
        private string GenerateSalesVoucherXml(string companyName, JObject data, DateTime date, string partyName, string narration)
        {
            var items = data["items"] as JArray ?? new JArray();
            var totalAmount = data["total_amount"]?.Value<decimal>() ?? 0;
            var cgst = data["cgst_amount"]?.Value<decimal>() ?? 0;
            var sgst = data["sgst_amount"]?.Value<decimal>() ?? 0;
            var igst = data["igst_amount"]?.Value<decimal>() ?? 0;
            var roundOff = data["round_off"]?.Value<decimal>() ?? 0;
            var grandTotal = data["grand_total"]?.Value<decimal>() ?? totalAmount + cgst + sgst + igst + roundOff;
            var salesLedger = data["sales_ledger"]?.ToString() ?? "Sales Account";

            SyncLogger.Log($">>> Generating Sales XML:");
            SyncLogger.Log($"    Party: {partyName}, Date: {date:yyyyMMdd}, Total: {totalAmount}, GrandTotal: {grandTotal}");
            SyncLogger.Log($"    Items count: {items.Count}, CGST: {cgst}, SGST: {sgst}, IGST: {igst}");

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
            }

            // Recalculate grandTotal if it's zero and we have components
            if (grandTotal == 0)
            {
                var subtotal = data["subtotal"]?.Value<decimal>() ?? 0;
                if (subtotal > 0)
                    totalAmount = subtotal;
                grandTotal = totalAmount + cgst + sgst + igst + roundOff;
                SyncLogger.Log($"    Recalculated grandTotal: {grandTotal} (subtotal={totalAmount}, tax={cgst + sgst + igst})");
            }
            
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
            xml.AppendLine($"          <VOUCHER VCHTYPE=\"Sales\" ACTION=\"Create\">");
            xml.AppendLine($"            <DATE>{date:yyyyMMdd}</DATE>");
            xml.AppendLine("            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>");
            xml.AppendLine($"            <PARTYLEDGERNAME>{EscapeXml(partyName)}</PARTYLEDGERNAME>");
            xml.AppendLine($"            <NARRATION>{EscapeXml(narration)}</NARRATION>");
            xml.AppendLine("            <ISINVOICE>Yes</ISINVOICE>");

            // Party entry (Debit)
            xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(partyName)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>-{grandTotal}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>");
            xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");

            // Sales entry (Credit)
            xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
            xml.AppendLine($"              <LEDGERNAME>{EscapeXml(salesLedger)}</LEDGERNAME>");
            xml.AppendLine($"              <AMOUNT>{totalAmount}</AMOUNT>");
            xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
            xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");

            // CGST entry
            if (cgst > 0)
            {
                var cgstLedger = data["cgst_ledger"]?.ToString() ?? "CGST";
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(cgstLedger)}</LEDGERNAME>");
                xml.AppendLine($"              <AMOUNT>{cgst}</AMOUNT>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            // SGST entry
            if (sgst > 0)
            {
                var sgstLedger = data["sgst_ledger"]?.ToString() ?? "SGST";
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(sgstLedger)}</LEDGERNAME>");
                xml.AppendLine($"              <AMOUNT>{sgst}</AMOUNT>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            // IGST entry
            if (igst > 0)
            {
                var igstLedger = data["igst_ledger"]?.ToString() ?? "IGST";
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(igstLedger)}</LEDGERNAME>");
                xml.AppendLine($"              <AMOUNT>{igst}</AMOUNT>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            // Round Off entry
            if (roundOff != 0)
            {
                var roundOffLedger = data["round_off_ledger"]?.ToString() ?? "Round Off";
                xml.AppendLine("            <ALLLEDGERENTRIES.LIST>");
                xml.AppendLine($"              <LEDGERNAME>{EscapeXml(roundOffLedger)}</LEDGERNAME>");
                xml.AppendLine($"              <AMOUNT>{roundOff}</AMOUNT>");
                xml.AppendLine($"              <ISDEEMEDPOSITIVE>{(roundOff > 0 ? "No" : "Yes")}</ISDEEMEDPOSITIVE>");
                xml.AppendLine("            </ALLLEDGERENTRIES.LIST>");
            }

            // Inventory entries
            int itemIndex = 0;
            foreach (var item in items)
            {
                itemIndex++;
                var itemName = item["stock_item_name"]?.ToString() ?? item["description"]?.ToString() ?? "";
                var qty = item["quantity"]?.Value<decimal>() ?? 0;
                var rate = item["rate"]?.Value<decimal>() ?? 0;
                var amount = item["amount"]?.Value<decimal>() ?? (qty * rate);
                var unit = item["unit"]?.ToString() ?? "Nos";

                if (string.IsNullOrEmpty(itemName))
                {
                    SyncLogger.Log($"    ⚠️ Sales Item #{itemIndex} has no stock_item_name, skipping");
                    continue;
                }

                SyncLogger.Log($"    Sales Item #{itemIndex}: {itemName}, Qty: {qty}, Rate: {rate}, Amount: {amount}");

                xml.AppendLine("            <ALLINVENTORYENTRIES.LIST>");
                xml.AppendLine($"              <STOCKITEMNAME>{EscapeXml(itemName)}</STOCKITEMNAME>");
                xml.AppendLine($"              <ACTUALQTY>{qty} {unit}</ACTUALQTY>");
                xml.AppendLine($"              <BILLEDQTY>{qty} {unit}</BILLEDQTY>");
                xml.AppendLine($"              <RATE>{rate}/{unit}</RATE>");
                xml.AppendLine($"              <AMOUNT>{amount}</AMOUNT>");
                xml.AppendLine("              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>");
                xml.AppendLine("              <ACCOUNTINGALLOCATIONS.LIST>");
                xml.AppendLine($"                <LEDGERNAME>{EscapeXml(salesLedger)}</LEDGERNAME>");
                xml.AppendLine($"                <AMOUNT>{amount}</AMOUNT>");
                xml.AppendLine("              </ACCOUNTINGALLOCATIONS.LIST>");
                xml.AppendLine("            </ALLINVENTORYENTRIES.LIST>");
            }

            // Add serial number as a basic auto-number if Tally expects it
            xml.AppendLine("            <SERIALNO>1</SERIALNO>");

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
