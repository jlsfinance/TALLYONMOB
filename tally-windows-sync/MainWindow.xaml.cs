using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;

namespace TallySyncApp
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            
            // Wire up tab navigation
            TabDashboard.Checked += (s, e) => MainTabControl.SelectedIndex = 0;
            TabLiveStatus.Checked += (s, e) => MainTabControl.SelectedIndex = 1;
            TabSettings.Checked += (s, e) => MainTabControl.SelectedIndex = 2;
            TabHistory.Checked += (s, e) => MainTabControl.SelectedIndex = 3;
            
            // Set user email in data context
            if (App.AuthService?.CurrentSession != null)
            {
                var vm = DataContext as ViewModels.MainViewModel;
                if (vm != null)
                {
                    vm.UserEmail = App.AuthService.CurrentSession.Email;
                }
            }
        }

        // Custom title bar drag
        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ClickCount == 2)
            {
                ToggleMaximize();
            }
            else
            {
                DragMove();
            }
        }

        // Window controls
        private void MinimizeBtn_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState.Minimized;
        }

        private void MaximizeBtn_Click(object sender, RoutedEventArgs e)
        {
            ToggleMaximize();
        }

        private void ToggleMaximize()
        {
            if (WindowState == WindowState.Maximized)
            {
                WindowState = WindowState.Normal;
                MaximizeBtn.Content = "\uE922";
            }
            else
            {
                WindowState = WindowState.Maximized;
                MaximizeBtn.Content = "\uE923";
            }
        }

        private void CloseBtn_Click(object sender, RoutedEventArgs e)
        {
            Close();
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

    // Bool to color converter
    public class BoolToColorConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is bool isConnected && isConnected)
            {
                return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10B981"));
            }
            return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#EF4444"));
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    // Null to visibility converter
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

    // Bool to string converter (Connected/Disconnected)
    public class BoolToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is bool b) return b ? "Connected" : "Disconnected";
            return "Unknown";
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    // Rect converter for window clipping
    public class RectConverter : IMultiValueConverter
    {
        public static readonly RectConverter Instance = new RectConverter();

        public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
        {
            if (values.Length == 2 && values[0] is double w && values[1] is double h)
            {
                return new Rect(0, 0, w, h);
            }
            return new Rect(0, 0, 0, 0);
        }

        public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
