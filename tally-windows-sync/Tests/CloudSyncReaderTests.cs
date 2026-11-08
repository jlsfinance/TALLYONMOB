using System.Net;
using System.Net.Http.Headers;
using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class CloudSyncReaderTests
{
    private const string Owner = "9c198011-a538-4ef1-91d1-ba29e20bf585";
    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(respond(request));
    }
    private static HttpResponseMessage Json(string json) => new(HttpStatusCode.OK) { Content = new StringContent(json) };

    [Fact]
    public async Task CountsAreOwnerScopedAndOlderSuccessSurvivesRecentFailures()
    {
        using var client = new HttpClient(new Handler(request =>
        {
            var url = Uri.UnescapeDataString(request.RequestUri!.AbsoluteUri);
            if (url.Contains("/companies?"))
            {
                Assert.Contains("owner_id=eq." + Owner, url);
                return Json("[{\"id\":\"company-a\",\"name\":\"Test company\"}]");
            }
            Assert.Contains("company_id=in.(\"company-a\")", url);
            if (request.Method == HttpMethod.Head)
            {
                Assert.Contains("count=exact", request.Headers.GetValues("Prefer"));
                var count = url.Contains("/vouchers?") ? 3000000000L : url.Contains("/ledgers?") ? 11 : 7;
                if (url.Contains("/vouchers?")) Assert.Contains("is_deleted=not.is.true", url);
                var response = Json("");
                response.Content.Headers.TryAddWithoutValidation("Content-Range", $"0-0/{count}");
                return response;
            }
            return url.Contains("status=in.")
                ? Json("[{\"status\":\"completed\",\"completed_at\":\"2026-10-01T12:00:00Z\"}]")
                : Json("[{\"company_id\":\"company-a\",\"status\":\"failed\",\"started_at\":\"2026-11-08T10:00:00Z\",\"vouchers_synced\":42,\"error_message\":\"timeout\"}]");
        }));
        var result = await new CloudSyncReader(client, "https://example.test", Owner).ReadAsync(default);
        Assert.Equal(3000000018L, result.RecordsSynced);
        Assert.Equal(DateTimeOffset.Parse("2026-10-01T12:00:00Z"), result.LastSuccessfulSync);
        var row = Assert.Single(result.History);
        Assert.Equal("Test company", row.CompanyName);
        Assert.Equal(42, row.RecordsSynced);
        Assert.Equal("timeout", row.Error);
    }

    [Fact]
    public async Task NoCompaniesNeverIssuesUnscopedReads()
    {
        var calls = 0;
        using var client = new HttpClient(new Handler(request =>
        {
            calls++;
            Assert.Contains("/companies?", request.RequestUri!.AbsoluteUri);
            return Json("[]");
        }));
        var result = await new CloudSyncReader(client, "https://example.test", Owner).ReadAsync(default);
        Assert.Equal(1, calls);
        Assert.Equal(0, result.RecordsSynced);
        Assert.Null(result.LastSuccessfulSync);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task CloudErrorsNeverBecomeSuccessfulZeroCounts(bool forbidden)
    {
        using var client = new HttpClient(new Handler(request =>
        {
            if (forbidden) return new HttpResponseMessage(HttpStatusCode.Forbidden);
            if (request.RequestUri!.AbsolutePath.EndsWith("companies")) return Json("[{\"id\":\"a\"}]");
            return Json("[]"); // Deliberately missing exact count header.
        }));
        if (forbidden) await Assert.ThrowsAsync<HttpRequestException>(() => new CloudSyncReader(client, "https://example.test", Owner).ReadAsync(default));
        else await Assert.ThrowsAsync<InvalidOperationException>(() => new CloudSyncReader(client, "https://example.test", Owner).ReadAsync(default));
    }

    [Fact]
    public async Task EmptySuccessfulHistoryReturnsNoLastSync()
    {
        using var client = new HttpClient(new Handler(request =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("companies")) return Json("[{\"id\":\"a\"}]");
            var response = Json("[]");
            if (request.Method == HttpMethod.Head) response.Content.Headers.ContentRange = new ContentRangeHeaderValue(0);
            return response;
        }));
        Assert.Null((await new CloudSyncReader(client, "https://example.test", Owner).ReadAsync(default)).LastSuccessfulSync);
    }

    [Theory]
    [InlineData("https://tallyonmobile.com/buy-licence")]
    [InlineData("http://wrong.test/pricing")]
    [InlineData("javascript:alert(1)")]
    [InlineData(null)]
    public void InvalidOrOldPurchaseLinksUseProjectSubscription(string? configured)
        => Assert.Equal(LicencePurchaseLink.ProjectSubscriptionUrl, LicencePurchaseLink.Resolve(configured, false));

    [Fact]
    public void DebugOpensLocalProjectAndReleaseNormalizesConfiguredProjectRoute()
    {
        Assert.Equal(LicencePurchaseLink.LocalSubscriptionUrl, LicencePurchaseLink.Resolve("https://old.test/buy", true));
        Assert.Equal("https://project.test/subscription", LicencePurchaseLink.Resolve("https://project.test/pricing?email=old#pay", false));
    }
}
