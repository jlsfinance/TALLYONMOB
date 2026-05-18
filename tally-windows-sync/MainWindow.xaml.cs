using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;

namespace TallySyncApp
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();

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
                SetNavIcon(NavDashboard, "📊");
                SetNavIcon(NavSyncStatus, "📋");
                SetNavIcon(NavSettings, "⚙️");
                SetNavIcon(NavHistory, "📜");

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

            // Hide all panels
            DashboardPanel.Visibility = Visibility.Collapsed;
            SyncStatusPanel.Visibility = Visibility.Collapsed;
            SettingsPanel.Visibility = Visibility.Collapsed;
            HistoryPanel.Visibility = Visibility.Collapsed;

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
}
