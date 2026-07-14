using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Globalization;
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
        private const string VoucherCollectionFetchFields = "MASTERID, ALTERID, GUID, DATE, VOUCHERTYPENAME, VOUCHERNUMBER, PARTYLEDGERNAME, PARTYGSTIN, PARTYMAILINGNAME, AMOUNT, NARRATION, STATENAME, PLACEOFSUPPLY, ISOPTIONAL, ISINVOICE, PERSISTEDVIEW, OBJVIEW, BASICBUYERNAME, BASICBUYERGSTIN, CONSIGNEEMAILINGNAME, CONSIGNEESTATENAME, ALLLEDGERENTRIES.LIST, ALLLEDGERENTRIES.LIST.LEDGERNAME, ALLLEDGERENTRIES.LIST.AMOUNT, LEDGERENTRIES.LIST, LEDGERENTRIES.LIST.LEDGERNAME, LEDGERENTRIES.LIST.AMOUNT, ALLINVENTORYENTRIES.LIST, ALLINVENTORYENTRIES.LIST.STOCKITEMNAME, ALLINVENTORYENTRIES.LIST.DSPVCHITEMNAME, ALLINVENTORYENTRIES.LIST.ITEMNAME, ALLINVENTORYENTRIES.LIST.BILLEDQTY, ALLINVENTORYENTRIES.LIST.ACTUALQTY, ALLINVENTORYENTRIES.LIST.DSPVCHQTY, ALLINVENTORYENTRIES.LIST.QTY, ALLINVENTORYENTRIES.LIST.RATE, ALLINVENTORYENTRIES.LIST.DSPVCHRATE, ALLINVENTORYENTRIES.LIST.AMOUNT, ALLINVENTORYENTRIES.LIST.DSPVCHITEMAMOUNT, ALLINVENTORYENTRIES.LIST.DISCOUNT, ALLINVENTORYENTRIES.LIST.DSPVCHDISCOUNT, ALLINVENTORYENTRIES.LIST.HSNCODE, ALLINVENTORYENTRIES.LIST.RATEOFTAXCALCULATION, ALLINVENTORYENTRIES.LIST.GSTRATE, ALLINVENTORYENTRIES.LIST.IGSTRATE, ALLINVENTORYENTRIES.LIST.TAXABILITY, INVENTORYENTRIES.LIST, INVENTORYENTRIES.LIST.STOCKITEMNAME, INVENTORYENTRIES.LIST.DSPVCHITEMNAME, INVENTORYENTRIES.LIST.ITEMNAME, INVENTORYENTRIES.LIST.BILLEDQTY, INVENTORYENTRIES.LIST.ACTUALQTY, INVENTORYENTRIES.LIST.DSPVCHQTY, INVENTORYENTRIES.LIST.QTY, INVENTORYENTRIES.LIST.RATE, INVENTORYENTRIES.LIST.DSPVCHRATE, INVENTORYENTRIES.LIST.AMOUNT, INVENTORYENTRIES.LIST.DSPVCHITEMAMOUNT, INVENTORYENTRIES.LIST.DISCOUNT, INVENTORYENTRIES.LIST.DSPVCHDISCOUNT, INVENTORYENTRIES.LIST.HSNCODE, INVENTORYENTRIES.LIST.RATEOFTAXCALCULATION, INVENTORYENTRIES.LIST.GSTRATE, INVENTORYENTRIES.LIST.IGSTRATE, INVENTORYENTRIES.LIST.TAXABILITY, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.STOCKITEMNAME, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DSPVCHITEMNAME, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.ITEMNAME, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.BILLEDQTY, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.ACTUALQTY, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DSPVCHQTY, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.QTY, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.RATE, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DSPVCHRATE, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.AMOUNT, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DSPVCHITEMAMOUNT, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DISCOUNT, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DSPVCHDISCOUNT, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.HSNCODE, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.RATEOFTAXCALCULATION, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.GSTRATE, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.IGSTRATE, ALLLEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.TAXABILITY, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.STOCKITEMNAME, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DSPVCHITEMNAME, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.ITEMNAME, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.BILLEDQTY, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.ACTUALQTY, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DSPVCHQTY, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.QTY, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.RATE, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DSPVCHRATE, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.AMOUNT, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DSPVCHITEMAMOUNT, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DISCOUNT, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.DSPVCHDISCOUNT, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.HSNCODE, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.RATEOFTAXCALCULATION, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.GSTRATE, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.IGSTRATE, LEDGERENTRIES.LIST.INVENTORYALLOCATIONS.LIST.TAXABILITY";

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
                        SyncLogger.Log($"Ã°Å¸â€ºÂ¡Ã¯Â¸Â CIRCUIT BREAKER ACTIVE: {MAX_CONSECUTIVE_FAILURES} consecutive failures. " +
                            $"Waiting {CIRCUIT_BREAKER_RESET_SECONDS - (int)elapsed}s before retry to protect Tally.");
                        Log($"Ã°Å¸â€ºÂ¡Ã¯Â¸Â CIRCUIT BREAKER: {_consecutiveFailures} failures, wait {CIRCUIT_BREAKER_RESET_SECONDS - (int)elapsed}s");
                        return null;
                    }
                    // Reset after cooldown period
                    SyncLogger.Log("Ã°Å¸â€â€ž Circuit breaker reset - retrying Tally connection");
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
                        Log($"Ã¢ÂÅ’ Tally HTTP {(int)response.StatusCode}: {response.ReasonPhrase}");
                        if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                            _circuitBreakerTrippedAt = DateTime.Now;
                        return null;
                    }

                    // ======= RESPONSE SIZE CHECK =======
                    var contentLength = response.Content.Headers.ContentLength;
                    if (contentLength.HasValue && contentLength.Value > MAX_XML_RESPONSE_SIZE)
                    {
                        SyncLogger.Log($"Ã°Å¸â€ºÂ¡Ã¯Â¸Â SAFETY: Response too large ({contentLength.Value / (1024 * 1024)}MB > {MAX_XML_RESPONSE_MB}MB limit). " +
                            "Skipping to prevent memory crash. Reduce batch size.");
                        Log($"Ã°Å¸â€ºÂ¡Ã¯Â¸Â Response TOO LARGE: {contentLength.Value / (1024 * 1024)}MB");
                        return null;
                    }

                    var responseContent = await response.Content.ReadAsStringAsync();
                    
                    // Double-check actual response size
                    if (responseContent.Length > MAX_XML_RESPONSE_SIZE)
                    {
                        SyncLogger.Log($"Ã°Å¸â€ºÂ¡Ã¯Â¸Â SAFETY: Response body too large ({responseContent.Length / (1024 * 1024)}MB). Skipping.");
                        return null;
                    }

                    // Always save response for debugging
                    SyncLogger.SaveFile("last_tally_response.xml", responseContent);
                    Log($"Ã°Å¸â€œÂ¨ Tally response: {responseContent.Length} chars");
                    
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
                SyncLogger.Log($"Ã¢Å¡Â Ã¯Â¸Â Tally request timed out after {customTimeout ?? _timeout}s (failure #{_consecutiveFailures})");
                Log($"Ã¢Å¡Â Ã¯Â¸Â TIMEOUT: Tally did not respond in {customTimeout ?? _timeout}s");
                return null;
            }
            catch (HttpRequestException ex)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"Ã¢Å¡Â Ã¯Â¸Â Tally connection error: {ex.Message} (failure #{_consecutiveFailures})");
                return null;
            }
            catch (Exception ex)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"Ã¢Å¡Â Ã¯Â¸Â Tally request error: {ex.Message} (failure #{_consecutiveFailures})");
                Log($"Ã¢ÂÅ’ Tally error: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Send XML request to Tally and return sanitized XML text without materializing the full DOM.
        /// </summary>
        private async Task<string?> SendRequestRawAsync(string xmlRequest, string? companyName = null, int? customTimeout = null)
        {
            try
            {
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                {
                    var elapsed = (DateTime.Now - _circuitBreakerTrippedAt).TotalSeconds;
                    if (elapsed < CIRCUIT_BREAKER_RESET_SECONDS)
                    {
                        SyncLogger.Log($"Ã°Å¸â€ºÂ¡Ã¯Â¸Â CIRCUIT BREAKER ACTIVE: {MAX_CONSECUTIVE_FAILURES} consecutive failures. " +
                            $"Waiting {CIRCUIT_BREAKER_RESET_SECONDS - (int)elapsed}s before retry to protect Tally.");
                        Log($"Ã°Å¸â€ºÂ¡Ã¯Â¸Â CIRCUIT BREAKER: {_consecutiveFailures} failures, wait {CIRCUIT_BREAKER_RESET_SECONDS - (int)elapsed}s");
                        return null;
                    }

                    SyncLogger.Log("Ã°Å¸â€â€ž Circuit breaker reset - retrying Tally connection");
                    _consecutiveFailures = 0;
                }

                var timeSinceLastRequest = (DateTime.Now - _lastRequestTime).TotalMilliseconds;
                if (timeSinceLastRequest < REQUEST_COOLDOWN_MS)
                {
                    await Task.Delay(REQUEST_COOLDOWN_MS - (int)timeSinceLastRequest).ConfigureAwait(false);
                }
                _lastRequestTime = DateTime.Now;

                SyncLogger.Log($">>> Tally Request [{companyName ?? "Global"}]: XML Length {xmlRequest.Length}");
                SyncLogger.SaveFile("last_tally_request.xml", xmlRequest);

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(customTimeout ?? _timeout));
                var content = new StringContent(xmlRequest, Encoding.UTF8, "text/xml");
                var response = await _httpClient.PostAsync(_tallyUrl, content, cts.Token).ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                {
                    _consecutiveFailures++;
                    Log($"Ã¢âÅ’ Tally HTTP {(int)response.StatusCode}: {response.ReasonPhrase}");
                    if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                        _circuitBreakerTrippedAt = DateTime.Now;
                    return null;
                }

                var contentLength = response.Content.Headers.ContentLength;
                if (contentLength.HasValue && contentLength.Value > MAX_XML_RESPONSE_SIZE)
                {
                    SyncLogger.Log($"Ã°Å¸â€ºÂ¡Ã¯Â¸Â SAFETY: Response too large ({contentLength.Value / (1024 * 1024)}MB > {MAX_XML_RESPONSE_MB}MB limit). " +
                        "Skipping to prevent memory crash. Reduce batch size.");
                    Log($"Ã°Å¸â€ºÂ¡Ã¯Â¸Â Response TOO LARGE: {contentLength.Value / (1024 * 1024)}MB");
                    return null;
                }

                var responseContent = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                if (responseContent.Length > MAX_XML_RESPONSE_SIZE)
                {
                    SyncLogger.Log($"Ã°Å¸â€ºÂ¡Ã¯Â¸Â SAFETY: Response body too large ({responseContent.Length / (1024 * 1024)}MB). Skipping.");
                    return null;
                }

                SyncLogger.SaveFile("last_tally_response.xml", responseContent);
                Log($"Ã°Å¸â€œÂ¨ Tally response: {responseContent.Length} chars");

                _consecutiveFailures = 0;
                return SanitizeXmlString(responseContent);
            }
            catch (TaskCanceledException)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"Ã¢Å¡Â Ã¯Â¸Â Tally request timed out after {customTimeout ?? _timeout}s (failure #{_consecutiveFailures})");
                Log($"Ã¢Å¡Â Ã¯Â¸Â TIMEOUT: Tally did not respond in {customTimeout ?? _timeout}s");
                return null;
            }
            catch (HttpRequestException ex)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"Ã¢Å¡Â Ã¯Â¸Â Tally connection error: {ex.Message} (failure #{_consecutiveFailures})");
                return null;
            }
            catch (Exception ex)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"Ã¢Å¡Â Ã¯Â¸Â Tally request error: {ex.Message} (failure #{_consecutiveFailures})");
                Log($"Ã¢â’ Tally error: {ex.Message}");
                return null;
            }
        }

        private async Task<TextReader?> SendRequestReaderAsync(string xmlRequest, string? companyName = null, int? customTimeout = null)
        {
            try
            {
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                {
                    var elapsed = (DateTime.Now - _circuitBreakerTrippedAt).TotalSeconds;
                    if (elapsed < CIRCUIT_BREAKER_RESET_SECONDS)
                    {
                        SyncLogger.Log($"🛡️ CIRCUIT BREAKER ACTIVE: {MAX_CONSECUTIVE_FAILURES} consecutive failures. " +
                            $"Waiting {CIRCUIT_BREAKER_RESET_SECONDS - (int)elapsed}s before retry to protect Tally.");
                        Log($"🛡️ CIRCUIT BREAKER: {_consecutiveFailures} failures, wait {CIRCUIT_BREAKER_RESET_SECONDS - (int)elapsed}s");
                        return null;
                    }
                    SyncLogger.Log("🔄 Circuit breaker reset - retrying Tally connection");
                    _consecutiveFailures = 0;
                }

                var timeSinceLastRequest = (DateTime.Now - _lastRequestTime).TotalMilliseconds;
                if (timeSinceLastRequest < REQUEST_COOLDOWN_MS)
                {
                    await Task.Delay(REQUEST_COOLDOWN_MS - (int)timeSinceLastRequest).ConfigureAwait(false);
                }
                _lastRequestTime = DateTime.Now;

                SyncLogger.Log($">>> Tally Request [{companyName ?? "Global"}]: XML Length {xmlRequest.Length}");
                SyncLogger.SaveFile("last_tally_request.xml", xmlRequest);

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(customTimeout ?? _timeout));
                var requestMessage = new HttpRequestMessage(HttpMethod.Post, _tallyUrl)
                {
                    Content = new StringContent(xmlRequest, Encoding.UTF8, "text/xml")
                };
                var response = await _httpClient.SendAsync(requestMessage, HttpCompletionOption.ResponseHeadersRead, cts.Token).ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                {
                    _consecutiveFailures++;
                    Log($"❌ Tally HTTP {(int)response.StatusCode}: {response.ReasonPhrase}");
                    if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                        _circuitBreakerTrippedAt = DateTime.Now;
                    return null;
                }

                var responseStream = await response.Content.ReadAsStreamAsync().ConfigureAwait(false);
                
                _consecutiveFailures = 0;
                return new TallyXmlSanitizingReader(responseStream);
            }
            catch (TaskCanceledException)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"⚠️ Tally request timed out after {customTimeout ?? _timeout}s (failure #{_consecutiveFailures})");
                Log($"⚠️ TIMEOUT: Tally did not respond in {customTimeout ?? _timeout}s");
                return null;
            }
            catch (HttpRequestException ex)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"⚠️ Tally connection error: {ex.Message} (failure #{_consecutiveFailures})");
                return null;
            }
            catch (Exception ex)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
                    _circuitBreakerTrippedAt = DateTime.Now;
                SyncLogger.Log($"⚠️ Tally request error: {ex.Message} (failure #{_consecutiveFailures})");
                Log($"❌ Tally error: {ex.Message}");
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
                Log("Ã°Å¸â€Â Tally Response received. Checking for companies...");

                var companies = new List<Company>();
                
                // Try to find any tag that looks like a company record
                // Tally often wraps these in <COMPANY> or <COMPANYCOLLECTION> tags
                var companyElements = doc.Descendants().Where(x => x.Name.LocalName.Equals("COMPANY", StringComparison.OrdinalIgnoreCase)).ToList();
                
                Log($"Ã°Å¸â€Â Found {companyElements.Count} potential company elements in XML.");

                foreach (var comp in companyElements)
                {
                    string? name = comp.Element("NAME")?.Value ?? comp.Attribute("NAME")?.Value ?? comp.Value;
                    
                    if (string.IsNullOrEmpty(name)) 
                    {
                        Log("   Ã¢Å¡Â Ã¯Â¸Â Skipping empty company name element");
                        continue;
                    }

                    if (name.Length < 2)
                    {
                         Log($"   Ã¢Å¡Â Ã¯Â¸Â Skipping too short name: '{name}'");
                         continue;
                    }

                    if (name.Contains("Report") || name.Contains("Error") || name.Contains("\n")) 
                    {
                        Log($"   Ã¢Å¡Â Ã¯Â¸Â Skipping reserved keyword/invalid char in: '{name}'");
                        continue;
                    }

                    name = name.Trim();
                    Log($"   Ã¢Å“â€¦ Found Company: '{name}'");
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

                        if (string.IsNullOrWhiteSpace(compGstin) || string.IsNullOrWhiteSpace(compState) || addressParts.Count == 0)
                        {
                            var taxUnitDetails = await TryGetCompanyTaxUnitDetailsAsync(name);
                            if (string.IsNullOrWhiteSpace(compGstin))
                            {
                                compGstin = taxUnitDetails.Gstin;
                            }
                            if (string.IsNullOrWhiteSpace(compState))
                            {
                                compState = taxUnitDetails.State;
                            }
                            if (addressParts.Count == 0 && !string.IsNullOrWhiteSpace(taxUnitDetails.Address))
                            {
                                addressParts.AddRange(taxUnitDetails.Address.Split(',').Select(part => part.Trim()).Where(part => !string.IsNullOrWhiteSpace(part)));
                            }
                        }

                        // Extract phone
                        var compPhone = GetElementValue(comp, "PHONENUMBER") ?? GetElementValue(comp, "LEDGERPHONE") ?? GetElementValue(comp, "LEDGERMOBILE") ?? GetElementValue(comp, "MOBILENO") ?? GetElementValue(comp, "CONTACTNUMBER") ?? GetElementValue(comp, "CONTACT");

                        // Extract email
                        var compEmail = GetElementValue(comp, "EMAIL") ?? GetElementValue(comp, "LEDGEREMAIL");

                        // STARTINGFROM/BOOKSFROM reflect books-beginning dates, not the currently loaded
                        // voucher period in Tally. Keep them separate from FY metadata so diagnostics stay honest,
                        // but use them to widen import requests when older voucher dates are pushed.
                        DateTime? booksStart = TryParseDateValue(
                            GetElementValue(comp, "BOOKSFROM")
                            ?? GetElementValue(comp, "STARTINGFROM")
                            ?? GetElementValue(comp, "BOOKBEGINNINGFROM")
                            ?? GetElementValue(comp, "BOOKSBEGINNINGFROM"));
                        DateTime? fyStart = null;
                        DateTime? fyEnd = null;
                        string currency = GetElementValue(comp, "CURRENCYSYMBOL") ?? "Ã¢â€šÂ¹";

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
                            BooksStartDate = booksStart,
                            CurrencySymbol = currency
                        });
                        Log($"   Added Company: '{name}' (ID: {sanitizedId})");
                        Log($"   Ã°Å¸â€œâ€¹ GSTIN: '{compGstin ?? "EMPTY"}' | Address: '{string.Join(", ", addressParts)}' | Phone: '{compPhone ?? "EMPTY"}' | State: '{compState ?? "EMPTY"}' | BooksFrom: '{(booksStart.HasValue ? booksStart.Value.ToString("dd-MMM-yyyy") : "EMPTY")}'");
                    }
                    else
                    {
                         Log($"   Ã¢Å¡Â Ã¯Â¸Â Skipping duplicate: '{name}'");
                    }
                }

                Log($"Ã°Å¸â€Â Returning {companies.Count} valid companies to SyncManager.");

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

        private async Task<(string? Gstin, string? State, string? Address)> TryGetCompanyTaxUnitDetailsAsync(string companyName)
        {
            if (string.IsNullOrWhiteSpace(companyName))
            {
                return (null, null, null);
            }

            var request = $@"<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CompanyTaxUnitDetails</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""CompanyTaxUnitDetails"">
            <TYPE>Company</TYPE>
            <FETCH>NAME, STATENAME, ADDRESS.LIST, GSTREGISTRATIONNUMBER, GSTIN, COMPANYGSTDETAILS.LIST</FETCH>
            <COMPUTE>GSTRegNumberCompute:$GSTRegNumber:TaxUnit:($ExciseUnitName:Company:##SVCurrentCompany)</COMPUTE>
            <COMPUTE>TaxUnitStateCompute:$StateName:TaxUnit:($ExciseUnitName:Company:##SVCurrentCompany)</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

            try
            {
                var doc = await SendRequestAsync(request, companyName, 30);
                var companyElement = doc?.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("COMPANY", StringComparison.OrdinalIgnoreCase));
                if (companyElement == null)
                {
                    return (null, null, null);
                }

                var gstin = GetElementValue(companyElement, "GSTREGNUMBERCOMPUTE")
                    ?? GetElementValue(companyElement, "GSTREGISTRATIONNUMBER")
                    ?? GetElementValue(companyElement, "GSTIN");

                if (string.IsNullOrWhiteSpace(gstin))
                {
                    var gstDetails = companyElement.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("COMPANYGSTDETAILS.LIST", StringComparison.OrdinalIgnoreCase));
                    if (gstDetails != null)
                    {
                        gstin = GetElementValue(gstDetails, "GSTREGISTRATIONNUMBER") ?? GetElementValue(gstDetails, "GSTIN");
                    }
                }

                var state = GetElementValue(companyElement, "TAXUNITSTATECOMPUTE")
                    ?? GetElementValue(companyElement, "STATENAME")
                    ?? GetElementValue(companyElement, "STATE");

                var addressParts = new List<string>();
                var addressList = companyElement.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("ADDRESS.LIST", StringComparison.OrdinalIgnoreCase));
                if (addressList != null)
                {
                    addressParts.AddRange(addressList.Elements().Where(e => e.Name.LocalName.Equals("ADDRESS", StringComparison.OrdinalIgnoreCase)).Select(a => a.Value.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                    if (addressParts.Count == 0 && !string.IsNullOrWhiteSpace(addressList.Value))
                    {
                        addressParts.AddRange(addressList.Value.Split('\n').Select(a => a.Trim()).Where(v => !string.IsNullOrWhiteSpace(v)));
                    }
                }

                var address = addressParts.Count > 0 ? string.Join(", ", addressParts) : null;
                return (gstin, state, address);
            }
            catch (Exception ex)
            {
                Log($"Company TaxUnit details fetch failed for '{companyName}': {ex.Message}");
                return (null, null, null);
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

            using var reader = await SendRequestReaderAsync(request, companyName);
            if (reader == null) return new List<Ledger>();

            return ParseLedgersFromXmlStreaming(reader, companyName);
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

        private int GetAdaptiveVoucherBatchSize(int defaultBatchSize = 100)
        {
            if (_consecutiveFailures >= 3) return MIN_BATCH_SIZE;
            if (_consecutiveFailures >= 2) return Math.Max(MIN_BATCH_SIZE, VOUCHER_BATCH_SIZE);
            return Math.Max(MIN_BATCH_SIZE, defaultBatchSize);
        }
        
        public async Task<List<Voucher>> GetModifiedVouchersAsync(string companyName, long afterAlterId, Dictionary<string, string>? stockItemHsnCache = null, DateTime? booksStartDate = null)
        {
            SyncLogger.Log($"Ã°Å¸â€Â Incremental Sync: Checking vouchers with ALTERID > {afterAlterId}");
            
            // ===== PHASE 1: Lightweight Scout Fetch =====
            // Chunking backward in 1-year intervals to prevent Tally Memory Crash
            // Tally evaluates Formula on the entire period's vouchers. If unbounded, 500k vouchers = Instant Crash.
            
            DateTime currentEnd = DateTime.Today;
            // Smart limit: First sync uses BooksStartDate (or 10 years back), Incremental = 3 months
            bool isFirstSync = afterAlterId == 0;
            DateTime absoluteStart = isFirstSync
                ? (booksStartDate ?? DateTime.Today.AddYears(-10))  // First sync: from BooksStartDate or 10 years
                : DateTime.Today.AddMonths(-3);    // Incremental: 3 months (backdated edits rare)
            
            var allAlterIds = new List<long>();
            long minScoutAlterId = long.MaxValue;
            long maxScoutAlterId = 0;
            
            int chunksRun = 0;
            int MAX_CHUNKS = isFirstSync ? 20 : 3;  // More chunks for full historical sync
            
            while (currentEnd > absoluteStart && chunksRun < MAX_CHUNKS)
            {
                DateTime currentStart = currentEnd.AddMonths(isFirstSync ? -12 : -1);
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
            // ===== PHASE 2: Batched Full Fetch with exact IDs =====
            int BATCH_SIZE = GetAdaptiveVoucherBatchSize(100);
            SyncLogger.Log($"📦 Phase 2: Fetching {allAlterIds.Count} vouchers in batches of {BATCH_SIZE}");
            
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
                SyncLogger.Log($"📦 Fetching {rangeLabel} ({batchIds.Count} vouchers)");
                
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
            <FETCH>{VoucherCollectionFetchFields}</FETCH>
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
                    using var reader = await SendRequestReaderAsync(request, companyName, 120);

                    if (reader != null)
                    {
                        var chunkVouchers = await Task.Run(() => ParseVouchersFromXmlStreaming(reader, companyName, DateTime.Today, stockItemHsnCache));
                        allVouchers.AddRange(chunkVouchers);
                        SyncLogger.Log($"   ✅ {chunkVouchers.Count} vouchers fetched (Total: {allVouchers.Count})");
                    }
                    else
                    {
                        SyncLogger.Log($"   ⚠️ {rangeLabel} returned NULL");
                    }
                }
                catch (Exception ex)
                {
                    SyncLogger.Log($"   ❌ {rangeLabel} error: {ex.Message}");
                }
                
                // Breathing room for Tally between batches to prevent hang
                if (i + BATCH_SIZE < allAlterIds.Count)
                {
                    await Task.Delay(1500);
                }
            }
            
            SyncLogger.Log($"Ã¢Å“â€¦ Phase 2 Complete: {allVouchers.Count} vouchers fetched in {batchNumber} batches");
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
                    SyncLogger.Log($"Ã¢Å¡Â Ã¯Â¸Â Tally returned null response for Scout request ({fromDate:yyyyMMdd}-{toDate:yyyyMMdd}).");
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
            var startDate = fromDate ?? new DateTime(2000, 1, 1);
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
            <FETCH>{VoucherCollectionFetchFields}</FETCH>
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
                using var reader = await SendRequestReaderAsync(request, companyName, timeoutSeconds);

                if (reader == null)
                {
                    SyncLogger.Log($"⚠️ Tally returned null response for Batch {fromAlterId}-{toAlterId}");
                    return new List<Voucher>();
                }
                
                // Safe execution with try-catch inside Task.Run
                return await Task.Run(() => {
                    try {
                        return ParseVouchersFromXmlStreaming(reader, companyName, DateTime.Today, stockItemHsnCache);
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
                SyncLogger.Log($"   Ã¢Å¡Â Ã¯Â¸Â Batch {fromAlterId}-{toAlterId} failed (Attempt 1): {ex.Message}");
                
                try 
                {
                    // Attempt 2: If failed, try with longer timeout (Tally might be slow)
                    SyncLogger.Log($"   Ã¢Å¡Â Ã¯Â¸Â Retrying with extended timeout (240s)...");
                    await Task.Delay(2000); // 2s cool-down
                    return await FetchVoucherBatchAsync(companyName, fromAlterId, toAlterId, stockItemHsnCache, BATCH_TIMEOUT_SECONDS * 2, fromDate, toDate);
                }
                catch
                {
                    // Attempt 3: If still failing, it's likely too much data. Split into sub-batches.
                    long range = toAlterId - fromAlterId;
                    if (range <= 1) return new List<Voucher>(); // Can't split further

                    SyncLogger.Log($"   Ã¢Å¡Â Ã¯Â¸Â Retry failed, splitting batch into sub-batches...");
                    await Task.Delay(3000); // 3s cool-down
                    
                    var results = new List<Voucher>();
                    long midAlterId = fromAlterId + (range / 2);
                    
                    try {
                        var firstHalf = await FetchVoucherBatchAsync(companyName, fromAlterId, midAlterId, stockItemHsnCache, BATCH_TIMEOUT_SECONDS, fromDate, toDate);
                        results.AddRange(firstHalf);
                    } catch (Exception e) { SyncLogger.LogError($"   Ã¢ÂÅ’ Sub-batch 1 failed: {e.Message}", e); }
                    
                    try {
                        var secondHalf = await FetchVoucherBatchAsync(companyName, midAlterId, toAlterId, stockItemHsnCache, BATCH_TIMEOUT_SECONDS, fromDate, toDate);
                        results.AddRange(secondHalf);
                    } catch (Exception e) { SyncLogger.LogError($"   Ã¢ÂÅ’ Sub-batch 2 failed: {e.Message}", e); }
                    
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
            SyncLogger.Log($"Ã°Å¸â€Â Fetching ledgers with ALTERID > {afterAlterId}");
            
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

            using var reader = await SendRequestReaderAsync(request, companyName, 120);
            if (reader == null) return new List<Ledger>();

            var ledgers = ParseLedgersFromXmlStreaming(reader, companyName);
            SyncLogger.Log($"✅ Found {ledgers.Count} modified ledgers");
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
            Log($"Ã°Å¸â€œÂ¦ Phase 1: Scouting exactly how many vouchers we have...");
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
                Log("Ã¢Å¡Â Ã¯Â¸Â Voucher scout returned NULL. Tally timed out or returned empty.");
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
                Log("Ã¢â€žÂ¹Ã¯Â¸Â No vouchers found in this date range.");
                return new List<Voucher>();
            }

            Log($"Ã°Å¸â€Â Scout found {allAlterIds.Count} vouchers.");
            
            // PHASE 2: EXACT 100-VOUCHER CHUNKS
            int BATCH_SIZE = GetAdaptiveVoucherBatchSize(100);
            var allVouchers = new List<Voucher>();
            int totalBatches = (int)Math.Ceiling((double)allAlterIds.Count / BATCH_SIZE);

            Log($"Ã°Å¸â€œÂ¦ Phase 2: Fetching full details in {totalBatches} chunks of {BATCH_SIZE} vouchers.");

            for (int i = 0; i < allAlterIds.Count; i += BATCH_SIZE)
            {
                int batchNum = (i / BATCH_SIZE) + 1;
                var batchIds = allAlterIds.Skip(i).Take(BATCH_SIZE).ToList();
                long batchMin = batchIds.Min();
                long batchMax = batchIds.Max();

                string rangeLabel = $"Batch {batchNum}/{totalBatches} (AlterID {batchMin}-{batchMax})";
                Log($"Ã°Å¸â€œÂ¦ Fetching {rangeLabel}");
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
            <FETCH>{VoucherCollectionFetchFields}</FETCH>
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
                    using var reader = await SendRequestReaderAsync(request, companyName, 120);

                    if (reader != null)
                    {
                        var chunkVouchers = await Task.Run(() => ParseVouchersFromXmlStreaming(reader, companyName, toDate, stockItemHsnCache));
                        allVouchers.AddRange(chunkVouchers);
                        Log($"   ✅ {chunkVouchers.Count} vouchers (Total: {allVouchers.Count})");
                    }
                    else
                    {
                        Log($"   ⚠️ {rangeLabel} returned NULL");
                    }
                }
                catch (Exception ex)
                {
                    Log($"   Ã¢ÂÅ’ {rangeLabel} error: {ex.Message}");
                }

                // 1.5 seconds breathing room for Tally between 100-voucher fetches
                if (i + BATCH_SIZE < allAlterIds.Count)
                {
                    await Task.Delay(1500);
                }
            }

            Log($"Ã¢Å“â€¦ Total: {allVouchers.Count} vouchers fetched in {totalBatches} chunks.");
            progressCallback?.Invoke($"Ã¢Å“â€¦ {allVouchers.Count} vouchers fetched");
            return allVouchers;
        }


        private async Task<List<Voucher>> GetVouchersInternalAsync(DateTime? fromDate, DateTime? toDate, string? companyName, string? voucherTypeFilter, Dictionary<string, string>? stockItemHsnCache = null)
        {
            DateTime effectiveFrom = fromDate ?? new DateTime(2000, 1, 1);
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
    <FETCH>{VoucherCollectionFetchFields}</FETCH>
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
            using var reader = await SendRequestReaderAsync(request, companyName, timeout);
            if (reader == null) return new List<Voucher>();

            return ParseVouchersFromXmlStreaming(reader, companyName, effectiveFrom, stockItemHsnCache);
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
                            e.Name.LocalName.Equals("INVENTORYALLOCATIONS.LIST", StringComparison.OrdinalIgnoreCase) ||
                            e.Name.LocalName.Equals("STOCKALLOCATIONS.LIST", StringComparison.OrdinalIgnoreCase) ||
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

                    inventoryEntries = inventoryEntries
                        .Where(entry => entry != null && !string.IsNullOrWhiteSpace(entry.StockItemName) && Math.Abs(entry.Amount) > 0)
                        .GroupBy(entry => string.Join("|",
                            entry.StockItemName.Trim().ToUpperInvariant(),
                            Math.Abs(entry.Quantity).ToString("0.###", CultureInfo.InvariantCulture),
                            Math.Abs(entry.Rate).ToString("0.###", CultureInfo.InvariantCulture),
                            Math.Abs(entry.Amount).ToString("0.###", CultureInfo.InvariantCulture),
                            (entry.HsnCode ?? string.Empty).Trim().ToUpperInvariant(),
                            entry.TaxRate.HasValue ? Math.Abs(entry.TaxRate.Value).ToString("0.##", CultureInfo.InvariantCulture) : string.Empty))
                        .Select(group => group.First())
                        .ToList();

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
                    string persistedView = GetElementValue(vNode, "PERSISTEDVIEW") ?? GetElementValue(vNode, "OBJVIEW") ?? string.Empty;
                    string invoiceFlagText = GetElementValue(vNode, "ISINVOICE") ?? string.Empty;
                    bool hasInventoryEntries = inventoryEntries.Count > 0;
                    bool isInvoice = invoiceFlagText.Equals("Yes", StringComparison.OrdinalIgnoreCase)
                        || invoiceFlagText.Equals("True", StringComparison.OrdinalIgnoreCase)
                        || persistedView.Contains("invoice", StringComparison.OrdinalIgnoreCase)
                        || hasInventoryEntries;
                    bool isAccountingVoucher = !isInvoice;
                    var rawVoucherData = new Dictionary<string, object?>
                    {
                        ["voucher_type"] = vType,
                        ["voucher_number"] = vNum,
                        ["voucher_date"] = vDate.ToString("yyyy-MM-dd"),
                        ["party_name"] = partyName,
                        ["total_amount"] = totalAmount,
                        ["persisted_view"] = persistedView,
                        ["ledger_entries"] = ledgerEntries,
                        ["inventory_entries"] = inventoryEntries,
                        ["is_invoice"] = isInvoice,
                        ["is_accounting_voucher"] = isAccountingVoucher
                    };

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
                        IsInvoice = isInvoice,
                        IsAccountingVoucher = isAccountingVoucher,
                        RawData = rawVoucherData,
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

        private List<Ledger> ParseLedgersFromXmlStreaming(TextReader reader, string? companyName)
        {
            var ledgers = new List<Ledger>();
            var settings = new XmlReaderSettings { CheckCharacters = false, IgnoreComments = true, DtdProcessing = DtdProcessing.Ignore };
            using var xmlReader = XmlReader.Create(reader, settings);

            while (xmlReader.Read())
            {
                if (xmlReader.NodeType != XmlNodeType.Element || !xmlReader.LocalName.Equals("LEDGER", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                try
                {
                    var element = (XElement)XNode.ReadFrom(xmlReader);
                    var ledger = ParseLedgerElement(element);
                    if (ledger != null)
                    {
                        ledgers.Add(ledger);
                    }
                }
                catch (Exception ex)
                {
                    SyncLogger.Log($"Error streaming ledger parse: {ex.Message}");
                }
            }

            return ledgers;
        }

        private List<Ledger> ParseLedgersFromXmlStreaming(string xmlContent, string? companyName)
        {
            using var stringReader = new StringReader(xmlContent);
            return ParseLedgersFromXmlStreaming(stringReader, companyName);
        }

        private Ledger? ParseLedgerElement(XElement ledgerElement)
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

                return new Ledger
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
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error parsing ledger: {ex.Message}");
                return null;
            }
        }

        private List<Voucher> ParseVouchersFromXmlStreaming(TextReader reader, string? companyName, DateTime defaultDate, Dictionary<string, string>? stockItemHsnCache = null)
        {
            var vouchers = new List<Voucher>();
            var settings = new XmlReaderSettings { CheckCharacters = false, IgnoreComments = true, DtdProcessing = DtdProcessing.Ignore };
            using var xmlReader = XmlReader.Create(reader, settings);

            while (xmlReader.Read())
            {
                if (xmlReader.NodeType != XmlNodeType.Element)
                {
                    continue;
                }

                var localName = xmlReader.LocalName;
                if (!localName.Equals("VOUCHER", StringComparison.OrdinalIgnoreCase)
                    && !localName.Equals("DSPVCH", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                try
                {
                    var element = (XElement)XNode.ReadFrom(xmlReader);
                    var parsed = ParseVouchersFromXml(new XDocument(element), companyName, defaultDate, stockItemHsnCache);
                    if (parsed.Count > 0)
                    {
                        vouchers.AddRange(parsed);
                    }
                }
                catch (Exception ex)
                {
                    SyncLogger.Log($"Error streaming voucher parse: {ex.Message}");
                }
            }

            return vouchers;
        }

        private List<Voucher> ParseVouchersFromXmlStreaming(string xmlContent, string? companyName, DateTime defaultDate, Dictionary<string, string>? stockItemHsnCache = null)
        {
            using var stringReader = new StringReader(xmlContent);
            return ParseVouchersFromXmlStreaming(stringReader, companyName, defaultDate, stockItemHsnCache);
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
            var doc = await SendRequestAsync(request, companyName, 60);
            if (doc == null) 
            {
                 SyncLogger.Log("Ã¢Å¡Â Ã¯Â¸Â StockItem request returned NULL");
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
                    decimal gstRate = ResolveStockItemGstRate(itemElement);
                    
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

            SyncLogger.Log($"[DEBUG] Parsed {items.Count} stock items. HSN populated: {items.Count(i => !string.IsNullOrEmpty(i.HsnCode))} | GST populated: {items.Count(i => i.GstRate > 0)}");
            return items;
        }




        /// <summary>
        /// Get stock items modified after a specific ALTERID
        /// </summary>
        public async Task<List<StockItem>> GetModifiedStockItemsAsync(string companyName, long afterAlterId)
        {
            SyncLogger.Log($"Ã°Å¸â€Â Fetching stock items with ALTERID > {afterAlterId}");

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

                    decimal gstRate = ResolveStockItemGstRate(itemElement);

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

            SyncLogger.Log($"[DEBUG] Found {items.Count} modified stock items (HSN: {items.Count(i => !string.IsNullOrEmpty(i.HsnCode))}, GST: {items.Count(i => i.GstRate > 0)})");
            return items;
        }

        private static decimal ResolveStockItemGstRate(XElement itemElement)
        {
            var descendants = itemElement.Descendants().ToList();

            decimal directRate = descendants
                .Where(x =>
                    x.Name.LocalName.Equals("GSTRATE", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("RATEOFTAXCALCULATION", StringComparison.OrdinalIgnoreCase))
                .Select(x => Math.Abs(ParseDecimal(x.Value)))
                .FirstOrDefault(rate => rate > 0);

            if (directRate > 0)
            {
                return directRate;
            }

            decimal igstRate = descendants
                .Where(x =>
                    x.Name.LocalName.Equals("IGSTRATE", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("INTEGRATEDTAXRATE", StringComparison.OrdinalIgnoreCase))
                .Select(x => Math.Abs(ParseDecimal(x.Value)))
                .FirstOrDefault(rate => rate > 0);

            if (igstRate > 0)
            {
                return igstRate;
            }

            decimal cgstRate = descendants
                .Where(x =>
                    x.Name.LocalName.Equals("CGSTRATE", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("CENTRALTAXRATE", StringComparison.OrdinalIgnoreCase))
                .Select(x => Math.Abs(ParseDecimal(x.Value)))
                .FirstOrDefault(rate => rate > 0);

            decimal sgstRate = descendants
                .Where(x =>
                    x.Name.LocalName.Equals("SGSTRATE", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("STATETAXRATE", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("UTGSTRATE", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("UNIONTERRITORYTAXRATE", StringComparison.OrdinalIgnoreCase))
                .Select(x => Math.Abs(ParseDecimal(x.Value)))
                .FirstOrDefault(rate => rate > 0);

            decimal combinedRate = cgstRate + sgstRate;
            return combinedRate > 0 ? combinedRate : 0;
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
            cleanValue = cleanValue.Replace("Ã¢â€šÂ¹", "").Replace(",", "").Replace("Rs", "").Replace("Rs.", "").Trim();
            
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
            return TryParseDateValue(value) ?? DateTime.Today;
        }

        private static DateTime? TryParseDateValue(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;

            var trimmed = value.Trim();
            if (trimmed.Length == 8 && DateTime.TryParseExact(trimmed, "yyyyMMdd",
                null, System.Globalization.DateTimeStyles.None, out var tallyDate))
            {
                return tallyDate.Date;
            }

            if (DateTime.TryParse(trimmed, out var parsed))
            {
                return parsed.Date;
            }

            return null;
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
                    // SyncLogger.Log($"   Ã°Å¸â€Â§ HSN filled from cache: {itemName} -> {cachedHsn}"); 
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
            List<VoucherInventoryEntry>? inventoryEntries = null,
            string? counterLedgerHint = null,
            IEnumerable<string>? knownLedgerNames = null,
            DateTime? companyFyStart = null,
            DateTime? companyFyEnd = null,
            DateTime? companyBooksStart = null)
        {
            try
            {
                var normalizedVoucherType = string.IsNullOrWhiteSpace(voucherType) ? "Receipt" : voucherType.Trim();
                var normalizedPartyLedger = string.IsNullOrWhiteSpace(partyLedger) ? "Cash" : partyLedger.Trim();
                var voucherTypeLower = normalizedVoucherType.ToLowerInvariant();
                var safeAmount = Math.Abs(amount);
                var voucherDateValue = voucherDate.Date;
                if (voucherDateValue == DateTime.MinValue || voucherDateValue.Year < 1900)
                {
                    voucherDateValue = DateTime.Today;
                }

                bool isSalesLike = voucherTypeLower.Contains("sale");
                bool isPurchaseLike = voucherTypeLower.Contains("purchase");
                bool isReceiptLike = voucherTypeLower.StartsWith("receipt");
                bool isPaymentLike = voucherTypeLower.StartsWith("payment");
                bool hasInventory = inventoryEntries != null && inventoryEntries.Any();
                bool isSalesOrPurchaseInventoryType = hasInventory
                    && (isSalesLike
                        || isPurchaseLike
                        || normalizedVoucherType.Equals("Sales", StringComparison.OrdinalIgnoreCase)
                        || normalizedVoucherType.Equals("Purchase", StringComparison.OrdinalIgnoreCase));
                var inventoryCount = inventoryEntries?.Count ?? 0;
                var ledgerCount = ledgerEntries?.Count ?? 0;
                var inventoryTotal = inventoryEntries?.Sum(entry => Math.Abs(entry.Amount)) ?? 0m;

                SyncLogger.Log($"Pushing {normalizedVoucherType} to Tally: party={normalizedPartyLedger}, amount={safeAmount:0.##}, date={voucherDateValue:yyyy-MM-dd}, inventory={inventoryCount} ({inventoryTotal:0.##}), ledgers={ledgerCount}");


                var ledgerListTag = isSalesOrPurchaseInventoryType ? "LEDGERENTRIES.LIST" : "ALLLEDGERENTRIES.LIST";
                var inventoryListTag = isSalesOrPurchaseInventoryType ? "INVENTORYENTRIES.LIST" : "ALLINVENTORYENTRIES.LIST";
                void AppendLedgerEntryXml(StringBuilder xml, string ledgerName, decimal signedAmount, bool isPartyLedgerEntry = false, bool includeBillAllocation = false)
                {
                    if (string.IsNullOrWhiteSpace(ledgerName) || signedAmount == 0)
                    {
                        return;
                    }

                    var absAmountText = Math.Abs(signedAmount).ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);
                    var formattedAmount = signedAmount < 0 ? $"-{absAmountText}" : absAmountText;
                    var billAllocationXml = string.Empty;
                    if (includeBillAllocation)
                    {
                        var billRef = normalizedVoucherType + "-" + voucherDateValue.ToString("yyyyMMdd");
                        billAllocationXml = "\n                <BILLALLOCATIONS.LIST>\n                    <NAME>" + XmlEscape(billRef) + "</NAME>\n                    <BILLTYPE>New Ref</BILLTYPE>\n                    <AMOUNT>" + formattedAmount + "</AMOUNT>\n                </BILLALLOCATIONS.LIST>";
                    }

                    xml.AppendLine($@"
            <{ledgerListTag}>
                <LEDGERNAME>{XmlEscape(ledgerName)}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>{(signedAmount < 0 ? "Yes" : "No")}</ISDEEMEDPOSITIVE>
                <ISLASTDEEMEDPOSITIVE>{(signedAmount < 0 ? "Yes" : "No")}</ISLASTDEEMEDPOSITIVE>
                <ISPARTYLEDGER>{(isPartyLedgerEntry ? "Yes" : "No")}</ISPARTYLEDGER>
                <AMOUNT>{formattedAmount}</AMOUNT>{billAllocationXml}
            </{ledgerListTag}>");
                }

                bool IsTaxOrRoundOffLedgerName(string ledgerName)
                {
                    if (string.IsNullOrWhiteSpace(ledgerName))
                    {
                        return false;
                    }

                    return ledgerName.Contains("gst", StringComparison.OrdinalIgnoreCase)
                        || ledgerName.Contains("cgst", StringComparison.OrdinalIgnoreCase)
                        || ledgerName.Contains("sgst", StringComparison.OrdinalIgnoreCase)
                        || ledgerName.Contains("igst", StringComparison.OrdinalIgnoreCase)
                        || ledgerName.Contains("cess", StringComparison.OrdinalIgnoreCase)
                        || ledgerName.Contains("tax", StringComparison.OrdinalIgnoreCase)
                        || ledgerName.Contains("round", StringComparison.OrdinalIgnoreCase)
                        || ledgerName.Contains("duty", StringComparison.OrdinalIgnoreCase);
                }

                var availableLedgerNames = (knownLedgerNames ?? Enumerable.Empty<string>())
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .Select(name => name.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                bool LedgerExists(string ledgerName)
                {
                    if (string.IsNullOrWhiteSpace(ledgerName))
                    {
                        return false;
                    }

                    return availableLedgerNames.Count == 0 || availableLedgerNames.Contains(ledgerName.Trim());
                }

                string? FindBusinessLedgerFromKnownNames()
                {
                    if (availableLedgerNames.Count == 0)
                    {
                        return null;
                    }

                    var candidates = availableLedgerNames
                        .Where(name => !string.Equals(name, normalizedPartyLedger, StringComparison.OrdinalIgnoreCase))
                        .Where(name => !IsTaxOrRoundOffLedgerName(name))
                        .ToList();

                    if (candidates.Count == 0)
                    {
                        return availableLedgerNames.FirstOrDefault();
                    }

                    if (isSalesLike)
                    {
                        var salesLedger = candidates.FirstOrDefault(name =>
                            name.Contains("sale", StringComparison.OrdinalIgnoreCase)
                            || name.Contains("revenue", StringComparison.OrdinalIgnoreCase)
                            || name.Contains("income", StringComparison.OrdinalIgnoreCase));
                        if (!string.IsNullOrWhiteSpace(salesLedger))
                        {
                            return salesLedger;
                        }
                    }

                    if (isPurchaseLike)
                    {
                        var purchaseLedger = candidates.FirstOrDefault(name =>
                            name.Contains("purch", StringComparison.OrdinalIgnoreCase)
                            || name.Contains("expense", StringComparison.OrdinalIgnoreCase)
                            || name.Contains("consum", StringComparison.OrdinalIgnoreCase));
                        if (!string.IsNullOrWhiteSpace(purchaseLedger))
                        {
                            return purchaseLedger;
                        }
                    }

                    var cashOrBank = candidates.FirstOrDefault(name =>
                        name.Equals("Cash", StringComparison.OrdinalIgnoreCase)
                        || name.Contains("cash", StringComparison.OrdinalIgnoreCase)
                        || name.Contains("bank", StringComparison.OrdinalIgnoreCase));

                    return !string.IsNullOrWhiteSpace(cashOrBank)
                        ? cashOrBank
                        : candidates.FirstOrDefault();
                }

                if (availableLedgerNames.Count > 0 && !LedgerExists(normalizedPartyLedger))
                {
                    var partyFallback = availableLedgerNames.FirstOrDefault(name =>
                        name.Equals("Cash", StringComparison.OrdinalIgnoreCase)
                        || name.Contains("cash", StringComparison.OrdinalIgnoreCase)
                        || name.Contains("bank", StringComparison.OrdinalIgnoreCase))
                        ?? availableLedgerNames.FirstOrDefault();

                    if (!string.IsNullOrWhiteSpace(partyFallback))
                    {
                        SyncLogger.Log($"Party ledger '{normalizedPartyLedger}' not found in Tally. Falling back to '{partyFallback}'.");
                        normalizedPartyLedger = partyFallback;
                    }
                }

                var validLedgerEntries = (ledgerEntries ?? new List<VoucherLedgerEntry>())
                    .Where(entry => entry != null && !string.IsNullOrWhiteSpace(entry.LedgerName) && entry.Amount != 0)
                    .ToList();

                if (availableLedgerNames.Count > 0)
                {
                    var droppedLedgers = validLedgerEntries
                        .Where(entry => !LedgerExists(entry.LedgerName))
                        .Select(entry => entry.LedgerName?.Trim())
                        .Where(name => !string.IsNullOrWhiteSpace(name))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    validLedgerEntries = validLedgerEntries
                        .Where(entry => LedgerExists(entry.LedgerName))
                        .ToList();

                    if (droppedLedgers.Count > 0)
                    {
                        SyncLogger.Log($"Filtered {droppedLedgers.Count} ledger entries because ledgers do not exist in Tally.");
                        SyncLogger.Log($"Dropped ledgers: {string.Join(", ", droppedLedgers.Take(5))}{(droppedLedgers.Count > 5 ? " ..." : string.Empty)}");
                    }
                }

                string counterLedger = !string.IsNullOrWhiteSpace(counterLedgerHint) && LedgerExists(counterLedgerHint)
                    ? counterLedgerHint.Trim()
                    : isSalesLike
                        ? (LedgerExists("Sales") ? "Sales" : string.Empty)
                        : isPurchaseLike
                            ? (LedgerExists("Purchase") ? "Purchase" : string.Empty)
                            : isReceiptLike || isPaymentLike
                                ? (LedgerExists("Cash") ? "Cash" : string.Empty)
                                : string.Empty;

                if (string.IsNullOrWhiteSpace(counterLedger) && validLedgerEntries.Count > 0)
                {
                    var businessLedger = validLedgerEntries
                        .Where(entry => !string.Equals(entry.LedgerName?.Trim(), normalizedPartyLedger, StringComparison.OrdinalIgnoreCase))
                        .Where(entry => !IsTaxOrRoundOffLedgerName(entry.LedgerName ?? string.Empty))
                        .Where(entry => !isSalesLike || entry.Amount > 0)
                        .Where(entry => !isPurchaseLike || entry.Amount < 0)
                        .OrderByDescending(entry => Math.Abs(entry.Amount))
                        .Select(entry => entry.LedgerName?.Trim())
                        .FirstOrDefault(name => !string.IsNullOrWhiteSpace(name) && LedgerExists(name));

                    if (!string.IsNullOrWhiteSpace(businessLedger))
                    {
                        counterLedger = businessLedger;
                    }
                }

                if (string.IsNullOrWhiteSpace(counterLedger))
                {
                    counterLedger = FindBusinessLedgerFromKnownNames()
                        ?? (isReceiptLike || isPaymentLike ? "Cash" : "Suspense A/c");
                }

                if (availableLedgerNames.Count > 0 && !LedgerExists(counterLedger))
                {
                    var fallbackCounter = FindBusinessLedgerFromKnownNames();
                    if (!string.IsNullOrWhiteSpace(fallbackCounter))
                    {
                        SyncLogger.Log($"Counter ledger '{counterLedger}' not found in Tally. Falling back to '{fallbackCounter}'.");
                        counterLedger = fallbackCounter;
                    }
                }

                var ledgerEntriesXml = new StringBuilder();
                if (validLedgerEntries.Count > 0)
                {
                    foreach (var entry in validLedgerEntries)
                    {
                        var isPartyLedgerEntry = string.Equals(entry.LedgerName?.Trim(), normalizedPartyLedger, StringComparison.OrdinalIgnoreCase);
                        AppendLedgerEntryXml(
                            ledgerEntriesXml,
                            entry.LedgerName ?? string.Empty,
                            entry.Amount,
                            isPartyLedgerEntry,
                            includeBillAllocation: isPartyLedgerEntry && isSalesOrPurchaseInventoryType);
                    }
                }
                else
                {
                    decimal partySignedAmount = (isSalesLike || isPaymentLike) ? -safeAmount : safeAmount;
                    AppendLedgerEntryXml(
                        ledgerEntriesXml,
                        normalizedPartyLedger,
                        partySignedAmount,
                        isPartyLedgerEntry: true,
                        includeBillAllocation: isSalesOrPurchaseInventoryType);

                    // For inventory vouchers, accounting allocations inside ALLINVENTORYENTRIES
                    // already post to the counter ledger; adding a second summary ledger line
                    // can make totals inconsistent and Tally may silently reject the import.
                    if (!hasInventory)
                    {
                        decimal counterSignedAmount = -partySignedAmount;
                        AppendLedgerEntryXml(ledgerEntriesXml, counterLedger, counterSignedAmount);
                    }
                }

                var inventoryXml = new StringBuilder();
                if (hasInventory)
                {
                    foreach (var item in inventoryEntries ?? Enumerable.Empty<VoucherInventoryEntry>())
                    {
                        if (item == null || string.IsNullOrWhiteSpace(item.StockItemName))
                        {
                            continue;
                        }

                        var quantity = Math.Abs(item.Quantity);
                        if (quantity <= 0)
                        {
                            quantity = 1;
                        }

                        var rate = Math.Abs(item.Rate);
                        var lineAmount = Math.Abs(item.Amount);

                        if (lineAmount <= 0 && rate > 0)
                        {
                            lineAmount = quantity * rate;
                        }

                        if (rate <= 0 && quantity > 0 && lineAmount > 0)
                        {
                            rate = lineAmount / quantity;
                        }

                        var unit = string.IsNullOrWhiteSpace(item.Unit) ? "Nos" : item.Unit!;
                        var quantityText = quantity.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);
                        var rateText = rate.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);

                        var gstXmlBuilder = new StringBuilder();
                        bool hasPositiveTaxRate = item.TaxRate.HasValue && item.TaxRate.Value > 0m;
                        string explicitTaxability = string.IsNullOrWhiteSpace(item.Taxability) ? string.Empty : item.Taxability!.Trim();
                        if (!string.IsNullOrWhiteSpace(item.HsnCode) || hasPositiveTaxRate || !string.IsNullOrWhiteSpace(explicitTaxability))
                        {
                            gstXmlBuilder.AppendLine("                <GSTDETAILS.LIST>");

                            if (!string.IsNullOrWhiteSpace(item.HsnCode))
                            {
                                gstXmlBuilder.AppendLine($"                    <HSNCODE>{XmlEscape(item.HsnCode)}</HSNCODE>");
                            }

                            if (hasPositiveTaxRate)
                            {
                                var taxRateText = item.TaxRate!.Value.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);
                                gstXmlBuilder.AppendLine($"                    <RATEOFTAXCALCULATION>{taxRateText}</RATEOFTAXCALCULATION>");
                                gstXmlBuilder.AppendLine("                    <GSTOVRDNNATURE>Taxable</GSTOVRDNNATURE>");
                            }

                            var taxability = !string.IsNullOrWhiteSpace(explicitTaxability)
                                ? explicitTaxability
                                : hasPositiveTaxRate ? "Taxable" : string.Empty;
                            if (!string.IsNullOrWhiteSpace(taxability))
                            {
                                gstXmlBuilder.AppendLine($"                    <TAXABILITY>{XmlEscape(taxability)}</TAXABILITY>");
                            }

                            gstXmlBuilder.AppendLine("                </GSTDETAILS.LIST>");
                        }
                        var signedLineAmount = isPurchaseLike ? -lineAmount : lineAmount;
                        var amountText = Math.Abs(signedLineAmount).ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);
                        var formattedAmountText = signedLineAmount < 0 ? $"-{amountText}" : amountText;

                        inventoryXml.AppendLine($@"
            <{inventoryListTag}>
                <STOCKITEMNAME>{XmlEscape(item.StockItemName)}</STOCKITEMNAME>
{gstXmlBuilder}
                <ACTUALQTY>{quantityText} {XmlEscape(unit)}</ACTUALQTY>
                <BILLEDQTY>{quantityText} {XmlEscape(unit)}</BILLEDQTY>
                <RATE>{rateText}/{XmlEscape(unit)}</RATE>
                <AMOUNT>{formattedAmountText}</AMOUNT>
                <ISDEEMEDPOSITIVE>{(signedLineAmount < 0 ? "Yes" : "No")}</ISDEEMEDPOSITIVE>
                <ISLASTDEEMEDPOSITIVE>{(signedLineAmount < 0 ? "Yes" : "No")}</ISLASTDEEMEDPOSITIVE>
                <ACCOUNTINGALLOCATIONS.LIST>
                    <LEDGERNAME>{XmlEscape(counterLedger)}</LEDGERNAME>
                    <ISDEEMEDPOSITIVE>{(signedLineAmount < 0 ? "Yes" : "No")}</ISDEEMEDPOSITIVE>
                    <ISLASTDEEMEDPOSITIVE>{(signedLineAmount < 0 ? "Yes" : "No")}</ISLASTDEEMEDPOSITIVE>
                    <AMOUNT>{formattedAmountText}</AMOUNT>
                </ACCOUNTINGALLOCATIONS.LIST>
            </{inventoryListTag}>");
                    }
                }

                var persistedView = "Accounting Voucher View";
                if (isSalesOrPurchaseInventoryType)
                {
                    persistedView = "Invoice Voucher View";
                }
                var isInvoiceValue = isSalesOrPurchaseInventoryType ? "Yes" : "No";
                var objViewXml = isSalesOrPurchaseInventoryType ? $"\r\n                        <OBJVIEW>{persistedView}</OBJVIEW>" : string.Empty;

                // Keep the import context within a single financial year. Tally can reject voucher imports
                // with a misleading date-missing error when request-level period variables span multiple FYs.
                var voucherFyStartYear = voucherDateValue.Month >= 4 ? voucherDateValue.Year : voucherDateValue.Year - 1;
                var derivedFyStart = new DateTime(voucherFyStartYear, 4, 1);
                var derivedFyEnd = new DateTime(voucherFyStartYear + 1, 3, 31);
                var hasCompanyFyForVoucher = companyFyStart.HasValue
                    && companyFyEnd.HasValue
                    && companyFyStart.Value.Year >= 1900
                    && companyFyEnd.Value.Year >= 1900
                    && voucherDateValue >= companyFyStart.Value.Date
                    && voucherDateValue <= companyFyEnd.Value.Date;

                var importFrom = hasCompanyFyForVoucher ? companyFyStart!.Value.Date : derivedFyStart;
                var importTo = hasCompanyFyForVoucher ? companyFyEnd!.Value.Date : derivedFyEnd;

                var booksStart = companyBooksStart?.Date;
                if (booksStart.HasValue
                    && booksStart.Value.Year >= 1900
                    && booksStart.Value <= voucherDateValue
                    && booksStart.Value > importFrom)
                {
                    importFrom = booksStart.Value;
                }

                if (importTo < voucherDateValue)
                {
                    importTo = voucherDateValue;
                }

                var currentContextDate = voucherDateValue;
                if (currentContextDate < importFrom)
                {
                    currentContextDate = importFrom;
                }
                else if (currentContextDate > importTo)
                {
                    currentContextDate = importTo;
                }

                if (companyFyStart.HasValue && companyFyEnd.HasValue
                    && companyFyStart.Value.Year >= 1900 && companyFyEnd.Value.Year >= 1900
                    && !hasCompanyFyForVoucher)
                {
                    SyncLogger.Log($"INFO: Company period metadata ({companyFyStart.Value:dd-MMM-yyyy} to {companyFyEnd.Value:dd-MMM-yyyy}) does not contain voucher date {voucherDateValue:dd-MMM-yyyy}. Using single-FY import period {importFrom:dd-MMM-yyyy} to {importTo:dd-MMM-yyyy} with current context {currentContextDate:dd-MMM-yyyy}.");
                }
                else
                {
                    SyncLogger.Log($"INFO: Using single-FY import period {importFrom:dd-MMM-yyyy} to {importTo:dd-MMM-yyyy} with current context {currentContextDate:dd-MMM-yyyy} for voucher date {voucherDateValue:dd-MMM-yyyy}.");
                }
                var request = $@"
<?xml version=""1.0"" encoding=""utf-8""?>
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
                    <SVFROMDATE>{importFrom:yyyyMMdd}</SVFROMDATE>
                    <SVTODATE>{importTo:yyyyMMdd}</SVTODATE>
                    <SVCURRENTDATE>{currentContextDate:yyyyMMdd}</SVCURRENTDATE>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF=""TallyUDF"">
                    <VOUCHER VCHTYPE=""{XmlEscape(normalizedVoucherType)}"" ACTION=""Create"">
                        <DATE>{voucherDateValue:yyyyMMdd}</DATE>
                        <VOUCHERDATE>{voucherDateValue:yyyyMMdd}</VOUCHERDATE>
                        <EFFECTIVEDATE>{voucherDateValue:yyyyMMdd}</EFFECTIVEDATE>
                        <VOUCHERTYPENAME>{XmlEscape(normalizedVoucherType)}</VOUCHERTYPENAME>
                        <PERSISTEDVIEW>{persistedView}</PERSISTEDVIEW>
{objViewXml}
                        <ISINVOICE>{isInvoiceValue}</ISINVOICE>
                        <PARTYLEDGERNAME>{XmlEscape(normalizedPartyLedger)}</PARTYLEDGERNAME>
                        <NARRATION>{XmlEscape(narration ?? "")}</NARRATION>
{ledgerEntriesXml}
{inventoryXml}
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>";

                SyncLogger.SaveFile("last_push_voucher_request.xml", request);
                var doc = await SendRequestAsync(request, companyName, 60);
                if (doc == null)
                {
                    return (false, null, "No response from Tally");
                }

                SyncLogger.SaveFile("last_push_voucher_response.xml", doc.ToString());
                var created = doc.Descendants("CREATED").FirstOrDefault()?.Value?.Trim();
                if (created == "1")
                {
                    var voucherNumber = doc.Descendants("VOUCHERNUMBER").FirstOrDefault()?.Value?.Trim();
                    SyncLogger.Log($"Voucher created in Tally: {voucherNumber ?? "Success"}");
                    return (true, voucherNumber, null);
                }

                var errorMsg = ExtractTallyImportError(doc);
                var failureContext = $"type={normalizedVoucherType}, party={normalizedPartyLedger}, amount={safeAmount:0.##}, date={voucherDateValue:yyyy-MM-dd}, ledgers={validLedgerEntries.Count}, inventory={inventoryCount}";

                if (hasInventory)
                {
                    SyncLogger.Log($"Inventory voucher rejected (type={normalizedVoucherType}, salesPurchase={isSalesOrPurchaseInventoryType}): {errorMsg}");
                }

                SyncLogger.Log($"Tally rejected voucher: {errorMsg}");
                SyncLogger.Log($"Tally rejection context: {failureContext}");
                SyncLogger.Log("Diagnostic files: Logs/last_push_voucher_request.xml, Logs/last_push_voucher_response.xml");
                return (false, null, errorMsg);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"PushVoucherToTallyAsync error: {ex.Message}");
                return (false, null, ex.Message);
            }
        }

        public async Task<(bool Success, string? Error)> CreateStockItemAsync(string companyName, VoucherInventoryEntry item)
        {
            try
            {
                if (item == null)
                {
                    return (false, "Stock item payload is missing");
                }

                var stockItemName = item.StockItemName?.Trim();
                if (string.IsNullOrWhiteSpace(stockItemName))
                {
                    return (false, "Stock item name is missing");
                }

                var baseUnitSource = item.Unit;
                var baseUnit = string.IsNullOrWhiteSpace(baseUnitSource) ? "Nos" : baseUnitSource.Trim();
                var stockGroup = "Primary";

                var hsnCode = string.IsNullOrWhiteSpace(item.HsnCode) ? null : item.HsnCode.Trim();
                var hsnXml = string.IsNullOrWhiteSpace(hsnCode)
                    ? string.Empty
                    : $"\r\n                        <HSNCODE>{XmlEscape(hsnCode)}</HSNCODE>";

                var request = $@"
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>All Masters</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>{XmlEscape(companyName)}</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF=""TallyUDF"">
                    <STOCKITEM NAME=""{XmlEscape(stockItemName)}"" ACTION=""Create"">
                        <NAME>{XmlEscape(stockItemName)}</NAME>
                        <PARENT>{XmlEscape(stockGroup)}</PARENT>
                        <BASEUNITS>{XmlEscape(baseUnit)}</BASEUNITS>{hsnXml}
                    </STOCKITEM>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>";

                SyncLogger.SaveFile("last_create_stock_request.xml", request);
                var doc = await SendRequestAsync(request, companyName, 60);
                if (doc == null)
                {
                    return (false, "No response from Tally while creating stock item");
                }

                SyncLogger.SaveFile("last_create_stock_response.xml", doc.ToString());

                var created = doc.Descendants("CREATED").FirstOrDefault()?.Value?.Trim() ?? "0";
                var altered = doc.Descendants("ALTERED").FirstOrDefault()?.Value?.Trim() ?? "0";
                if (created == "1" || altered == "1")
                {
                    SyncLogger.Log($"Stock item ensured in Tally: {stockItemName} (Created={created}, Altered={altered})");
                    return (true, null);
                }

                var error = ExtractTallyImportError(doc);
                SyncLogger.Log($"Stock item create failed for '{stockItemName}': {error}");
                SyncLogger.Log("Diagnostic files: Logs/last_create_stock_request.xml, Logs/last_create_stock_response.xml");
                return (false, error);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"CreateStockItemAsync error: {ex.Message}");
                return (false, ex.Message);
            }
        }
        private static string ExtractTallyImportError(XDocument doc)
        {
            var lineErrors = doc.Descendants("LINEERROR")
                .Select(x => x.Value?.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct()
                .ToList();

            if (lineErrors.Count > 0)
            {
                return string.Join(" | ", lineErrors);
            }

            var errorNodes = doc.Descendants("ERROR")
                .Select(x => x.Value?.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct()
                .ToList();

            if (errorNodes.Count > 0)
            {
                return string.Join(" | ", errorNodes);
            }

            var errorsValue = doc.Descendants("ERRORS").FirstOrDefault()?.Value?.Trim();
            if (!string.IsNullOrWhiteSpace(errorsValue) && errorsValue != "0")
            {
                return errorsValue;
            }

            var created = doc.Descendants("CREATED").FirstOrDefault()?.Value?.Trim() ?? "0";
            var altered = doc.Descendants("ALTERED").FirstOrDefault()?.Value?.Trim() ?? "0";
            var ignored = doc.Descendants("IGNORED").FirstOrDefault()?.Value?.Trim() ?? "0";
            var errors = errorsValue ?? "0";

            var importSummary = $"Tally import failed (Created={created}, Altered={altered}, Errors={errors}, Ignored={ignored})";
            var responseHints = BuildImportResponseSummary(doc);
            if (!string.IsNullOrWhiteSpace(responseHints))
            {
                importSummary += $" [{responseHints}]";
            }

            var exceptionsValue = doc.Descendants("EXCEPTIONS").FirstOrDefault()?.Value?.Trim() ?? "0";

            if (created == "0" && altered == "0" && errors == "0" && ignored == "0")
            {
                if (exceptionsValue != "0")
                {
                    importSummary += $". Tally raised {exceptionsValue} exception(s) without LINEERROR. Common causes: period restrictions, missing masters, or voucher type mismatch.";
                }
                else
                {
                    importSummary += ". No LINEERROR returned by Tally; check voucher balancing, missing masters (party/item/ledger), and voucher type configuration.";
                }
            }

            return importSummary;
        }

        private static string BuildImportResponseSummary(XDocument doc)
        {
            var hints = new List<string>();

            var status = doc.Descendants("STATUS").FirstOrDefault()?.Value?.Trim();
            if (!string.IsNullOrWhiteSpace(status))
            {
                hints.Add($"Status={status}");
            }

            var statusCode = doc.Descendants("STATUSCODE").FirstOrDefault()?.Value?.Trim();
            if (!string.IsNullOrWhiteSpace(statusCode))
            {
                hints.Add($"StatusCode={statusCode}");
            }

            var lastVoucher = doc.Descendants("VOUCHERNUMBER").FirstOrDefault()?.Value?.Trim();
            if (!string.IsNullOrWhiteSpace(lastVoucher))
            {
                hints.Add($"VoucherNo={lastVoucher}");
            }

            var lastVchId = doc.Descendants("LASTVCHID").FirstOrDefault()?.Value?.Trim();
            if (!string.IsNullOrWhiteSpace(lastVchId))
            {
                hints.Add($"LastVchId={lastVchId}");
            }

            var exceptions = doc.Descendants("EXCEPTIONS").FirstOrDefault()?.Value?.Trim();
            if (!string.IsNullOrWhiteSpace(exceptions))
            {
                hints.Add($"Exceptions={exceptions}");
            }

            return string.Join(", ", hints);
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
                Log($"Ã°Å¸â€œâ€¹ Fetched {groups.Count} Ledger Groups from {companyName}");
            }
            catch (Exception ex) { Log($"Ã¢ÂÅ’ GetLedgerGroupsAsync error: {ex.Message}"); }
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
                Log($"Ã°Å¸ÂÂ­ Fetched {items.Count} Cost Centres from {companyName}");
            }
            catch (Exception ex) { Log($"Ã¢ÂÅ’ GetCostCentresAsync error: {ex.Message}"); }
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
                Log($"Ã°Å¸â€œÂ¦ Fetched {items.Count} Godowns from {companyName}");
            }
            catch (Exception ex) { Log($"Ã¢ÂÅ’ GetGodownsAsync error: {ex.Message}"); }
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
                Log($"Ã°Å¸â€œÅ  Fetched {items.Count} Stock Groups from {companyName}");
            }
            catch (Exception ex) { Log($"Ã¢ÂÅ’ GetStockGroupsAsync error: {ex.Message}"); }
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
                Log($"Ã°Å¸â€œâ€š Fetched {items.Count} Stock Categories from {companyName}");
            }
            catch (Exception ex) { Log($"Ã¢ÂÅ’ GetStockCategoriesAsync error: {ex.Message}"); }
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
                Log($"Ã°Å¸â€™Â± Fetched {items.Count} Currencies from {companyName}");
            }
            catch (Exception ex) { Log($"Ã¢ÂÅ’ GetCurrenciesAsync error: {ex.Message}"); }
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
                Log($"Ã°Å¸â€œÂ Fetched {items.Count} Voucher Types from {companyName}");
            }
            catch (Exception ex) { Log($"Ã¢ÂÅ’ GetVoucherTypesAsync error: {ex.Message}"); }
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
                Log($"Ã°Å¸â€œÂ Fetched {items.Count} Units from {companyName}");
            }
            catch (Exception ex) { Log($"Ã¢ÂÅ’ GetUnitsAsync error: {ex.Message}"); }
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
                Log($"Ã°Å¸â€™Â° Fetched {items.Count} Budgets from {companyName}");
            }
            catch (Exception ex) { Log($"Ã¢ÂÅ’ GetBudgetsAsync error: {ex.Message}"); }
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
                 foreach (var el in doc.Descendants("PRICELEVEL"))
                {
                    // This is just the level name (e.g. "Retail", "Wholesale").
                    _ = GetAttribute(el, "NAME") ?? GetElementValue(el, "NAME");
                    // We can't get the items without a specific TDL report request.
                }
            }
            catch (Exception ex) { Log($"Ã¢ÂÅ’ GetPriceListsAsync error: {ex.Message}"); }
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

    public class TallyXmlSanitizingReader : TextReader
    {
        private readonly StreamReader _reader;
        private readonly Queue<char> _buffer = new Queue<char>();

        public TallyXmlSanitizingReader(Stream stream)
        {
            _reader = new StreamReader(stream, Encoding.UTF8);
        }

        public override int Read()
        {
            if (_buffer.Count > 0)
            {
                return _buffer.Dequeue();
            }

            int nextChar = _reader.Read();
            if (nextChar == -1)
            {
                return -1;
            }

            char c = (char)nextChar;

            // Handle UDF: replacement to UDF_
            // Look ahead for "UDF:" when we see c == '<' or ' '
            if (c == '<' || c == ' ')
            {
                // Peek up to 5 characters to check for "UDF:" or "/UDF:"
                List<char> peeked = new List<char>();
                for (int i = 0; i < 5; i++)
                {
                    int next = _reader.Read();
                    if (next == -1) break;
                    peeked.Add((char)next);
                }

                string peekStr = new string(peeked.ToArray());
                if (c == '<' && peekStr.StartsWith("UDF:"))
                {
                    _buffer.Enqueue('<');
                    _buffer.Enqueue('U');
                    _buffer.Enqueue('D');
                    _buffer.Enqueue('F');
                    _buffer.Enqueue('_');
                    for (int i = 4; i < peeked.Count; i++)
                    {
                        _buffer.Enqueue(peeked[i]);
                    }
                }
                else if (c == '<' && peekStr.StartsWith("/UDF:"))
                {
                    _buffer.Enqueue('<');
                    _buffer.Enqueue('/');
                    _buffer.Enqueue('U');
                    _buffer.Enqueue('D');
                    _buffer.Enqueue('F');
                    _buffer.Enqueue('_');
                    for (int i = 5; i < peeked.Count; i++)
                    {
                        _buffer.Enqueue(peeked[i]);
                    }
                }
                else if (c == ' ' && peekStr.StartsWith("UDF:"))
                {
                    _buffer.Enqueue(' ');
                    _buffer.Enqueue('U');
                    _buffer.Enqueue('D');
                    _buffer.Enqueue('F');
                    _buffer.Enqueue('_');
                    for (int i = 4; i < peeked.Count; i++)
                    {
                        _buffer.Enqueue(peeked[i]);
                    }
                }
                else
                {
                    _buffer.Enqueue(c);
                    foreach (var pc in peeked)
                    {
                        _buffer.Enqueue(pc);
                    }
                }
                return _buffer.Dequeue();
            }

            // Sanitization: Allow tab, LF, CR, and typical printable XML chars
            if (c == '\t' || c == '\n' || c == '\r' || (c >= ' ' && c <= 0xD7FF) || (c >= 0xE000 && c <= 0xFFFD))
            {
                return c;
            }

            // Skip invalid character by reading the next one
            return Read();
        }

        public override int Peek()
        {
            if (_buffer.Count > 0)
            {
                return _buffer.Peek();
            }

            int next = Read();
            if (next == -1)
            {
                return -1;
            }

            _buffer.Enqueue((char)next);
            return next;
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _reader.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
