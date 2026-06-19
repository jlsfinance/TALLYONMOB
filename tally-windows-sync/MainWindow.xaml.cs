using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using TallySyncApp.Services;

namespace TallySyncApp
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            try
            {
                InitializeComponent();
            }
            catch (Exception ex)
            {
                System.IO.File.AppendAllText(
                    System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs", "crash.log"),
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] XAML PARSE ERROR:\n{ex}\n\n");
                MessageBox.Show($"UI failed to load:\n{ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            
            // Set user email in data context
            try
            {
                if (App.AuthService?.CurrentSession != null)
                {
                    var vm = DataContext as ViewModels.MainViewModel;
                    if (vm != null)
                    {
                        vm.UserEmail = App.AuthService.CurrentSession.Email;
                    }
                }
            }
            catch (Exception ex)
            {
                System.IO.File.AppendAllText(
                    System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs", "crash.log"),
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] CONSTRUCTOR ERROR:\n{ex}\n\n");
            }

            // Handle window closing - minimize to tray instead of close
            Closing += OnWindowClosing;
        }

        private void OnWindowClosing(object? sender, System.ComponentModel.CancelEventArgs e)
        {
            if (App.TrayService != null)
            {
                e.Cancel = true;
                App.TrayService.MinimizeToTray(this);
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

        private void ShowPage(string page)
        {
            if (DashboardPage != null) DashboardPage.Visibility = Visibility.Collapsed;
            if (LivePage != null) LivePage.Visibility = Visibility.Collapsed;
            if (SettingsPage != null) SettingsPage.Visibility = Visibility.Collapsed;
            if (HistoryPage != null) HistoryPage.Visibility = Visibility.Collapsed;

            switch (page)
            {
                case "dashboard":
                    if (DashboardPage != null) DashboardPage.Visibility = Visibility.Visible;
                    if (PageTitle != null) PageTitle.Text = "Dashboard";
                    break;
                case "live":
                    if (LivePage != null) LivePage.Visibility = Visibility.Visible;
                    if (PageTitle != null) PageTitle.Text = "Live Status";
                    break;
                case "settings":
                    if (SettingsPage != null) SettingsPage.Visibility = Visibility.Visible;
                    if (PageTitle != null) PageTitle.Text = "Settings";
                    break;
                case "history":
                    if (HistoryPage != null) HistoryPage.Visibility = Visibility.Visible;
                    if (PageTitle != null) PageTitle.Text = "History";
                    break;
            }
        }

        private void NavDashboard_Checked(object sender, RoutedEventArgs e)
        {
            if (DashboardPage != null) ShowPage("dashboard");
        }

        private void NavLive_Checked(object sender, RoutedEventArgs e)
        {
            if (LivePage != null) ShowPage("live");
        }

        private void NavSettings_Checked(object sender, RoutedEventArgs e)
        {
            if (SettingsPage != null) ShowPage("settings");
        }

        private void NavHistory_Checked(object sender, RoutedEventArgs e)
        {
            if (HistoryPage != null) ShowPage("history");
        }

        private void Window_Loaded(object sender, RoutedEventArgs e)
        {
            ShowPage("dashboard");
        }
    }

    // Helper to convert boolean connection status to color
    public class BoolToColorConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is bool isConnected && isConnected)
            {
                return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#059669")); // Green
            }
            return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#94A3B8")); // Gray
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

    // Converter: 0 count -> Visible (show empty message), >0 -> Collapsed (hide empty message)
    public class CountToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is int count)
                return count == 0 ? Visibility.Visible : Visibility.Collapsed;
            return Visibility.Visible;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    // Converter: string color hex to SolidColorBrush
    public class StringToBrushConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is string hex && !string.IsNullOrEmpty(hex))
            {
                try
                {
                    return new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
                }
                catch { }
            }
            return new SolidColorBrush(Colors.Transparent);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    // Converter: bool to Visibility
    public class BoolToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            return value is true ? Visibility.Visible : Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    // Converter: ValidationSeverity enum to color Brush
    public class ValidationSeverityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is Services.ValidationSeverity severity)
            {
                return severity switch
                {
                    Services.ValidationSeverity.Error => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#DC2626")),
                    Services.ValidationSeverity.Warning => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#D97706")),
                    _ => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3B82F6")),
                };
            }
            return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#94A3B8"));
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
