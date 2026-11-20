using System.Net;
using System.Xml.Linq;
using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class SyncCancellationTests
{
    private sealed class FakeTallyHandler(Func<CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        public int Requests { get; private set; }
        public int MetadataRequests { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var xml = XDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            if (xml.Descendants("ID").FirstOrDefault()?.Value == "SyncoraHistoryCompany")
            {
                MetadataRequests++;
                var company = xml.Descendants("SVCURRENTCOMPANY").Single().Value;
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(
                    new XElement("ENVELOPE", new XElement("COMPANY", new XAttribute("NAME", company),
                        new XElement("STARTINGFROM", "20240401"))).ToString()) };
            }
            Requests++;
            return await send(cancellationToken);
        }
    }

    private static HttpResponseMessage IndexResponse() => new(HttpStatusCode.OK)
    { Content = new StringContent("<ENVELOPE><VOUCHER><ALTERID>101217</ALTERID></VOUCHER></ENVELOPE>") };

    [Fact]
    public async Task ManualRetryAfterStopGetsFreshTokenAndCanReadTallyIndex()
    {
        var stopped = new CancellationTokenSource();
        var stoppedToken = stopped.Token;
        stopped.Cancel();
        using var retry = SyncRunCancellation.Prepare(stopped, isManual: true)!;
        Assert.NotSame(stopped, retry);
        Assert.True(stoppedToken.IsCancellationRequested);
        Assert.False(retry.IsCancellationRequested);
        var handler = new FakeTallyHandler(_ => Task.FromResult(IndexResponse()));
        using var extractor = new TallyFastExtractor(handler: handler);
        Assert.Equal(new long[] { 101217 }, await extractor.GetModifiedVoucherAlterIdsAsync("Test1.2", 101216, retry.Token));
        Assert.Equal(1, handler.Requests);
        Assert.Equal(1, handler.MetadataRequests);
    }

    [Fact]
    public void StoppedBackgroundCallbackCannotStartAnotherRun()
    {
        using var stopped = new CancellationTokenSource();
        stopped.Cancel();
        Assert.Null(SyncRunCancellation.Prepare(stopped, isManual: false));
    }

    [Fact]
    public void ActiveSessionKeepsItsTokenSoStopCanCancelTheRunningRequest()
    {
        using var active = new CancellationTokenSource();
        Assert.Same(active, SyncRunCancellation.Prepare(active, isManual: true));
        Assert.Same(active, SyncRunCancellation.Prepare(active, isManual: false));
    }

    [Fact]
    public void FirstManualRunGetsAnActiveCancellationSource()
    {
        using var source = SyncRunCancellation.Prepare(null, isManual: true)!;
        Assert.False(source.IsCancellationRequested);
    }

    [Fact]
    public async Task AlreadyCancelledRequestNeverReachesTally()
    {
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        var handler = new FakeTallyHandler(_ => Task.FromResult(IndexResponse()));
        using var extractor = new TallyFastExtractor(handler: handler);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => extractor.GetModifiedVoucherAlterIdsAsync("Test", 100, cancelled.Token));
        Assert.Equal(0, handler.Requests);
        Assert.Equal(0, handler.MetadataRequests);
    }

    [Fact]
    public async Task StopDuringHttpRequestPropagatesCancellationInsteadOfNoAnswerError()
    {
        using var stop = new CancellationTokenSource();
        var requestStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var handler = new FakeTallyHandler(async token =>
        {
            requestStarted.SetResult();
            await Task.Delay(Timeout.Infinite, token);
            return IndexResponse();
        });
        using var extractor = new TallyFastExtractor(handler: handler);
        var request = extractor.GetModifiedVoucherAlterIdsAsync("Test", 100, stop.Token);
        await requestStarted.Task;
        stop.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);
    }

    [Fact]
    public async Task TimeoutWithoutUserStopRemainsARealFailure()
    {
        var handler = new FakeTallyHandler(_ => throw new TaskCanceledException("Simulated HTTP timeout"));
        using var extractor = new TallyFastExtractor(handler: handler);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => extractor.GetModifiedVoucherAlterIdsAsync("Test", 100));
        Assert.Contains("Tally did not answer", error.Message);
    }

    [Fact]
    public async Task HttpFailureWithoutStopRemainsARealFailure()
    {
        var handler = new FakeTallyHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)));
        using var extractor = new TallyFastExtractor(handler: handler);
        await Assert.ThrowsAsync<InvalidOperationException>(() => extractor.GetModifiedVoucherAlterIdsAsync("Test", 100));
    }

    [Fact]
    public async Task EmptyValidIndexMeansNoChangesRatherThanCancellation()
    {
        var handler = new FakeTallyHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        { Content = new StringContent("<ENVELOPE><COLLECTION /></ENVELOPE>") }));
        using var extractor = new TallyFastExtractor(handler: handler);
        Assert.Empty(await extractor.GetModifiedVoucherAlterIdsAsync("Test", 100));
    }

    [Fact]
    public async Task FastExtractorTracksAndResetsTransportFailures()
    {
        int attempt = 0;
        var handler = new FakeTallyHandler(_ =>
        {
            attempt++;
            return attempt switch
            {
                1 => throw new TaskCanceledException("Simulated HTTP timeout"),
                2 => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)),
                _ => Task.FromResult(IndexResponse())
            };
        });
        using var extractor = new TallyFastExtractor(handler: handler);

        await Assert.ThrowsAsync<InvalidOperationException>(() => extractor.GetModifiedVoucherAlterIdsAsync("Test", 100));
        Assert.Equal(1, extractor.ConsecutiveFailures);
        Assert.Contains("Simulated HTTP timeout", extractor.LastTransportError);

        await Assert.ThrowsAsync<InvalidOperationException>(() => extractor.GetModifiedVoucherAlterIdsAsync("Test", 100));
        Assert.Equal(2, extractor.ConsecutiveFailures);
        Assert.Equal("HTTP 503", extractor.LastTransportError);

        var ids = await extractor.GetModifiedVoucherAlterIdsAsync("Test", 100);
        Assert.Equal(new long[] { 101217 }, ids);
        Assert.Equal(0, extractor.ConsecutiveFailures);
        Assert.Null(extractor.LastTransportError);
    }
}
