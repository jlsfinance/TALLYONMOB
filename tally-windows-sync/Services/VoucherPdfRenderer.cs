using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Renders one voucher as a PDF through the WebView2 runtime the app already ships.
    /// The caller owns the returned temp file and must delete it.
    /// </summary>
    internal static class VoucherPdfRenderer
    {
        internal static async Task<string> RenderAsync(Company company, Voucher voucher, CancellationToken ct)
        {
            string path = Path.Combine(Path.GetTempPath(), $"syncora-voucher-{Guid.NewGuid():N}.pdf");
            string html = VoucherPdfHtml.Build(company, voucher);

            await Application.Current.Dispatcher.InvokeAsync(async () =>
            {
                var window = new Window
                {
                    Width = 800,
                    Height = 1120,
                    WindowStyle = WindowStyle.None,
                    ShowInTaskbar = false,
                    ShowActivated = false,
                    Left = -30000,
                    Top = -30000,
                };
                var webView = new WebView2();
                window.Content = webView;

                try
                {
                    window.Show();
                    await webView.EnsureCoreWebView2Async();
                    ct.ThrowIfCancellationRequested();

                    var loaded = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                    void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
                    {
                        webView.CoreWebView2.NavigationCompleted -= OnNavigationCompleted;
                        if (e.IsSuccess) loaded.TrySetResult(true);
                        else loaded.TrySetException(new InvalidOperationException($"Voucher HTML failed to load ({e.WebErrorStatus})"));
                    }

                    webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
                    webView.NavigateToString(html);
                    await loaded.Task;
                    await webView.CoreWebView2.PrintToPdfAsync(path, null);
                }
                finally
                {
                    window.Close();
                }
            }).Task.Unwrap();

            return path;
        }
    }
}
