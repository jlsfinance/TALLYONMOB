using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using System.Xml;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// TallyConnector - Connects to Tally ERP via XML API (ODBC Server)
    /// Fetches data from Tally running on localhost:9000
    /// </summary>
    public class TallyConnector : IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly string _tallyUrl;
        private readonly int _timeout;

        public TallyConnector(string host = "127.0.0.1", int port = 9000, int timeoutSeconds = 300)
        {
            _tallyUrl = $"http://{host}:{port}";
            _timeout = timeoutSeconds;

            _httpClient = new HttpClient
            {
                Timeout = TimeSpan.FromSeconds(_timeout)
            };
            _httpClient.DefaultRequestHeaders.Add("Accept", "text/xml");
        }

        /// <summary>
        /// Test connection to Tally using multiple common ports
        /// </summary>
        public async Task<(bool Success, string? Message)> TestConnectionAsync()
        {
            int[] commonPorts = { 9000, 9001 };
            string lastError = "";

            foreach (var port in commonPorts)
            {
                try
                {
                    string url = $"http://127.0.0.1:{port}";
                    var pingRequest = "<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Summary</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";
                    var content = new StringContent(pingRequest, Encoding.UTF8, "text/xml");
                    
                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2)))
                    {
                        var response = await _httpClient.PostAsync(url, content, cts.Token);
                        if (response.IsSuccessStatusCode)
                        {
                            return (true, $"Connected on port {port}");
                        }
                    }
                }
                catch (TaskCanceledException)
                {
                }
                catch (Exception ex)
                {
                    lastError = ex.Message;
                }
            }

            return (false, "Tally not responding. Please check:\n" +
                           "1. Tally is OPEN.\n" +
                           "2. F1 -> Settings -> Connectivity -> Client/Server Configuration.\n" +
                           "3. Enable ODBC = Yes, Port = 9000.\n" +
                           "4. Restart Tally after changes.");
        }

        /// <summary>
        /// Send XML request to Tally and get response
        /// </summary>
        private async Task<XDocument?> SendRequestAsync(string xmlRequest, string? companyName = null, int? customTimeout = null)
        {
            try
            {
                SyncLogger.Log($">>> Tally Request [{companyName ?? "Global"}]: XML Length {xmlRequest.Length}");
                SyncLogger.SaveFile("last_tally_request.xml", xmlRequest);

                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(customTimeout ?? _timeout)))
                {
                    var content = new StringContent(xmlRequest, Encoding.UTF8, "text/xml");
                    var response = await _httpClient.PostAsync(_tallyUrl, content, cts.Token);

                    if (!response.IsSuccessStatusCode) return null;

                    var responseContent = await response.Content.ReadAsStringAsync();
                    SyncLogger.SaveFile("last_tally_response.xml", responseContent);
                    
                    if (string.IsNullOrEmpty(responseContent)) return null;

                    string sanitizedContent = SanitizeXmlString(responseContent);
                    
                    try
                    {
                        var settings = new XmlReaderSettings 
                        { 
                            CheckCharacters = false, 
                            IgnoreComments = true, 
                            DtdProcessing = DtdProcessing.Ignore 
                        };
                        using (var stringReader = new StringReader(sanitizedContent))
                        using (var xmlReader = XmlReader.Create(stringReader, settings))
                        {
                            return XDocument.Load(xmlReader);
                        }
                    }
                    catch (Exception xmlEx)
                    {
                         SyncLogger.Log($"❌ XML PARSE FAILURE: {xmlEx.Message}");
                         SyncLogger.SaveFile("tally_parse_error.txt", sanitizedContent);
                         throw new Exception($"Invalid XML from Tally: {xmlEx.Message}", xmlEx);
                    }
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"❌ Tally Communication Error: {ex.Message}");
                if (ex.InnerException != null) SyncLogger.Log($"   Inner: {ex.InnerException.Message}");
                return null;
            }
        }

        /// <summary>
        /// Sanitizes XML string by removing invalid control characters
        /// </summary>
        private string SanitizeXmlString(string xml)
        {
            if (string.IsNullOrEmpty(xml)) return xml;
            
            var sb = new StringBuilder(xml.Length);
            foreach (var ch in xml)
            {
                if ((ch == 0x09) || (ch == 0x0A) || (ch == 0x0D) ||
                    (ch >= 0x20 && ch <= 0xD7FF) ||
                    (ch >= 0xE000 && ch <= 0xFFFD))
                {
                    sb.Append(ch);
                }
            }
            return sb.ToString();
        }

        /// <summary>
        /// Escapes string for XML safety and removes invalid characters
        /// </summary>
        private string EscapeXml(string? value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            string clean = SanitizeXmlString(value);
            return System.Security.SecurityElement.Escape(clean);
        }

        public async Task<string> GetTallySerialNumberAsync()
        {
            var request = @"<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>SerialReport</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME=""SerialReport""><FORMS>SerialForm</FORMS></REPORT><FORM NAME=""SerialForm""><PARTS>SerialPart</PARTS></FORM><PART NAME=""SerialPart""><LINES>SerialLine</LINES></PART><LINE NAME=""SerialLine""><FIELDS>SerialField</FIELDS></LINE><FIELD NAME=""SerialField""><SET>$$LicenseInfo:SerialNumber</SET></FIELD></TDLMESSAGE></TDL></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";
            try 
            {
                var doc = await SendRequestAsync(request, null, 10);
                if (doc == null) return string.Empty;
                var serial = doc.Descendants("SERIALFIELD").FirstOrDefault()?.Value;
                return serial?.Trim() ?? string.Empty;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"❌ Error fetching Tally serial: {ex.Message}");
                return string.Empty;
            }
        }

        public async Task<List<Company>> GetOpenCompaniesAsync()
        {
            var request = @"<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>CompanyCollection</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME=""CompanyCollection""><TYPE>Company</TYPE><FETCH>NAME, GUID, MasterId</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>";

            try
            {
                var doc = await SendRequestAsync(request);
                if (doc == null) return new List<Company>();

                // REMOVED: File.WriteAllText("tally_response.xml", doc.ToString());

                var companies = new List<Company>();
                var companyElements = doc.Descendants().Where(x => x.Name.LocalName.Equals("COMPANY", StringComparison.OrdinalIgnoreCase));
                
                foreach (var comp in companyElements)
                {
                    string? name = comp.Element("NAME")?.Value ?? comp.Attribute("NAME")?.Value ?? comp.Value;
                    if (string.IsNullOrEmpty(name) || name.Length < 2) continue;
                    if (name.Contains("Report") || name.Contains("Error") || name.Contains("\n")) continue;

                    name = name.Trim();
                    string cleanName = name.Split(" -")[0].Split(" (")[0].Trim();
                    var sanitizedId = System.Text.RegularExpressions.Regex.Replace(cleanName, @"[^a-zA-Z0-9]", "").ToUpperInvariant();
                    
                    if (!companies.Any(c => c.Name == name))
                    {
                        companies.Add(new Company { Id = sanitizedId, Name = name });
                    }
                }

                if (companies.Count == 0)
                {
                    var active = await GetActiveCompanyAsync();
                    if (active != null) companies.Add(active);
                }
                return companies;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company list error: {ex.Message}");
                return new List<Company>();
            }
        }

        public async Task<Company?> GetActiveCompanyAsync()
        {
            var request = @"<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Accounts</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";
            try
            {
                var doc = await SendRequestAsync(request);
                if (doc == null) return null;
                string? name = doc.Descendants().FirstOrDefault(x => x.Name.LocalName.Equals("SVCURRENTCOMPANY", StringComparison.OrdinalIgnoreCase))?.Value;
                if (string.IsNullOrEmpty(name)) name = doc.Descendants().FirstOrDefault(x => x.Name.LocalName.Equals("COMPANY", StringComparison.OrdinalIgnoreCase))?.Element("NAME")?.Value;
                if (string.IsNullOrEmpty(name) || name.Contains("Report") || name.Contains("Error")) return null;
                name = name.Trim();
                var sanitizedId = System.Text.RegularExpressions.Regex.Replace(name, @"[^a-zA-Z0-9]", "").ToUpperInvariant();
                return new Company { Id = sanitizedId, Name = name };
            }
            catch { return null; }
        }

        public async Task<Dictionary<string, int>> GetRecordCountsAsync(string? companyName = null)
        {
            var counts = new Dictionary<string, int> { { "Ledgers", 0 }, { "Sales", 0 }, { "Purchases", 0 }, { "StockItems", 0 } };
            try {
                var request = @"<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Statistics</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";
                var doc = await SendRequestAsync(request, companyName);
                if (doc != null)
                {
                    foreach (var row in doc.Descendants("STATROW"))
                    {
                        string? type = GetElementValue(row, "STATROWNAME");
                        int count = (int)ParseDecimal(GetElementValue(row, "STATROWCOUNT"));
                        if (type == null) continue;
                        if (type.Contains("Ledgers")) counts["Ledgers"] = count;
                        else if (type.Contains("Stock Items")) counts["StockItems"] = count;
                        else if (type.Contains("Vouchers") || type.Contains("Accounting Vouchers")) counts["Vouchers"] = count;
                        else if (type.Contains("Sales")) counts["Sales"] = count;
                        else if (type.Contains("Purchase")) counts["Purchases"] = count;
                    }
                }
            } catch { }
            return counts;
        }

        private async Task<int> GetCountAsync(string tallyType, string? companyName = null)
        {
            var request = $@"<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>CountColl</ID></HEADER><BODY><DESC><TDL><TDLMESSAGE><COLLECTION NAME=""CountColl""><TYPE>{tallyType}</TYPE></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>";
            var doc = await SendRequestAsync(request, companyName);
            var tag = tallyType.Replace(" ", "").ToUpper();
            return doc?.Descendants(tag).Count() ?? 0;
        }

        public async Task<List<Ledger>> GetLedgersAsync(string? companyName = null)
        {
            var request = $@"<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>LedgerCollection</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME=""LedgerCollection"" ISMODIFY=""No""><TYPE>Ledger</TYPE><FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS, PHONE, EMAIL, GSTREGISTRATIONNUMBER, PANNUMBER, MASTERID, ALTERID</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>";
            var doc = await SendRequestAsync(request, companyName);
            if (doc == null) return new List<Ledger>();
            var ledgers = new List<Ledger>();
            foreach (var ledgerElement in doc.Descendants("LEDGER"))
            {
                try
                {
                    ledgers.Add(new Ledger
                    {
                        Id = GetAttribute(ledgerElement, "GUID") ?? GetElementValue(ledgerElement, "GUID") ?? Guid.NewGuid().ToString(),
                        Name = GetAttribute(ledgerElement, "NAME") ?? GetElementValue(ledgerElement, "NAME") ?? "Unknown",
                        ParentGroup = GetElementValue(ledgerElement, "PARENT"),
                        LedgerGroup = GetElementValue(ledgerElement, "PARENT"),
                        OpeningBalance = ParseDecimal(GetElementValue(ledgerElement, "OPENINGBALANCE")),
                        ClosingBalance = ParseDecimal(GetElementValue(ledgerElement, "CLOSINGBALANCE")),
                        Address = string.Join(", ", ledgerElement.Descendants("ADDRESS").Select(a => a.Value)),
                        Phone = GetElementValue(ledgerElement, "PHONE") ?? GetElementValue(ledgerElement, "LEDGERPHONE"),
                        Email = GetElementValue(ledgerElement, "EMAIL") ?? GetElementValue(ledgerElement, "LEDGEREMAIL"),
                        Gstin = GetElementValue(ledgerElement, "GSTREGISTRATIONNUMBER") ?? GetElementValue(ledgerElement, "PARTYGSTIN"),
                        Pan = GetElementValue(ledgerElement, "PANNUMBER"),
                        MasterId = GetElementValue(ledgerElement, "MASTERID"),
                        AlterId = GetElementValue(ledgerElement, "ALTERID")
                    });
                }
                catch { }
            }
            return ledgers;
        }

        public async Task<List<Voucher>> GetModifiedVouchersAsync(string companyName, long afterAlterId, Dictionary<string, string?>? stockItemHsnCache = null)
        {
            SyncLogger.Log($"🔍 Fetching vouchers with ALTERID > {afterAlterId}");
            var request = $@"<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ModifiedVouchers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY><SVEXPLODEALL>Yes</SVEXPLODEALL></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME=""ModifiedVouchers""><TYPE>Voucher</TYPE><FETCH>MASTERID, ALTERID, VOUCHERTYPENAME, VOUCHERNUMBER, DATE, PARTYLEDGERNAME, AMOUNT, NARRATION, ALLLEDGERENTRIES.LIST, ALLINVENTORYENTRIES.LIST</FETCH><FILTER>ModifiedAfter</FILTER></COLLECTION><SYSTEM TYPE=""Formulae"" NAME=""ModifiedAfter"">$$NumValue:$ALTERID > {afterAlterId}</SYSTEM></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>";
            var doc = await SendRequestAsync(request, companyName, 300);
            if (doc == null) return new List<Voucher>();
            return ParseVouchersFromXml(doc, companyName, DateTime.Today, stockItemHsnCache);
        }

        public async Task<List<Ledger>> GetModifiedLedgersAsync(string companyName, long afterAlterId)
        {
            SyncLogger.Log($"🔍 Fetching ledgers with ALTERID > {afterAlterId}");
            var request = $@"<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ModifiedLedgers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME=""ModifiedLedgers""><TYPE>Ledger</TYPE><FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS, PHONE, EMAIL, GSTREGISTRATIONNUMBER, PANNUMBER, MASTERID, ALTERID</FETCH><FILTER>ModifiedAfter</FILTER></COLLECTION><SYSTEM TYPE=""Formulae"" NAME=""ModifiedAfter"">$$NumValue:$ALTERID > {afterAlterId}</SYSTEM></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>";
            var doc = await SendRequestAsync(request, companyName, 120);
            if (doc == null) return new List<Ledger>();
            var ledgers = new List<Ledger>();
            foreach (var ledgerElement in doc.Descendants("LEDGER"))
            {
                try
                {
                    ledgers.Add(new Ledger
                    {
                        Id = GetAttribute(ledgerElement, "GUID") ?? GetElementValue(ledgerElement, "GUID") ?? Guid.NewGuid().ToString(),
                        Name = GetAttribute(ledgerElement, "NAME") ?? GetElementValue(ledgerElement, "NAME") ?? "Unknown",
                        ParentGroup = GetElementValue(ledgerElement, "PARENT"),
                        LedgerGroup = GetElementValue(ledgerElement, "PARENT"),
                        OpeningBalance = ParseDecimal(GetElementValue(ledgerElement, "OPENINGBALANCE")),
                        ClosingBalance = ParseDecimal(GetElementValue(ledgerElement, "CLOSINGBALANCE")),
                        Address = string.Join(", ", ledgerElement.Descendants("ADDRESS").Select(a => a.Value)),
                        Phone = GetElementValue(ledgerElement, "PHONE") ?? GetElementValue(ledgerElement, "LEDGERPHONE"),
                        Email = GetElementValue(ledgerElement, "EMAIL") ?? GetElementValue(ledgerElement, "LEDGEREMAIL"),
                        Gstin = GetElementValue(ledgerElement, "GSTREGISTRATIONNUMBER") ?? GetElementValue(ledgerElement, "PARTYGSTIN"),
                        Pan = GetElementValue(ledgerElement, "PANNUMBER"),
                        MasterId = GetElementValue(ledgerElement, "MASTERID"),
                        AlterId = GetElementValue(ledgerElement, "ALTERID")
                    });
                }
                catch { }
            }
            return ledgers;
        }

        public async Task<List<Voucher>> GetVouchersAsync(DateTime? fromDate = null, DateTime? toDate = null, string? companyName = null, Dictionary<string, string?>? stockItemHsnCache = null)
        {
            return await GetVouchersInternalAsync(fromDate, toDate, companyName, null, stockItemHsnCache);
        }

        public async Task<List<Voucher>> GetVouchersChunkedAsync(DateTime fromDate, DateTime toDate, string? companyName, Action<string>? progressCallback = null, Dictionary<string, string?>? stockItemHsnCache = null)
        {
            var allVouchers = new List<Voucher>();
            var current = new DateTime(fromDate.Year, fromDate.Month, 1);
            var endMonth = new DateTime(toDate.Year, toDate.Month, 1);
            int monthCount = 0;
            int totalMonths = ((toDate.Year - fromDate.Year) * 12) + toDate.Month - fromDate.Month + 1;
            bool hasFailures = false;

            while (current <= endMonth)
            {
                monthCount++;
                var monthStart = current;
                var monthEnd = current.AddMonths(1).AddDays(-1);
                if (monthEnd > toDate) monthEnd = toDate;
                progressCallback?.Invoke($"Fetching {current:MMM yyyy} ({monthCount}/{totalMonths})...");
                
                try
                {
                    var monthVouchers = await GetVouchersInternalAsync(monthStart, monthEnd, companyName, null, stockItemHsnCache);
                    allVouchers.AddRange(monthVouchers);
                    progressCallback?.Invoke($"✓ {current:MMM yyyy}: {monthVouchers.Count} vouchers");
                    await Task.Delay(100);
                }
                catch
                {
                    hasFailures = true;
                }
                current = current.AddMonths(1);
            }
            
            if (hasFailures) throw new Exception($"Partial Sync Failure: Some months failed to load.");
            return allVouchers;
        }

        private async Task<List<Voucher>> GetVouchersInternalAsync(DateTime? fromDate, DateTime? toDate, string? companyName, string? voucherTypeFilter, Dictionary<string, string?>? stockItemHsnCache = null)
        {
            // SAFETY: xml escape company name
            string requestCompanyName = companyName?.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;") ?? "";

            DateTime effectiveFrom = fromDate ?? new DateTime(2024, 4, 1);
            DateTime effectiveTo = toDate ?? effectiveFrom;
            string fromDateStr = effectiveFrom.ToString("yyyyMMdd");
            string toDateStr = effectiveTo.ToString("yyyyMMdd");

            // Build TDL Filter
            // We use a Direct Collection Export which is the most reliable way to get raw data
            // Bypassing "Reports" which can have UI-specific filtering
            
            var typeFilter = string.IsNullOrEmpty(voucherTypeFilter) 
                ? "" 
                : $" AND $VoucherTypeName = \"{voucherTypeFilter}\"";

            var request = $@"<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>VoucherCollection</ID></HEADER>
<BODY><DESC>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>{requestCompanyName}</SVCURRENTCOMPANY><SVEXPLODEALL>Yes</SVEXPLODEALL></STATICVARIABLES>
<TDL><TDLMESSAGE>
<COLLECTION NAME=""VoucherCollection"">
<TYPE>Voucher</TYPE>
<FETCH>MASTERID, ALTERID, VOUCHERTYPENAME, VOUCHERNUMBER, DATE, PARTYLEDGERNAME, AMOUNT, NARRATION, ALLLEDGERENTRIES.LIST, ALLINVENTORYENTRIES.LIST, HSNDETAILS.LIST</FETCH>
<FILTER>FilterRules</FILTER>
</COLLECTION>
<SYSTEM TYPE=""Formulae"" NAME=""FilterRules"">$Date &gt;= $$Date:{fromDateStr} AND $Date &lt;= $$Date:{toDateStr}{typeFilter}</SYSTEM>
</TDLMESSAGE></TDL>
</DESC></BODY></ENVELOPE>";

            int timeout = string.IsNullOrEmpty(voucherTypeFilter) ? 300 : 60; // Increased timeout for bulk fetch
            
            SyncLogger.Log($"[Tally FETCH] Requesting Vouchers: {effectiveFrom:dd-MM-yyyy} to {effectiveTo:dd-MM-yyyy}");
            
            var doc = await SendRequestAsync(request, companyName, timeout);
            var vouchers = new List<Voucher>();

            // Primary Parse
            if (doc != null)
            {
                vouchers = ParseVouchersFromXml(doc, companyName, effectiveFrom, stockItemHsnCache);
            }

            // FALLBACK: If Collection returns 0 but it's a large date range, try Day Book Report
            // This handles cases where user permissions or TDL definitions block Collections
            if (vouchers.Count == 0 && (effectiveTo - effectiveFrom).TotalDays > 0)
            {
                SyncLogger.Log($"⚠️ standard Collection returned 0 vouchers. Retrying with Day Book Report...");
                
                var dayBookRequest = $@"<ENVELOPE>
<HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
<BODY><EXPORTDATA>
<REQUESTDESC><REPORTNAME>Day Book</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>{requestCompanyName}</SVCURRENTCOMPANY><SVFROMDATE>{fromDateStr}</SVFROMDATE><SVTODA>{toDateStr}</SVTODA></STATICVARIABLES>
</REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                var dbDoc = await SendRequestAsync(dayBookRequest, companyName, timeout);
                if (dbDoc != null)
                {
                    var dbVouchers = ParseVouchersFromXml(dbDoc, companyName, effectiveFrom, stockItemHsnCache);
                    if (dbVouchers.Count > 0)
                    {
                        SyncLogger.Log($"✅ Fallback Successful: Found {dbVouchers.Count} vouchers via Day Book.");
                        return dbVouchers;
                    }
                }
            }

            return vouchers;
        }

        private List<Voucher> ParseVouchersFromXml(XDocument doc, string? companyName, DateTime defaultDate, Dictionary<string, string?>? stockItemHsnCache = null)
        {
            var vouchers = new List<Voucher>();
            var companyId = CleanCompanyId(companyName);
            // Support both VOUCHER (Collection) and VOUCHER REMOTE (Day Book) tags
            var voucherNodes = doc.Descendants().Where(e => e.Name.LocalName == "VOUCHER" || e.Name.LocalName == "DSPVCH" || e.Name.LocalName == "VOUCHERREMOTE").ToList();

            foreach (var vNode in voucherNodes)
            {
                string vNum = "0";
                try
                {
                    string vType = GetElementValue(vNode, "VOUCHERTYPENAME") ?? GetElementValue(vNode, "VCHTYPE") ?? GetElementValue(vNode, "DSPVCHTYPE") ?? "Unknown";
                    vNum = GetElementValue(vNode, "VOUCHERNUMBER") ?? GetElementValue(vNode, "VCHNO") ?? GetElementValue(vNode, "DSPVCHNUMBER") ?? "0";
                    DateTime vDate = ParseDate(GetElementValue(vNode, "DATE") ?? GetElementValue(vNode, "DSPVCHDATE"));
                    if (vDate == DateTime.MinValue) vDate = defaultDate;

                    var ledgerEntries = new List<VoucherLedgerEntry>();
                    var ledgerNodes = vNode.Descendants().Where(e => (e.Name.LocalName.Contains("LEDGERENTRIES", StringComparison.OrdinalIgnoreCase) || e.Name.LocalName.Contains("DSPVCHLEDGER", StringComparison.OrdinalIgnoreCase)) && !e.Ancestors().Any(a => a.Name.LocalName.Contains("INVENTORYENTRIES", StringComparison.OrdinalIgnoreCase) || a.Name.LocalName.Contains("ORDERLIST", StringComparison.OrdinalIgnoreCase))).ToList();

                    foreach (var lNode in ledgerNodes)
                    {
                        string lName = GetElementValue(lNode, "LEDGERNAME") ?? GetElementValue(lNode, "DSPVCHLEDGERNAME") ?? "";
                        if (string.IsNullOrEmpty(lName)) continue;
                        decimal amount = ParseDecimal(GetElementValue(lNode, "AMOUNT") ?? GetElementValue(lNode, "DSPVCHLEDGERAMOUNT"));
                        ledgerEntries.Add(new VoucherLedgerEntry { LedgerName = lName, Amount = Math.Abs(amount), IsDebit = amount < 0 });
                    }

                    var inventoryEntries = new List<VoucherInventoryEntry>();
                    var invNodes = vNode.Descendants().Where(e => e.Name.LocalName.Equals("ALLINVENTORYENTRIES.LIST", StringComparison.OrdinalIgnoreCase) || e.Name.LocalName.Equals("INVENTORYENTRIES.LIST", StringComparison.OrdinalIgnoreCase) || e.Name.LocalName.Equals("INVENTORYENTRIESIN.LIST", StringComparison.OrdinalIgnoreCase) || e.Name.LocalName.Equals("INVENTORYENTRIESOUT.LIST", StringComparison.OrdinalIgnoreCase) || (e.Name.LocalName.Contains("DSPVCH") && e.Elements().Any(c => c.Name.LocalName.Equals("STOCKITEMNAME", StringComparison.OrdinalIgnoreCase) || c.Name.LocalName.Equals("DSPVCHITEMNAME", StringComparison.OrdinalIgnoreCase)))).ToList();

                    foreach (var iNode in invNodes)
                    {
                        var iDescendants = iNode.Descendants().ToList();
                        string itemName = GetElementValue(iNode, "STOCKITEMNAME") ?? GetElementValue(iNode, "DSPVCHITEMNAME") ?? GetElementValue(iNode, "ITEMNAME") ?? "";
                        if (string.IsNullOrEmpty(itemName) || itemName.Equals("Stock Item", StringComparison.OrdinalIgnoreCase)) continue;
                        string hsnCode = ResolveHsn(iDescendants, itemName, stockItemHsnCache);
                        string qtyStr = GetElementValue(iNode, "BILLEDQTY") ?? GetElementValue(iNode, "ACTUALQTY") ?? GetElementValue(iNode, "DSPVCHQTY") ?? GetElementValue(iNode, "QTY") ?? "0";
                        decimal qty = ParseDecimal(qtyStr);
                        string unit = GetElementValue(iNode, "DSPVCHUNIT") ?? GetElementValue(iNode, "UNIT") ?? "";
                        if (string.IsNullOrEmpty(unit) && qtyStr.Contains(' ')) unit = qtyStr.Split(' ').LastOrDefault() ?? "";
                        string rateStr = GetElementValue(iNode, "RATE") ?? GetElementValue(iNode, "DSPVCHRATE") ?? "0";
                        decimal rate = ParseDecimal(rateStr);
                        decimal amount = Math.Abs(ParseDecimal(GetElementValue(iNode, "AMOUNT") ?? GetElementValue(iNode, "DSPVCHITEMAMOUNT") ?? "0"));
                        string? taxRateStr = iDescendants.FirstOrDefault(x => x.Name.LocalName.Equals("RATEOFTAXCALCULATION", StringComparison.OrdinalIgnoreCase))?.Value;
                        decimal? taxRate = !string.IsNullOrEmpty(taxRateStr) ? ParseDecimal(taxRateStr) : (decimal?)null;
                        string? taxability = iDescendants.FirstOrDefault(x => x.Name.LocalName.Equals("TAXABILITY", StringComparison.OrdinalIgnoreCase))?.Value;
                        inventoryEntries.Add(new VoucherInventoryEntry { StockItemName = itemName, Quantity = qty, Unit = unit, Rate = rate, Amount = amount, HsnCode = hsnCode, TaxRate = taxRate, Taxability = taxability });
                    }

                    string partyName = GetElementValue(vNode, "PARTYLEDGERNAME") ?? GetElementValue(vNode, "PARTYNAME") ?? GetElementValue(vNode, "DSPVCHPARTY") ?? "";
                    if (string.IsNullOrEmpty(partyName) && ledgerEntries.Count > 0) partyName = ledgerEntries.OrderByDescending(l => l.Amount).FirstOrDefault()?.LedgerName ?? "";
                    decimal totalAmount = 0;
                    var mainPartyLedger = ledgerEntries.FirstOrDefault(l => !string.IsNullOrEmpty(partyName) && l.LedgerName.Equals(partyName, StringComparison.OrdinalIgnoreCase));
                    if (mainPartyLedger != null) totalAmount = Math.Abs(mainPartyLedger.Amount);
                    else { if (ledgerEntries.Count > 0) totalAmount = ledgerEntries.Max(l => Math.Abs(l.Amount)); if (totalAmount == 0) totalAmount = Math.Abs(ParseDecimal(GetElementValue(vNode, "AMOUNT") ?? GetElementValue(vNode, "DSPVCHAMOUNT"))); }
                    if (totalAmount == 0 && inventoryEntries.Count > 0) totalAmount = inventoryEntries.Sum(i => i.Amount);

                    var voucher = new Voucher { CompanyId = companyId, VoucherType = vType, VoucherNumber = vNum, VoucherDate = vDate, PartyName = partyName, TotalAmount = totalAmount, Narration = GetElementValue(vNode, "NARRATION"), MasterId = GetElementValue(vNode, "MASTERID") ?? GetElementValue(vNode, "GUID"), AlterId = GetElementValue(vNode, "ALTERID"), LedgerEntries = ledgerEntries, InventoryEntries = inventoryEntries };
                    voucher.GenerateDeterministicId(companyId);
                    vouchers.Add(voucher);
                }
                catch (Exception ex) { SyncLogger.Log($"Error parsing voucher {vNum}: {ex.Message}"); }
            }
            return vouchers;
        }

        private string CleanCompanyId(string? companyName)
        {
            if (string.IsNullOrEmpty(companyName)) return "UNKNOWN";
            string clean = companyName.Split(" -")[0].Split(" (")[0].Trim();
            return Regex.Replace(clean, @"[^a-zA-Z0-9]", "").ToUpperInvariant();
        }

        public List<Sale> MapVouchersToSales(List<Voucher> vouchers, string? companyName)
        {
            // Simplified mapping for brevity in reconstruction
            var companyId = CleanCompanyId(companyName);
            return vouchers.Select(v => new Sale { Id = v.Id, VoucherId = v.Id, InvoiceNumber = v.VoucherNumber, InvoiceDate = v.VchDate, PartyLedgerName = v.PartyName ?? "Cash", GrossAmount = v.TotalAmount, NetAmount = v.TotalAmount, CompanyId = companyId }).ToList();
        }

        public List<Purchase> MapVouchersToPurchases(List<Voucher> vouchers, string? companyName)
        {
            var companyId = CleanCompanyId(companyName);
            return vouchers.Select(v => new Purchase { Id = v.Id, VoucherId = v.Id, InvoiceNumber = v.VoucherNumber, InvoiceDate = v.VchDate, PartyLedgerName = v.PartyName ?? "Cash", GrossAmount = v.TotalAmount, NetAmount = v.TotalAmount, CompanyId = companyId }).ToList();
        }

        public async Task<List<StockItem>> GetStockItemsAsync(string? companyName = null)
        {
            var request = $@"<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>StockItemCollection</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME=""StockItemCollection"" ISMODIFY=""No""><TYPE>Stock Item</TYPE><FETCH>NAME, NAME.LIST, GUID, PARENT, BASEUNITS, OPENINGBALANCE, CLOSINGBALANCE, GSTDETAILS.LIST, HSNDETAILS.LIST, HSNCODE, GSTAPPLICABLE, GSTCLASSIFICATION, ADDITIONALUNITS, MASTERID, ALTERID</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>";
            SyncLogger.Log("[DEBUG] Sending StockItem request to Tally...");
            var doc = await SendRequestAsync(request, companyName);
            if (doc == null) return new List<StockItem>();
            
            // REMOVED doc.ToString()

            var items = new List<StockItem>();
            var stockNodes = doc.Descendants().Where(x => x.Name.LocalName.Equals("STOCKITEM", StringComparison.OrdinalIgnoreCase)).ToList();
            if (stockNodes.Count == 0) stockNodes = doc.Descendants().Where(x => x.Element("NAME") != null || x.Element("NAME.LIST") != null).ToList();

            foreach (var itemElement in stockNodes)
            {
                try
                {
                    string? hsnCode = GetElementValue(itemElement, "HSNCODE");
                    // ... (HSN logic simplified for rebuild safety) ...
                    if (string.IsNullOrEmpty(hsnCode)) hsnCode = GetElementValue(itemElement, "HSN") ?? GetElementValue(itemElement, "HSNORSACCODE");

                    string? itemName = GetElementValue(itemElement, "NAME") ?? GetAttribute(itemElement, "NAME");
                    items.Add(new StockItem 
                    { 
                        Id = GetAttribute(itemElement, "GUID") ?? Guid.NewGuid().ToString(),
                        Name = itemName ?? "Unknown",
                        HsnCode = hsnCode,
                        MasterId = GetElementValue(itemElement, "MASTERID")
                    });
                }
                catch { }
            }
            return items;
        }

        public async Task<List<string>> GetVoucherMasterIdsAsync(string? companyName = null)
        {
            var request = $@"<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>VoucherIdCollection</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME=""VoucherIdCollection"" ISMODIFY=""No""><TYPE>Voucher</TYPE><FETCH>MASTERID, GUID</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>";
            var doc = await SendRequestAsync(request, companyName);
            if (doc == null) return new List<string>();
            var ids = new List<string>();
            foreach (var vNode in doc.Descendants("VOUCHER"))
            {
                var masterId = GetElementValue(vNode, "MASTERID") ?? GetElementValue(vNode, "GUID");
                if (!string.IsNullOrEmpty(masterId)) ids.Add(masterId);
            }
            return ids.Distinct().ToList();
        }

        private static string? GetElementValue(XElement element, string name)
        {
            var child = element.Elements().FirstOrDefault(e => e.Name.LocalName.Equals(name, StringComparison.OrdinalIgnoreCase));
            if (child != null) return child.Value;
            child = element.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals(name, StringComparison.OrdinalIgnoreCase));
            return child?.Value;
        }

        private static string? GetAttribute(XElement element, string name) => element.Attribute(name)?.Value;

        private static decimal ParseDecimal(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return 0;
            var cleanValue = value.Trim();
            if (cleanValue.Contains('/')) cleanValue = cleanValue.Split('/')[0].Trim();
            if (cleanValue.Contains(' ')) cleanValue = cleanValue.Split(' ')[0].Trim();
            cleanValue = cleanValue.Replace("₹", "").Replace(",", "").Replace("Rs", "").Replace("Rs.", "").Trim();
            if (decimal.TryParse(cleanValue, out var result)) return result;
            return 0;
        }

        private static DateTime ParseDate(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return DateTime.Today;
            if (value.Length == 8 && DateTime.TryParseExact(value, "yyyyMMdd", null, System.Globalization.DateTimeStyles.None, out var result)) return result;
            if (DateTime.TryParse(value, out var parsed)) return parsed;
            return DateTime.Today;
        }

        private string ResolveHsn(List<XElement> iDescendants, string itemName, Dictionary<string, string?>? stockItemHsnCache)
        {
            var hsnFromXml = iDescendants.FirstOrDefault(x => x.Name.LocalName.Equals("HSNCODE", StringComparison.OrdinalIgnoreCase) || x.Name.LocalName.Equals("HSNORSACCODE", StringComparison.OrdinalIgnoreCase))?.Value ?? "";
            if (IsValidHsn(hsnFromXml)) return NormalizeHsn(hsnFromXml);
            
            // FIX: CS8604 - Handle nullable cached HSN safely
            if (!string.IsNullOrEmpty(itemName) && stockItemHsnCache != null && stockItemHsnCache.TryGetValue(itemName, out string? cachedHsn)) 
            {
                if (IsValidHsn(cachedHsn)) return NormalizeHsn(cachedHsn);
            }
            return "";
        }

        // FIX: Accept nullable string to prevent CS8604 warnings
        private static bool IsValidHsn(string? hsn) 
        {
            if (string.IsNullOrWhiteSpace(hsn)) return false;
            return hsn.Trim().Length >= 4 && !hsn.Any(c => char.IsLetter(c));
        }

        private static string NormalizeHsn(string? hsn) => hsn?.Trim() ?? "";

        public async Task<(bool Success, string? VoucherNumber, string? Error)> PushVoucherToTallyAsync(string companyName, string voucherType, DateTime voucherDate, string partyLedger, decimal amount, string? narration = null, List<VoucherLedgerEntry>? ledgerEntries = null, List<VoucherInventoryEntry>? inventoryEntries = null)
        {
            try
            {
                SyncLogger.Log($"📤 Pushing {voucherType} to Tally: {partyLedger} ₹{amount}");
                var ledgerEntriesXml = new StringBuilder();
                if (ledgerEntries != null && ledgerEntries.Any())
                {
                    foreach (var entry in ledgerEntries) ledgerEntriesXml.AppendLine($@"<ALLLEDGERENTRIES.LIST><LEDGERNAME>{EscapeXml(entry.LedgerName)}</LEDGERNAME><ISDEEMEDPOSITIVE>{(entry.Amount >= 0 ? "No" : "Yes")}</ISDEEMEDPOSITIVE><AMOUNT>{(entry.Amount >= 0 ? "" : "-")}{Math.Abs(entry.Amount)}</AMOUNT></ALLLEDGERENTRIES.LIST>");
                }
                else
                {
                    bool isSaleType = voucherType.Contains("Sales") || voucherType.Contains("Receipt");
                    ledgerEntriesXml.AppendLine($@"<ALLLEDGERENTRIES.LIST><LEDGERNAME>{EscapeXml(partyLedger)}</LEDGERNAME><ISDEEMEDPOSITIVE>{(isSaleType ? "Yes" : "No")}</ISDEEMEDPOSITIVE><AMOUNT>{(isSaleType ? "" : "-")}{amount}</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>{(isSaleType ? "Sales" : "Purchase")}</LEDGERNAME><ISDEEMEDPOSITIVE>{(isSaleType ? "No" : "Yes")}</ISDEEMEDPOSITIVE><AMOUNT>{(isSaleType ? "-" : "")}{amount}</AMOUNT></ALLLEDGERENTRIES.LIST>");
                }

                var inventoryXml = new StringBuilder();
                if (inventoryEntries != null && inventoryEntries.Any())
                {
                    foreach (var item in inventoryEntries)
                    {
                        var gstXmlBuilder = new StringBuilder();
                        if (!string.IsNullOrEmpty(item.HsnCode) || item.TaxRate.HasValue)
                        {
                            gstXmlBuilder.AppendLine("                <GSTDETAILS.LIST>");
                            if (!string.IsNullOrEmpty(item.HsnCode)) gstXmlBuilder.AppendLine($"                    <HSNCODE>{EscapeXml(item.HsnCode)}</HSNCODE>");
                            if (item.TaxRate.HasValue) { gstXmlBuilder.AppendLine($"                    <RATEOFTAXCALCULATION>{item.TaxRate}</RATEOFTAXCALCULATION>"); gstXmlBuilder.AppendLine($"                    <GSTOVRDNNATURE>Taxable</GSTOVRDNNATURE>"); }
                            string taxability = item.Taxability ?? ((item.TaxRate ?? 0) > 0 ? "Taxable" : "Exempt");
                            gstXmlBuilder.AppendLine($"                    <TAXABILITY>{EscapeXml(taxability)}</TAXABILITY>");
                            gstXmlBuilder.AppendLine("                </GSTDETAILS.LIST>");
                        }
                        inventoryXml.AppendLine($@"<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>{EscapeXml(item.StockItemName)}</STOCKITEMNAME>{gstXmlBuilder}<ACTUALQTY>{item.Quantity} {EscapeXml(item.Unit)}</ACTUALQTY><BILLEDQTY>{item.Quantity} {EscapeXml(item.Unit)}</BILLEDQTY><RATE>{item.Rate}/{EscapeXml(item.Unit)}</RATE><AMOUNT>{item.Amount}</AMOUNT></ALLINVENTORYENTRIES.LIST>");
                    }
                }

                var request = $@"<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{EscapeXml(companyName)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF=""TallyUDF""><VOUCHER VCHTYPE=""{EscapeXml(voucherType)}"" ACTION=""Create""><DATE>{voucherDate:yyyyMMdd}</DATE><VOUCHERTYPENAME>{EscapeXml(voucherType)}</VOUCHERTYPENAME><PARTYLEDGERNAME>{EscapeXml(partyLedger)}</PARTYLEDGERNAME><NARRATION>{EscapeXml(narration ?? "")}</NARRATION>{ledgerEntriesXml}{inventoryXml}</VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>";
                var doc = await SendRequestAsync(request, companyName, 30);
                if (doc == null) return (false, null, "No response from Tally");
                var created = doc.Descendants("CREATED").FirstOrDefault()?.Value;
                if (created == "1")
                {
                    var voucherNumber = doc.Descendants("VOUCHERNUMBER").FirstOrDefault()?.Value;
                    SyncLogger.Log($"✅ Voucher created in Tally: {voucherNumber ?? "Success"}");
                    return (true, voucherNumber, null);
                }
                var errorMsg = doc.Descendants("LINEERROR").FirstOrDefault()?.Value ?? doc.Descendants("ERRORS").FirstOrDefault()?.Value ?? "Unknown error creating voucher";
                SyncLogger.Log($"❌ Tally rejected voucher: {errorMsg}");
                return (false, null, errorMsg);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"❌ PushVoucherToTallyAsync error: {ex.Message}");
                return (false, null, ex.Message);
            }
        }

        public void Dispose()
        {
            _httpClient?.Dispose();
        }
    }
}
