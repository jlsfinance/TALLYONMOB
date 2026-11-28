using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;
using TallySyncApp.Services;
using TallySyncApp.ViewModels;

namespace TallySyncApp
{
    public partial class MainWindow : Window
    {
        private bool _webViewInitialized;
        private DispatcherTimer? _whatsAppQrTimer;
        private string? _dismissedDownloadingVersion;
        private string? _dismissedReadyVersion;

        public MainWindow()
        {
            InitializeComponent();
            GitHubAutoUpdater.StatusChanged += OnAutoUpdaterStatusChanged;
            Closed += (_, _) =>
            {
                GitHubAutoUpdater.StatusChanged -= OnAutoUpdaterStatusChanged;
                StopWhatsAppQrTimer();
                try
                {
                    if (_webViewInitialized) WhatsAppQrWebView.Dispose();
                }
                catch { }
                (DataContext as MainViewModel)?.Dispose();
            };
#if DEBUG
            Title = "SYNCORA Connector (Debug)";
#endif

            // Sidebar version label reads the real assembly version (no hardcode)
            SidebarVersionText.Text = "v" + (System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "?");

            // Set user email in data context
            if (App.AuthService?.CurrentSession != null)
            {
                var vm = DataContext as ViewModels.MainViewModel;
                if (vm != null)
                {
                    vm.UserEmail = App.AuthService.CurrentSession.Email;
                }
            }

            // Set icon text for nav buttons (since can't use x:Key from resources in triggers)
            Loaded += (s, e) =>
            {
                SetNavIcon(NavDashboard, "\uE80F");
                SetNavIcon(NavSyncStatus, "\uE895");
                SetNavIcon(NavSettings, "\uE713");
                SetNavIcon(NavHistory, "\uE81C");

                // Default to dashboard
                PageTitle.Text = "Dashboard";
                ApplyUpdateStatusToUi(GitHubAutoUpdater.CurrentStatus);
                _ = InitializeWhatsAppOnStartupAsync();
            };
        }

        private void SetNavIcon(System.Windows.Controls.RadioButton btn, string icon)
        {
            // Find the IconText TextBlock within the template
            var iconText = btn.Template?.FindName("IconText", btn) as System.Windows.Controls.TextBlock;
            if (iconText != null)
                iconText.Text = icon;
        }

        private void NavButton_Checked(object sender, RoutedEventArgs e)
        {
            if (!(sender is System.Windows.Controls.RadioButton btn)) return;

            // The XAML sets IsChecked="True" on the nav buttons while the window is still being
            // built, so the panels (declared later in the XAML) do not exist yet -> skip that first
            // event, the XAML already defines the initial panel visibility.
            if (DashboardPanel is null) return;

            // Hide all panels
            DashboardPanel.Visibility = Visibility.Collapsed;
            SyncStatusPanel.Visibility = Visibility.Collapsed;
            SettingsPanel.Visibility = Visibility.Collapsed;
            WhatsAppQrPanel.Visibility = Visibility.Collapsed;
            HistoryPanel.Visibility = Visibility.Collapsed;
            LicenseHistoryPanel.Visibility = Visibility.Collapsed;
            StopWhatsAppQrTimer();

            // Show selected panel
            var tag = btn.Tag?.ToString();
            switch (tag)
            {
                case "DashboardPanel":
                    DashboardPanel.Visibility = Visibility.Visible;
                    PageTitle.Text = "Dashboard";
                    break;
                case "SyncStatusPanel":
                    SyncStatusPanel.Visibility = Visibility.Visible;
                    PageTitle.Text = "Sync Status";
                    break;
                case "SettingsPanel":
                    SettingsPanel.Visibility = Visibility.Visible;
                    PageTitle.Text = "Settings";
                    _ = RefreshWhatsAppStatusAsync();
                    break;
                case "HistoryPanel":
                    HistoryPanel.Visibility = Visibility.Visible;
                    PageTitle.Text = "History";
                    if (DataContext is MainViewModel historyVm) _ = historyVm.LoadCloudSyncOverviewAsync();
                    break;
                case "LicenseHistoryPanel":
                    LicenseHistoryPanel.Visibility = Visibility.Visible;
                    PageTitle.Text = "Licence History";
                    if (DataContext is ViewModels.MainViewModel vm)
                        _ = vm.LoadLicenseHistoryAsync();
                    break;
            }
        }

        private void LogoutButton_Click(object sender, RoutedEventArgs e)
        {
            var result = MessageBox.Show(
                "Are you sure you want to logout?",
                "Confirm Logout",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question
            );

            if (result == MessageBoxResult.Yes)
            {
                App.Logout();
            }
        }

        /// <summary>
        /// Dismiss the licence blocking overlay temporarily. The overlay re-appears on the
        /// next sync cycle if the licence is still invalid — this does not bypass enforcement.
        /// </summary>
        private void DismissLicenseBlock_Click(object sender, RoutedEventArgs e)
        {
            if (DataContext is ViewModels.MainViewModel vm)
            {
                vm.IsLicenseBlocked = false;
            }
        }

        /// <summary>
        /// Opens the web purchase page in the default browser so the user can buy / extend a licence.
        /// Payment is processed server-side — the connector never handles money or licence keys.
        /// </summary>
        private void BuyLicence_Click(object sender, RoutedEventArgs e)
        {
            if (DataContext is MainViewModel vm && vm.BuyLicenceCommand.CanExecute(null))
                vm.BuyLicenceCommand.Execute(null);
        }

        private async Task InitializeWhatsAppOnStartupAsync()
        {
            if (await RefreshWhatsAppStatusAsync()) return;
            if (!WhatsAppHelperManager.HasSavedSession()) return;

            var (started, _) = await WhatsAppHelperManager.EnsureStartedAsync();
            if (!started) return;

            for (int attempt = 0; attempt < 10; attempt++)
            {
                if (await RefreshWhatsAppStatusAsync()) return;
                await Task.Delay(2000);
            }
        }

        private async Task<bool> RefreshWhatsAppStatusAsync()
        {
            bool isReady = false;
            string statusText = "Helper not running — click Open WhatsApp QR to start";
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
                using var resp = await http.GetAsync(WhatsAppHelperManager.StatusUrl);
                if (resp.IsSuccessStatusCode)
                {
                    var json = await resp.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<dynamic>(json);
                    bool ready = data?.ready == true;
                    bool hasQr = data?.hasQr == true;
                    string? phone = data?.connectedPhone?.ToString();
                    isReady = ready;

                    statusText = ready
                        ? $"Connected (+{phone ?? "Linked"}) — Sync alerts & Voucher PDFs active"
                        : hasQr
                            ? "Waiting for QR scan — scan via WhatsApp Linked Devices"
                            : "Starting WhatsApp helper — auto-refreshing status...";
                }
            }
            catch
            {
                // Helper not listening on 127.0.0.1:3001
            }

            WhatsAppStatusText.Text = statusText;
            if (WhatsAppQrOverlayStatusText != null)
            {
                WhatsAppQrOverlayStatusText.Text = statusText;
            }
            return isReady;
        }

        private async void RefreshWhatsAppStatus_Click(object sender, RoutedEventArgs e)
        {
            WhatsAppStatusText.Text = "Checking WhatsApp QR helper...";
            await RefreshWhatsAppStatusAsync();
        }

        private void StartWhatsAppQrTimer()
        {
            if (_whatsAppQrTimer == null)
            {
                _whatsAppQrTimer = new DispatcherTimer
                {
                    Interval = TimeSpan.FromSeconds(3)
                };
                _whatsAppQrTimer.Tick += async (_, _) => await RefreshWhatsAppStatusAsync();
            }
            if (!_whatsAppQrTimer.IsEnabled)
            {
                _whatsAppQrTimer.Start();
            }
        }

        private void StopWhatsAppQrTimer()
        {
            _whatsAppQrTimer?.Stop();
        }

        private async void OpenWhatsAppQr_Click(object sender, RoutedEventArgs e)
        {
            SettingsPanel.Visibility = Visibility.Collapsed;
            WhatsAppQrPanel.Visibility = Visibility.Visible;
            PageTitle.Text = "WhatsApp QR";
            WhatsAppQrLoadingPanel.Visibility = Visibility.Visible;
            WhatsAppQrWebView.Visibility = Visibility.Collapsed;
            WhatsAppQrLoadingText.Text = "Starting WhatsApp QR helper (no dependency download required)...";
            WhatsAppQrOverlayStatusText.Text = "Starting WhatsApp QR helper...";
            WhatsAppStatusText.Text = "Starting WhatsApp QR helper...";

            var (started, error) = await WhatsAppHelperManager.EnsureStartedAsync();
            if (!started)
            {
                var errMsg = error ?? "Could not start WhatsApp QR helper.";
                WhatsAppQrLoadingText.Text = errMsg;
                WhatsAppQrOverlayStatusText.Text = errMsg;
                WhatsAppStatusText.Text = errMsg;
                return;
            }

            StartWhatsAppQrTimer();
            await RefreshWhatsAppStatusAsync();

            try
            {
                WhatsAppQrLoadingText.Text = "Loading WhatsApp QR inside SYNCORA Connector...";
                if (!_webViewInitialized)
                {
                    var userDataFolder = WhatsAppHelperManager.GetWebViewUserDataDirectory();
                    Directory.CreateDirectory(userDataFolder);
                    var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                    await WhatsAppQrWebView.EnsureCoreWebView2Async(env);
                    _webViewInitialized = true;
                }

                WhatsAppQrWebView.CoreWebView2.Navigate(WhatsAppHelperManager.QrUrl);
                WhatsAppQrLoadingPanel.Visibility = Visibility.Collapsed;
                WhatsAppQrWebView.Visibility = Visibility.Visible;
            }
            catch (Exception ex)
            {
                WhatsAppQrLoadingText.Text = $"In-app browser unavailable ({ex.Message}). Opening in your default browser...";
                OpenQrInExternalBrowser();
            }
        }

        private async void CloseWhatsAppQr_Click(object sender, RoutedEventArgs e)
        {
            StopWhatsAppQrTimer();
            WhatsAppQrPanel.Visibility = Visibility.Collapsed;
            SettingsPanel.Visibility = Visibility.Visible;
            PageTitle.Text = "Settings";
            await RefreshWhatsAppStatusAsync();
        }

        private async void ReloadWhatsAppQr_Click(object sender, RoutedEventArgs e)
        {
            var (started, error) = await WhatsAppHelperManager.EnsureStartedAsync();
            if (!started)
            {
                WhatsAppQrOverlayStatusText.Text = error ?? "WhatsApp helper unavailable";
                return;
            }

            if (_webViewInitialized && WhatsAppQrWebView.CoreWebView2 != null)
            {
                WhatsAppQrWebView.CoreWebView2.Navigate(WhatsAppHelperManager.QrUrl);
                WhatsAppQrLoadingPanel.Visibility = Visibility.Collapsed;
                WhatsAppQrWebView.Visibility = Visibility.Visible;
            }
            await RefreshWhatsAppStatusAsync();
        }

        private void OpenWhatsAppQrExternal_Click(object sender, RoutedEventArgs e)
        {
            OpenQrInExternalBrowser();
        }

        private static void OpenQrInExternalBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = WhatsAppHelperManager.QrUrl,
                    UseShellExecute = true,
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Could not open WhatsApp QR page: {ex.Message}", "WhatsApp QR", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void OnAutoUpdaterStatusChanged(object? sender, AutoUpdateStatus status)
        {
            Dispatcher.BeginInvoke(() => ApplyUpdateStatusToUi(status));
        }

        private void ApplyUpdateStatusToUi(AutoUpdateStatus status)
        {
            var runningVer = GitHubAutoUpdater.GetRunningVersion();
            switch (status.State)
            {
                case AutoUpdateState.Checking:
                    SettingsUpdateStatusText.Text = $"Current version: v{runningVer} — Checking GitHub Releases...";
                    CheckForUpdatesButton.IsEnabled = false;
                    SettingsRestartUpdateButton.Visibility = Visibility.Collapsed;
                    break;

                case AutoUpdateState.Downloading:
                    CheckForUpdatesButton.IsEnabled = false;
                    SettingsUpdateStatusText.Text = $"Downloading SYNCORA Connector v{status.LatestVersion} ({status.ProgressPercent}%)...";
                    SettingsRestartUpdateButton.Visibility = Visibility.Collapsed;
                    if (!string.Equals(_dismissedDownloadingVersion, status.LatestVersion, StringComparison.OrdinalIgnoreCase))
                    {
                        UpdateBannerBorder.Visibility = Visibility.Visible;
                        RestartUpdateButton.Visibility = Visibility.Collapsed;
                        UpdateBannerText.Text = $"⬇️ Downloading SYNCORA Connector v{status.LatestVersion} ({status.ProgressPercent}%)...";
                    }
                    break;

                case AutoUpdateState.ReadyToInstall:
                    CheckForUpdatesButton.IsEnabled = true;
                    SettingsUpdateStatusText.Text = $"Update v{status.LatestVersion} downloaded and ready to install on restart.";
                    SettingsRestartUpdateButton.Visibility = Visibility.Visible;
                    if (!string.Equals(_dismissedReadyVersion, status.LatestVersion, StringComparison.OrdinalIgnoreCase))
                    {
                        UpdateBannerBorder.Visibility = Visibility.Visible;
                        RestartUpdateButton.Visibility = Visibility.Visible;
                        UpdateBannerText.Text = $"✨ SYNCORA Connector v{status.LatestVersion} ready to install — click Restart & Update";
                    }
                    break;

                case AutoUpdateState.UpToDate:
                    CheckForUpdatesButton.IsEnabled = true;
                    SettingsUpdateStatusText.Text = $"You are on the latest version (v{runningVer}).";
                    SettingsRestartUpdateButton.Visibility = Visibility.Collapsed;
                    UpdateBannerBorder.Visibility = Visibility.Collapsed;
                    break;

                case AutoUpdateState.Error:
                    CheckForUpdatesButton.IsEnabled = true;
                    SettingsUpdateStatusText.Text = $"Current version: v{runningVer} — {status.Message ?? "Update check failed."}";
                    SettingsRestartUpdateButton.Visibility = Visibility.Collapsed;
                    UpdateBannerBorder.Visibility = Visibility.Collapsed;
                    break;

                default:
                    CheckForUpdatesButton.IsEnabled = true;
                    SettingsUpdateStatusText.Text = $"Current version: v{runningVer} — Updates download automatically in the background.";
                    SettingsRestartUpdateButton.Visibility = Visibility.Collapsed;
                    break;
            }
        }

        private async void CheckForUpdates_Click(object sender, RoutedEventArgs e)
        {
            _dismissedDownloadingVersion = null;
            _dismissedReadyVersion = null;
            await GitHubAutoUpdater.CheckAndDownloadAsync(isManual: true);
        }

        private void RestartUpdateButton_Click(object sender, RoutedEventArgs e)
        {
            WhatsAppHelperManager.StopOwnedHelper();
            if (GitHubAutoUpdater.LaunchPendingUpdate(relaunchAfterInstall: true))
            {
                Application.Current.Shutdown();
            }
            else
            {
                MessageBox.Show(
                    "Could not start the downloaded update installer. Please click Check for Updates and try again.",
                    "SYNCORA Update",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
            }
        }

        private void DismissUpdateBanner_Click(object sender, RoutedEventArgs e)
        {
            var st = GitHubAutoUpdater.CurrentStatus;
            if (st.State == AutoUpdateState.ReadyToInstall)
                _dismissedReadyVersion = st.LatestVersion;
            else if (st.State == AutoUpdateState.Downloading)
                _dismissedDownloadingVersion = st.LatestVersion;

            UpdateBannerBorder.Visibility = Visibility.Collapsed;
        }

    }

    // Helper to convert boolean connection status to color
    public class BoolToColorConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is bool isConnected && isConnected)
            {
                return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10B981")); // Green
            }
            return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#EF4444")); // Red
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    // Helper to convert null/optional values to visibility
    public class NullToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is string s) return string.IsNullOrEmpty(s) ? Visibility.Collapsed : Visibility.Visible;
            return value == null ? Visibility.Collapsed : Visibility.Visible;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    // Helper to convert boolean to visibility (true = Visible, false = Collapsed)
    public class BoolToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            return value is bool b && b ? Visibility.Visible : Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    // Helper to invert boolean visibility
    public class InverseBoolConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            return value is bool b && b ? Visibility.Collapsed : Visibility.Visible;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    // Helper to convert hex color string to SolidColorBrush
    public class StringToBrushConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is string hex && !string.IsNullOrWhiteSpace(hex))
            {
                try
                {
                    return new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
                }
                catch { return new SolidColorBrush(Colors.Gray); }
            }
            return new SolidColorBrush(Colors.Gray);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
