using Microsoft.Web.WebView2.Wpf;
using System;
using System.Windows;

namespace TallySyncApp
{
    public partial class LicensePurchaseWindow : Window
    {
        private readonly string _purchaseUrl;

        public LicensePurchaseWindow(string purchaseUrl)
        {
            InitializeComponent();
            _purchaseUrl = purchaseUrl;

            InitializeWebView();
        }

        private async void InitializeWebView()
        {
            try
            {
                await WebView.EnsureCoreWebView2Async();

                WebView.CoreWebView2.Settings.IsScriptEnabled = true;
                WebView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                WebView.CoreWebView2.Settings.IsZoomControlEnabled = true;

                WebView.CoreWebView2.Navigate(_purchaseUrl);

                WebView.CoreWebView2.NavigationCompleted += (s, e) =>
                {
                    if (!e.IsSuccess)
                    {
                        // Navigation failed silently
                    }
                };
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to initialize browser: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                Close();
            }
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        protected override void OnClosed(EventArgs e)
        {
            WebView?.Dispose();
            base.OnClosed(e);
        }
    }
}