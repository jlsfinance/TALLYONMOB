using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using TallySyncApp.Models;
using TallySyncApp.Services;
using TallySyncApp;

namespace TallySyncApp.Views
{
    /// <summary>
    /// Main window code-behind with sync controls and status display
    /// </summary>
    public partial class MainWindow : Window
    {
        private readonly ObservableCollection<LogEntry> _logEntries = new();
        private readonly ObservableCollection<ErrorEntry> _errorEntries = new();
        private bool _isAutoSyncRunning;

        public MainWindow()
        {
            InitializeComponent();
            ActivityLogList.ItemsSource = _logEntries;
            ErrorLogList.ItemsSource = _errorEntries;
            
            Loaded += MainWindow_Loaded;
            Closed += MainWindow_Closed;
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            await Task.Delay(1000); // Let Tally breathe
            try 
            {
                AddLog("Application started (Direct Supabase Mode)");
                
                // Load configuration
                if (App.Settings != null)
                {
                    var tallyHost = App.Settings.TallySettings?.Host ?? "localhost";
                    var tallyPort = App.Settings.TallySettings?.Port ?? 9000;
                    TallyEndpoint.Text = $"{tallyHost}:{tallyPort}";
                    
                    ApiEndpoint.Text = "Supabase Direct";
                }

                // Subscribe to sync events
                var syncManager = App.GetSyncManager();
                if (syncManager != null)
                {
                    syncManager.StatusChanged += SyncManager_StatusChanged;
                    syncManager.SyncLogRequested += (s, msg) => Dispatcher.Invoke(() => AddLog(msg));
                }

                // Check connections
                await CheckConnectionsAsync();
                
                // Check for updates
                _ = CheckForUpdatesAsync();
                
                // Update queue stats
                UpdateQueueStats();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Startup Error: {ex.Message}", "Application Error", MessageBoxButton.OK, MessageBoxImage.Error);
                AddLog($"Startup Error: {ex.Message}");
            }
        }

        private void MainWindow_Closed(object? sender, EventArgs e)
        {
            var syncManager = App.GetSyncManager();
            if (syncManager != null)
            {
                syncManager.StatusChanged -= SyncManager_StatusChanged;
            }
        }

        private async Task CheckConnectionsAsync()
        {
            AddLog("Checking connections...");

            // Check connections via SyncManager
            var (tallyOk, serverOk, error) = await App.GetSyncManager().TestConnectionsAsync();

            if (tallyOk)
            {
                var onlineColor = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#16A34A"));
                UpdateTallyStatus("Connected", onlineColor);
                AddLog("✅ Tally ERP connected");
                
                // Show detected companies
                await LoadCompaniesAsync();
            }
            else
            {
                var offlineColor = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#DC2626"));
                UpdateTallyStatus("Offline", offlineColor);
                AddLog("⚠️ Tally ERP is offline");
                AddError("Tally Connection Failed", error ?? "Is Tally open and ODBC enabled on port 9000?");
            }

            if (serverOk)
            {
                var apiOnline = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#16A34A"));
                UpdateApiStatus("Connected", apiOnline);
                AddLog("✅ Supabase connected");
            }
            else
            {
                var apiOffline = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#DC2626"));
                UpdateApiStatus("Offline", apiOffline);
                AddLog("⚠️ Supabase offline");
                AddError("Supabase Connection Failed", error ?? "Check internet connection and API keys.");
            }
        }

        private async void RefreshCompaniesButton_Click(object sender, RoutedEventArgs e)
        {
            RefreshCompaniesButton.IsEnabled = false;
            CompanyComboBox.Items.Clear();
            CompanyComboBox.Items.Add(new System.Windows.Controls.ComboBoxItem { Content = "Scanning Tally..." });
            
            try
            {
                AddLog("Refreshing company list...");
                await LoadCompaniesAsync();
            }
            finally
            {
                RefreshCompaniesButton.IsEnabled = true;
            }
        }

        private async Task LoadCompaniesAsync()
        {
            try
            {
                var companies = await App.GetSyncManager().GetOpenCompaniesAsync();
                
                CompanyComboBox.Items.Clear();
                
                if (companies.Count > 0)
                {
                    foreach (var company in companies)
                    {
                        CompanyComboBox.Items.Add(new System.Windows.Controls.ComboBoxItem { Content = company.Name });
                    }
                    CompanyComboBox.SelectedIndex = 0;
                    
                    var active = companies.FirstOrDefault();
                    if (active != null)
                    {
                        TopCompanyText.Text = active.Name;
                        AddLog($"Found {companies.Count} open companies in Tally");
                    }
                }
                else
                {
                    CompanyComboBox.Items.Add(new System.Windows.Controls.ComboBoxItem { Content = "No companies found" });
                    TopCompanyText.Text = "(No Company)";
                }
            }
            catch (Exception ex)
            {
                AddLog($"Error loading companies: {ex.Message}");
            }
        }

        private async void SyncNowButton_Click(object sender, RoutedEventArgs e)
        {
            var syncManager = App.GetSyncManager();
            if (syncManager.Status.State != SyncState.Idle && 
                syncManager.Status.State != SyncState.Completed && 
                syncManager.Status.State != SyncState.Error)
            {
                AddLog("Sync already in progress");
                return;
            }

            if (!await CheckSerialAndConfirmAsync()) return;

            SyncNowButton.IsEnabled = false;
            UpdateStatus("Starting...", "#1A56DB");

            try
            {
                await syncManager.RunManualSyncAsync(ForceResetCheckBox.IsChecked == true);
                UpdateQueueStats();
                
                if (syncManager.Status.State == SyncState.Completed)
                {
                    MessageBox.Show($"Sync Completed Successfully!\nProcessed {syncManager.Status.ProcessedRecords} records.", 
                                    "Sync Success", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                AddLog($"Sync error: {ex.Message}");
            }
            finally
            {
                SyncNowButton.IsEnabled = true;
            }
        }

        private async void StartAutoSyncButton_Click(object sender, RoutedEventArgs e)
        {
            if (!await CheckSerialAndConfirmAsync()) return;
            var intervalMinutes = GetSelectedInterval();
            
            if (intervalMinutes <= 0)
            {
                AddLog("Select a valid interval");
                return;
            }
            
            App.Settings.SyncSettings.SyncIntervalMinutes = intervalMinutes;

            App.GetSyncManager().StartSync();
            _isAutoSyncRunning = true;
            
            StartAutoSyncButton.IsEnabled = false;
            StopAutoSyncButton.IsEnabled = true;
            
            UpdateStatus("Auto-Syncing", "#16A34A");
            AddLog($"Auto-sync started ({intervalMinutes} m)");
        }

        private void StopAutoSyncButton_Click(object sender, RoutedEventArgs e)
        {
            App.GetSyncManager().StopSync();
            _isAutoSyncRunning = false;
            
            StartAutoSyncButton.IsEnabled = true;
            StopAutoSyncButton.IsEnabled = false;
            
            UpdateStatus("Stopped", "#DC2626");
            AddLog("Auto-sync stopped");
        }

        private int GetSelectedInterval()
        {
            return (IntervalComboBox.SelectedIndex) switch
            {
                0 => 1,
                1 => 5,
                2 => 15,
                3 => 30,
                4 => 0, 
                _ => 5
            };
        }

        private void SyncManager_StatusChanged(object? sender, SyncStatus status)
        {
            Dispatcher.Invoke(() =>
            {
                SyncProgressBar.Value = status.ProgressPercentage;
                SyncProgressText.Text = status.Message;
                
                // Update connection dots in real-time
                var tallyColor = new SolidColorBrush((Color)ColorConverter.ConvertFromString(status.IsTallyConnected ? "#16A34A" : "#DC2626"));
                UpdateTallyStatus(status.IsTallyConnected ? "Connected" : "Offline", tallyColor);
                
                var apiColor = new SolidColorBrush((Color)ColorConverter.ConvertFromString(status.IsServerConnected ? "#16A34A" : "#DC2626"));
                UpdateApiStatus(status.IsServerConnected ? "Connected" : "Offline", apiColor);

                // Log significant state changes
                if (status.State == SyncState.Completed || status.State == SyncState.Error)
                {
                    AddLog(status.Message);
                }

                switch (status.State)
                {
                    case SyncState.FetchingData:
                        UpdateStatus(status.Message, "#D97706");
                        break;
                    case SyncState.Syncing:
                    case SyncState.Uploading:
                        UpdateStatus($"Syncing {status.ProcessedRecords}/{status.TotalRecords}", "#1A56DB");
                        break;
                    case SyncState.Completed:
                        UpdateStatus("Sync Success", "#16A34A");
                        AddLog($"✅ Sync Completed: {status.TotalRecords} records processed.");
                        LastSyncText.Text = $"Last sync: {DateTime.Now:HH:mm:ss}";
                        break;
                    case SyncState.Error:
                        UpdateStatus("Sync Failed", "#DC2626");
                        AddError("Sync Failed", status.Error ?? status.Message);
                        break;
                    case SyncState.Connecting:
                        UpdateStatus("Connecting...", "#D97706");
                        break;
                    default:
                        UpdateStatus("System Idle", "#16A34A");
                        break;
                }
                
                UpdateQueueStats();
            });
        }

        private void UpdateQueueStats()
        {
             var status = App.GetSyncManager().Status;
             QueueCount.Text = $"{status.ProcessedRecords}/{status.TotalRecords}";
        }

        private void UpdateStatus(string text, string hexColor)
        {
            StatusText.Text = text;
            try {
                StatusBadge.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hexColor));
            } catch {}
        }

        private void UpdateTallyStatus(string text, SolidColorBrush color)
        {
            TallyStatusText.Text = text;
            TallyStatusDot.Fill = color;
        }

        private void UpdateApiStatus(string text, SolidColorBrush color)
        {
            ApiStatusText.Text = text;
            ApiStatusDot.Fill = color;
        }

        private void AddLog(string message)
        {
            Dispatcher.Invoke(() =>
            {
                _logEntries.Insert(0, new LogEntry
                {
                    Message = message,
                    Timestamp = DateTime.Now.ToString("HH:mm:ss")
                });

                while (_logEntries.Count > 100)
                {
                    _logEntries.RemoveAt(_logEntries.Count - 1);
                }
            });
        }

        private void ClearLogButton_Click(object sender, RoutedEventArgs e)
        {
            _logEntries.Clear();
        }

        private void AddError(string message, string details = "")
        {
            Dispatcher.Invoke(() =>
            {
                _errorEntries.Insert(0, new ErrorEntry
                {
                    Message = message,
                    Details = details,
                    Timestamp = DateTime.Now.ToString("HH:mm:ss")
                });

                if (_errorEntries.Count > 50) _errorEntries.RemoveAt(_errorEntries.Count - 1);
            });
        }

        private void ClearErrorsButton_Click(object sender, RoutedEventArgs e)
        {
            _errorEntries.Clear();
        }

        private void SettingsLink_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("Settings are configured in appsettings.json", 
                            "Settings", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void LogoutButton_Click(object sender, RoutedEventArgs e)
        {
            var result = MessageBox.Show(
                "Are you sure you want to sign out?",
                "Sign Out",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result == MessageBoxResult.Yes)
            {
                App.GetSyncManager().StopSync();
                App.Logout();
            }
        }
        private async Task<bool> CheckSerialAndConfirmAsync()
        {
             var syncManager = App.GetSyncManager();
             var (isValid, current, stored, msg) = await syncManager.CheckTallySerialAsync();
             
             if (isValid)
             {
                 if (!string.IsNullOrEmpty(current) && string.IsNullOrEmpty(stored))
                 {
                     syncManager.UpdateTallySerial(current);
                     AddLog($"Captured Tally Serial: {current}");
                 }
                 return true;
             }

             // Mismatch
             var res = MessageBox.Show(
                 $"Tally Serial Number Mismatch!\n\nStored: {stored}\nCurrent: {current}\n\nDo you want to proceed and update the serial number?",
                 "Security Warning",
                 MessageBoxButton.YesNo,
                 MessageBoxImage.Warning);
                
             if (res == MessageBoxResult.Yes)
             {
                 syncManager.UpdateTallySerial(current!);
                 AddLog($"Updated Tally Serial to: {current}");
                 return true;
             }
             
             AddLog("Sync cancelled by user due to serial mismatch.");
             return false;
        }

        private async Task CheckForUpdatesAsync()
        {
            try
            {
                var syncManager = App.GetSyncManager();
                var apiClient = syncManager.GetApiClient();
                var settings = await apiClient.GetAppSettingsAsync();

                if (settings.TryGetValue("app_version", out var serverVersion))
                {
                    var currentVersion = "2.0.1"; // Hardcoded matching .csproj
                    if (serverVersion != currentVersion)
                    {
                        Dispatcher.Invoke(() => {
                            UpdateBtn.Visibility = Visibility.Visible;
                            UpdateBtn.ToolTip = $"New Version {serverVersion} available!";
                        });
                    }
                }
            }
            catch { /* Silent fail */ }
        }

        private async void UpdateBtn_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var syncManager = App.GetSyncManager();
                var apiClient = syncManager.GetApiClient();
                var settings = await apiClient.GetAppSettingsAsync();

                if (settings.TryGetValue("windows_app_download_url", out var downloadUrl))
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = downloadUrl,
                        UseShellExecute = true
                    });
                }
                else
                {
                    MessageBox.Show("Download link not found in settings.", "Update", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Could not open download link: {ex.Message}", "Update Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }

    public class LogEntry
    {
        public string Message { get; set; } = "";
        public string Timestamp { get; set; } = "";
    }

    public class ErrorEntry
    {
        public string Message { get; set; } = "";
        public string Details { get; set; } = "";
        public string Timestamp { get; set; } = "";
    }
}
