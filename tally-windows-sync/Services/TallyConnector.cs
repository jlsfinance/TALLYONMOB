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

        public event EventHandler<string>? LogReceived;

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
        
        private void Log(string message)
        {
            Console.WriteLine(message);
            LogReceived?.Invoke(this, message);
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
        /// Fetch Tally Serial Number
        /// </summary>
        public async Task<string> GetTallySerialNumberAsync()
        {
            var request = @"
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>SerialReport</REPORTNAME>
                <STATICVARIABLES>
                    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                </STATICVARIABLES>
                <TDL>
                    <TDLMESSAGE>
                        <REPORT NAME=""SerialReport"">
                            <FORMS>SerialForm</FORMS>
                        </REPORT>
                        <FORM NAME=""SerialForm"">
                            <PARTS>SerialPart</PARTS>
                        </FORM>
                        <PART NAME=""SerialPart"">
                            <LINES>SerialLine</LINES>
                        </PART>
                        <LINE NAME=""SerialLine"">
                            <FIELDS>SerialField</FIELDS>
                        </LINE>
                        <FIELD NAME=""SerialField"">
                            <SET>$$LicenseInfo:SerialNumber</SET>
                        </FIELD>
                    </TDLMESSAGE>
                </TDL>
            </REQUESTDESC>
        </EXPORTDATA>
    </BODY>
</ENVELOPE>";

            try 
            {
                var doc = await SendRequestAsync(request, null, 10);
                if (doc == null) return string.Empty;

                var serial = doc.Descendants("SERIALFIELD").FirstOrDefault()?.Value;
                return serial?.Trim() ?? string.Empty;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error fetching serial: {ex.Message}");
                return string.Empty;
            }
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
            <FETCH>NAME, GUID, ADDRESS.LIST, GSTREGISTRATIONNUMBER, PARTYGSTIN, PHONENUMBER, LEDGERPHONE, LEDGERMOBILE, EMAIL, LEDGEREMAIL, STATE, LEDSTATENAME, COUNTRYOFRESIDENCE</FETCH>
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
                // Using Log method if available, otherwise fallback to Console
                Log("🔍 Tally Response received. Checking for companies...");

                var companies = new List<Company>();
                
                // Try to find any tag that looks like a company record
                // Tally often wraps these in <COMPANY> or <COMPANYCOLLECTION> tags
                var companyElements = doc.Descendants().Where(x => x.Name.LocalName.Equals("COMPANY", StringComparison.OrdinalIgnoreCase)).ToList();
                
                Log($"🔍 Found {companyElements.Count} potential company elements in XML.");

                foreach (var comp in companyElements)
                {
                    string? name = comp.Element("NAME")?.Value ?? comp.Attribute("NAME")?.Value ?? comp.Value;
                    
                    if (string.IsNullOrEmpty(name)) 
                    {
                        Log("   ⚠️ Skipping empty company name element");
                        continue;
                    }

                    if (name.Length < 2)
                    {
                         Log($"   ⚠️ Skipping too short name: '{name}'");
                         continue;
                    }

                    if (name.Contains("Report") || name.Contains("Error") || name.Contains("\n")) 
                    {
                        Log($"   ⚠️ Skipping reserved keyword/invalid char in: '{name}'");
                        continue;
                    }

                    name = name.Trim();
                    Log($"   ✅ Found Company: '{name}'");
                    
                    // IMPORTANT: Must match CleanCompanyId() logic exactly!
                    // STRICT MATCHING: Generate ID from Hash of full name to differentiate even minor changes
                    // e.g. "ABC Ltd" vs "ABC Ltd." will have different IDs.
                    string cleanName = name.Trim();
                    string sanitizedId = "";
                    using (var sha = System.Security.Cryptography.SHA256.Create())
                    {
                        var bytes = System.Text.Encoding.UTF8.GetBytes(cleanName);
                        var hash = sha.ComputeHash(bytes);
                        // Use first 16 chars of hash as ID
                        sanitizedId = BitConverter.ToString(hash).Replace("-", "").Substring(0, 16);
                    }
                    
                    if (!companies.Any(c => c.Name == name))
                    {
                        // Extract address from ADDRESS.LIST > ADDRESS structure (Tally Prime format)
                        var addressParts = new List<string>();
                        var addressList = comp.Descendants().Where(e => e.Name.LocalName.Equals("ADDRESS.LIST", StringComparison.OrdinalIgnoreCase)).FirstOrDefault();
                        if (addressList != null)
                        {
                            addressParts.AddRange(addressList.Elements().Where(e => e.Name.LocalName.Equals("ADDRESS", StringComparison.OrdinalIgnoreCase)).Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                        }
                        // Fallback: direct ADDRESS descendants
                        if (addressParts.Count == 0)
                        {
                            addressParts.AddRange(comp.Descendants("ADDRESS").Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                        }
                        // Extract state
                        var compState = GetElementValue(comp, "STATE") ?? GetElementValue(comp, "LEDSTATENAME") ?? GetElementValue(comp, "STATENAME") ?? GetElementValue(comp, "COUNTRYOFRESIDENCE");
                        if (!string.IsNullOrWhiteSpace(compState) && !addressParts.Any(p => p.Contains(compState, StringComparison.OrdinalIgnoreCase)))
                        {
                            addressParts.Add(compState);
                        }

                        // Extract GSTIN
                        var compGstin = GetElementValue(comp, "GSTREGISTRATIONNUMBER") ?? GetElementValue(comp, "PARTYGSTIN");

                        // Extract phone
                        var compPhone = GetElementValue(comp, "PHONENUMBER") ?? GetElementValue(comp, "LEDGERPHONE") ?? GetElementValue(comp, "LEDGERMOBILE");

                        // Extract email
                        var compEmail = GetElementValue(comp, "EMAIL") ?? GetElementValue(comp, "LEDGEREMAIL");

                        companies.Add(new Company
                        {
                            Id = sanitizedId,
                            Name = name,
                            Gstin = compGstin,
                            Address = string.Join(", ", addressParts),
                            State = compState,
                            Phone = compPhone,
                            Email = compEmail
                        });
                        Log($"   Added Company: '{name}' (ID: {sanitizedId})");
                    }
                    else
                    {
                         Log($"   ⚠️ Skipping duplicate: '{name}'");
                    }
                }

                Log($"🔍 Returning {companies.Count} valid companies to SyncManager.");

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
                Log($"Company list error: {ex.Message}");
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
            <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS.LIST, LEDGERPHONE, LEDGERCONTACT, LEDGEREMAIL, LEDGERMOBILE, COUNTRYOFRESIDENCE, LEDSTATENAME, GSTREGISTRATIONTYPE, PARTYGSTIN, GSTREGISTRATIONNUMBER, PANNUMBER, MASTERID, ALTERID</FETCH>
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
                    // Extract address from ADDRESS.LIST > ADDRESS structure (Tally Prime format)
                    var addressParts = new List<string>();
                    var addressList = ledgerElement.Descendants().Where(e => e.Name.LocalName.Equals("ADDRESS.LIST", StringComparison.OrdinalIgnoreCase)).FirstOrDefault();
                    if (addressList != null)
                    {
                        addressParts.AddRange(addressList.Elements().Where(e => e.Name.LocalName.Equals("ADDRESS", StringComparison.OrdinalIgnoreCase)).Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                    }
                    // Fallback: direct ADDRESS descendants if ADDRESS.LIST not found
                    if (addressParts.Count == 0)
                    {
                        addressParts.AddRange(ledgerElement.Descendants("ADDRESS").Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                    }
                    // Append state if available
                    var state = GetElementValue(ledgerElement, "LEDSTATENAME") ?? GetElementValue(ledgerElement, "COUNTRYOFRESIDENCE");
                    if (!string.IsNullOrWhiteSpace(state) && !addressParts.Any(p => p.Contains(state, StringComparison.OrdinalIgnoreCase)))
                    {
                        addressParts.Add(state);
                    }
                    var fullAddress = string.Join(", ", addressParts);

                    // Extract phone: Try multiple Tally field names
                    var phone = GetElementValue(ledgerElement, "LEDGERPHONE") 
                             ?? GetElementValue(ledgerElement, "LEDGERMOBILE") 
                             ?? GetElementValue(ledgerElement, "PHONE") 
                             ?? GetElementValue(ledgerElement, "LEDGERCONTACT");

                    // Extract email
                    var email = GetElementValue(ledgerElement, "LEDGEREMAIL") 
                             ?? GetElementValue(ledgerElement, "EMAIL");

                    // Extract GSTIN: Try multiple Tally field names
                    var gstin = GetElementValue(ledgerElement, "PARTYGSTIN") 
                             ?? GetElementValue(ledgerElement, "GSTREGISTRATIONNUMBER");

                    ledgers.Add(new Ledger
                    {
                        Id = GetAttribute(ledgerElement, "GUID") ?? GetElementValue(ledgerElement, "GUID") ?? Guid.NewGuid().ToString(),
                        Name = GetAttribute(ledgerElement, "NAME") ?? GetElementValue(ledgerElement, "NAME") ?? "Unknown",
                        ParentGroup = GetElementValue(ledgerElement, "PARENT"),
                        LedgerGroup = GetElementValue(ledgerElement, "PARENT"),
                        OpeningBalance = ParseDecimal(GetElementValue(ledgerElement, "OPENINGBALANCE")),
                        ClosingBalance = ParseDecimal(GetElementValue(ledgerElement, "CLOSINGBALANCE")),
                        Address = fullAddress,
                        Phone = phone,
                        Email = email,
                        Gstin = gstin,
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
        /// <summary>
        /// Get vouchers modified after a specific ALTERID
        /// This catches ANY modification - even to 6-month old entries!
        /// NOTE: Collections do not fully support EXPLODEGSTDETAILS. HSN codes may be missing in raw XML.
        /// We rely on the stockItemHsnCache fallback in ParseVouchersFromXml to populate them.
        /// </summary>
        public async Task<List<Voucher>> GetModifiedVouchersAsync(string companyName, long afterAlterId, Dictionary<string, string>? stockItemHsnCache = null)
        {
            SyncLogger.Log($"🔍 Fetching vouchers with ALTERID > {afterAlterId}");
            
            // TDL query to get vouchers modified after specific ALTERID
            var request = $@"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ModifiedVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
        <SVEXPLODEALL>Yes</SVEXPLODEALL>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""ModifiedVouchers"">
            <TYPE>Voucher</TYPE>
            <FETCH>MASTERID, ALTERID, VOUCHERTYPENAME, VOUCHERNUMBER, DATE, PARTYLEDGERNAME, AMOUNT, NARRATION, ALLLEDGERENTRIES.LIST, ALLINVENTORYENTRIES.LIST</FETCH>
            <FILTER>ModifiedAfter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE=""Formulae"" NAME=""ModifiedAfter"">$$NumValue:$ALTERID > {afterAlterId}</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            var doc = await SendRequestAsync(request, companyName, 300); // 5 min timeout for large data
            
            if (doc == null)
            {
                SyncLogger.Log("⚠️ No response from Tally for modified vouchers");
                return new List<Voucher>();
            }

            var vouchers = ParseVouchersFromXml(doc, companyName, DateTime.Today, stockItemHsnCache);
            SyncLogger.Log($"✅ Found {vouchers.Count} modified vouchers (ALTERID > {afterAlterId})");
            
            return vouchers;
        }

        /// <summary>
        /// Get ledgers modified after a specific ALTERID
        /// </summary>
        public async Task<List<Ledger>> GetModifiedLedgersAsync(string companyName, long afterAlterId)
        {
            SyncLogger.Log($"🔍 Fetching ledgers with ALTERID > {afterAlterId}");
            
            var request = $@"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ModifiedLedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""ModifiedLedgers"">
            <TYPE>Ledger</TYPE>
            <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS.LIST, LEDGERPHONE, LEDGERCONTACT, LEDGEREMAIL, LEDGERMOBILE, COUNTRYOFRESIDENCE, LEDSTATENAME, GSTREGISTRATIONTYPE, PARTYGSTIN, GSTREGISTRATIONNUMBER, PANNUMBER, MASTERID, ALTERID</FETCH>
            <FILTER>ModifiedAfter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE=""Formulae"" NAME=""ModifiedAfter"">$$NumValue:$ALTERID > {afterAlterId}</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            var doc = await SendRequestAsync(request, companyName, 120);
            
            if (doc == null) return new List<Ledger>();

            var ledgers = new List<Ledger>();
            foreach (var ledgerElement in doc.Descendants("LEDGER"))
            {
                try
                {
                    // Extract address from ADDRESS.LIST > ADDRESS structure (Tally Prime format)
                    var addressParts = new List<string>();
                    var addressList = ledgerElement.Descendants().Where(e => e.Name.LocalName.Equals("ADDRESS.LIST", StringComparison.OrdinalIgnoreCase)).FirstOrDefault();
                    if (addressList != null)
                    {
                        addressParts.AddRange(addressList.Elements().Where(e => e.Name.LocalName.Equals("ADDRESS", StringComparison.OrdinalIgnoreCase)).Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                    }
                    if (addressParts.Count == 0)
                    {
                        addressParts.AddRange(ledgerElement.Descendants("ADDRESS").Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                    }
                    var state = GetElementValue(ledgerElement, "LEDSTATENAME") ?? GetElementValue(ledgerElement, "COUNTRYOFRESIDENCE");
                    if (!string.IsNullOrWhiteSpace(state) && !addressParts.Any(p => p.Contains(state, StringComparison.OrdinalIgnoreCase)))
                    {
                        addressParts.Add(state);
                    }
                    var fullAddress = string.Join(", ", addressParts);

                    var phone = GetElementValue(ledgerElement, "LEDGERPHONE") 
                             ?? GetElementValue(ledgerElement, "LEDGERMOBILE") 
                             ?? GetElementValue(ledgerElement, "PHONE") 
                             ?? GetElementValue(ledgerElement, "LEDGERCONTACT");
                    var email = GetElementValue(ledgerElement, "LEDGEREMAIL") 
                             ?? GetElementValue(ledgerElement, "EMAIL");
                    var gstin = GetElementValue(ledgerElement, "PARTYGSTIN") 
                             ?? GetElementValue(ledgerElement, "GSTREGISTRATIONNUMBER");

                    ledgers.Add(new Ledger
                    {
                        Id = GetAttribute(ledgerElement, "GUID") ?? GetElementValue(ledgerElement, "GUID") ?? Guid.NewGuid().ToString(),
                        Name = GetAttribute(ledgerElement, "NAME") ?? GetElementValue(ledgerElement, "NAME") ?? "Unknown",
                        ParentGroup = GetElementValue(ledgerElement, "PARENT"),
                        LedgerGroup = GetElementValue(ledgerElement, "PARENT"),
                        OpeningBalance = ParseDecimal(GetElementValue(ledgerElement, "OPENINGBALANCE")),
                        ClosingBalance = ParseDecimal(GetElementValue(ledgerElement, "CLOSINGBALANCE")),
                        Address = fullAddress,
                        Phone = phone,
                        Email = email,
                        Gstin = gstin,
                        Pan = GetElementValue(ledgerElement, "PANNUMBER"),
                        MasterId = GetElementValue(ledgerElement, "MASTERID"),
                        AlterId = GetElementValue(ledgerElement, "ALTERID")
                    });
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error parsing modified ledger: {ex.Message}");
                }
            }

            SyncLogger.Log($"✅ Found {ledgers.Count} modified ledgers");
            return ledgers;
        }

        public async Task<List<Voucher>> GetVouchersAsync(DateTime? fromDate = null, DateTime? toDate = null, string? companyName = null, Dictionary<string, string>? stockItemHsnCache = null)
        {
            return await GetVouchersInternalAsync(fromDate, toDate, companyName, null, stockItemHsnCache);
        }

        /// <summary>
        /// Performance-optimized: Fetch vouchers in monthly chunks for large datasets
        /// Prevents memory issues and Tally timeouts when dealing with 1 Lakh+ records
        /// </summary>
        public async Task<List<Voucher>> GetVouchersChunkedAsync(
            DateTime fromDate, 
            DateTime toDate, 
            string? companyName, 
            Action<string>? progressCallback = null,
            Dictionary<string, string>? stockItemHsnCache = null)
        {
            var allVouchers = new List<Voucher>();
            var current = new DateTime(fromDate.Year, fromDate.Month, 1);
            var endMonth = new DateTime(toDate.Year, toDate.Month, 1);
            
            int monthCount = 0;
            int totalMonths = ((toDate.Year - fromDate.Year) * 12) + toDate.Month - fromDate.Month + 1;
            
            while (current <= endMonth)
            {
                monthCount++;
                var monthStart = current;
                var monthEnd = current.AddMonths(1).AddDays(-1);
                if (monthEnd > toDate) monthEnd = toDate;
                
                progressCallback?.Invoke($"Fetching {current:MMM yyyy} ({monthCount}/{totalMonths})...");
                SyncLogger.Log($"📅 Chunked fetch: {monthStart:dd-MMM-yy} to {monthEnd:dd-MMM-yy}");
                
                try
                {
                    var monthVouchers = await GetVouchersInternalAsync(monthStart, monthEnd, companyName, null, stockItemHsnCache);
                    allVouchers.AddRange(monthVouchers);
                    
                    progressCallback?.Invoke($"✓ {current:MMM yyyy}: {monthVouchers.Count} vouchers");
                    
                    // Small delay to prevent Tally overload
                    await Task.Delay(100);
                }
                catch (Exception ex)
                {
                    SyncLogger.Log($"⚠️ Error fetching {current:MMM yyyy}: {ex.Message}");
                    // Continue with next month even if one fails
                }
                
                current = current.AddMonths(1);
            }
            
            progressCallback?.Invoke($"✅ Total: {allVouchers.Count} vouchers fetched");
            return allVouchers;
        }

        private async Task<List<Voucher>> GetVouchersInternalAsync(DateTime? fromDate, DateTime? toDate, string? companyName, string? voucherTypeFilter, Dictionary<string, string>? stockItemHsnCache = null)
        {
            DateTime effectiveFrom = fromDate ?? new DateTime(2024, 4, 1);
            DateTime effectiveTo = toDate ?? effectiveFrom;

            string fromDateStr = effectiveFrom.ToString("yyyyMMdd");
            string toDateStr = effectiveTo.ToString("yyyyMMdd");
            string typeLog = voucherTypeFilter ?? "All";

            SyncLogger.Log($"Extracting Vouchers ({typeLog}): {effectiveFrom:dd-MMM-yy} to {effectiveTo:dd-MMM-yy}");

            string filterXml = string.IsNullOrEmpty(voucherTypeFilter) ? "" : $"<VOUCHERTYPENAME>{voucherTypeFilter}</VOUCHERTYPENAME>";

            var request = $@"
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Voucher Register</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>{fromDateStr}</SVFROMDATE>
          <SVTODATE>{toDateStr}</SVTODATE>
          <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
          <ISITEMWISE>No</ISITEMWISE>
          <SVEXPLODEALL>Yes</SVEXPLODEALL>
          <SVEXPORTINVENTORY>Yes</SVEXPORTINVENTORY>
          {filterXml}
        </STATICVARIABLES>
        <TDL>
             <TDLMESSAGE>
                 <REPORT NAME=""Voucher Register"" ISMODIFY=""No"">
                     <SET>SVEXPLODEALL:Yes</SET>
                     <SET>EXPLODEINVENTORY:Yes</SET>
                     <SET>EXPLODEGSTDETAILS:Yes</SET>
                     <SET>GSTDETAILS:Yes</SET>
                 </REPORT>
             </TDLMESSAGE>
        </TDL>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>";

            // Short timeout for specific types, longer for global
            int timeout = string.IsNullOrEmpty(voucherTypeFilter) ? 180 : 60;
            var doc = await SendRequestAsync(request, companyName, timeout);
            
            if (doc == null) return new List<Voucher>();

            return ParseVouchersFromXml(doc, companyName, effectiveFrom, stockItemHsnCache);
        }

        private List<Voucher> ParseVouchersFromXml(XDocument doc, string? companyName, DateTime defaultDate, Dictionary<string, string>? stockItemHsnCache = null)
        {
            var vouchers = new List<Voucher>();
            var companyId = CleanCompanyId(companyName);

            // Tally Prime can return either VOUCHER or DSPVCH in register reports
            var voucherNodes = doc.Descendants().Where(e => 
                e.Name.LocalName == "VOUCHER" || e.Name.LocalName == "DSPVCH").ToList();
            
            SyncLogger.Log($"Found {voucherNodes.Count} raw nodes in Tally response.");

            foreach (var vNode in voucherNodes)
            {
                string vNum = "0";
                try
                {
                    string vType = GetElementValue(vNode, "VOUCHERTYPENAME") ?? GetElementValue(vNode, "VCHTYPE") ?? GetElementValue(vNode, "DSPVCHTYPE") ?? "Unknown";
                    vNum = GetElementValue(vNode, "VOUCHERNUMBER") ?? GetElementValue(vNode, "VCHNO") ?? GetElementValue(vNode, "DSPVCHNUMBER") ?? "0";
                    DateTime vDate = ParseDate(GetElementValue(vNode, "DATE") ?? GetElementValue(vNode, "DSPVCHDATE"));
                    
                    if (vDate == DateTime.MinValue) vDate = defaultDate;

                    // Parse Ledger Entries (Face of Voucher only, exclude Item Allocations)
                    var ledgerEntries = new List<VoucherLedgerEntry>();
                    var ledgerNodes = vNode.Descendants()
                        .Where(e => (e.Name.LocalName.Contains("LEDGERENTRIES", StringComparison.OrdinalIgnoreCase) ||
                                     e.Name.LocalName.Contains("DSPVCHLEDGER", StringComparison.OrdinalIgnoreCase)) &&
                                    !e.Ancestors().Any(a => a.Name.LocalName.Contains("INVENTORYENTRIES", StringComparison.OrdinalIgnoreCase) || 
                                                            a.Name.LocalName.Contains("ORDERLIST", StringComparison.OrdinalIgnoreCase)))
                        .ToList();

                    foreach (var lNode in ledgerNodes)
                    {
                        string lName = GetElementValue(lNode, "LEDGERNAME") ?? GetElementValue(lNode, "DSPVCHLEDGERNAME") ?? "";
                        if (string.IsNullOrEmpty(lName)) continue;

                        decimal amount = ParseDecimal(GetElementValue(lNode, "AMOUNT") ?? GetElementValue(lNode, "DSPVCHLEDGERAMOUNT"));
                        
                        var entry = new VoucherLedgerEntry
                        {
                            LedgerName = lName,
                            Amount = Math.Abs(amount),
                            IsDebit = amount < 0
                        };

                        // Parse Bill Allocations
                        foreach (var bNode in lNode.Descendants().Where(e => e.Name.LocalName == "BILLALLOCATIONS.LIST"))
                        {
                            entry.BillAllocations.Add(new BillAllocation
                            {
                                Name = GetElementValue(bNode, "NAME") ?? "Unknown Ref", // Required field
                                BillType = GetElementValue(bNode, "BILLTYPE"),
                                Amount = ParseDecimal(GetElementValue(bNode, "AMOUNT")),
                                BillCreditPeriod = GetElementValue(bNode, "BILLCREDITPERIOD")
                            });
                        }

                        // Parse Bank Allocations
                        foreach (var bankNode in lNode.Descendants().Where(e => e.Name.LocalName == "BANKALLOCATIONS.LIST"))
                        {
                            entry.BankAllocations.Add(new BankAllocation
                            {
                                BankPartyName = GetElementValue(bankNode, "PAYMENTFAVOURING") ?? GetElementValue(bankNode, "TRANSACTIONNAME"),
                                TransactionType = GetElementValue(bankNode, "TRANSACTIONTYPE"),
                                InstrumentDate = ParseDate(GetElementValue(bankNode, "INSTRUMENTDATE") ?? GetElementValue(bankNode, "DATE")),
                                InstrumentNumber = GetElementValue(bankNode, "INSTRUMENTNUMBER"),
                                Amount = ParseDecimal(GetElementValue(bankNode, "AMOUNT")),
                                BankName = GetElementValue(bankNode, "BANKNAME")
                            });
                        }

                        ledgerEntries.Add(entry);
                    }

                    // Parse Inventory Entries
                    var inventoryEntries = new List<VoucherInventoryEntry>();
                    
                    // FIX: Be more precise when selecting inventory nodes
                    var invNodes = vNode.Descendants()
                        .Where(e => 
                            e.Name.LocalName.Equals("ALLINVENTORYENTRIES.LIST", StringComparison.OrdinalIgnoreCase) ||
                            e.Name.LocalName.Equals("INVENTORYENTRIES.LIST", StringComparison.OrdinalIgnoreCase) ||
                            e.Name.LocalName.Equals("INVENTORYENTRIESIN.LIST", StringComparison.OrdinalIgnoreCase) ||
                            e.Name.LocalName.Equals("INVENTORYENTRIESOUT.LIST", StringComparison.OrdinalIgnoreCase) ||
                            (e.Name.LocalName.Contains("DSPVCH") && e.Elements().Any(c => 
                                c.Name.LocalName.Equals("STOCKITEMNAME", StringComparison.OrdinalIgnoreCase) ||
                                c.Name.LocalName.Equals("DSPVCHITEMNAME", StringComparison.OrdinalIgnoreCase)))
                        ).ToList();

                    foreach (var iNode in invNodes)
                    {
                        // Optimization: Cache descendants once for this inventory node
                        var iDescendants = iNode.Descendants().ToList();

                        // Get stock item name - must be present
                        string itemName = GetElementValue(iNode, "STOCKITEMNAME") ?? 
                                          GetElementValue(iNode, "DSPVCHITEMNAME") ?? 
                                          GetElementValue(iNode, "ITEMNAME") ?? "";
                        
                        // Skip if no valid item name (prevents picking up metadata nodes)
                        if (string.IsNullOrEmpty(itemName) || itemName.Equals("Stock Item", StringComparison.OrdinalIgnoreCase)) 
                            continue;

                        // FIXED: Robust HSN extraction using canonical helper
                        string hsnCode = ResolveHsn(iDescendants, itemName, stockItemHsnCache);

                        // Quantity
                        string qtyStr = GetElementValue(iNode, "BILLEDQTY") ?? 
                                        GetElementValue(iNode, "ACTUALQTY") ?? 
                                        GetElementValue(iNode, "DSPVCHQTY") ?? 
                                        GetElementValue(iNode, "QTY") ?? "0";
                        decimal qty = ParseDecimal(qtyStr);
                        
                        // Unit
                        string unit = GetElementValue(iNode, "DSPVCHUNIT") ?? 
                                      GetElementValue(iNode, "UNIT") ?? "";
                        if (string.IsNullOrEmpty(unit) && qtyStr.Contains(' '))
                        {
                            unit = qtyStr.Split(' ').LastOrDefault() ?? "";
                        }

                        // Rate
                        string rateStr = GetElementValue(iNode, "RATE") ?? 
                                         GetElementValue(iNode, "DSPVCHRATE") ?? "0";
                        decimal rate = ParseDecimal(rateStr);

                        // Amount
                        decimal amount = Math.Abs(ParseDecimal(
                            GetElementValue(iNode, "AMOUNT") ?? 
                            GetElementValue(iNode, "DSPVCHITEMAMOUNT") ?? "0"));

                        // Discount Percentage
                        // Tally sends " 5 %" or "-5%" or just "5"
                        string discountStr = GetElementValue(iNode, "DISCOUNT") ?? 
                                           GetElementValue(iNode, "DSPVCHDISCOUNT") ?? "0";
                        decimal discountPercent = Math.Abs(ParseDecimal(discountStr.Replace("%", "").Trim()));

                        // Tax Rate & Taxability
                        string? taxRateStr = iDescendants.FirstOrDefault(x => x.Name.LocalName.Equals("RATEOFTAXCALCULATION", StringComparison.OrdinalIgnoreCase))?.Value;
                        decimal? taxRate = !string.IsNullOrEmpty(taxRateStr) ? ParseDecimal(taxRateStr) : (decimal?)null;
                        
                        string? taxability = iDescendants.FirstOrDefault(x => x.Name.LocalName.Equals("TAXABILITY", StringComparison.OrdinalIgnoreCase))?.Value;

                        inventoryEntries.Add(new VoucherInventoryEntry
                        {
                            StockItemName = itemName,
                            Quantity = qty,
                            Unit = unit,
                            Rate = rate,
                            Amount = amount,
                            DiscountPercent = discountPercent,
                            HsnCode = hsnCode,
                            TaxRate = taxRate,
                            Taxability = taxability
                        });
                    }


                    // --- Robust Party and Amount Extraction ---
                    string partyName = GetElementValue(vNode, "PARTYLEDGERNAME") ?? GetElementValue(vNode, "PARTYNAME") ?? GetElementValue(vNode, "DSPVCHPARTY") ?? "";
                    if (string.IsNullOrEmpty(partyName) && ledgerEntries.Count > 0)
                    {
                        var partyEntry = ledgerEntries.OrderByDescending(l => l.Amount).FirstOrDefault();
                        partyName = partyEntry?.LedgerName ?? "";
                    }

                    // TOTAL AMOUNT logic: In a Sales/Purchase voucher, the Party is the main Debit/Credit for the FULL amount.
                    decimal totalAmount = 0;
                    
                    // 1. Try to find the Ledger entry matching the Party Name (Case Insensitive)
                    var mainPartyLedger = ledgerEntries.FirstOrDefault(l => 
                        !string.IsNullOrEmpty(partyName) && 
                        l.LedgerName.Equals(partyName, StringComparison.OrdinalIgnoreCase));
                    
                    if (mainPartyLedger != null)
                    {
                        totalAmount = Math.Abs(mainPartyLedger.Amount);
                    }
                    else
                    {
                        // 2. Fallback: Use the highest absolute ledger amount (usually the Party amount)
                        if (ledgerEntries.Count > 0)
                            totalAmount = ledgerEntries.Max(l => Math.Abs(l.Amount));
                        
                        // 3. Fallback: Use top-level tag
                        if (totalAmount == 0)
                            totalAmount = Math.Abs(ParseDecimal(GetElementValue(vNode, "AMOUNT") ?? GetElementValue(vNode, "DSPVCHAMOUNT")));
                    }

                    if (totalAmount == 0 && inventoryEntries.Count > 0)
                    {
                        totalAmount = inventoryEntries.Sum(i => i.Amount);
                    }

                    var voucher = new Voucher
                    {
                        CompanyId = companyId,
                        VoucherType = vType,
                        VoucherNumber = vNum,
                        VoucherDate = vDate,
                        PartyName = partyName,
                        TotalAmount = totalAmount,
                        Narration = GetElementValue(vNode, "NARRATION"),
                        MasterId = GetElementValue(vNode, "MASTERID") ?? GetElementValue(vNode, "GUID"),
                        AlterId = GetElementValue(vNode, "ALTERID"),
                        LedgerEntries = ledgerEntries,
                        InventoryEntries = inventoryEntries
                    };
                    
                    voucher.GenerateDeterministicId(companyId);
                    vouchers.Add(voucher);
                }
                catch (Exception ex)
                {
                    SyncLogger.Log($"Error parsing voucher {vNum}: {ex.Message}");
                }
            }

            return vouchers;
        }

        /// <summary>
        /// Simple fallback: Basic voucher collection (ODBC-style)
        /// </summary>
        private async Task<List<Voucher>> GetVouchersSimpleAsync(DateTime fromDate, DateTime toDate, string? companyName)
        {
            // ... (existing code, keeping brief for cleaner file)
            // For now, redirecting to internal to leverage the same logic or could keep separate.
            // Keeping original implementation content for safety but we replaced the previous block.
            return await GetVouchersInternalAsync(fromDate, toDate, companyName, null);
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
        public async Task<List<Sale>> GetSalesAsync(DateTime? fromDate = null, DateTime? toDate = null, string? companyName = null, Dictionary<string, string>? stockItemHsnCache = null)
        {
            // NEW APPROACH: Ask Tally strictly for Sales vouchers
            // This ensures we get all sales sub-types (GST Sales, Export Sales) automatically
            var vouchers = await GetVouchersInternalAsync(fromDate, toDate, companyName, "Sales", stockItemHsnCache);
            return MapVouchersToSales(vouchers, companyName);
        }

        public List<Sale> MapVouchersToSales(List<Voucher> vouchers, string? companyName)
        {
            var companyId = CleanCompanyId(companyName);
            return vouchers
                .Select(v => {
                    var sale = new Sale
                    {
                        Id = v.Id,
                        VoucherId = v.Id,
                        InvoiceNumber = v.VoucherNumber,
                        InvoiceDate = v.VchDate,
                        PartyLedgerName = v.PartyName ?? "Cash",
                        GrossAmount = v.TotalAmount,
                        NetAmount = v.TotalAmount,
                        TaxableAmount = v.TotalAmount,
                        Narration = v.Narration,
                        MasterId = v.MasterId,
                        AlterId = v.AlterId,
                        CompanyId = companyId,
                        Items = v.InventoryEntries?.Select((inv, idx) => new SaleItem
                        {
                            Id = $"{v.Id}_{idx}",
                            SaleId = v.Id,
                            CompanyId = companyId,
                            StockItemName = inv.StockItemName,
                            Quantity = inv.Quantity,
                            Unit = inv.Unit,
                            Rate = inv.Rate,
                            Amount = inv.Amount,
                            HsnCode = inv.HsnCode
                        }).ToList()
                    };

                    if (v.LedgerEntries != null)
                    {
                        sale.CgstAmount = Math.Abs(v.LedgerEntries
                            .Where(l => l.LedgerName.Contains("CGST", StringComparison.OrdinalIgnoreCase))
                            .Sum(l => l.Amount));
                        sale.SgstAmount = Math.Abs(v.LedgerEntries
                            .Where(l => l.LedgerName.Contains("SGST", StringComparison.OrdinalIgnoreCase))
                            .Sum(l => l.Amount));
                        sale.IgstAmount = Math.Abs(v.LedgerEntries
                            .Where(l => l.LedgerName.Contains("IGST", StringComparison.OrdinalIgnoreCase))
                            .Sum(l => l.Amount));
                        
                        var totalTax = sale.CgstAmount + sale.SgstAmount + sale.IgstAmount;
                        sale.TaxableAmount = sale.GrossAmount - totalTax;
                        
                        if (totalTax == 0 && v.InventoryEntries?.Count > 0)
                        {
                            sale.TaxableAmount = v.InventoryEntries.Sum(i => i.Amount);
                        }
                        
                        sale.NetAmount = sale.TaxableAmount;
                    }

                    return sale;
                })
                .ToList();
        }

        public async Task<List<Purchase>> GetPurchasesAsync(DateTime? fromDate = null, DateTime? toDate = null, string? companyName = null, Dictionary<string, string>? stockItemHsnCache = null)
        {
            // NEW APPROACH: Ask Tally strictly for Purchase vouchers
            var vouchers = await GetVouchersInternalAsync(fromDate, toDate, companyName, "Purchase", stockItemHsnCache);
            return MapVouchersToPurchases(vouchers, companyName);
        }

        public List<Purchase> MapVouchersToPurchases(List<Voucher> vouchers, string? companyName)
        {
            var companyId = CleanCompanyId(companyName);
            return vouchers
                .Select(v => {
                    var purchase = new Purchase
                    {
                        Id = v.Id,
                        VoucherId = v.Id,
                        InvoiceNumber = v.VoucherNumber,
                        InvoiceDate = v.VchDate,
                        PartyLedgerName = v.PartyName ?? "Cash",
                        GrossAmount = v.TotalAmount, // Gross = Total bill including tax
                        NetAmount = v.TotalAmount,   // Initial, will be subtracted below
                        TaxableAmount = v.TotalAmount, // Initial
                        Narration = v.Narration,
                        MasterId = v.MasterId,
                        AlterId = v.AlterId,
                        CompanyId = companyId,
                        Items = v.InventoryEntries?.Select((inv, idx) => new PurchaseItem
                        {
                            Id = $"{v.Id}_{idx}",
                            PurchaseId = v.Id,
                            CompanyId = companyId,
                            StockItemName = inv.StockItemName,
                            Quantity = inv.Quantity,
                            Unit = inv.Unit,
                            Rate = inv.Rate,
                            Amount = inv.Amount,
                            HsnCode = inv.HsnCode
                        }).ToList()
                    };

                    // Tax Breakdown
                    // NOTE: Tally ledger entries may have negative amounts for debit/credit entries
                    // We use Math.Abs() to get the actual tax values
                    if (v.LedgerEntries != null)
                    {
                        purchase.CgstAmount = Math.Abs(v.LedgerEntries
                            .Where(l => l.LedgerName.Contains("CGST", StringComparison.OrdinalIgnoreCase))
                            .Sum(l => l.Amount));
                        purchase.SgstAmount = Math.Abs(v.LedgerEntries
                            .Where(l => l.LedgerName.Contains("SGST", StringComparison.OrdinalIgnoreCase))
                            .Sum(l => l.Amount));
                        purchase.IgstAmount = Math.Abs(v.LedgerEntries
                            .Where(l => l.LedgerName.Contains("IGST", StringComparison.OrdinalIgnoreCase))
                            .Sum(l => l.Amount));
                        
                        // Taxable (Net) = Gross - Total Tax
                        var totalTax = purchase.CgstAmount + purchase.SgstAmount + purchase.IgstAmount;
                        purchase.TaxableAmount = purchase.GrossAmount - totalTax;
                        
                        // Fallback: If no tax ledgers found, Taxable = Items Total
                        if (totalTax == 0 && v.InventoryEntries?.Count > 0)
                        {
                            purchase.TaxableAmount = v.InventoryEntries.Sum(i => i.Amount);
                        }
                        
                        purchase.NetAmount = purchase.TaxableAmount; // Net = Taxable (matches Tally ledger)
                    }

                    return purchase;
                })
                .ToList();
        }

        /// <summary>
        /// Get stock items
        /// </summary>
        public async Task<List<StockItem>> GetStockItemsAsync(string? companyName = null)
        {
            // Use a more detailed TDL request that fetches GST details
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
            <FETCH>NAME, GUID, PARENT, BASEUNITS, OPENINGBALANCE, CLOSINGBALANCE, OPENINGVALUE, CLOSINGVALUE, OPENINGRATE, CLOSINGRATE, GSTDETAILS.LIST, HSNDETAILS.LIST, HSNCODE, GSTAPPLICABLE, GSTCLASSIFICATION, ADDITIONALUNITS</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            SyncLogger.Log("[DEBUG] Sending StockItem request to Tally...");
            var doc = await SendRequestAsync(request, companyName);
            if (doc == null) 
            {
                 SyncLogger.Log("⚠️ StockItem request returned NULL");
                 return new List<StockItem>();
            }
            
            int rawCount = doc.Descendants("STOCKITEM").Count();
            SyncLogger.Log($"[DEBUG] Tally returned {rawCount} STOCKITEM nodes");

            var items = new List<StockItem>();

            foreach (var itemElement in doc.Descendants("STOCKITEM"))
            {
                try
                {
                    // Try to get HSN from multiple locations (Layered approach)
                    string? hsnCode = GetElementValue(itemElement, "HSNCODE");

                    // 1. TallyPrime 4.0+: Check HSNDETAILS.LIST (New Structure)
                    if (string.IsNullOrEmpty(hsnCode))
                    {
                        var hsnDetailsList = itemElement.Descendants()
                            .Where(x => x.Name.LocalName.Equals("HSNDETAILS.LIST", StringComparison.OrdinalIgnoreCase))
                            .ToList();

                        // Iterate to find the latest valid HSN
                        foreach (var detail in hsnDetailsList)
                        {
                            var hsn = GetElementValue(detail, "HSNCODE");
                            if (!string.IsNullOrEmpty(hsn)) 
                            { 
                                hsnCode = hsn; 
                                // Don't break immediately, we might want the last one if it's date-ordered? 
                                // Tally usually exports list in order. Let's assume last or rely on first hit if acceptable.
                                // Actually, 'HSNCODE' usually appears in the history list.
                            } 
                        }
                    }
                    
                    // 2. Tally ERP 9 / Older Prime: Check GSTDETAILS.LIST
                    if (string.IsNullOrEmpty(hsnCode))
                    {
                        var gstDetailsList = itemElement.Descendants()
                            .Where(x => x.Name.LocalName.Equals("GSTDETAILS.LIST", StringComparison.OrdinalIgnoreCase))
                            .Reverse() // Start from latest
                            .ToList();

                        foreach (var gstDetails in gstDetailsList)
                        {
                            hsnCode = GetElementValue(gstDetails, "HSNCODE") ?? 
                                      GetElementValue(gstDetails, "HSN") ?? 
                                      GetElementValue(gstDetails, "HSNORSACCODE");
                            
                            if (!string.IsNullOrEmpty(hsnCode)) break; // Found it
                        }
                    }
                    
                    // 3. Final Fallback: Root level tags
                    if (string.IsNullOrEmpty(hsnCode))
                    {
                        hsnCode = GetElementValue(itemElement, "HSN") ?? 
                                  GetElementValue(itemElement, "HSNORSACCODE");
                    }
                    
                    // Filter out invalid HSN codes like "Stock Item", "Stock Group", etc.
                    if (!string.IsNullOrEmpty(hsnCode) && 
                        (hsnCode.Contains("Stock", StringComparison.OrdinalIgnoreCase) ||
                         hsnCode.Contains("Group", StringComparison.OrdinalIgnoreCase) ||
                         hsnCode.Contains("Primary", StringComparison.OrdinalIgnoreCase)))
                    {
                        hsnCode = null;
                    }

                    items.Add(new StockItem
                    {
                        Id = GetAttribute(itemElement, "GUID") ?? GetElementValue(itemElement, "GUID") ?? Guid.NewGuid().ToString(),
                        Name = GetAttribute(itemElement, "NAME") ?? GetElementValue(itemElement, "NAME") ?? "Unknown",
                        StockGroup = GetElementValue(itemElement, "PARENT"),
                        BaseUnit = GetElementValue(itemElement, "BASEUNITS") ?? GetElementValue(itemElement, "ADDITIONALUNITS"),
                        OpeningBalance = ParseDecimal(GetElementValue(itemElement, "OPENINGBALANCE")),
                        OpeningValue = ParseDecimal(GetElementValue(itemElement, "OPENINGVALUE")),
                        ClosingBalance = ParseDecimal(GetElementValue(itemElement, "CLOSINGBALANCE")),
                        ClosingValue = ParseDecimal(GetElementValue(itemElement, "CLOSINGVALUE")),
                        Rate = ParseDecimal(GetElementValue(itemElement, "CLOSINGRATE")) > 0 
                            ? ParseDecimal(GetElementValue(itemElement, "CLOSINGRATE")) 
                            : ParseDecimal(GetElementValue(itemElement, "OPENINGRATE")),
                        HsnCode = hsnCode,
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
            // First try direct child
            var child = element.Elements().FirstOrDefault(e => e.Name.LocalName.Equals(name, StringComparison.OrdinalIgnoreCase));
            if (child != null) return child.Value;

            // Then try any descendant (useful for deep trees or variations)
            child = element.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals(name, StringComparison.OrdinalIgnoreCase));
            return child?.Value;
        }

        private static string? GetAttribute(XElement element, string name)
        {
            return element.Attribute(name)?.Value;
        }

        private static decimal ParseDecimal(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return 0;
            
            var cleanValue = value.Trim();
            
            // Handle Tally Rate format: "100/NOS" or "50.00/PCS" 
            if (cleanValue.Contains('/'))
            {
                cleanValue = cleanValue.Split('/')[0].Trim();
            }
            
            // Handle Tally Quantity format: "10 NOS" or "5 PCS"
            if (cleanValue.Contains(' '))
            {
                cleanValue = cleanValue.Split(' ')[0].Trim();
            }
            
            // Remove currency symbols and commas
            cleanValue = cleanValue.Replace("₹", "").Replace(",", "").Replace("Rs", "").Replace("Rs.", "").Trim();
            
            if (decimal.TryParse(cleanValue, out var result))
            {
                return result;
            }

            // Fallback: extract only numbers, decimal point, and minus
            var numericPart = new string(cleanValue.Where(c => char.IsDigit(c) || c == '.' || c == '-').ToArray());
            if (decimal.TryParse(numericPart, out result))
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

        #region HSN Logic

        private string ResolveHsn(List<XElement> iDescendants, string itemName, Dictionary<string, string>? stockItemHsnCache)
        {
            // 1. Try XML First
            var hsnFromXml = iDescendants
                .FirstOrDefault(x =>
                    x.Name.LocalName.Equals("HSNCODE", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("HSNORSACCODE", StringComparison.OrdinalIgnoreCase))
                ?.Value ?? "";

            if (IsValidHsn(hsnFromXml)) return NormalizeHsn(hsnFromXml);

            // 2. Fallback: Stock Item Master Cache
            if (!string.IsNullOrEmpty(itemName) && stockItemHsnCache != null)
            {
                if (stockItemHsnCache.TryGetValue(itemName, out string? cachedHsn) && IsValidHsn(cachedHsn))
                {
                    // SyncLogger.Log($"   🔧 HSN filled from cache: {itemName} -> {cachedHsn}"); 
                    return NormalizeHsn(cachedHsn);
                }
            }

            return "";
        }

        private static bool IsValidHsn(string hsn)
        {
            if (string.IsNullOrWhiteSpace(hsn)) return false;
            hsn = hsn.Trim();
            // Basic validation: must be at least 4 chars and numeric-ish (avoiding "Stock Item" garbage)
            return hsn.Length >= 4 && !hsn.Any(c => char.IsLetter(c));
        }

        private static string NormalizeHsn(string hsn) => hsn.Trim();

        #endregion

        #endregion

        // ============================================
        // TWO-WAY SYNC: Push Voucher TO Tally
        // ============================================

        /// <summary>
        /// Push a voucher to Tally (create new entry in Tally)
        /// Used for Two-Way Sync when entries are created on Web/App
        /// </summary>
        public async Task<(bool Success, string? VoucherNumber, string? Error)> PushVoucherToTallyAsync(
            string companyName,
            string voucherType,
            DateTime voucherDate,
            string partyLedger,
            decimal amount,
            string? narration = null,
            List<VoucherLedgerEntry>? ledgerEntries = null,
            List<VoucherInventoryEntry>? inventoryEntries = null)
        {
            try
            {
                SyncLogger.Log($"📤 Pushing {voucherType} to Tally: {partyLedger} ₹{amount}");

                // Build XML for creating voucher in Tally
                var ledgerEntriesXml = new StringBuilder();
                
                if (ledgerEntries != null && ledgerEntries.Any())
                {
                    foreach (var entry in ledgerEntries)
                    {
                        ledgerEntriesXml.AppendLine($@"
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>{entry.LedgerName}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>{(entry.Amount >= 0 ? "No" : "Yes")}</ISDEEMEDPOSITIVE>
                <AMOUNT>{(entry.Amount >= 0 ? "" : "-")}{Math.Abs(entry.Amount)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>");
                    }
                }
                else
                {
                    // Default: Party ledger (debit for sales, credit for purchases)
                    bool isSaleType = voucherType.Contains("Sales") || voucherType.Contains("Receipt");
                    ledgerEntriesXml.AppendLine($@"
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>{partyLedger}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>{(isSaleType ? "Yes" : "No")}</ISDEEMEDPOSITIVE>
                <AMOUNT>{(isSaleType ? "" : "-")}{amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>{(isSaleType ? "Sales" : "Purchase")}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>{(isSaleType ? "No" : "Yes")}</ISDEEMEDPOSITIVE>
                <AMOUNT>{(isSaleType ? "-" : "")}{amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>");
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
                            
                            if (!string.IsNullOrEmpty(item.HsnCode))
                                gstXmlBuilder.AppendLine($"                    <HSNCODE>{item.HsnCode}</HSNCODE>");
                                
                            if (item.TaxRate.HasValue)
                            {
                                gstXmlBuilder.AppendLine($"                    <RATEOFTAXCALCULATION>{item.TaxRate}</RATEOFTAXCALCULATION>");
                                gstXmlBuilder.AppendLine($"                    <GSTOVRDNNATURE>Taxable</GSTOVRDNNATURE>");
                            }
                            
                            string taxability = item.Taxability ?? ((item.TaxRate ?? 0) > 0 ? "Taxable" : "Exempt");
                            gstXmlBuilder.AppendLine($"                    <TAXABILITY>{taxability}</TAXABILITY>");
                            
                            gstXmlBuilder.AppendLine("                </GSTDETAILS.LIST>");
                        }
                        string hsnXml = gstXmlBuilder.ToString();

                        inventoryXml.AppendLine($@"
            <ALLINVENTORYENTRIES.LIST>
                <STOCKITEMNAME>{item.StockItemName}</STOCKITEMNAME>
                {hsnXml}
                <ACTUALQTY>{item.Quantity} {item.Unit}</ACTUALQTY>
                <BILLEDQTY>{item.Quantity} {item.Unit}</BILLEDQTY>
                <RATE>{item.Rate}/{item.Unit}</RATE>
                <AMOUNT>{item.Amount}</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>");
                    }
                }

                var request = $@"
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF=""TallyUDF"">
                    <VOUCHER VCHTYPE=""{voucherType}"" ACTION=""Create"">
                        <DATE>{voucherDate:yyyyMMdd}</DATE>
                        <VOUCHERTYPENAME>{voucherType}</VOUCHERTYPENAME>
                        <PARTYLEDGERNAME>{partyLedger}</PARTYLEDGERNAME>
                        <NARRATION>{narration ?? ""}</NARRATION>
                        {ledgerEntriesXml}
                        {inventoryXml}
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>";

                var doc = await SendRequestAsync(request, companyName, 30);

                if (doc == null)
                {
                    return (false, null, "No response from Tally");
                }

                // Check for success in response
                var responseText = doc.ToString();
                
                // Look for CREATED element (successful creation)
                var created = doc.Descendants("CREATED").FirstOrDefault()?.Value;
                if (created == "1")
                {
                    // Try to get the voucher number from response
                    var voucherNumber = doc.Descendants("VOUCHERNUMBER").FirstOrDefault()?.Value;
                    SyncLogger.Log($"✅ Voucher created in Tally: {voucherNumber ?? "Success"}");
                    return (true, voucherNumber, null);
                }

                // Check for errors
                var errorMsg = doc.Descendants("LINEERROR").FirstOrDefault()?.Value ??
                               doc.Descendants("ERRORS").FirstOrDefault()?.Value ??
                               "Unknown error creating voucher";

                SyncLogger.Log($"❌ Tally rejected voucher: {errorMsg}");
                return (false, null, errorMsg);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"❌ PushVoucherToTallyAsync error: {ex.Message}");
                return (false, null, ex.Message);
            }
        }
        // =============================================
        // NEW MASTER DATA FETCH METHODS
        // =============================================

        /// <summary>
        /// Get all Ledger Groups (Account Groups) from Tally
        /// </summary>
        public async Task<List<LedgerGroup>> GetLedgerGroupsAsync(string companyName)
        {
            var groups = new List<LedgerGroup>();
            try
            {
                string xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <STATICVARIABLES><SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY></STATICVARIABLES>
                        <REPORTNAME>List of Accounts</REPORTNAME>
                        <STATICVARIABLES><EXPLODEFLAG>Yes</EXPLODEFLAG></STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                // Simpler collection approach
                xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <COLLECTIONTYPE>Group</COLLECTIONTYPE>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                var doc = await SendRequestAsync(xml, companyName);
                if (doc == null) return groups;

                var elements = doc.Descendants("GROUP");
                int idx = 0;
                foreach (var el in elements)
                {
                    groups.Add(new LedgerGroup
                    {
                        Id = GetElementValue(el, "GUID") ?? $"grp_{companyName}_{idx++}",
                        Name = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME") ?? "",
                        Parent = GetElementValue(el, "PARENT"),
                        IsRevenue = GetElementValue(el, "ISREVENUE")?.ToUpper() == "YES",
                        IsDeemedPositive = GetElementValue(el, "ISDEEMEDPOSITIVE")?.ToUpper() == "YES",
                        AffectsGrossProfit = GetElementValue(el, "AFFECTSGROSSPROFIT")?.ToUpper() == "YES",
                        SortPosition = (int)ParseDecimal(GetElementValue(el, "SORTPOSITION")),
                        MasterId = GetElementValue(el, "MASTERID"),
                        AlterId = GetElementValue(el, "ALTERID")
                    });
                }
                Log($"📋 Fetched {groups.Count} Ledger Groups from {companyName}");
            }
            catch (Exception ex) { Log($"❌ GetLedgerGroupsAsync error: {ex.Message}"); }
            return groups;
        }

        /// <summary>
        /// Get all Cost Centres from Tally
        /// </summary>
        public async Task<List<CostCentre>> GetCostCentresAsync(string companyName)
        {
            var items = new List<CostCentre>();
            try
            {
                string xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <COLLECTIONTYPE>CostCentre</COLLECTIONTYPE>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                var doc = await SendRequestAsync(xml, companyName);
                if (doc == null) return items;

                int idx = 0;
                foreach (var el in doc.Descendants("COSTCENTRE"))
                {
                    items.Add(new CostCentre
                    {
                        Id = GetElementValue(el, "GUID") ?? $"cc_{companyName}_{idx++}",
                        Name = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME") ?? "",
                        Parent = GetElementValue(el, "PARENT"),
                        Category = GetElementValue(el, "CATEGORY"),
                        MasterId = GetElementValue(el, "MASTERID"),
                        AlterId = GetElementValue(el, "ALTERID")
                    });
                }
                Log($"🏭 Fetched {items.Count} Cost Centres from {companyName}");
            }
            catch (Exception ex) { Log($"❌ GetCostCentresAsync error: {ex.Message}"); }
            return items;
        }

        /// <summary>
        /// Get all Godowns (Warehouses) from Tally
        /// </summary>
        public async Task<List<Godown>> GetGodownsAsync(string companyName)
        {
            var items = new List<Godown>();
            try
            {
                string xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <COLLECTIONTYPE>Godown</COLLECTIONTYPE>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                var doc = await SendRequestAsync(xml, companyName);
                if (doc == null) return items;

                int idx = 0;
                foreach (var el in doc.Descendants("GODOWN"))
                {
                    items.Add(new Godown
                    {
                        Id = GetElementValue(el, "GUID") ?? $"gdn_{companyName}_{idx++}",
                        Name = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME") ?? "",
                        Parent = GetElementValue(el, "PARENT"),
                        Address = GetElementValue(el, "ADDRESS"),
                        HasNoSpace = GetElementValue(el, "HASNOSPACE")?.ToUpper() == "YES",
                        IsInternal = GetElementValue(el, "ISINTERNAL")?.ToUpper() == "YES",
                        MasterId = GetElementValue(el, "MASTERID"),
                        AlterId = GetElementValue(el, "ALTERID")
                    });
                }
                Log($"📦 Fetched {items.Count} Godowns from {companyName}");
            }
            catch (Exception ex) { Log($"❌ GetGodownsAsync error: {ex.Message}"); }
            return items;
        }

        /// <summary>
        /// Get all Stock Groups from Tally
        /// </summary>
        public async Task<List<TallyStockGroup>> GetStockGroupsAsync(string companyName)
        {
            var items = new List<TallyStockGroup>();
            try
            {
                string xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <COLLECTIONTYPE>StockGroup</COLLECTIONTYPE>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                var doc = await SendRequestAsync(xml, companyName);
                if (doc == null) return items;

                int idx = 0;
                foreach (var el in doc.Descendants("STOCKGROUP"))
                {
                    items.Add(new TallyStockGroup
                    {
                        Id = GetElementValue(el, "GUID") ?? $"sg_{companyName}_{idx++}",
                        Name = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME") ?? "",
                        Parent = GetElementValue(el, "PARENT"),
                        IsAddAble = GetElementValue(el, "ISADDABLE")?.ToUpper() != "NO",
                        MasterId = GetElementValue(el, "MASTERID"),
                        AlterId = GetElementValue(el, "ALTERID")
                    });
                }
                Log($"📊 Fetched {items.Count} Stock Groups from {companyName}");
            }
            catch (Exception ex) { Log($"❌ GetStockGroupsAsync error: {ex.Message}"); }
            return items;
        }

        /// <summary>
        /// Get all Stock Categories from Tally
        /// </summary>
        public async Task<List<TallyStockCategory>> GetStockCategoriesAsync(string companyName)
        {
            var items = new List<TallyStockCategory>();
            try
            {
                string xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <COLLECTIONTYPE>StockCategory</COLLECTIONTYPE>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                var doc = await SendRequestAsync(xml, companyName);
                if (doc == null) return items;

                int idx = 0;
                foreach (var el in doc.Descendants("STOCKCATEGORY"))
                {
                    items.Add(new TallyStockCategory
                    {
                        Id = GetElementValue(el, "GUID") ?? $"sc_{companyName}_{idx++}",
                        Name = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME") ?? "",
                        Parent = GetElementValue(el, "PARENT"),
                        MasterId = GetElementValue(el, "MASTERID"),
                        AlterId = GetElementValue(el, "ALTERID")
                    });
                }
                Log($"📂 Fetched {items.Count} Stock Categories from {companyName}");
            }
            catch (Exception ex) { Log($"❌ GetStockCategoriesAsync error: {ex.Message}"); }
            return items;
        }

        /// <summary>
        /// Get all Currencies from Tally
        /// </summary>
        public async Task<List<TallyCurrency>> GetCurrenciesAsync(string companyName)
        {
            var items = new List<TallyCurrency>();
            try
            {
                string xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <COLLECTIONTYPE>Currency</COLLECTIONTYPE>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                var doc = await SendRequestAsync(xml, companyName);
                if (doc == null) return items;

                int idx = 0;
                foreach (var el in doc.Descendants("CURRENCY"))
                {
                    items.Add(new TallyCurrency
                    {
                        Id = GetElementValue(el, "GUID") ?? $"cur_{companyName}_{idx++}",
                        Name = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME") ?? "",
                        Symbol = GetElementValue(el, "MAILINGNAME") ?? GetElementValue(el, "ORIGINALNAME"),
                        FormalName = GetElementValue(el, "FORMALNAME"),
                        IsoCode = GetElementValue(el, "ISOCODE") ?? GetElementValue(el, "ISOCURRENCYCODE"),
                        DecimalPlaces = (int)ParseDecimal(GetElementValue(el, "DECIMALPLACES") ?? "2"),
                        InMillions = GetElementValue(el, "INMILLIONS")?.ToUpper() == "YES",
                        MasterId = GetElementValue(el, "MASTERID"),
                        AlterId = GetElementValue(el, "ALTERID")
                    });
                }
                Log($"💱 Fetched {items.Count} Currencies from {companyName}");
            }
            catch (Exception ex) { Log($"❌ GetCurrenciesAsync error: {ex.Message}"); }
            return items;
        }

        /// <summary>
        /// Get all Voucher Types from Tally
        /// </summary>
        public async Task<List<TallyVoucherType>> GetVoucherTypesAsync(string companyName)
        {
            var items = new List<TallyVoucherType>();
            try
            {
                string xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <COLLECTIONTYPE>VoucherType</COLLECTIONTYPE>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                var doc = await SendRequestAsync(xml, companyName);
                if (doc == null) return items;

                int idx = 0;
                foreach (var el in doc.Descendants("VOUCHERTYPE"))
                {
                    items.Add(new TallyVoucherType
                    {
                        Id = GetElementValue(el, "GUID") ?? $"vt_{companyName}_{idx++}",
                        Name = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME") ?? "",
                        Parent = GetElementValue(el, "PARENT"),
                        NumberingMethod = GetElementValue(el, "NUMBERINGMETHOD"),
                        IsActive = GetElementValue(el, "ISACTIVE")?.ToUpper() != "NO",
                        IsTaxInvoice = GetElementValue(el, "ISTAXINVOICE")?.ToUpper() == "YES",
                        Prefix = GetElementValue(el, "PREFIX"),
                        Suffix = GetElementValue(el, "SUFFIX"),
                        MasterId = GetElementValue(el, "MASTERID"),
                        AlterId = GetElementValue(el, "ALTERID")
                    });
                }
                Log($"📝 Fetched {items.Count} Voucher Types from {companyName}");
            }
            catch (Exception ex) { Log($"❌ GetVoucherTypesAsync error: {ex.Message}"); }
            return items;
        }

        /// <summary>
        /// Get all Units of Measure from Tally
        /// </summary>
        public async Task<List<UnitOfMeasure>> GetUnitsAsync(string companyName)
        {
            var items = new List<UnitOfMeasure>();
            try
            {
                string xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <COLLECTIONTYPE>Unit</COLLECTIONTYPE>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                var doc = await SendRequestAsync(xml, companyName);
                if (doc == null) return items;

                int idx = 0;
                foreach (var el in doc.Descendants("UNIT"))
                {
                    items.Add(new UnitOfMeasure
                    {
                        Id = GetElementValue(el, "GUID") ?? $"unit_{companyName}_{idx++}",
                        Name = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME") ?? "",
                        Symbol = GetElementValue(el, "ORIGINALNAME") ?? GetElementValue(el, "NAME"),
                        FormalName = GetElementValue(el, "FORMALNAME"),
                        IsSimpleUnit = GetElementValue(el, "ISSIMPLEUNIT")?.ToUpper() != "NO",
                        BaseUnits = GetElementValue(el, "BASEUNITS"),
                        AdditionalUnits = GetElementValue(el, "ADDITIONALUNITS"),
                        Conversion = ParseDecimal(GetElementValue(el, "CONVERSION")),
                        NumberOfDecimalPlaces = (int)ParseDecimal(GetElementValue(el, "DECIMALPLACES") ?? "0"),
                        MasterId = GetElementValue(el, "MASTERID"),
                        AlterId = GetElementValue(el, "ALTERID")
                    });
                }
                Log($"📐 Fetched {items.Count} Units from {companyName}");
            }
            catch (Exception ex) { Log($"❌ GetUnitsAsync error: {ex.Message}"); }
            return items;
        }

        /// <summary>
        /// Get all Budgets from Tally
        /// </summary>
        public async Task<List<TallyBudget>> GetBudgetsAsync(string companyName)
        {
            var items = new List<TallyBudget>();
            try
            {
                // Correct request for Budgets uses "Budget" collection
                string xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>List of Budgets</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                // Using Collection approach
                xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <COLLECTIONTYPE>Budget</COLLECTIONTYPE>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                var doc = await SendRequestAsync(xml, companyName);
                if (doc == null) return items;

                int idx = 0;
                foreach (var el in doc.Descendants("BUDGET"))
                {
                    items.Add(new TallyBudget
                    {
                        Id = GetElementValue(el, "GUID") ?? $"bgt_{companyName}_{idx++}",
                        Name = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME") ?? "",
                        BudgetFor = GetElementValue(el, "BUDGETFOR"), // e.g. "Ledger" or "Group"
                        // Dates might need parsing if present
                        MasterId = GetElementValue(el, "MASTERID"),
                        AlterId = GetElementValue(el, "ALTERID")
                    });
                }
                Log($"💰 Fetched {items.Count} Budgets from {companyName}");
            }
            catch (Exception ex) { Log($"❌ GetBudgetsAsync error: {ex.Message}"); }
            return items;
        }

        /// <summary>
        /// Extract Bank Allocations from vouchers (cheque/NEFT details)
        /// Called after voucher sync - processes already-fetched voucher XML
        /// </summary>
        /// <summary>
        /// Get all Price Lists from Tally
        /// </summary>
        public async Task<List<PriceListEntry>> GetPriceListsAsync(string companyName)
        {
            var items = new List<PriceListEntry>();
            try
            {
                // Price Lists are complex in Tally (PRICELEVEL list -> PRICELEVEL -> PRICELIST -> ITEM)
                // We'll use a collection export for Price Levels, but extracting items is tricky.
                // Alternative: Use a collection of "PriceList" directly if Tally supports it, but standard hierarchy is PriceLevel -> Item -> PriceList
                
                string xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>List of Price Levels</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <EXPLODEFLAG>Yes</EXPLODEFLAG>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                // Using standard collection approach for Price Levels
                // Note: Getting full item-wise price list via XML Collection is verbose.
                // We'll attempt a broad collection fetch.
                
                // For now, we'll try to fetch PRICELEVEL collection and hope for nested items.
                 xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
                            <COLLECTIONTYPE>PriceLevel</COLLECTIONTYPE>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";
                 
                 // NOTE: Tally XML API for comprehensive Price List extraction is notoriously difficult 
                 // without a specific TDL. We will try a best-effort fetch of Price Levels.
                 // If specific item prices aren't exposed in standard XML, we might only get level names.
                 
                 var doc = await SendRequestAsync(xml, companyName);
                 if (doc == null) return items;

                 // Logic to parse Price Lists if available. 
                 // Tally Default XML for PriceLevel usually just gives names. 
                 // Deep extraction requires a custom TDL report usually. 
                 // We will return empty list for now to avoid crashes if data implies custom TDL needed.
                 // NOTE: To properly implement this, user would likely need a TDL file installed.
                 // We will verify if Tally returns items.
                 
                 // Log("Price List sync requires custom TDL for item-level details. Syncing Levels only for now.");
                 int idx = 0;
                 foreach (var el in doc.Descendants("PRICELEVEL"))
                 {
                     // This is just the level name (e.g. "Retail", "Wholesale")
                     string levelName = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME");
                     // We can't get the items without a specific TDL report request.
                 }
            }
            catch (Exception ex) { Log($"❌ GetPriceListsAsync error: {ex.Message}"); }
            return items;
        }

        /// <summary>
        /// Extract Bank Allocations from vouchers (cheque/NEFT details)
        /// Called after voucher sync - processes already-fetched voucher XML
        /// </summary>
        public List<BankAllocation> ExtractBankAllocations(List<Voucher> vouchers, string companyName)
        {
            var allocs = new List<BankAllocation>();
            foreach (var v in vouchers)
            {
                if (v.LedgerEntries == null) continue;
                
                foreach (var le in v.LedgerEntries)
                {
                    if (le.BankAllocations == null) continue;
                    
                    foreach (var ba in le.BankAllocations)
                    {
                        // Enrich with parent voucher info
                        ba.VoucherId = v.Id; // This is the deteministic UUID we generated
                        // ba.CompanyId will be set by SyncManager during upload
                        allocs.Add(ba);
                    }
                }
            }
            return allocs;
        }

        /// <summary>
        /// Extract Bill Allocations from vouchers (outstanding per-bill)
        /// Called after voucher sync - processes already-fetched voucher data
        /// </summary>
        public List<BillAllocation> ExtractBillAllocations(List<Voucher> vouchers, string companyName)
        {
            var allocs = new List<BillAllocation>();
            foreach (var v in vouchers)
            {
                if (v.LedgerEntries == null) continue;

                foreach (var le in v.LedgerEntries)
                {
                    if (le.BillAllocations == null) continue;

                    foreach (var ba in le.BillAllocations)
                    {
                        // Enrich with parent voucher info
                        ba.VoucherId = v.Id;
                        ba.LedgerName = le.LedgerName; // Important: link to the ledger
                        allocs.Add(ba);
                    }
                }
            }
            return allocs;
        }

        /// <summary>
        /// Extract Debit/Credit Notes from vouchers
        /// </summary>
        public List<DebitCreditNote> ExtractDebitCreditNotes(List<Voucher> vouchers, string companyName)
        {
            var notes = new List<DebitCreditNote>();
            foreach (var v in vouchers)
            {
                bool isDebitNote = v.VoucherType.Contains("Debit Note", StringComparison.OrdinalIgnoreCase);
                bool isCreditNote = v.VoucherType.Contains("Credit Note", StringComparison.OrdinalIgnoreCase);
                
                if (!isDebitNote && !isCreditNote) continue;

                notes.Add(new DebitCreditNote
                {
                    // Use deterministic ID based on Voucher ID
                    Id = v.Id, // Same ID as voucher is fine, but usually we want unique Note ID. 
                               // Actually if we use Voucher ID it's 1:1. 
                               // But DebitCreditNotes table might track extra info.
                               // Let's use "dcn_" prefix to avoid PK collision if table is separate but logic implies 1:1
                    VoucherId = v.Id,
                    NoteType = isDebitNote ? "debit" : "credit",
                    NoteNumber = v.VoucherNumber,
                    NoteDate = v.VoucherDate,
                    PartyName = v.PartyName,
                    TotalAmount = v.TotalAmount,
                    Narration = v.Narration,
                    MasterId = v.MasterId,
                    AlterId = v.AlterId,
                    // GST details would need deep parsing
                });
            }
            return notes;
        }

        public void Dispose()
        {
            _httpClient?.Dispose();
        }
    }
}
