using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;

namespace TallySyncApp
{
    public partial class MainWindow : Window
    {
        private System.Windows.Forms.NotifyIcon? _notifyIcon;
        private bool _isExplicitExit = false;

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
                    
                    // AUTO-START SYNC
                    // The user wants it to start "As soon as PC on" (which equates to App Startup)
                    // We call the command directly.
                    if (vm.StartSyncCommand.CanExecute(null))
                    {
                        vm.StartSyncCommand.Execute(null);
                    }
                }
            }

            InitializeTrayIcon();
            LoadStartupState();
        }

        private void InitializeTrayIcon()
        {
            try
            {
                _notifyIcon = new System.Windows.Forms.NotifyIcon();
                _notifyIcon.Icon = System.Drawing.SystemIcons.Application; // Use default app icon
                _notifyIcon.Visible = true;
                _notifyIcon.Text = "LiveKeeping Tally Sync";
                _notifyIcon.DoubleClick += (s, args) => ShowWindow();

                var contextMenu = new System.Windows.Forms.ContextMenuStrip();
                contextMenu.Items.Add("Open", null, (s, e) => ShowWindow());
                contextMenu.Items.Add("Sync Now", null, (s, e) => {
                     var vm = DataContext as ViewModels.MainViewModel;
                     vm?.ManualSyncCommand.Execute(null);
                });
                contextMenu.Items.Add("-");
                contextMenu.Items.Add("Exit", null, (s, e) => {
                    _isExplicitExit = true;
                    this.Close();
                });
                _notifyIcon.ContextMenuStrip = contextMenu;
            }
            catch (Exception ex) 
            {
                // Fallback if tray fails (e.g. some restricted environments)
                Console.WriteLine($"Tray icon error: {ex.Message}");
            }
        }

        private void ShowWindow()
        {
            this.Show();
            this.WindowState = WindowState.Normal;
            this.Activate();
        }

        protected override void OnStateChanged(EventArgs e)
        {
            if (this.WindowState == WindowState.Minimized)
            {
                this.Hide(); 
            }
            base.OnStateChanged(e);
        }

        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            if (!_isExplicitExit)
            {
                e.Cancel = true;
                this.Hide();
                _notifyIcon?.ShowBalloonTip(3000, "LiveKeeping Sync", "App is running in background. Double-click tray icon to open.", System.Windows.Forms.ToolTipIcon.Info);
            }
            else
            {
                _notifyIcon?.Dispose();
                base.OnClosing(e);
            }
        }

        private void StartWithWindows_Checked(object sender, RoutedEventArgs e) => SetStartup(true);
        private void StartWithWindows_Unchecked(object sender, RoutedEventArgs e) => SetStartup(false);

        private void LoadStartupState()
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", false))
                {
                    var val = key?.GetValue("LiveKeepingSync");
                    if (val != null)
                    {
                        StartupCheckBox.IsChecked = true;
                    }
                }
            }
            catch { }
        }

        // Public methods for CheckBox events
        public void SetStartup(bool enable)
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", true))
                {
                    if (enable)
                    {
                        string exePath = System.Diagnostics.Process.GetCurrentProcess().MainModule?.FileName ?? "";
                        if (exePath.EndsWith(".dll")) exePath = exePath.Replace(".dll", ".exe"); // Fix for .NET Core
                        
                        key?.SetValue("LiveKeepingSync", exePath);
                    }
                    else
                    {
                        key?.DeleteValue("LiveKeepingSync", false);
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to change startup settings: {ex.Message}");
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
                _isExplicitExit = true; // Allow closing
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
