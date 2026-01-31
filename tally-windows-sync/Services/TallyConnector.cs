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
                    
                    // Use a short timeout for the connection test (e.g., 2 seconds)
                    // We don't want to wait 30s just to see if it's there.
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
                    // Timeout occurred, move to next port
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
                if (!string.IsNullOrEmpty(companyName))
                {
                    // DON'T clean the company name - Tally ODBC needs exact match
                    // OR we can skip setting SVCurrentCompany and let Tally use its currently open company
                    // For now, we skip setting SVCurrentCompany to avoid the error
                    // Tally will use whatever company is currently open
                    SyncLogger.Log($"Using Tally's currently open company (skipping SVCurrentCompany)");
                }

                SyncLogger.Log($">>> Tally Request [{companyName ?? "Global"}]: XML Length {xmlRequest.Length}");
                SyncLogger.SaveFile("last_tally_request.xml", xmlRequest);

                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(customTimeout ?? _timeout)))
                {
                    var content = new StringContent(xmlRequest, Encoding.UTF8, "text/xml");
                    var response = await _httpClient.PostAsync(_tallyUrl, content, cts.Token);

                    if (!response.IsSuccessStatusCode) return null;

                    var responseContent = await response.Content.ReadAsStringAsync();
                    SyncLogger.SaveFile("last_tally_response.xml", responseContent);
                    
                    string sanitizedContent = SanitizeXmlString(responseContent);
                    
                    var settings = new XmlReaderSettings { CheckCharacters = false, IgnoreComments = true, DtdProcessing = DtdProcessing.Ignore };
                    using (var stringReader = new StringReader(sanitizedContent))
                    using (var xmlReader = XmlReader.Create(stringReader, settings))
                    {
                        return XDocument.Load(xmlReader);
                    }
                }
            }
            catch { return null; }
        }

        private string SanitizeXmlString(string xml)
        {
            if (string.IsNullOrEmpty(xml)) return xml;

            // Direct character-by-character filtering (LINQ)
            // Only allow Tab (9), LF (10), CR (13) and characters from Space (32) upwards
            return new string(xml.Where(c => 
                c == '\t' || 
                c == '\n' || 
                c == '\r' || 
                (c >= ' ' && c <= 0xD7FF) || 
                (c >= 0xE000 && c <= 0xFFFD)
            ).ToArray());
        }

        private bool IsLegalXmlChar(int character)
        {
            return (
                character == 0x9 ||
                character == 0xA ||
                character == 0xD ||
                (character >= 0x20 && character <= 0xD7FF) ||
                (character >= 0xE000 && character <= 0xFFFD)
            );
        }

        /// <summary>
        /// Get active company info using standard Tally system variable
        /// </summary>
        public async Task<List<Company>> GetOpenCompaniesAsync()
        {
            // Direct Collection Query - Most reliable way for Tally Prime
            var request = @"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CompanyCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""CompanyCollection"">
            <TYPE>Company</TYPE>
            <FETCH>NAME, GUID, MasterId</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            try
            {
                var doc = await SendRequestAsync(request);
                if (doc == null) return new List<Company>();

                // Save for debugging if needed
                File.WriteAllText("tally_response.xml", doc.ToString());

                var companies = new List<Company>();
                
                // Try to find any tag that looks like a company record
                // Tally often wraps these in <COMPANY> or <COMPANYCOLLECTION> tags
                var companyElements = doc.Descendants().Where(x => x.Name.LocalName.Equals("COMPANY", StringComparison.OrdinalIgnoreCase));
                
                foreach (var comp in companyElements)
                {
                    string? name = comp.Element("NAME")?.Value ?? comp.Attribute("NAME")?.Value ?? comp.Value;
                    if (string.IsNullOrEmpty(name) || name.Length < 2) continue;
                    if (name.Contains("Report") || name.Contains("Error") || name.Contains("\n")) continue;

                    name = name.Trim();
                    
                    // IMPORTANT: Must match CleanCompanyId() logic exactly!
                    // Strip suffixes like " - - (from 1-Apr-24)" before sanitizing
                    string cleanName = name.Split(" -")[0].Split(" (")[0].Trim();
                    var sanitizedId = System.Text.RegularExpressions.Regex.Replace(cleanName, @"[^a-zA-Z0-9]", "").ToUpperInvariant();
                    
                    if (!companies.Any(c => c.Name == name))
                    {
                        companies.Add(new Company
                        {
                            Id = sanitizedId,
                            Name = name
                        });
                    }
                }

                // If collection query failed, try the old active company method as fallback
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
            // Simple request to get the active company name - using a more stable tag
            var request = @"<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Accounts</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

            try
            {
                var doc = await SendRequestAsync(request);
                if (doc == null) return null;

                // SVCURRENTCOMPANY is often in the header STATICVARIABLES
                string? name = doc.Descendants().FirstOrDefault(x => x.Name.LocalName.Equals("SVCURRENTCOMPANY", StringComparison.OrdinalIgnoreCase))?.Value;
                
                if (string.IsNullOrEmpty(name))
                {
                    // Look in Body for any COMPANY tag
                    name = doc.Descendants().FirstOrDefault(x => x.Name.LocalName.Equals("COMPANY", StringComparison.OrdinalIgnoreCase))?.Element("NAME")?.Value;
                }

                if (string.IsNullOrEmpty(name) || name.Contains("Report") || name.Contains("Error"))
                {
                    return null;
                }

                name = name.Trim();
                var sanitizedId = System.Text.RegularExpressions.Regex.Replace(name, @"[^a-zA-Z0-9]", "").ToUpperInvariant();
                
                return new Company { Id = sanitizedId, Name = name };
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Get total record counts for all types
        /// </summary>
        public async Task<Dictionary<string, int>> GetRecordCountsAsync(string? companyName = null)
        {
            var counts = new Dictionary<string, int>
            {
                { "Ledgers", 0 },
                { "Sales", 0 },
                { "Purchases", 0 },
                { "StockItems", 0 }
            };

            try {
                // Fetch Statistics report - fastest way to get counts in Tally
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
            } catch (Exception ex) {
                Console.WriteLine($"Error fetching counts via Statistics: {ex.Message}");
                // Light fallback for essential counts
                try {
                    counts["Ledgers"] = await GetCountAsync("Ledger", companyName);
                    counts["StockItems"] = await GetCountAsync("Stock Item", companyName);
                } catch {}
            }

            return counts;
        }

        private async Task<int> GetCountAsync(string tallyType, string? companyName = null)
        {
            var request = $@"<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>CountColl</ID></HEADER><BODY><DESC><TDL><TDLMESSAGE><COLLECTION NAME=""CountColl""><TYPE>{tallyType}</TYPE></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>";
            var doc = await SendRequestAsync(request, companyName);
            var tag = tallyType.Replace(" ", "").ToUpper();
            return doc?.Descendants(tag).Count() ?? 0;
        }

        /// <summary>
        /// Get all ledgers from Tally
        /// </summary>
        public async Task<List<Ledger>> GetLedgersAsync(string? companyName = null)
        {
            var request = @"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>LedgerCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""LedgerCollection"" ISMODIFY=""No"">
            <TYPE>Ledger</TYPE>
            <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS, PHONE, EMAIL, GSTREGISTRATIONNUMBER, PANNUMBER, MASTERID, ALTERID</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

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
                catch (Exception ex)
                {
                    Console.WriteLine($"Error parsing ledger: {ex.Message}");
                }
            }

            return ledgers;
        }

        public async Task<List<Voucher>> GetVouchersAsync(DateTime? fromDate = null, DateTime? toDate = null, string? companyName = null)
        {
            DateTime effectiveFrom = fromDate ?? new DateTime(2024, 4, 1);
            string fromDateStr = effectiveFrom.ToString("yyyyMMdd");
            string toDateStr = (toDate ?? DateTime.Today).ToString("yyyyMMdd");

            SyncLogger.Log($"Fetching DayBook (Native): {effectiveFrom:dd-MMM-yyyy} to {toDate:dd-MMM-yyyy}");

            // Standard DayBook Export - Most Stable Method
            var request = $@"
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Day Book</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>{fromDateStr}</SVFROMDATE>
          <SVTODATE>{toDateStr}</SVTODATE>
          <EXPLODEFLAG>Yes</EXPLODEFLAG> 
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>";

            var doc = await SendRequestAsync(request, companyName, 120);
            if (doc == null) return new List<Voucher>();

            // SyncLogger.SaveFile("last_daybook_native.xml", doc.ToString());

            var vouchers = new List<Voucher>();
            var companyId = CleanCompanyId(companyName);

            // DayBook returns VOUCHER elements directly under BODY or DSPVCH
            var voucherNodes = doc.Descendants("VOUCHER").ToList();
            if (!voucherNodes.Any())
            {
                // Sometimes wrapped in TDL Report tags
                voucherNodes = doc.Descendants().Where(x => x.Name.LocalName == "VOUCHER").ToList();
            }

            SyncLogger.Log($"Parsing {voucherNodes.Count} vouchers from DayBook...");

            foreach (var vNode in voucherNodes)
            {
                try
                {
                    // Core Fields
                    string vType = GetElementValue(vNode, "VOUCHERTYPENAME") ?? "Unknown";
                    string vNum = GetElementValue(vNode, "VOUCHERNUMBER") ?? "0";
                    DateTime vDate = ParseDate(GetElementValue(vNode, "DATE"));
                    string masterId = GetElementValue(vNode, "MASTERID");
                    string alterId = GetElementValue(vNode, "ALTERID");
                    string narration = GetElementValue(vNode, "NARRATION");
                    string explicitParty = GetElementValue(vNode, "PARTYLEDGERNAME");
                    
                    if (vDate == DateTime.MinValue) continue;

                    // Parse Ledger Entries
                    var ledgerEntries = new List<VoucherLedgerEntry>();
                    // DayBook typically uses LEDGERENTRIES.LIST or ALLLEDGERENTRIES.LIST
                    var ledgerList = vNode.Descendants("LEDGERENTRIES.LIST").ToList();
                    ledgerList.AddRange(vNode.Descendants("ALLLEDGERENTRIES.LIST"));

                    foreach (var lNode in ledgerList)
                    {
                        string lName = GetElementValue(lNode, "LEDGERNAME");
                        if (string.IsNullOrEmpty(lName)) continue;

                        decimal lAmount = ParseDecimal(GetElementValue(lNode, "AMOUNT"));
                        
                        ledgerEntries.Add(new VoucherLedgerEntry
                        {
                            LedgerName = lName,
                            Amount = Math.Abs(lAmount),
                            IsDebit = lAmount > 0
                        });
                    }

                    // Parse Inventory Entries
                    var inventoryEntries = new List<VoucherInventoryEntry>();
                    // DayBook uses INVENTORYENTRIES.LIST or ALLINVENTORYENTRIES.LIST
                    var invList = vNode.Descendants("INVENTORYENTRIES.LIST").ToList();
                    invList.AddRange(vNode.Descendants("ALLINVENTORYENTRIES.LIST"));

                    foreach (var iNode in invList)
                    {
                        inventoryEntries.Add(new VoucherInventoryEntry
                        {
                            StockItemName = GetElementValue(iNode, "STOCKITEMNAME") ?? "",
                            Quantity = ParseDecimal(GetElementValue(iNode, "BILLEDQTY")),
                            Rate = ParseDecimal(GetElementValue(iNode, "RATE")),
                            Amount = Math.Abs(ParseDecimal(GetElementValue(iNode, "AMOUNT")))
                        });
                    }

                    // Determining PartyName and TotalAmount logic
                    string partyName = explicitParty;
                    decimal totalAmount = 0;

                    if (string.IsNullOrEmpty(partyName) && ledgerEntries.Count > 0)
                    {
                        partyName = ledgerEntries[0].LedgerName;
                    }

                    if (inventoryEntries.Count > 0)
                    {
                        totalAmount = inventoryEntries.Sum(i => i.Amount);
                    }
                    else if (ledgerEntries.Count > 0)
                    {
                        totalAmount = ledgerEntries.Max(l => l.Amount);
                    }

                    var voucher = new Voucher
                    {
                        CompanyId = companyId,
                        VoucherNumber = vNum,
                        VoucherType = vType,
                        VoucherDate = vDate,
                        PartyName = partyName,
                        TotalAmount = totalAmount,
                        Narration = narration,
                        MasterId = masterId,
                        AlterId = alterId,
                        LedgerEntries = ledgerEntries,
                        InventoryEntries = inventoryEntries
                    };
                    
                    voucher.GenerateDeterministicId(companyId);
                    vouchers.Add(voucher);
                }
                catch { }
            }

            SyncLogger.Log($"Parsed {vouchers.Count} vouchers.");
            return vouchers;
        }

        /// <summary>
        /// Simple fallback: Basic voucher collection (ODBC-style)
        /// </summary>
        private async Task<List<Voucher>> GetVouchersSimpleAsync(DateTime fromDate, DateTime toDate, string? companyName)
        {
            string fromDateStr = fromDate.ToString("yyyyMMdd");
            string toDateStr = toDate.ToString("yyyyMMdd");

            SyncLogger.Log($"Trying simple ODBC-style export: {fromDate:dd-MMM-yy} to {toDate:dd-MMM-yy}");

            // Simplest possible request that works everywhere
            var request = $@"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>{fromDateStr}</SVFROMDATE>
        <SVTODATE>{toDateStr}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""MyVouchers"">
            <TYPE>Voucher</TYPE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            var doc = await SendRequestAsync(request, companyName, 30);
            if (doc == null) return new List<Voucher>();

            var vouchers = new List<Voucher>();
            var companyId = CleanCompanyId(companyName);

            foreach (var vNode in doc.Descendants("VOUCHER"))
            {
                try
                {
                    string vType = GetElementValue(vNode, "VOUCHERTYPENAME") ?? "Unknown";
                    string vNum = GetElementValue(vNode, "VOUCHERNUMBER") ?? "0";
                    DateTime vDate = ParseDate(GetElementValue(vNode, "DATE"));

                    var voucher = new Voucher
                    {
                        VoucherId = Voucher.GenerateId(companyId, vType, vNum, vDate),
                        CompanyId = companyId,
                        VoucherNumber = vNum,
                        VoucherType = vType,
                        VoucherDate = vDate,
                        PartyName = GetElementValue(vNode, "PARTYLEDGERNAME"),
                        TotalAmount = Math.Abs(ParseDecimal(GetElementValue(vNode, "AMOUNT"))),
                        Narration = GetElementValue(vNode, "NARRATION"),
                        LedgerEntries = new List<VoucherLedgerEntry>(),
                        InventoryEntries = new List<VoucherInventoryEntry>()
                    };

                    vouchers.Add(voucher);
                }
                catch { }
            }

            SyncLogger.Log($"Fallback method: {vouchers.Count} vouchers");
            return vouchers;
        }

        /// <summary>
        /// Clean company ID from display name
        /// </summary>
        private string CleanCompanyId(string? companyName)
        {
            if (string.IsNullOrEmpty(companyName)) return "UNKNOWN";
            string clean = companyName.Split(" -")[0].Split(" (")[0].Trim();
            return Regex.Replace(clean, @"[^a-zA-Z0-9]", "").ToUpperInvariant();
        }

        /// <summary>
        /// Get sales invoices
        /// </summary>
        public async Task<List<Sale>> GetSalesAsync(DateTime? fromDate = null, DateTime? toDate = null, string? companyName = null)
        {
            var vouchers = await GetVouchersAsync(fromDate, toDate, companyName);
            
            return vouchers
                .Where(v => v.VoucherType.Equals("Sales", StringComparison.OrdinalIgnoreCase))
                .Select(v => new Sale
                {
                    Id = v.Id,
                    VoucherId = v.Id,
                    InvoiceNumber = v.VoucherNumber,
                    InvoiceDate = v.VchDate,
                    PartyLedgerName = v.PartyLedgerName ?? "Cash",
                    NetAmount = v.Amount,
                    Narration = v.Narration,
                    MasterId = v.MasterId,
                    AlterId = v.AlterId
                })
                .ToList();
        }

        /// <summary>
        /// Get purchase invoices
        /// </summary>
        public async Task<List<Purchase>> GetPurchasesAsync(DateTime? fromDate = null, DateTime? toDate = null, string? companyName = null)
        {
            var vouchers = await GetVouchersAsync(fromDate, toDate, companyName);
            
            return vouchers
                .Where(v => v.VoucherType.Equals("Purchase", StringComparison.OrdinalIgnoreCase))
                .Select(v => new Purchase
                {
                    Id = v.Id,
                    VoucherId = v.Id,
                    InvoiceNumber = v.VoucherNumber,
                    InvoiceDate = v.VchDate,
                    PartyLedgerName = v.PartyLedgerName ?? "Cash",
                    NetAmount = v.Amount,
                    Narration = v.Narration,
                    MasterId = v.MasterId,
                    AlterId = v.AlterId
                })
                .ToList();
        }

        /// <summary>
        /// Get stock items
        /// </summary>
        public async Task<List<StockItem>> GetStockItemsAsync(string? companyName = null)
        {
            var request = @"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>StockItemCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""StockItemCollection"" ISMODIFY=""No"">
            <TYPE>Stock Item</TYPE>
            <FETCH>NAME, GUID, PARENT, BASEUNITS, OPENINGBALANCE, CLOSINGBALANCE</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            var doc = await SendRequestAsync(request, companyName);
            if (doc == null) return new List<StockItem>();

            var items = new List<StockItem>();

            foreach (var itemElement in doc.Descendants("STOCKITEM"))
            {
                try
                {
                    items.Add(new StockItem
                    {
                        Id = GetAttribute(itemElement, "GUID") ?? GetElementValue(itemElement, "GUID") ?? Guid.NewGuid().ToString(),
                        Name = GetAttribute(itemElement, "NAME") ?? GetElementValue(itemElement, "NAME") ?? "Unknown",
                        StockGroup = GetElementValue(itemElement, "PARENT"),
                        BaseUnit = GetElementValue(itemElement, "BASEUNITS"),
                        OpeningBalance = ParseDecimal(GetElementValue(itemElement, "OPENINGBALANCE")),
                        OpeningValue = ParseDecimal(GetElementValue(itemElement, "OPENINGVALUE")),
                        ClosingBalance = ParseDecimal(GetElementValue(itemElement, "CLOSINGBALANCE")),
                        ClosingValue = ParseDecimal(GetElementValue(itemElement, "CLOSINGVALUE")),
                        HsnCode = GetElementValue(itemElement, "HSNCODE"),
                        MasterId = GetElementValue(itemElement, "MASTERID"),
                        AlterId = GetElementValue(itemElement, "ALTERID")
                    });
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error parsing stock item: {ex.Message}");
                }
            }

            return items;
        }

        #region Helper Methods

        private static string? GetElementValue(XElement element, string name)
        {
            var child = element.Element(name);
            return child?.Value;
        }

        private static string? GetAttribute(XElement element, string name)
        {
            return element.Attribute(name)?.Value;
        }

        private static decimal ParseDecimal(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return 0;
            
            // Tally often uses negative for credits, positive for debits
            // Remove any currency symbols and parse
            var cleanValue = value.Replace("₹", "").Replace(",", "").Trim();
            
            if (decimal.TryParse(cleanValue, out var result))
            {
                return result;
            }
            return 0;
        }

        private static DateTime ParseDate(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return DateTime.Today;

            // Tally date format: YYYYMMDD
            if (value.Length == 8 && DateTime.TryParseExact(value, "yyyyMMdd", 
                null, System.Globalization.DateTimeStyles.None, out var result))
            {
                return result;
            }

            if (DateTime.TryParse(value, out var parsed))
            {
                return parsed;
            }

            return DateTime.Today;
        }

        #endregion

        public void Dispose()
        {
            _httpClient?.Dispose();
        }
    }
}
