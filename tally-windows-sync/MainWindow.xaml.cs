using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using TallySyncApp.ViewModels;

namespace TallySyncApp
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
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
                    break;
                case "HistoryPanel":
                    HistoryPanel.Visibility = Visibility.Visible;
                    PageTitle.Text = "History";
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
            try
            {
                var vm = DataContext as ViewModels.MainViewModel;
                string url = vm?.LicenseResult != null
                    ? (vm.LicenseResult.SupportEmail != null
                        ? ReadPurchaseUrlFromSettings() : "https://tallyonmobile.com/buy-licence")
                    : "https://tallyonmobile.com/buy-licence";
                url = ReadPurchaseUrlFromSettings();

                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                System.Windows.MessageBox.Show($"खरीद पेज नहीं खुल सका: {ex.Message}", "Buy Licence",
                    System.Windows.MessageBoxButton.OK, System.Windows.MessageBoxImage.Warning);
            }
        }

        private string ReadPurchaseUrlFromSettings()
        {
            try
            {
                var path = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
                if (!System.IO.File.Exists(path)) return "https://tallyonmobile.com/buy-licence";
                var txt = System.IO.File.ReadAllText(path);
                var key = "\"LicencePurchaseUrl\":";
                var idx = txt.IndexOf(key);
                if (idx < 0) return "https://tallyonmobile.com/buy-licence";
                var q1 = txt.IndexOf('"', idx + key.Length);
                var q2 = txt.IndexOf('"', q1 + 1);
                if (q1 < 0 || q2 < 0) return "https://tallyonmobile.com/buy-licence";
                var url = txt.Substring(q1 + 1, q2 - q1 - 1);
                return string.IsNullOrWhiteSpace(url) ? "https://tallyonmobile.com/buy-licence" : url;
            }
            catch
            {
                return "https://tallyonmobile.com/buy-licence";
            }
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
}
