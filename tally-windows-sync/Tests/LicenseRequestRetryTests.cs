using System.Net;
using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class LicenseRequestRetryTests
{
    private static Task NoDelay(int attempt,CancellationToken ct)=>Task.CompletedTask;
    [Fact]
    public async Task TransientTransportFailureRecoversBeforeBlockingSync()
    {
        var attempts=0;
        using var response=await LicenseRequestRetry.SendAsync(_ => ++attempts<3
            ? Task.FromException<HttpResponseMessage>(new HttpRequestException("Temporary DNS failure"))
            : Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)),delay:NoDelay);
        Assert.Equal(3,attempts);Assert.Equal(HttpStatusCode.OK,response.StatusCode);
    }
    [Theory]
    [InlineData(HttpStatusCode.Unauthorized,1)]
    [InlineData(HttpStatusCode.Forbidden,1)]
    [InlineData(HttpStatusCode.ServiceUnavailable,3)]
    [InlineData(HttpStatusCode.TooManyRequests,3)]
    public async Task OnlyTransientStatusCodesAreRetried(HttpStatusCode status,int expected)
    {
        var attempts=0;
        using var response=await LicenseRequestRetry.SendAsync(_=>{attempts++;return Task.FromResult(new HttpResponseMessage(status));},delay:NoDelay);
        Assert.Equal(expected,attempts);
    }
    [Fact]
    public async Task ExhaustedRetriesPropagateErrorAndUserCancellationNeverRetries()
    {
        var attempts=0;
        await Assert.ThrowsAsync<HttpRequestException>(()=>LicenseRequestRetry.SendAsync(_=>{attempts++;throw new HttpRequestException("Disconnected");},delay:NoDelay));
        Assert.Equal(3,attempts);
        using var cts=new CancellationTokenSource();cts.Cancel();attempts=0;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>LicenseRequestRetry.SendAsync(_=>{attempts++;throw new Exception();},cts.Token,NoDelay));
        Assert.Equal(0,attempts);
    }
}
