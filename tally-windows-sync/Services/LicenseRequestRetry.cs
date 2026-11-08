using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace TallySyncApp.Services;

public static class LicenseRequestRetry
{
    public static async Task<HttpResponseMessage> SendAsync(Func<CancellationToken, Task<HttpResponseMessage>> send,
        CancellationToken cancellationToken = default, Func<int, CancellationToken, Task>? delay = null)
    {
        delay ??= (attempt, ct) => Task.Delay(500 * (attempt + 1), ct);
        for (var attempt = 0; ; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            try
            {
                var response = await send(timeout.Token);
                var transient = (int)response.StatusCode >= 500 || response.StatusCode == HttpStatusCode.RequestTimeout || (int)response.StatusCode == 429;
                if (!transient || attempt == 2) return response;
                response.Dispose();
            }
            catch (HttpRequestException) when (attempt < 2) { }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested && attempt < 2) { }
            await delay(attempt, cancellationToken);
        }
    }
}
