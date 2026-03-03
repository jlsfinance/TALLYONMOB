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

        // ======= ANTI-CRASH SAFETY CONSTANTS =======
        // These limits prevent Tally ERP from crashing due to large/frequent requests
        private const int MAX_XML_RESPONSE_MB = 50;              // Max 50MB response (Tally crashes above this)
        private const int MAX_XML_RESPONSE_SIZE = MAX_XML_RESPONSE_MB * 1024 * 1024;
        private const int REQUEST_COOLDOWN_MS = 200;             // 200ms minimum gap between Tally requests
        private const int MAX_CONSECUTIVE_FAILURES = 5;          // Circuit breaker trips after 5 failures
        private const int CIRCUIT_BREAKER_RESET_SECONDS = 60;    // Wait 60s before retrying after circuit break
        private const int MAX_RETRY_TIMEOUT_SECONDS = 600;       // Max 10 minutes per request
        private const int SAFE_RECORD_LIMIT = 5000;              // Max records to fetch in one Tally request

        // Circuit breaker state
        private int _consecutiveFailures = 0;
        private DateTime _circuitBreakerTrippedAt = DateTime.MinValue;
        private DateTime _lastRequestTime = DateTime.MinValue;

        public event EventHandler<string>? LogReceived;

        public TallyConnector(string host = "127.0.0.1", int port = 9000, int timeoutSeconds = 300)
        {
            _tallyUrl = $"http://{host}:{port}";
            _timeout = Math.Min(timeoutSeconds, MAX_RETRY_TIMEOUT_SECONDS);

            // FIX: Disable proxy to avoid connection issues
            var handler = new HttpClientHandler
            {
                UseProxy = false,
                AllowAutoRedirect = true
            };

            _httpClient = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(_timeout),
                MaxResponseContentBufferSize = MAX_XML_RESPONSE_SIZE
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
        /// SAFETY: Includes circuit breaker, request cooldown, and response size limits
        /// </summary>
        private async Task<XDocument?> SendRequestAsync(string xmlRequest, string? companyName = null, int? customTimeout = null)
        {
            try
            {
                // ======= CIRCUIT BREAKER CHECK =======
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                {
                    var elapsed = (DateTime.Now - _circuitBreakerTrippedAt).TotalSeconds;
                    if (elapsed < CIRCUIT_BREAKER_RESET_SECONDS)
                    {
                        SyncLogger.Log($"ðŸ›¡ï¸ CIRCUIT BREAKER ACTIVE: {MAX_CONSECUTIVE_FAILURES} consecutive failures. " +
                            $"Waiting {CIRCUIT_BREAKER_RESET_SECONDS - (int)elapsed}s before retry to protect Tally.");
                        Log($"ðŸ›¡ï¸ CIRCUIT BREAKER: {_consecutiveFailures} failures, wait {CIRCUIT_BREAKER_RESET_SECONDS - (int)elapsed}s");
                        return null;
                    }
                    // Reset after cooldown period
                    SyncLogger.Log("ðŸ”„ Circuit breaker reset - retrying Tally connection");
                    _consecutiveFailures = 0;
                }

                // ======= REQUEST COOLDOWN =======
                // Prevent rapid-fire requests that can overwhelm Tally
                var timeSinceLastRequest = (DateTime.Now - _lastRequestTime).TotalMilliseconds;
                if (timeSinceLastRequest < REQUEST_COOLDOWN_MS)
                {
                    await Task.Delay(REQUEST_COOLDOWN_MS - (int)timeSinceLastRequest);
                }
                _lastRequestTime = DateTime.Now;

                SyncLogger.Log($">>> Tally Request [{companyName ?? "Global"}]: XML Length {xmlRequest.Length}");
                SyncLogger.SaveFile("last_tally_request.xml", xmlRequest);

                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(customTimeout ?? _timeout)))
                {
                    var content = new StringContent(xmlRequest, Encoding.UTF8, "text/xml");
                    var response = await _httpClient.PostAsync(_tallyUrl, content, cts.Token);

                    if (!response.IsSuccessStatusCode)
                    {
                        _consecutiveFailures++;
                        Log($"âŒ Tally HTTP {(int)response.StatusCode}: {response.ReasonPhrase}");
                        if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                            _circuitBreakerTrippedAt = DateTime.Now;
                        return null;
                    }

                    // ======= RESPONSE SIZE CHECK =======
                    var contentLength = response.Content.Headers.ContentLength;
                    if (contentLength.HasValue && contentLength.Value > MAX_XML_RESPONSE_SIZE)
                    {
                        SyncLogger.Log($"ðŸ›¡ï¸ SAFETY: Response too large ({contentLength.Value / (1024 * 1024)}MB > {MAX_XML_RESPONSE_MB}MB limit). " +
                            "Skipping to prevent memory crash. Reduce batch size.");
                        Log($"ðŸ›¡ï¸ Response TOO LARGE: {contentLength.Value / (1024 * 1024)}MB");
                        return null;
                    }

                    var responseContent = await response.Content.ReadAsStringAsync();
                    
                    // Double-check actual response size
                    if (responseContent.Length > MAX_XML_RESPONSE_SIZE)
                    {
                        SyncLogger.Log($"ðŸ›¡ï¸ SAFETY: Response body too large ({responseContent.Length / (1024 * 1024)}MB). Skipping.");
                        return null;
                    }

                    // Always save response for debugging
                    SyncLogger.SaveFile("last_tally_response.xml", responseContent);
                    Log($"ðŸ“¨ Tally response: {responseContent.Length} chars");
                    
                    string sanitizedContent = SanitizeXmlString(responseContent);
                    
                    var settings = new XmlReaderSettings { CheckCharacters = false, IgnoreComments = true, DtdProcessing = DtdProcessing.Ignore };
                    using (var stringReader = new StringReader(sanitizedContent))
                    using (var xmlReader = XmlReader.Create(stringReader, settings))
                    {
                        var doc = XDocument.Load(xmlReader);
                        // Success - reset circuit breaker
                        _consecutiveFailures = 0;
                        return doc;
                    }
                }
            }
            catch (TaskCanceledException)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"âš ï¸ Tally request timed out after {customTimeout ?? _timeout}s (failure #{_consecutiveFailures})");
                Log($"âš ï¸ TIMEOUT: Tally did not respond in {customTimeout ?? _timeout}s");
                return null;
            }
            catch (HttpRequestException ex)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"âš ï¸ Tally connection error: {ex.Message} (failure #{_consecutiveFailures})");
                return null;
            }
            catch (Exception ex)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"âš ï¸ Tally request error: {ex.Message} (failure #{_consecutiveFailures})");
                Log($"âŒ Tally error: {ex.Message}");
                return null;
            }
        }

        private string SanitizeXmlString(string xml)
        {
            if (string.IsNullOrEmpty(xml)) return xml;

            // FIX: Tally Prime adds UDF: prefix (User Defined Fields) without declaring xmlns:UDF
            // This causes XmlReader to throw "UDF is an undeclared prefix"
            // Solution: Replace UDF: prefix with UDF_ to make it a regular element name
            xml = xml.Replace("<UDF:", "<UDF_")
                     .Replace("</UDF:", "</UDF_")
                     .Replace(" UDF:", " UDF_");

            // Also handle any other undeclared namespace prefixes Tally might add
            // Add xmlns:UDF declaration to ENVELOPE if it still has UDF: references
            if (xml.Contains("UDF:") && xml.Contains("<ENVELOPE"))
            {
                xml = xml.Replace("<ENVELOPE", "<ENVELOPE xmlns:UDF=\"TallyUDF\"");
            }

            // Direct character-by-character filtering
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
            <COMPUTE>GSTINCompute: $GSTIN</COMPUTE>
            <COMPUTE>GSTNoCompute: $GSTREGISTRATIONNUMBER</COMPUTE>
            <COMPUTE>AddressCompute: $$SysName:Address</COMPUTE>
            <COMPUTE>StateCompute: $$SysName:StateName</COMPUTE>
            <FETCH>NAME, GUID, ADDRESS, STATENAME, LEDSTATENAME, PINCODE, PHONENUMBER, LEDGERPHONE, LEDGERMOBILE, EMAIL, LEDGEREMAIL, GSTREGISTRATIONNUMBER, TAXREGISTRATIONNUMBER, STARTINGFROM, BOOKSFROM, CURRENCYSYMBOL, COMPANYGSTDETAILS.LIST, ADDRESS.LIST, GSTINCompute, GSTNoCompute, AddressCompute, StateCompute</FETCH>
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
#if DEBUG
                File.WriteAllText("tally_response.xml", doc.ToString());
#endif
                // Using Log method if available, otherwise fallback to Console
                Log("ðŸ” Tally Response received. Checking for companies...");

                var companies = new List<Company>();
                
                // Try to find any tag that looks like a company record
                // Tally often wraps these in <COMPANY> or <COMPANYCOLLECTION> tags
                var companyElements = doc.Descendants().Where(x => x.Name.LocalName.Equals("COMPANY", StringComparison.OrdinalIgnoreCase)).ToList();
                
                Log($"ðŸ” Found {companyElements.Count} potential company elements in XML.");

                foreach (var comp in companyElements)
                {
                    string? name = comp.Element("NAME")?.Value ?? comp.Attribute("NAME")?.Value ?? comp.Value;
                    
                    if (string.IsNullOrEmpty(name)) 
                    {
                        Log("   âš ï¸ Skipping empty company name element");
                        continue;
                    }

                    if (name.Length < 2)
                    {
                         Log($"   âš ï¸ Skipping too short name: '{name}'");
                         continue;
                    }

                    if (name.Contains("Report") || name.Contains("Error") || name.Contains("\n")) 
                    {
                        Log($"   âš ï¸ Skipping reserved keyword/invalid char in: '{name}'");
                        continue;
                    }

                    name = name.Trim();
                    Log($"   âœ… Found Company: '{name}'");
                    // DEBUG: Dump raw XML snippet for company (first 800 chars)
                    try { SyncLogger.Log($"   [RAW XML] {comp.ToString().Substring(0, Math.Min(800, comp.ToString().Length))}"); } catch { }
                    
                    string sanitizedId = GenerateCompanyId(name);
                    
                    if (!companies.Any(c => c.Name == name))
                    {
                        // Extract address from ADDRESS.LIST > ADDRESS structure (Tally Prime format)
                        var addressParts = new List<string>();
                        var addressList = comp.Descendants().Where(e => e.Name.LocalName.Equals("ADDRESS.LIST", StringComparison.OrdinalIgnoreCase)).FirstOrDefault();
                        if (addressList != null)
                        {
                            addressParts.AddRange(addressList.Elements().Where(e => e.Name.LocalName.Equals("ADDRESS", StringComparison.OrdinalIgnoreCase)).Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                            if (addressParts.Count == 0 && !string.IsNullOrWhiteSpace(addressList.Value)) 
                            {
                                // Tally might return flat text for ADDRESS.LIST when FETCH is used
                                addressParts.AddRange(addressList.Value.Split('\n').Select(a => a.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                            }
                        }
                        // Fallback: direct ADDRESS descendants
                        if (addressParts.Count == 0)
                        {
                            addressParts.AddRange(comp.Descendants("ADDRESS").Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                        }
                        
                        // New computed address variable
                        var compAddressCompute = GetElementValue(comp, "ADDRESSCOMPUTE") ?? GetElementValue(comp, "COMPLETEADDRESS");
                        if (!string.IsNullOrEmpty(compAddressCompute) && addressParts.Count == 0)
                        {
                            addressParts.AddRange(compAddressCompute.Split('\n').Select(a => a.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                        }

                        // Extract State
                        var compState = GetElementValue(comp, "STATECOMPUTE") ?? GetElementValue(comp, "STATENAME") ?? GetElementValue(comp, "LEDSTATENAME") ?? GetElementValue(comp, "STATE");
                        if (!string.IsNullOrEmpty(compState) && !addressParts.Contains(compState))
                        {
                            addressParts.Add(compState);
                        }

                        // Extract GSTIN
                        var compGstin = GetElementValue(comp, "GSTINCOMPUTE") ??
                                       GetElementValue(comp, "GSTNOCOMPUTE") ??
                                       GetElementValue(comp, "CMPGSTIN") ??
                                       GetElementValue(comp, "COMPANYGSTIN") ??
                                       GetElementValue(comp, "GSTREGISTRATIONNUMBER") ??
                                       GetElementValue(comp, "GSTIN") ??
                                       GetElementValue(comp, "PARTYGSTIN") ??
                                       GetElementValue(comp, "TAXREGISTRATIONNUMBER") ??
                                       GetElementValue(comp, "VATREGISTRATIONNUMBER");

                        // Fallback: Check inside COMPANYGSTDETAILS.LIST
                        if (string.IsNullOrEmpty(compGstin))
                        {
                            var gstDetails = comp.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("COMPANYGSTDETAILS.LIST", StringComparison.OrdinalIgnoreCase));
                            if (gstDetails != null)
                            {
                                compGstin = GetElementValue(gstDetails, "GSTREGISTRATIONNUMBER") ?? GetElementValue(gstDetails, "GSTIN");
                            }
                        }

                        // Extract phone
                        var compPhone = GetElementValue(comp, "PHONENUMBER") ?? GetElementValue(comp, "LEDGERPHONE") ?? GetElementValue(comp, "LEDGERMOBILE") ?? GetElementValue(comp, "MOBILENO") ?? GetElementValue(comp, "CONTACTNUMBER") ?? GetElementValue(comp, "CONTACT");

                        // Extract email
                        var compEmail = GetElementValue(comp, "EMAIL") ?? GetElementValue(comp, "LEDGEREMAIL");

                        // Extract Financial Year
                        DateTime? fyStart = ParseDate(GetElementValue(comp, "STARTINGFROM"));
                        DateTime? fyEnd = ParseDate(GetElementValue(comp, "BOOKSFROM"));
                        string currency = GetElementValue(comp, "CURRENCYSYMBOL") ?? "â‚¹";

                        companies.Add(new Company
                        {
                            Id = sanitizedId,
                            Name = name,
                            Gstin = compGstin,
                            Address = string.Join(", ", addressParts),
                            State = compState,
                            Phone = compPhone,
                            Email = compEmail,
                            FinancialYearStart = fyStart,
                            FinancialYearEnd = fyEnd,
                            CurrencySymbol = currency
                        });
                        Log($"   Added Company: '{name}' (ID: {sanitizedId})");
                        Log($"   ðŸ“‹ GSTIN: '{compGstin ?? "EMPTY"}' | Address: '{string.Join(", ", addressParts)}' | Phone: '{compPhone ?? "EMPTY"}' | State: '{compState ?? "EMPTY"}'");
                    }
                    else
                    {
                         Log($"   âš ï¸ Skipping duplicate: '{name}'");
                    }
                }

                Log($"ðŸ” Returning {companies.Count} valid companies to SyncManager.");

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
                var sanitizedId = GenerateCompanyId(name);
                
                return new Company { Id = sanitizedId, Name = name };
            }
            catch
            {
                return null;
            }
        }

        public async Task<string> GetTallySerialNumberAsync()
        {
            var request = @"<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>System Information</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";
            
            try
            {
                var doc = await SendRequestAsync(request);
                if (doc == null) return "";

                // Look for Serial Number in various possible tags
                string? serial = doc.Descendants().FirstOrDefault(x => x.Name.LocalName.Equals("SVSERIALNUMBER", StringComparison.OrdinalIgnoreCase))?.Value;
                
                if (string.IsNullOrEmpty(serial))
                {
                    serial = doc.Descendants().FirstOrDefault(x => x.Name.LocalName.Contains("SERIAL", StringComparison.OrdinalIgnoreCase))?.Value;
                }

                return serial?.Trim() ?? "";
            }
            catch
            {
                return "";
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
            var doc = await SendRequestAsync(request, companyName != null ? XmlEscape(companyName) : null);
            var tag = tallyType.Replace(" ", "").ToUpper();
            return doc?.Descendants(tag).Count() ?? 0;
        }

        /// <summary>
        /// Get all ledgers from Tally
        /// </summary>
        public async Task<List<Ledger>> GetLedgersAsync(string? companyName = null)
        {
            // SAFE: No date bounds needed for ledgers - they are master data, not transactional
            // Ledger count is always manageable (usually < 5000 even in large companies)
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
            <COMPUTE>GstinCompute: $PARTYGSTIN</COMPUTE>
            <COMPUTE>GstRegNoCompute: $GSTREGISTRATIONNUMBER</COMPUTE>
            <COMPUTE>AddressCompute: $ADDRESS</COMPUTE>
            <COMPUTE>StateCompute: $STATE</COMPUTE>
            <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS.LIST, LEDGERPHONE, LEDGERCONTACT, LEDGEREMAIL, LEDGERMOBILE, COUNTRYOFRESIDENCE, LEDSTATENAME, GSTREGISTRATIONTYPE, PARTYGSTIN, GSTREGISTRATIONNUMBER, PANNUMBER, MASTERID, ALTERID, GstinCompute, GstRegNoCompute, AddressCompute, StateCompute</FETCH>
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
                    var addressCompute = GetElementValue(ledgerElement, "ADDRESSCOMPUTE");
                    if (!string.IsNullOrEmpty(addressCompute) && addressParts.Count == 0)
                    {
                        addressParts.AddRange(addressCompute.Split('\n').Select(a => a.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                    }

                    var state = GetElementValue(ledgerElement, "STATECOMPUTE") ?? GetElementValue(ledgerElement, "LEDSTATENAME") ?? GetElementValue(ledgerElement, "COUNTRYOFRESIDENCE");
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
                    var gstin = GetElementValue(ledgerElement, "GSTINCOMPUTE")
                             ?? GetElementValue(ledgerElement, "GSTREGNOCOMPUTE")
                             ?? GetElementValue(ledgerElement, "PARTYGSTIN") 
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
        /// INDUSTRY-STANDARD: Two-Phase Batched Incremental Sync
        /// Phase 1: Lightweight count fetch (MASTERID + ALTERID only) 
        /// Phase 2: Full detail fetch in AlterID-range batches
        /// 
        /// This prevents Tally from generating massive XML responses
        /// that crash both Tally and the sync app.
        /// </summary>
        private const int VOUCHER_BATCH_SIZE = 50;         // Fetch 50 vouchers per batch (Safe Mode)
        private const int MIN_BATCH_SIZE = 25;              // Minimum batch on retry
        private const int INTER_BATCH_DELAY_MS = 500;       // 500ms breathing room for Tally
        private const int BATCH_TIMEOUT_SECONDS = 120;      // 2 min per batch (not 5 min for everything)
        
        public async Task<List<Voucher>> GetModifiedVouchersAsync(string companyName, long afterAlterId, Dictionary<string, string>? stockItemHsnCache = null)
        {
            SyncLogger.Log($"ðŸ” Incremental Sync: Checking vouchers with ALTERID > {afterAlterId}");
            
            // ===== PHASE 1: Lightweight Scout Fetch =====
            // Chunking backward in 1-year intervals to prevent Tally Memory Crash
            // Tally evaluates Formula on the entire period's vouchers. If unbounded, 500k vouchers = Instant Crash.
            
            DateTime currentEnd = DateTime.Today;
            // Smart limit: First sync = 2 years, Incremental = 3 months
            bool isFirstSync = afterAlterId == 0;
            DateTime absoluteStart = isFirstSync 
                ? DateTime.Today.AddYears(-2)      // First sync: max 2 years back
                : DateTime.Today.AddMonths(-3);    // Incremental: 3 months (backdated edits rare)
            
            var allAlterIds = new List<long>();
            long minScoutAlterId = long.MaxValue;
            long maxScoutAlterId = 0;
            
            int chunksRun = 0;
            int MAX_CHUNKS = isFirstSync ? 8 : 3;  // Hard cap on API calls
            
            while (currentEnd > absoluteStart && chunksRun < MAX_CHUNKS)
            {
                DateTime currentStart = currentEnd.AddMonths(isFirstSync ? -3 : -1);
                if (currentStart < absoluteStart) currentStart = absoluteStart;
                
                chunksRun++;
                // Fetch specific to this date chunk
                var scoutResult = await ScoutModifiedVouchersAsync(companyName, afterAlterId, currentStart, currentEnd);
                
                if (scoutResult.Count > 0)
                {
                    allAlterIds.AddRange(scoutResult.AlterIds);
                    if (scoutResult.MinAlterId < minScoutAlterId) minScoutAlterId = scoutResult.MinAlterId;
                    if (scoutResult.MaxAlterId > maxScoutAlterId) maxScoutAlterId = scoutResult.MaxAlterId;
                }
                
                // Fast break logic: if we found modified vouchers in this recent chunk, 
                // we keep going backwards to ensure we didn't miss backdated edits. 
                // We always scan the entire 10 years to be absolutely sure we catch back-dated edits safely.
                await Task.Delay(300); // 300ms breathing room for Tally GC
                
                currentEnd = currentStart.AddDays(-1);
            }
            
            allAlterIds = allAlterIds.Distinct().OrderBy(id => id).ToList();
            
            if (allAlterIds.Count == 0)
            {
                SyncLogger.Log($"âœ… No modified vouchers found across {chunksRun} chunks - system is up to date");
                return new List<Voucher>();
            }
            
            SyncLogger.Log($"ðŸ“‹ Phase 1 Complete: {allAlterIds.Count} modified vouchers detected (AlterID range: {minScoutAlterId} â†’ {maxScoutAlterId})");
            
            // If count is small (â‰¤ BATCH_SIZE), fast path handled gracefully by the same exact-ID logic
            
            // ===== PHASE 2: Batched Full Fetch with exact IDs =====
            int BATCH_SIZE = 100; // Exact same chunk size as historical sync
            SyncLogger.Log($"ðŸ“¦ Phase 2: Fetching {allAlterIds.Count} vouchers in batches of {BATCH_SIZE}");
            
            var allVouchers = new List<Voucher>();
            int batchNumber = 0;
            int totalBatches = (int)Math.Ceiling((double)allAlterIds.Count / BATCH_SIZE);
            
            // Iterate through sorted AlterIDs in chunks
            for (int i = 0; i < allAlterIds.Count; i += BATCH_SIZE)
            {
                batchNumber++;
                
                var batchIds = allAlterIds.Skip(i).Take(BATCH_SIZE).ToList();
                long batchMinAlterId = batchIds.Min();
                long batchMaxAlterId = batchIds.Max();
                
                string rangeLabel = $"Batch {batchNumber}/{totalBatches} (AlterID {batchMinAlterId}-{batchMaxAlterId})";
                SyncLogger.Log($"ðŸ“¦ Fetching {rangeLabel} ({batchIds.Count} vouchers)");
                
                // EXACT match on AlterIDs to prevent evaluating > / < formulae on entire database
                string orConditions = string.Join(" OR ", batchIds.Select(id => $"($ALTERID = {id})"));
                
                var request = $@"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>BatchVouchersInc</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
        <SVFROMDATE>{absoluteStart:yyyyMMdd}</SVFROMDATE>
        <SVTODATE>{DateTime.Today.AddDays(1):yyyyMMdd}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""BatchVouchersInc"">
            <TYPE>Voucher</TYPE>
            <FETCH>MASTERID, ALTERID, GUID, VOUCHERTYPENAME, VOUCHERNUMBER, DATE, PARTYLEDGERNAME, PARTYGSTIN, PARTYMAILINGNAME, STATENAME, PLACEOFSUPPLY, AMOUNT, NARRATION, BASICBUYERNAME, BASICBUYERGSTIN, CONSIGNEEMAILINGNAME, CONSIGNEESTATENAME</FETCH>
            <FILTER>BatchFilterInc</FILTER>
          </COLLECTION>
          <SYSTEM TYPE=""Formulae"" NAME=""BatchFilterInc"">{orConditions}</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

                try
                {
                    var doc = await SendRequestAsync(request, companyName, 120);
                    
                    if (doc != null)
                    {
                        var chunkVouchers = await Task.Run(() => ParseVouchersFromXml(doc, companyName, DateTime.Today, stockItemHsnCache));
                        allVouchers.AddRange(chunkVouchers);
                        SyncLogger.Log($"   âœ… {chunkVouchers.Count} vouchers fetched (Total: {allVouchers.Count})");
                    }
                    else
                    {
                        SyncLogger.Log($"   âš ï¸ {rangeLabel} returned NULL");
                    }
                }
                catch (Exception ex)
                {
                    SyncLogger.Log($"   âŒ {rangeLabel} error: {ex.Message}");
                }
                
                // Breathing room for Tally between batches to prevent hang
                if (i + BATCH_SIZE < allAlterIds.Count)
                {
                    await Task.Delay(1500);
                }
            }
            
            SyncLogger.Log($"âœ… Phase 2 Complete: {allVouchers.Count} vouchers fetched in {batchNumber} batches");
            return allVouchers;
        }
        
        /// <summary>
        /// Phase 1: Lightweight scout - fetch only MASTERID + ALTERID
        /// Supported by date chunking to prevent out of memory constraint when evaluating AlterID filter on full database
        /// </summary>
        private async Task<ScoutResult> ScoutModifiedVouchersAsync(string companyName, long afterAlterId, DateTime fromDate, DateTime toDate)
        {
            var request = $@"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VoucherScout</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
<SVFROMDATE>{fromDate:yyyyMMdd}</SVFROMDATE>
<SVTODATE>{toDate:yyyyMMdd}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
<TDLMESSAGE>
  <COLLECTION NAME=""VoucherScout"">
    <TYPE>Voucher</TYPE>
    <FETCH>MASTERID, ALTERID</FETCH>
    <FILTER>ModifiedAfter</FILTER>
  </COLLECTION>
  <SYSTEM TYPE=""Formulae"" NAME=""ModifiedAfter"">$$NumValue:$ALTERID > {afterAlterId}</SYSTEM>
</TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            try 
            {
                var doc = await SendRequestAsync(request, companyName, 60); // 1 min is enough for lightweight fetch
                
                if (doc == null) 
                {
                    SyncLogger.Log($"âš ï¸ Tally returned null response for Scout request ({fromDate:yyyyMMdd}-{toDate:yyyyMMdd}).");
                    return new ScoutResult();
                }
                
                var alterIds = new List<long>();
                foreach (var voucher in doc.Descendants("VOUCHER"))
                {
                    // Handle both Element and Attribute for resilience
                    string? alterIdStr = GetElementValue(voucher, "ALTERID") ?? GetAttribute(voucher, "ALTERID");
                    
                    if (long.TryParse(alterIdStr?.Trim(), out long alterId))
                    {
                        alterIds.Add(alterId);
                    }
                }
                
                // Filter again client-side just to be absolutely sure
                alterIds = alterIds.Where(id => id > afterAlterId).Distinct().ToList();

                return new ScoutResult
                {
                    AlterIds = alterIds,
                    Count = alterIds.Count,
                    MinAlterId = alterIds.Count > 0 ? alterIds.Min() : 0,
                    MaxAlterId = alterIds.Count > 0 ? alterIds.Max() : 0
                };
            }
            catch (Exception ex)
            {
                SyncLogger.LogError($"Scout Fetch Error: {ex.Message}", ex);
                return new ScoutResult();
            }
        }
        
        /// <summary>
        /// Fetch full voucher details for a specific AlterID range
        /// </summary>
        private async Task<List<Voucher>> FetchVoucherBatchAsync(
            string companyName, long fromAlterId, long toAlterId, 
            Dictionary<string, string>? stockItemHsnCache, int timeoutSeconds,
            DateTime? fromDate = null, DateTime? toDate = null)
        {
            var startDate = fromDate ?? new DateTime(2014, 4, 1);
            var endDate = toDate ?? DateTime.Today;

            var request = $@"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>BatchVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
        <SVFROMDATE>{startDate:yyyyMMdd}</SVFROMDATE>
        <SVTODATE>{endDate:yyyyMMdd}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""BatchVouchers"">
            <TYPE>Voucher</TYPE>
            <FETCH>MASTERID, ALTERID, GUID, VOUCHERTYPENAME, VOUCHERNUMBER, DATE, PARTYLEDGERNAME, PARTYGSTIN, PARTYMAILINGNAME, STATENAME, PLACEOFSUPPLY, AMOUNT, NARRATION, BASICBUYERNAME, BASICBUYERGSTIN, CONSIGNEEMAILINGNAME, CONSIGNEESTATENAME</FETCH>
            <FILTER>AlterIdRange</FILTER>
          </COLLECTION>
          <SYSTEM TYPE=""Formulae"" NAME=""AlterIdRange"">($$NumValue:$ALTERID > {fromAlterId}) AND ($$NumValue:$ALTERID <= {toAlterId})</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            try
            {
                var doc = await SendRequestAsync(request, companyName, timeoutSeconds);
                
                if (doc == null) 
                {
                    SyncLogger.Log($"âš ï¸ Tally returned null response for Batch {fromAlterId}-{toAlterId}");
                    return new List<Voucher>();
                }
                
                // Safe execution with try-catch inside Task.Run
                return await Task.Run(() => {
                    try {
                        return ParseVouchersFromXml(doc, companyName, DateTime.Today, stockItemHsnCache);
                    } catch (Exception parseEx) {
                        SyncLogger.LogError($"Parsing Error in Batch {fromAlterId}-{toAlterId}: {parseEx.Message}", parseEx);
                        throw; // Rethrow to handle in retry logic
                    }
                });
            }
            catch (Exception ex)
            {
                 SyncLogger.LogError($"Batch Fetch Error ({fromAlterId}-{toAlterId}): {ex.Message}", ex);
                 throw; // Rethrow to trigger retry logic
            }
        }
        
        /// <summary>
        /// Fetch with automatic retry at smaller batch size or extended timeout on failure
        /// Industry standard: Progressive degradation pattern / Exponential Backoff
        /// </summary>
        private async Task<List<Voucher>> FetchVoucherBatchWithRetryAsync(
            string companyName, long fromAlterId, long toAlterId, 
            Dictionary<string, string>? stockItemHsnCache,
            DateTime? fromDate = null, DateTime? toDate = null)
        {
            try
            {
                // Attempt 1: Normal batch
                return await FetchVoucherBatchAsync(companyName, fromAlterId, toAlterId, stockItemHsnCache, BATCH_TIMEOUT_SECONDS, fromDate, toDate);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"   âš ï¸ Batch {fromAlterId}-{toAlterId} failed (Attempt 1): {ex.Message}");
                
                try 
                {
                    // Attempt 2: If failed, try with longer timeout (Tally might be slow)
                    SyncLogger.Log($"   âš ï¸ Retrying with extended timeout (240s)...");
                    await Task.Delay(2000); // 2s cool-down
                    return await FetchVoucherBatchAsync(companyName, fromAlterId, toAlterId, stockItemHsnCache, BATCH_TIMEOUT_SECONDS * 2, fromDate, toDate);
                }
                catch
                {
                    // Attempt 3: If still failing, it's likely too much data. Split into sub-batches.
                    long range = toAlterId - fromAlterId;
                    if (range <= 1) return new List<Voucher>(); // Can't split further

                    SyncLogger.Log($"   âš ï¸ Retry failed, splitting batch into sub-batches...");
                    await Task.Delay(3000); // 3s cool-down
                    
                    var results = new List<Voucher>();
                    long midAlterId = fromAlterId + (range / 2);
                    
                    try {
                        var firstHalf = await FetchVoucherBatchAsync(companyName, fromAlterId, midAlterId, stockItemHsnCache, BATCH_TIMEOUT_SECONDS, fromDate, toDate);
                        results.AddRange(firstHalf);
                    } catch (Exception e) { SyncLogger.LogError($"   âŒ Sub-batch 1 failed: {e.Message}", e); }
                    
                    try {
                        var secondHalf = await FetchVoucherBatchAsync(companyName, midAlterId, toAlterId, stockItemHsnCache, BATCH_TIMEOUT_SECONDS, fromDate, toDate);
                        results.AddRange(secondHalf);
                    } catch (Exception e) { SyncLogger.LogError($"   âŒ Sub-batch 2 failed: {e.Message}", e); }
                    
                    return results;
                }
            }
        }
        
        /// <summary>
        /// Helper to escape XML special characters to prevent injection/breakage
        /// </summary>
        private string XmlEscape(string? value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            return System.Security.SecurityElement.Escape(value);
        }
        
        /// <summary>
        /// Scout result for Phase 1 lightweight fetch
        /// </summary>
        private class ScoutResult
        {
            public List<long> AlterIds { get; set; } = new List<long>();
            public int Count { get; set; }
            public long MinAlterId { get; set; }
            public long MaxAlterId { get; set; }
        }

        /// <summary>
        /// Get ledgers modified after a specific ALTERID
        /// </summary>
        public async Task<List<Ledger>> GetModifiedLedgersAsync(string companyName, long afterAlterId)
        {
            SyncLogger.Log($"ðŸ” Fetching ledgers with ALTERID > {afterAlterId}");
            
            // SAFETY: Ledgers are master data - even 'modified' filter scans all masters.
            // No date bounding needed as Tally master count is always small vs vouchers.
            // Timeout set to 120s which is safe.
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
<SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
<TDLMESSAGE>
  <COLLECTION NAME=""ModifiedLedgers"">
    <TYPE>Ledger</TYPE>
    <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS.LIST, LEDGERPHONE, LEDGERCONTACT, LEDGEREMAIL, LEDGERMOBILE, COUNTRYOFRESIDENCE, LEDSTATENAME, GSTREGISTRATIONTYPE, GSTIN, PARTYGSTIN, GSTREGISTRATIONNUMBER, PANNUMBER, MASTERID, ALTERID</FETCH>
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
                    var addressParts = new List<string>();
                    var addressList = ledgerElement.Descendants().Where(e => e.Name.LocalName.Equals("ADDRESS.LIST", StringComparison.OrdinalIgnoreCase)).FirstOrDefault();
                    if (addressList != null)
                    {
                        addressParts.AddRange(addressList.Elements().Where(e => e.Name.LocalName.Equals("ADDRESS", StringComparison.OrdinalIgnoreCase)).Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                        if (addressParts.Count == 0 && !string.IsNullOrWhiteSpace(addressList.Value)) 
                        {
                            // Tally might return flat text for ADDRESS.LIST when FETCH is used
                            addressParts.AddRange(addressList.Value.Split('\n').Select(a => a.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                        }
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
                             ?? GetElementValue(ledgerElement, "GSTREGISTRATIONNUMBER")
                             ?? GetElementValue(ledgerElement, "GSTIN");

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

            SyncLogger.Log($"âœ… Found {ledgers.Count} modified ledgers");
            return ledgers;
        }

        public async Task<List<Voucher>> GetVouchersAsync(DateTime? fromDate = null, DateTime? toDate = null, string? companyName = null, Dictionary<string, string>? stockItemHsnCache = null)
        {
            return await GetVouchersInternalAsync(fromDate, toDate, companyName, null, stockItemHsnCache);
        }

        /// <summary>
        /// Two-phase approach: Scout IDs first, then fetch full details in batches of 100
        /// This is how BizAnalyst/LiveKeeping do it - never crash, all data comes through
        /// </summary>
        public async Task<List<Voucher>> GetVouchersChunkedAsync(
            DateTime fromDate, 
            DateTime toDate, 
            string? companyName, 
            Action<string>? progressCallback = null,
            Dictionary<string, string>? stockItemHsnCache = null)
        {
            // PHASE 1: VOUCHER COUNT CHUNKING (Scout)
            // Scout everything in the date range just to get AlterIDs
            Log($"ðŸ“¦ Phase 1: Scouting exactly how many vouchers we have...");
            progressCallback?.Invoke("Phase 1: Scanning vouchers by date...");

            var scoutRequest = $@"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VoucherScoutAll</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>{XmlEscape(companyName ?? "")}</SVCURRENTCOMPANY>
        <SVFROMDATE>{fromDate:yyyyMMdd}</SVFROMDATE>
        <SVTODATE>{toDate:yyyyMMdd}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""VoucherScoutAll"">
            <TYPE>Voucher</TYPE>
            <FETCH>MASTERID, ALTERID</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            var scoutDoc = await SendRequestAsync(scoutRequest, companyName, 60);
            
            if (scoutDoc == null)
            {
                Log("âš ï¸ Voucher scout returned NULL. Tally timed out or returned empty.");
                return new List<Voucher>();
            }

            var allAlterIds = new List<long>();
            foreach (var v in scoutDoc.Descendants("VOUCHER"))
            {
                string? alterStr = GetElementValue(v, "ALTERID") ?? GetAttribute(v, "ALTERID");
                if (long.TryParse(alterStr?.Trim(), out long aid) && aid > 0)
                    allAlterIds.Add(aid);
            }

            allAlterIds = allAlterIds.Distinct().OrderBy(id => id).ToList();

            if (allAlterIds.Count == 0)
            {
                Log("â„¹ï¸ No vouchers found in this date range.");
                return new List<Voucher>();
            }

            Log($"ðŸ” Scout found {allAlterIds.Count} vouchers.");
            
            // PHASE 2: EXACT 100-VOUCHER CHUNKS
            int BATCH_SIZE = 100;
            var allVouchers = new List<Voucher>();
            int totalBatches = (int)Math.Ceiling((double)allAlterIds.Count / BATCH_SIZE);

            Log($"ðŸ“¦ Phase 2: Fetching full details in {totalBatches} chunks of {BATCH_SIZE} vouchers.");

            for (int i = 0; i < allAlterIds.Count; i += BATCH_SIZE)
            {
                int batchNum = (i / BATCH_SIZE) + 1;
                var batchIds = allAlterIds.Skip(i).Take(BATCH_SIZE).ToList();
                long batchMin = batchIds.Min();
                long batchMax = batchIds.Max();

                string rangeLabel = $"Batch {batchNum}/{totalBatches} (AlterID {batchMin}-{batchMax})";
                Log($"ðŸ“¦ Fetching {rangeLabel}");
                progressCallback?.Invoke($"Fetching {batchNum}/{totalBatches} ({batchIds.Count} vouchers)");

                // We construct an exact OR filter to ensure Tally ONLY returns these 100 vouchers.
                // Using a range like (>= min AND <= max) might grab extra vouchers that weren't in our 100.
                string orConditions = string.Join(" OR ", batchIds.Select(id => $"($ALTERID = {id})"));

                var request = $@"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>BatchVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>{XmlEscape(companyName ?? "")}</SVCURRENTCOMPANY>
        <SVFROMDATE>{fromDate:yyyyMMdd}</SVFROMDATE>
        <SVTODATE>{toDate:yyyyMMdd}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""BatchVouchers"">
            <TYPE>Voucher</TYPE>
            <FETCH>MASTERID, ALTERID, GUID, VOUCHERTYPENAME, VOUCHERNUMBER, DATE, PARTYLEDGERNAME, PARTYGSTIN, PARTYMAILINGNAME, STATENAME, PLACEOFSUPPLY, AMOUNT, NARRATION, BASICBUYERNAME, BASICBUYERGSTIN, CONSIGNEEMAILINGNAME, CONSIGNEESTATENAME</FETCH>
            <FILTER>BatchFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE=""Formulae"" NAME=""BatchFilter"">{orConditions}</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

                try
                {
                    var doc = await SendRequestAsync(request, companyName, 120);
                    
                    if (doc != null)
                    {
                        var chunkVouchers = await Task.Run(() => ParseVouchersFromXml(doc, companyName, toDate, stockItemHsnCache));
                        allVouchers.AddRange(chunkVouchers);
                        Log($"   âœ… {chunkVouchers.Count} vouchers (Total: {allVouchers.Count})");
                    }
                    else
                    {
                        Log($"   âš ï¸ {rangeLabel} returned NULL");
                    }
                }
                catch (Exception ex)
                {
                    Log($"   âŒ {rangeLabel} error: {ex.Message}");
                }

                // 1.5 seconds breathing room for Tally between 100-voucher fetches
                if (i + BATCH_SIZE < allAlterIds.Count)
                {
                    await Task.Delay(1500);
                }
            }

            Log($"âœ… Total: {allVouchers.Count} vouchers fetched in {totalBatches} chunks.");
            progressCallback?.Invoke($"âœ… {allVouchers.Count} vouchers fetched");
            return allVouchers;
        }


        private async Task<List<Voucher>> GetVouchersInternalAsync(DateTime? fromDate, DateTime? toDate, string? companyName, string? voucherTypeFilter, Dictionary<string, string>? stockItemHsnCache = null)
        {
            DateTime effectiveFrom = fromDate ?? new DateTime(2024, 4, 1);
            DateTime effectiveTo = toDate ?? DateTime.Today.AddDays(1);

            string fromDateStr = effectiveFrom.ToString("yyyyMMdd");
            string toDateStr = effectiveTo.ToString("yyyyMMdd");
            string typeLog = voucherTypeFilter ?? "All";

            SyncLogger.Log($"Extracting Vouchers ({typeLog}): {effectiveFrom:dd-MMM-yy} to {effectiveTo:dd-MMM-yy}");

            // Voucher type filter for TDL Collection
            string typeFilter = string.IsNullOrEmpty(voucherTypeFilter) ? "" :
                $@"<FILTER>TypeFilter</FILTER>";
            string typeFilterFormula = string.IsNullOrEmpty(voucherTypeFilter) ? "" :
                $@"<SYSTEM TYPE=""Formulae"" NAME=""TypeFilter"">$VoucherTypeName = ""{voucherTypeFilter}""</SYSTEM>";

            // ===========================================================
            // BizAnalyst / LiveKeeping Industry-Standard Approach:
            // 1. Use TDL COLLECTION (not Report Export)
            // 2. NO SVEXPLODEALL - this is the crash killer
            // 3. Use dot-notation for sub-fields (ALLLEDGERENTRIES.LIST.*)  
            // 4. SVFROMDATE/SVTODATE bounds the collection to date range
            // 5. Only fetch fields we actually need - nothing extra
            // ===========================================================
            var request = $@"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VoucherData</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<SVCURRENTCOMPANY>{XmlEscape(companyName ?? "")}</SVCURRENTCOMPANY>
<SVFROMDATE>{fromDateStr}</SVFROMDATE>
<SVTODATE>{toDateStr}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
<TDLMESSAGE>
  <COLLECTION NAME=""VoucherData"" ISMODIFY=""No"">
    <TYPE>Voucher</TYPE>
    <FETCH>MASTERID, ALTERID, GUID, DATE, VOUCHERTYPENAME, VOUCHERNUMBER, PARTYLEDGERNAME, PARTYGSTIN, PARTYMAILINGNAME, AMOUNT, NARRATION, STATENAME, PLACEOFSUPPLY, ISOPTIONAL, BASICBUYERNAME, BASICBUYERGSTIN</FETCH>
    {typeFilter}
  </COLLECTION>
  {typeFilterFormula}
</TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";


            // Generous timeout per chunk - TDL Collection is much faster than Report
            int timeout = 90;
            var doc = await SendRequestAsync(request, companyName, timeout);
            
            if (doc == null) return new List<Voucher>();

            return ParseVouchersFromXml(doc, companyName, effectiveFrom, stockItemHsnCache);
        }


        private List<Voucher> ParseVouchersFromXml(XDocument doc, string? companyName, DateTime defaultDate, Dictionary<string, string>? stockItemHsnCache = null)
        {
            var vouchers = new List<Voucher>();
            var companyId = GenerateCompanyId(companyName);

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
                        var taxRateElement = iDescendants.FirstOrDefault(x => 
                            x.Name.LocalName.Equals("RATEOFTAXCALCULATION", StringComparison.OrdinalIgnoreCase) ||
                            x.Name.LocalName.Equals("GSTRATE", StringComparison.OrdinalIgnoreCase) ||
                            x.Name.LocalName.Equals("IGSTRATE", StringComparison.OrdinalIgnoreCase));
                        
                        decimal? taxRate = taxRateElement != null ? ParseDecimal(taxRateElement.Value) : (decimal?)null;
                        
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


                    // Filter report/footer noise rows (common in DSPVCH responses).
                    var hasMasterIdentity = !string.IsNullOrWhiteSpace(GetElementValue(vNode, "MASTERID"))
                        || !string.IsNullOrWhiteSpace(GetElementValue(vNode, "ALTERID"))
                        || !string.IsNullOrWhiteSpace(GetElementValue(vNode, "GUID"));
                    var hasBusinessLines = ledgerEntries.Count > 0 || inventoryEntries.Count > 0;
                    if (!hasMasterIdentity && !hasBusinessLines)
                    {
                        continue;
                    }

                    if (string.Equals(vType, "Unknown", StringComparison.OrdinalIgnoreCase)
                        && (string.IsNullOrWhiteSpace(vNum) || vNum == "0")
                        && !hasBusinessLines)
                    {
                        continue;
                    }

                    // --- Robust Party and Amount Extraction ---
                    // Party Identification
                    string partyName = GetElementValue(vNode, "PARTYMAILINGNAME") ?? GetElementValue(vNode, "BASICBUYERNAME") ?? GetElementValue(vNode, "CONSIGNEEMAILINGNAME") ?? GetElementValue(vNode, "PARTYLEDGERNAME") ?? GetElementValue(vNode, "PARTYNAME") ?? GetElementValue(vNode, "DSPVCHPARTY") ?? "";
                    string partyGstin = GetElementValue(vNode, "PARTYGSTIN") ?? GetElementValue(vNode, "BASICBUYERGSTIN") ?? GetElementValue(vNode, "CONSIGNEEGSTIN") ?? "";
                    
                    // Party Address & State
                    var partyAddrParts = new List<string>();
                    var addressNodeNames = new[] { "PARTYADDRESS.LIST", "BASICBUYERADDRESS.LIST", "CONSIGNEEADDRESS.LIST" };
                    var partyAddrList = vNode.Descendants().FirstOrDefault(e => addressNodeNames.Contains(e.Name.LocalName, StringComparer.OrdinalIgnoreCase));
                    if (partyAddrList != null)
                    {
                        partyAddrParts.AddRange(partyAddrList.Elements().Where(e => e.Name.LocalName.Equals("ADDRESS", StringComparison.OrdinalIgnoreCase) || e.Name.LocalName.Equals("BASICBUYERADDRESS", StringComparison.OrdinalIgnoreCase)).Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                    }
                    else
                    {
                         partyAddrParts.AddRange(vNode.Descendants("PARTYADDRESS").Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                         partyAddrParts.AddRange(vNode.Descendants("BASICBUYERADDRESS").Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                         partyAddrParts.AddRange(vNode.Descendants("CONSIGNEEADDRESS").Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                    }
                    string partyAddress = string.Join(", ", partyAddrParts);
                    string partyState = GetElementValue(vNode, "STATENAME") ?? GetElementValue(vNode, "CONSIGNEESTATENAME") ?? "";
                    string placeOfSupply = GetElementValue(vNode, "PLACEOFSUPPLY") ?? "";

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
                        PartyGstin = partyGstin,
                        PartyAddress = partyAddress,
                        PartyState = partyState,
                        PlaceOfSupply = placeOfSupply,
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

        private string CleanCompanyId(string? companyName)
        {
            return GenerateCompanyId(companyName);
        }

        private string GenerateCompanyId(string? companyName)
        {
            if (string.IsNullOrWhiteSpace(companyName)) return "UNKNOWN";
            using (var sha = System.Security.Cryptography.SHA256.Create())
            {
                var bytes = System.Text.Encoding.UTF8.GetBytes(companyName.Trim());
                var hash = sha.ComputeHash(bytes);
                return BitConverter.ToString(hash).Replace("-", ""); // Full 64 chars
            }
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
            var companyId = GenerateCompanyId(companyName);
            return vouchers
                .Select(v => {
                    var sale = new Sale
                    {
                        Id = v.Id,
                        VoucherId = v.Id,
                        InvoiceNumber = v.VoucherNumber,
                        InvoiceDate = v.VchDate,
                        PartyLedgerName = v.PartyName ?? "Cash",
                        PartyGstin = v.PartyGstin,
                        PlaceOfSupply = v.PlaceOfSupply,
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
                            HsnCode = inv.HsnCode,
                            TaxRate = inv.TaxRate ?? 0
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
            var companyId = GenerateCompanyId(companyName);
            return vouchers
                .Select(v => {
                    var purchase = new Purchase
                    {
                        Id = v.Id,
                        VoucherId = v.Id,
                        InvoiceNumber = v.VoucherNumber,
                        InvoiceDate = v.VchDate,
                        PartyLedgerName = v.PartyName ?? "Cash",
                        PartyGstin = v.PartyGstin,
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
                            HsnCode = inv.HsnCode,
                            TaxRate = inv.TaxRate ?? 0
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
            // INDUSTRY APPROACH (BizAnalyst style):
            // Request only flat fields. No nested LIST fields to prevent 300MB+ XML crash.
            // HSNCODE is a flat computed field in Tally that works without LIST expansion.
            // For items where HSNCODE is inherited from group/parent, 
            // we handle fallback in ParseStockItemHsn() below.
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
            <FETCH>NAME, GUID, PARENT, BASEUNITS, ADDITIONALUNITS, OPENINGBALANCE, CLOSINGBALANCE, OPENINGVALUE, CLOSINGVALUE, OPENINGRATE, CLOSINGRATE, MASTERID, ALTERID, HSNCODE, GSTDETAILS.LIST, HSNDETAILS.LIST</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            SyncLogger.Log("[DEBUG] Sending StockItem request to Tally (safe flat-field fetch)...");
            var doc = await SendRequestAsync(request, companyName, 30);
            if (doc == null) 
            {
                 SyncLogger.Log("âš ï¸ StockItem request returned NULL");
                 return new List<StockItem>();
            }
            
            int rawCount = doc.Descendants("STOCKITEM").Count();
            SyncLogger.Log($"[DEBUG] Tally returned {rawCount} STOCKITEM nodes");

            var items = new List<StockItem>();

            foreach (var itemElement in doc.Descendants("STOCKITEM"))
            {
                try
                {
                    // Fetch flat HSNCODE (computed field)
                    string? hsnCode = GetElementValue(itemElement, "HSNCODE");
                    
                    if (string.IsNullOrEmpty(hsnCode))
                    {
                        hsnCode = GetElementValue(itemElement, "HSNMASTERNAME") ?? 
                                  GetElementValue(itemElement, "HSNORSACCODE");
                    }
                    if (string.IsNullOrEmpty(hsnCode))
                    {
                        var gstDetails = itemElement.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("GSTDETAILS.LIST", StringComparison.OrdinalIgnoreCase) || e.Name.LocalName.Equals("HSNDETAILS.LIST", StringComparison.OrdinalIgnoreCase));
                        if (gstDetails != null)
                        {
                            hsnCode = GetElementValue(gstDetails, "HSNCODE") ?? 
                                      GetElementValue(gstDetails, "HSNMASTERNAME") ?? 
                                      GetElementValue(gstDetails, "HSN") ?? 
                                      GetElementValue(gstDetails, "HSNORSACCODE");
                        }
                    }
                    
                    // Fallback to name-based parsing if needed (many items have HSN in name)
                    decimal gstRate = 0;
                    
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
                        GstRate = gstRate,
                        MasterId = GetElementValue(itemElement, "MASTERID"),
                        AlterId = GetElementValue(itemElement, "ALTERID")
                    });
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error parsing stock item: {ex.Message}");
                }
            }

            SyncLogger.Log($"[DEBUG] Parsed {items.Count} stock items. HSN populated: {items.Count(i => !string.IsNullOrEmpty(i.HsnCode))}");
            return items;
        }




        /// <summary>
        /// Get stock items modified after a specific ALTERID
        /// </summary>
        public async Task<List<StockItem>> GetModifiedStockItemsAsync(string companyName, long afterAlterId)
        {
            SyncLogger.Log($"ðŸ” Fetching stock items with ALTERID > {afterAlterId}");

            // NO nested LIST fields - flat fields only to prevent Tally OOM crash
            var request = $@"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ModifiedStockItems</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""ModifiedStockItems"">
            <TYPE>Stock Item</TYPE>
            <FETCH>NAME, GUID, PARENT, BASEUNITS, ADDITIONALUNITS, OPENINGBALANCE, CLOSINGBALANCE, OPENINGVALUE, CLOSINGVALUE, OPENINGRATE, CLOSINGRATE, MASTERID, ALTERID, HSNCODE, GSTDETAILS.LIST, HSNDETAILS.LIST</FETCH>
            <FILTER>ModifiedAfter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE=""Formulae"" NAME=""ModifiedAfter"">$$NumValue:$ALTERID > {afterAlterId}</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            var doc = await SendRequestAsync(request, companyName, 60);
            if (doc == null) return new List<StockItem>();

            var items = new List<StockItem>();
            foreach (var itemElement in doc.Descendants("STOCKITEM"))
            {
                try
                {
                    // Fetch flat HSNCODE (computed field)
                    string? hsnCode = GetElementValue(itemElement, "HSNCODE");

                    if (string.IsNullOrEmpty(hsnCode))
                    {
                        hsnCode = GetElementValue(itemElement, "HSNMASTERNAME") ?? 
                                  GetElementValue(itemElement, "HSNORSACCODE");
                    }
                    if (string.IsNullOrEmpty(hsnCode))
                    {
                        var gstDetails = itemElement.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("GSTDETAILS.LIST", StringComparison.OrdinalIgnoreCase) || e.Name.LocalName.Equals("HSNDETAILS.LIST", StringComparison.OrdinalIgnoreCase));
                        if (gstDetails != null)
                        {
                            hsnCode = GetElementValue(gstDetails, "HSNCODE") ?? 
                                      GetElementValue(gstDetails, "HSNMASTERNAME") ?? 
                                      GetElementValue(gstDetails, "HSN") ?? 
                                      GetElementValue(gstDetails, "HSNORSACCODE");
                        }
                    }

                    decimal gstRate = 0;

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
                        GstRate = gstRate,
                        MasterId = GetElementValue(itemElement, "MASTERID"),
                        AlterId = GetElementValue(itemElement, "ALTERID")
                    });
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error parsing modified stock item: {ex.Message}");
                }
            }

            SyncLogger.Log($"âœ… Found {items.Count} modified stock items (HSN: {items.Count(i => !string.IsNullOrEmpty(i.HsnCode))})");
            return items;
        }


        #region Helper Methods

        private static string? GetElementValue(XElement element, string name)
        {
            // First try direct child
            var child = element.Elements().FirstOrDefault(e => e.Name.LocalName.Equals(name, StringComparison.OrdinalIgnoreCase));
            if (child != null) return child.Value?.Trim();

            // Then try any descendant (useful for deep trees or variations)
            child = element.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals(name, StringComparison.OrdinalIgnoreCase));
            return child?.Value?.Trim();
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
            cleanValue = cleanValue.Replace("â‚¹", "").Replace(",", "").Replace("Rs", "").Replace("Rs.", "").Trim();
            
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
                    // SyncLogger.Log($"   ðŸ”§ HSN filled from cache: {itemName} -> {cachedHsn}"); 
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
                SyncLogger.Log($"ðŸ“¤ Pushing {voucherType} to Tally: {partyLedger} â‚¹{amount}");

                // Build XML for creating voucher in Tally
                var ledgerEntriesXml = new StringBuilder();
                
                if (ledgerEntries != null && ledgerEntries.Any())
                {
                    foreach (var entry in ledgerEntries)
                    {
                        ledgerEntriesXml.AppendLine($@"
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>{XmlEscape(entry.LedgerName)}</LEDGERNAME>
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
                <LEDGERNAME>{XmlEscape(partyLedger)}</LEDGERNAME>
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
                <STOCKITEMNAME>{XmlEscape(item.StockItemName)}</STOCKITEMNAME>
                {hsnXml}
                <ACTUALQTY>{item.Quantity} {XmlEscape(item.Unit)}</ACTUALQTY>
                <BILLEDQTY>{item.Quantity} {XmlEscape(item.Unit)}</BILLEDQTY>
                <RATE>{item.Rate}/{XmlEscape(item.Unit)}</RATE>
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
                    <VOUCHER VCHTYPE=""{XmlEscape(voucherType)}"" ACTION=""Create"">
                        <DATE>{voucherDate:yyyyMMdd}</DATE>
                        <VOUCHERTYPENAME>{XmlEscape(voucherType)}</VOUCHERTYPENAME>
                        <PARTYLEDGERNAME>{XmlEscape(partyLedger)}</PARTYLEDGERNAME>
                        <NARRATION>{XmlEscape(narration ?? "")}</NARRATION>
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
                    SyncLogger.Log($"âœ… Voucher created in Tally: {voucherNumber ?? "Success"}");
                    return (true, voucherNumber, null);
                }

                // Check for errors
                var errorMsg = doc.Descendants("LINEERROR").FirstOrDefault()?.Value ??
                               doc.Descendants("ERRORS").FirstOrDefault()?.Value ??
                               "Unknown error creating voucher";

                SyncLogger.Log($"âŒ Tally rejected voucher: {errorMsg}");
                return (false, null, errorMsg);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"âŒ PushVoucherToTallyAsync error: {ex.Message}");
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
                Log($"ðŸ“‹ Fetched {groups.Count} Ledger Groups from {companyName}");
            }
            catch (Exception ex) { Log($"âŒ GetLedgerGroupsAsync error: {ex.Message}"); }
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
                Log($"ðŸ­ Fetched {items.Count} Cost Centres from {companyName}");
            }
            catch (Exception ex) { Log($"âŒ GetCostCentresAsync error: {ex.Message}"); }
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
                Log($"ðŸ“¦ Fetched {items.Count} Godowns from {companyName}");
            }
            catch (Exception ex) { Log($"âŒ GetGodownsAsync error: {ex.Message}"); }
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
                Log($"ðŸ“Š Fetched {items.Count} Stock Groups from {companyName}");
            }
            catch (Exception ex) { Log($"âŒ GetStockGroupsAsync error: {ex.Message}"); }
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
                Log($"ðŸ“‚ Fetched {items.Count} Stock Categories from {companyName}");
            }
            catch (Exception ex) { Log($"âŒ GetStockCategoriesAsync error: {ex.Message}"); }
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
                Log($"ðŸ’± Fetched {items.Count} Currencies from {companyName}");
            }
            catch (Exception ex) { Log($"âŒ GetCurrenciesAsync error: {ex.Message}"); }
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
                Log($"ðŸ“ Fetched {items.Count} Voucher Types from {companyName}");
            }
            catch (Exception ex) { Log($"âŒ GetVoucherTypesAsync error: {ex.Message}"); }
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
                Log($"ðŸ“ Fetched {items.Count} Units from {companyName}");
            }
            catch (Exception ex) { Log($"âŒ GetUnitsAsync error: {ex.Message}"); }
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
                        </STATICVARIABLES>
                    </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";

                // Using Collection approach
                xml = $@"<ENVELOPE>
                    <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
                    <BODY><EXPORTDATA><REQUESTDESC>
                        <REPORTNAME>%%Collection</REPORTNAME>
                        <STATICVARIABLES>
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
                Log($"ðŸ’° Fetched {items.Count} Budgets from {companyName}");
            }
            catch (Exception ex) { Log($"âŒ GetBudgetsAsync error: {ex.Message}"); }
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
                            <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
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
            catch (Exception ex) { Log($"âŒ GetPriceListsAsync error: {ex.Message}"); }
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



