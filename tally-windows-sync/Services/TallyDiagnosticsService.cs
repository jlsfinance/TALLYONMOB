using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace TallySyncApp.Services
{
    public sealed record TallyCompanyDiagnostic(string Name, string? Guid, bool IsSelected);

    public sealed class TallyDiagnosticsResult
    {
        public bool Reachable { get; init; }
        public int Port { get; init; }
        public string Endpoint { get; init; } = string.Empty;
        public string? Version { get; init; }
        public string? Error { get; init; }
        public IReadOnlyList<TallyCompanyDiagnostic> Companies { get; init; } = Array.Empty<TallyCompanyDiagnostic>();
        public DateTime CheckedAtUtc { get; init; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Fast, read-only diagnostics used by the Windows retry/error panel.
    /// It deliberately probes only localhost and never mutates Tally data.
    /// </summary>
    public sealed class TallyDiagnosticsService
    {
        private static readonly int[] DefaultPorts = { 9000, 9001, 9002 };
        private readonly HttpClient _httpClient;

        public TallyDiagnosticsService(HttpClient? httpClient = null)
        {
            _httpClient = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        }

        public async Task<TallyDiagnosticsResult> RunAsync(string host = "127.0.0.1", int preferredPort = 9000, CancellationToken cancellationToken = default)
        {
            var ports = new List<int> { preferredPort };
            foreach (var port in DefaultPorts) if (!ports.Contains(port)) ports.Add(port);
            string? lastError = null;
            foreach (var port in ports)
            {
                var endpoint = $"http://{host}:{port}";
                try
                {
                    var summary = await PostAsync(endpoint, SummaryRequest, cancellationToken);
                    if (summary == null) continue;
                    var companies = await LoadCompaniesAsync(endpoint, cancellationToken);
                    return new TallyDiagnosticsResult
                    {
                        Reachable = true,
                        Port = port,
                        Endpoint = endpoint,
                        Version = FindValue(summary, "VERSION") ?? FindValue(summary, "RELEASE") ,
                        Companies = companies,
                    };
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { lastError = "Tally connection timed out"; }
                catch (Exception ex) { lastError = ex.Message; }
            }
            return new TallyDiagnosticsResult
            {
                Reachable = false,
                Port = preferredPort,
                Endpoint = $"http://{host}:{preferredPort}",
                Error = lastError ?? "Tally is not responding on the configured ports."
            };
        }

        private async Task<XDocument?> PostAsync(string endpoint, string request, CancellationToken cancellationToken)
        {
            using var content = new StringContent(request, Encoding.UTF8, "text/xml");
            using var response = await _httpClient.PostAsync(endpoint, content, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            var xml = await response.Content.ReadAsStringAsync(cancellationToken);
            return XDocument.Parse(xml, LoadOptions.PreserveWhitespace);
        }

        private async Task<IReadOnlyList<TallyCompanyDiagnostic>> LoadCompaniesAsync(string endpoint, CancellationToken cancellationToken)
        {
            var document = await PostAsync(endpoint, CompaniesRequest, cancellationToken);
            if (document?.Root == null) return Array.Empty<TallyCompanyDiagnostic>();
            var result = new List<TallyCompanyDiagnostic>();
            foreach (var element in document.Descendants())
            {
                if (!string.Equals(element.Name.LocalName, "COMPANY", StringComparison.OrdinalIgnoreCase)) continue;
                var name = element.Value.Trim();
                if (string.IsNullOrWhiteSpace(name)) continue;
                result.Add(new TallyCompanyDiagnostic(
                    name,
                    element.Attribute("GUID")?.Value,
                    string.Equals(element.Attribute("SELECTED")?.Value, "Yes", StringComparison.OrdinalIgnoreCase)));
            }
            return result;
        }

        private static string? FindValue(XDocument document, string localName)
            => document.Descendants().FirstOrDefault(x => string.Equals(x.Name.LocalName, localName, StringComparison.OrdinalIgnoreCase))?.Value?.Trim();

        private const string SummaryRequest = "<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Summary</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";
        private const string CompaniesRequest = "<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";
    }
}
