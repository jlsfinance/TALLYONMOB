using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;

namespace TallySyncApp.Services
{
    /// <summary>
    /// A from-date before the company's books can silently leave Tally's current
    /// UI period in effect. Resolve the actual books start before history exports.
    /// Explicitly bounded report requests retain their requested period.
    /// </summary>
    public sealed class TallyHistoryPeriod
    {
        private readonly SemaphoreSlim _gate = new(1, 1);
        private readonly Dictionary<string, (DateTime Start, DateTime Expires)> _starts = new(StringComparer.OrdinalIgnoreCase);

        public async Task<string> PrepareAsync(string requestXml, HttpClient client, string tallyUrl, CancellationToken ct)
        {
            if (!requestXml.Contains("19000101", StringComparison.Ordinal)) return requestXml;
            var request = XDocument.Parse(requestXml);
            var variables = request.Descendants("STATICVARIABLES").SingleOrDefault();
            var from = variables?.Element("SVFROMDATE");
            if (from?.Value.Trim() != "19000101") return requestXml;

            var company = variables!.Element("SVCURRENTCOMPANY")?.Value.Trim();
            if (string.IsNullOrWhiteSpace(company))
                throw new InvalidOperationException("Full-history export requires an explicit Tally company.");

            DateTime start;
            await _gate.WaitAsync(ct);
            try
            {
                if (_starts.TryGetValue(company, out var cached) && cached.Expires > DateTime.UtcNow)
                    start = cached.Start;
                else
                {
                    var collection = new XElement("COLLECTION", new XAttribute("NAME", "SyncoraHistoryCompany"),
                        new XAttribute("ISMODIFY", "No"), new XElement("TYPE", "Company"),
                        new XElement("FETCH", "NAME,STARTINGFROM,BOOKSFROM"));
                    var description = new XElement("DESC",
                        new XElement("STATICVARIABLES", new XElement("SVEXPORTFORMAT", "$$SysName:XML"),
                            new XElement("SVCURRENTCOMPANY", company)),
                        new XElement("TDL", new XElement("TDLMESSAGE", collection)));
                    var metadataRequest = new XDocument(new XElement("ENVELOPE",
                        new XElement("HEADER", new XElement("VERSION", "1"), new XElement("TALLYREQUEST", "Export"),
                            new XElement("TYPE", "Collection"), new XElement("ID", "SyncoraHistoryCompany")),
                        new XElement("BODY", description)));
                    using var content = new StringContent(metadataRequest.ToString(), Encoding.UTF8, "text/xml");
                    using var response = await client.PostAsync(tallyUrl, content, ct);
                    response.EnsureSuccessStatusCode();
                    var raw = await response.Content.ReadAsStringAsync(ct);
                    raw = raw.Replace("<UDF:", "<UDF_").Replace("</UDF:", "</UDF_");
                    using var text = new StringReader(raw);
                    using var reader = XmlReader.Create(text, new XmlReaderSettings { CheckCharacters = false, DtdProcessing = DtdProcessing.Prohibit });
                    var metadata = XDocument.Load(reader);
                    var matching = metadata.Descendants("COMPANY").Where(c => string.Equals(
                        c.Attribute("NAME")?.Value ?? c.Element("NAME")?.Value, company, StringComparison.OrdinalIgnoreCase)).ToList();
                    var dates = matching.SelectMany(c => new[] { c.Element("STARTINGFROM")?.Value, c.Element("BOOKSFROM")?.Value })
                        .Select(value => DateTime.TryParseExact(value?.Trim(), "yyyyMMdd", CultureInfo.InvariantCulture,
                            DateTimeStyles.None, out var date) ? (DateTime?)date : null)
                        .Where(date => date.HasValue && date.Value.Year > 1900).Select(date => date!.Value).ToList();
                    if (matching.Count != 1 || dates.Count == 0)
                        throw new InvalidOperationException($"Books start date unavailable for '{company}'; full-history export blocked.");
                    start = dates.Min();
                    _starts[company] = (start, DateTime.UtcNow.AddMinutes(1));
                }
            }
            finally { _gate.Release(); }

            from!.Value = start.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
            from.SetAttributeValue("TYPE", "Date");
            // Future-dated vouchers are genuine records too; retain them in the
            // identity index and in the independent ALTERID/batch exports alike.
            var to = variables.Element("SVTODATE");
            if (to == null) { to = new XElement("SVTODATE"); variables.Add(to); }
            to.Value = "20991231";
            to.SetAttributeValue("TYPE", "Date");
            return request.ToString(SaveOptions.DisableFormatting);
        }
    }
}
