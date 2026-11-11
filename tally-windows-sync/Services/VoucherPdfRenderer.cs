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
            string pdfPath = Path.Combine(Path.GetTempPath(), $"syncora-voucher-{Guid.NewGuid():N}.pdf");
            string htmlPath = Path.Combine(Path.GetTempPath(), $"syncora-voucher-{Guid.NewGuid():N}.html");
            await File.WriteAllTextAsync(htmlPath, VoucherPdfHtml.Build(company, voucher), ct);

            try
            {
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

                        // PrintToPdf needs a laid-out page, and the navigation status of a
                        // locally loaded page reports ConnectionAborted even when it rendered.
                        // So wait for the document itself instead of trusting that event.
                        webView.CoreWebView2.Navigate(new Uri(htmlPath).AbsoluteUri);
                        if (!await WaitForDocumentAsync(webView.CoreWebView2, ct))
                            throw new InvalidOperationException("Voucher page did not finish loading");

                        var print = webView.CoreWebView2.Environment.CreatePrintSettings();
                        print.PageWidth = 8.27;   // A4
                        print.PageHeight = 11.69;
                        print.MarginTop = 0.35;
                        print.MarginBottom = 0.35;
                        print.MarginLeft = 0.3;
                        print.MarginRight = 0.3;
                        print.ShouldPrintBackgrounds = true;
                        await webView.CoreWebView2.PrintToPdfAsync(pdfPath, print);
                    }
                    finally
                    {
                        window.Close();
                    }
                }).Task.Unwrap();
            }
            finally
            {
                try { File.Delete(htmlPath); } catch { /* temp file */ }
            }

            return pdfPath;
        }

        private static async Task<bool> WaitForDocumentAsync(CoreWebView2 core, CancellationToken ct)
        {
            for (int attempt = 0; attempt < 100; attempt++)
            {
                ct.ThrowIfCancellationRequested();
                await Task.Delay(100, ct);
                var state = await core.ExecuteScriptAsync(
                    "document.readyState === 'complete' && !!document.querySelector('[data-syncora-voucher]') ? 'ready' : 'wait'");
                if (state?.Trim('"') == "ready") return true;
            }
            return false;
        }
    }
}
