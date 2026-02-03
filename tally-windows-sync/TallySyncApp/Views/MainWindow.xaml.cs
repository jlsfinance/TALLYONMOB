using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using TallySyncApp.Models;
using TallySyncApp.Services;
using TallySyncApp;
using MessageBox = System.Windows.MessageBox; // Fix Ambiguity

namespace TallySyncApp.Views
{
    /// <summary>
    /// Main window code-behind with sync controls and status display
    /// </summary>
    public partial class MainWindow : System.Windows.Window
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

        private System.Windows.Forms.NotifyIcon? _notifyIcon;
        private bool _isExplicitExit = false;

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

                // Update Version Text
                try 
                {
                    var buildInfo = BuildInfo.Load();
                    VersionText.Text = $"© 2026 TallyLink • v{buildInfo.version} (Build {buildInfo.build})";
                }
                catch { }

                InitializeTrayIcon();
                LoadStartupState();

                // Subscribe to sync events
                var syncManager = App.GetSyncManager();
                if (syncManager != null)
                {
                    syncManager.StatusChanged += SyncManager_StatusChanged;
                    syncManager.SyncLogRequested += (s, msg) => Dispatcher.Invoke(() => AddLog(msg));
                    
                    // AUTO-START SYNC
                    // "Jese hi Tally on ho vo Sync chalu kar de"
                    // We start the timer immediately. The timer will check for Tally connection.
                    AddLog("🚀 Auto-starting sync service...");
                    syncManager.StartSync();
                    _isAutoSyncRunning = true;
                    StartAutoSyncButton.IsEnabled = false;
                    StopAutoSyncButton.IsEnabled = true;
                    UpdateStatus("Auto-Syncing", "#10B981");
                }

                // Check connections
                await CheckConnectionsAsync();
                
                // Update queue stats
                UpdateQueueStats();

                // Check for updates
                await syncManager.CheckForUpdatesAsync();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Startup Error: {ex.Message}", "Application Error", MessageBoxButton.OK, MessageBoxImage.Error);
                AddLog($"Startup Error: {ex.Message}");
            }
        }

        private void InitializeTrayIcon()
        {
            try
            {
                _notifyIcon = new System.Windows.Forms.NotifyIcon();
                _notifyIcon.Icon = System.Drawing.SystemIcons.Application; 
                _notifyIcon.Visible = true;
                _notifyIcon.Text = "LiveKeeping Tally Sync";
                _notifyIcon.DoubleClick += (s, args) => ShowWindow();

                var contextMenu = new System.Windows.Forms.ContextMenuStrip();
                contextMenu.Items.Add("Open", null, (s, e) => ShowWindow());
                contextMenu.Items.Add("Sync Now", null, (s, e) => SyncNowButton_Click(s, null));
                contextMenu.Items.Add("-");
                contextMenu.Items.Add("Exit", null, (s, e) => {
                    _isExplicitExit = true;
                    this.Close();
                });
                _notifyIcon.ContextMenuStrip = contextMenu;
            }
            catch {}
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
                _notifyIcon?.ShowBalloonTip(3000, "LiveKeeping Sync", "App is running in background.", System.Windows.Forms.ToolTipIcon.Info);
            }
            else
            {
                _notifyIcon?.Dispose();
                base.OnClosing(e);
            }
        }

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

        public void SetStartup(bool enable)
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", true))
                {
                    if (enable)
                    {
                         string exePath = System.Diagnostics.Process.GetCurrentProcess().MainModule?.FileName ?? "";
                         if (exePath.EndsWith(".dll")) exePath = exePath.Replace(".dll", ".exe");
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

        private void StartWithWindows_Checked(object sender, RoutedEventArgs e) => SetStartup(true);
        private void StartWithWindows_Unchecked(object sender, RoutedEventArgs e) => SetStartup(false);

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
                UpdateTallyStatus("Connected", System.Windows.Media.Brushes.LimeGreen);
                AddLog("✅ Tally ERP connected");
                
                // Show detected companies
                await LoadCompaniesAsync();
            }
            else
            {
                UpdateTallyStatus("Offline", System.Windows.Media.Brushes.OrangeRed);
                AddLog("⚠️ Tally ERP is offline");
                AddError("Tally Connection Failed", error ?? "Is Tally open and ODBC enabled on port 9000?");
            }

            if (serverOk)
            {
                UpdateApiStatus("Connected", System.Windows.Media.Brushes.LimeGreen);
                AddLog("✅ Supabase connected");
            }
            else
            {
                UpdateApiStatus("Offline", System.Windows.Media.Brushes.OrangeRed);
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
            UpdateStatus("Starting...", "#6366F1");

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
            
            UpdateStatus("Auto-Syncing", "#10B981");
            AddLog($"Auto-sync started ({intervalMinutes} m)");
        }

        private void StopAutoSyncButton_Click(object sender, RoutedEventArgs e)
        {
            App.GetSyncManager().StopSync();
            _isAutoSyncRunning = false;
            
            StartAutoSyncButton.IsEnabled = true;
            StopAutoSyncButton.IsEnabled = false;
            
            UpdateStatus("Stopped", "#EF4444");
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
                UpdateTallyStatus(status.IsTallyConnected ? "Connected" : "Offline", 
                                 status.IsTallyConnected ? System.Windows.Media.Brushes.LimeGreen : System.Windows.Media.Brushes.OrangeRed);
                
                UpdateApiStatus(status.IsServerConnected ? "Connected" : "Offline", 
                               status.IsServerConnected ? System.Windows.Media.Brushes.LimeGreen : System.Windows.Media.Brushes.OrangeRed);
                // Log significant state changes
                if (status.State == SyncState.Completed || status.State == SyncState.Error)
                {
                    AddLog(status.Message);
                }

                switch (status.State)
                {
                    case SyncState.FetchingData:
                        UpdateStatus(status.Message, "#F59E0B"); // Orange
                        break;
                    case SyncState.Syncing:
                    case SyncState.Uploading:
                        UpdateStatus($"Syncing {status.ProcessedRecords}/{status.TotalRecords}", "#6366F1");
                        break;
                    case SyncState.Completed:
                        UpdateStatus("Sync Success", "#10B981");
                        AddLog($"✅ Sync Completed: {status.TotalRecords} records processed.");
                        LastSyncText.Text = $"Last sync: {DateTime.Now:HH:mm:ss}";
                        break;
                    case SyncState.Error:
                        UpdateStatus("Sync Failed", "#EF4444");
                        AddError("Sync Failed", status.Error ?? status.Message);
                        break;
                    case SyncState.Connecting:
                        UpdateStatus("Connecting...", "#F59E0B");
                        break;
                    default:
                        UpdateStatus("System Idle", "#10B981");
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
                StatusBadge.Background = new SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(hexColor));
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

        private async void PurgeDataButton_Click(object sender, RoutedEventArgs e)
        {
            var result = MessageBox.Show(
                "⚠️ DANGER: This will delete ALL synced data for this company from the Cloud.\n\n" +
                "Are you sure you want to proceed?\n" +
                "(This cannot be undone. Data will re-sync from Tally afterwards.)",
                "Start Fresh?", MessageBoxButton.YesNo, MessageBoxImage.Warning);

            if (result == MessageBoxResult.Yes)
            {
                PurgeDataButton.IsEnabled = false;
                try 
                {
                    await App.GetSyncManager().PurgeCompanyDataAsync();
                    MessageBox.Show("Data Reset Successfully. Starting fresh sync...", "Done", MessageBoxButton.OK, MessageBoxImage.Information);
                    
                    // Trigger fresh sync
                    CheckConnectionsAsync(); 
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Reset Failed: {ex.Message}");
                }
                finally
                {
                    PurgeDataButton.IsEnabled = true;
                }
            }
        }

        private void SettingsLink_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("Settings are configured in appsettings.json", 
                            "Settings", MessageBoxButton.OK, MessageBoxImage.Information);
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
