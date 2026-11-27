using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using Newtonsoft.Json;
using TallySyncApp.ViewModels;

namespace TallySyncApp
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            Closed += (_, _) => (DataContext as MainViewModel)?.Dispose();
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
                _ = RefreshWhatsAppStatusAsync();
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
            HistoryPanel.Visibility = Visibility.Collapsed;
            LicenseHistoryPanel.Visibility = Visibility.Collapsed;

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

        private async Task RefreshWhatsAppStatusAsync()
        {
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
                using var resp = await http.GetAsync("http://127.0.0.1:3001/status");
                if (resp.IsSuccessStatusCode)
                {
                    var json = await resp.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<dynamic>(json);
                    bool ready = data?.ready == true;
                    bool hasQr = data?.hasQr == true;
                    string? phone = data?.connectedPhone?.ToString();

                    WhatsAppStatusText.Text = ready
                        ? $"Connected (+{phone ?? "Linked"}) — Sync alerts & Voucher PDFs active"
                        : hasQr
                            ? "Waiting for QR scan — click Open WhatsApp QR"
                            : "Starting WhatsApp helper — click Refresh Status in a few seconds";
                    return;
                }
            }
            catch
            {
                // Helper not listening on 127.0.0.1:3001
            }

            WhatsAppStatusText.Text = "Helper not running — click Open WhatsApp QR to start";
        }

        private async void RefreshWhatsAppStatus_Click(object sender, RoutedEventArgs e)
        {
            WhatsAppStatusText.Text = "Checking WhatsApp QR helper...";
            await RefreshWhatsAppStatusAsync();
        }

        private async void OpenWhatsAppQr_Click(object sender, RoutedEventArgs e)
        {
            bool helperRunning = false;
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
                using var resp = await http.GetAsync("http://127.0.0.1:3001/status");
                helperRunning = resp.IsSuccessStatusCode;
            }
            catch
            {
                helperRunning = false;
            }

            if (!helperRunning)
            {
                var candidates = new[]
                {
                    Path.Combine(AppContext.BaseDirectory, "whatsapp-notifier", "start-whatsapp.bat"),
                    Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "whatsapp-notifier", "start-whatsapp.bat")),
                };
                var batPath = Array.Find(candidates, File.Exists);
                if (!string.IsNullOrEmpty(batPath))
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = batPath,
                            WorkingDirectory = Path.GetDirectoryName(batPath)!,
                            UseShellExecute = true,
                        });
                        WhatsAppStatusText.Text = "Starting WhatsApp QR helper — browser will open http://127.0.0.1:3001/qr";
                        await Task.Delay(2500);
                        await RefreshWhatsAppStatusAsync();
                        return;
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Could not start WhatsApp helper: {ex.Message}", "WhatsApp QR", MessageBoxButton.OK, MessageBoxImage.Warning);
                    }
                }
            }

            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "http://127.0.0.1:3001/qr",
                    UseShellExecute = true,
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Could not open WhatsApp QR page: {ex.Message}", "WhatsApp QR", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
            await RefreshWhatsAppStatusAsync();
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
