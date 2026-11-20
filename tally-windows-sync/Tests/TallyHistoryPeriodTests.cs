using System.Net;
using System.Xml.Linq;
using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class TallyHistoryPeriodTests
{
    private static string Request(string company = "Books & Co", string from = "19000101")
    {
        var variables = new XElement("STATICVARIABLES", new XElement("SVCURRENTCOMPANY", company),
            new XElement("SVFROMDATE", from), new XElement("SVTODATE", "20261115"));
        var collection = new XElement("COLLECTION", new XAttribute("NAME", "History"), new XElement("FETCH", "GUID,ALTERID,DATE"));
        return new XDocument(new XElement("ENVELOPE", new XElement("BODY", new XElement("DESC", variables,
            new XElement("TDL", new XElement("TDLMESSAGE", collection)))))).ToString();
    }

    private sealed class MetadataHandler : HttpMessageHandler
    {
        public int Calls;
        public bool MissingDates;
        public bool WrongCompany;
        public string LastRequest = "";
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            LastRequest = await request.Content!.ReadAsStringAsync(ct);
            var company = XDocument.Parse(LastRequest).Descendants("SVCURRENTCOMPANY").Single().Value;
            var data = new XElement("ENVELOPE", new XElement("COLLECTION", new XElement("COMPANY",
                new XAttribute("NAME", WrongCompany ? "Other company" : company),
                MissingDates ? null : new XElement("STARTINGFROM", "20260401"),
                MissingDates ? null : new XElement("BOOKSFROM", "20240401"))));
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(data.ToString()) };
        }
    }

    [Fact]
    public async Task FullHistoryStartsAtEarliestCompanyBooksDateAndIncludesFutureVouchers()
    {
        var handler = new MetadataHandler();
        using var client = new HttpClient(handler);
        var output = XDocument.Parse(await new TallyHistoryPeriod().PrepareAsync(Request(), client, "http://tally", default));
        var from = output.Descendants("SVFROMDATE").Single();
        var to = output.Descendants("SVTODATE").Single();
        Assert.Equal("20240401", from.Value);
        Assert.Equal("Date", from.Attribute("TYPE")!.Value);
        Assert.Equal("20991231", to.Value);
        Assert.Equal("Date", to.Attribute("TYPE")!.Value);
        Assert.Equal("GUID,ALTERID,DATE", output.Descendants("FETCH").Single().Value);
        Assert.Equal("Books & Co", XDocument.Parse(handler.LastRequest).Descendants("SVCURRENTCOMPANY").Single().Value);
    }

    [Fact]
    public async Task ExplicitReportPeriodIsNotExpandedOrQueried()
    {
        var handler = new MetadataHandler();
        using var client = new HttpClient(handler);
        var request = Request(from: "20261001");
        Assert.Equal(request, await new TallyHistoryPeriod().PrepareAsync(request, client, "http://tally", default));
        Assert.Equal(0, handler.Calls);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task MissingOrWrongCompanyMetadataBlocksHistoryInsteadOfUsingCurrentUiPeriod(bool missing, bool wrong)
    {
        var handler = new MetadataHandler { MissingDates = missing, WrongCompany = wrong };
        using var client = new HttpClient(handler);
        await Assert.ThrowsAsync<InvalidOperationException>(() => new TallyHistoryPeriod().PrepareAsync(Request(), client, "http://tally", default));
        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task MetadataCacheIsScopedToCompany()
    {
        var handler = new MetadataHandler();
        using var client = new HttpClient(handler);
        var period = new TallyHistoryPeriod();
        await period.PrepareAsync(Request("Company A"), client, "http://tally", default);
        await period.PrepareAsync(Request("Company A"), client, "http://tally", default);
        Assert.Equal(1, handler.Calls);
        await period.PrepareAsync(Request("Company B"), client, "http://tally", default);
        Assert.Equal(2, handler.Calls);
    }

    private sealed class PeriodSensitiveHandler : HttpMessageHandler
    {
        public string? ExportFrom;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var xml = XDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            string body;
            if (xml.Descendants("ID").FirstOrDefault()?.Value == "SyncoraHistoryCompany")
                body = "<ENVELOPE><COLLECTION><COMPANY NAME=\"History Co\"><STARTINGFROM>20240401</STARTINGFROM></COMPANY></COLLECTION></ENVELOPE>";
            else
            {
                ExportFrom = xml.Descendants("SVFROMDATE").Single().Value;
                // Models Tally silently returning only the active FY for the invalid 1900 start.
                body = ExportFrom == "20240401"
                    ? "<ENVELOPE><COLLECTION><VOUCHER><ALTERID>1001</ALTERID><DATE>20240401</DATE></VOUCHER></COLLECTION></ENVELOPE>"
                    : "<ENVELOPE><COLLECTION /></ENVELOPE>";
            }
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) };
        }
    }

    [Fact]
    public async Task IncrementalExportFindsEditsToPriorYearVouchersDespiteCurrentUiPeriod()
    {
        var handler = new PeriodSensitiveHandler();
        using var extractor = new TallyFastExtractor("http://tally", handler: handler);
        var ids = await extractor.GetModifiedVoucherAlterIdsAsync("History Co", 1000);
        Assert.Equal(new long[] { 1001 }, ids);
        Assert.Equal("20240401", handler.ExportFrom);
    }

    private sealed class EmptyAttrCompanyHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var data = new XElement("ENVELOPE", new XElement("COLLECTION", new XElement("COMPANY",
                new XAttribute("NAME", ""),
                new XElement("NAME", "  Books & Co  "),
                new XElement("STARTINGFROM", "20260401"),
                new XElement("BOOKSFROM", "20230401"))));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(data.ToString()) });
        }
    }

    [Fact]
    public async Task EmptyNameAttributeFallsBackToTrimmedNameElement()
    {
        using var client = new HttpClient(new EmptyAttrCompanyHandler());
        var output = XDocument.Parse(await new TallyHistoryPeriod().PrepareAsync(Request("Books & Co"), client, "http://tally", default));
        Assert.Equal("20230401", output.Descendants("SVFROMDATE").Single().Value);
        Assert.Equal("20991231", output.Descendants("SVTODATE").Single().Value);
    }

    [Fact]
    public async Task UnavailableBooksStartDatePropagatesDirectlyInsteadOfNoAnswer()
    {
        var handler = new MetadataHandler { MissingDates = true };
        using var extractor = new TallyFastExtractor("http://tally", handler: handler);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            extractor.GetModifiedVoucherAlterIdsAsync("Books & Co", 100));
        Assert.Contains("Books start date unavailable", error.Message);
        Assert.DoesNotContain("Tally did not answer", error.Message);
        Assert.Equal(error.Message, extractor.LastTransportError);
    }
}
