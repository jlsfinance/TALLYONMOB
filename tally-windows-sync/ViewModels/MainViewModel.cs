using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using TallySyncApp.Models;
using TallySyncApp.Services;

namespace TallySyncApp.ViewModels
{
    public class MainViewModel : INotifyPropertyChanged
    {
        private readonly SyncManager _syncManager;
        private SyncStatus _status;
        private bool _isSyncing;
        private string _consoleOutput = "";

        // Commands
        public ICommand StartSyncCommand { get; }
        public ICommand StopSyncCommand { get; }
        public ICommand ManualSyncCommand { get; }
        public ICommand SaveSettingsCommand { get; }
        public ICommand TestConnectionCommand { get; }

        // Properties
        public SyncStatus Status
        {
            get => _status;
            set { _status = value; OnPropertyChanged(); }
        }

        public AppSettings Settings => _syncManager.GetSettings();

        public string ConsoleOutput
        {
            get => _consoleOutput;
            set { _consoleOutput = value; OnPropertyChanged(); }
        }

        public ObservableCollection<SyncLogEntry> RecentLogs { get; } = new();
        public ObservableCollection<SyncItemStatus> SyncItems { get; } = new();

        public bool IsSyncing
        {
            get => _isSyncing;
            set { _isSyncing = value; OnPropertyChanged(); }
        }

        private string _userEmail = "";
        public string UserEmail
        {
            get => _userEmail;
            set { _userEmail = value; OnPropertyChanged(); }
        }

        public MainViewModel()
        {
            _syncManager = App.GetSyncManager();
            _status = _syncManager.Status;

            // Subscribe to status updates
            _syncManager.StatusChanged += (s, status) =>
            {
                Status = status;
                Application.Current.Dispatcher.Invoke(() =>
                {
                    // Force UI update for progress
                    OnPropertyChanged(nameof(Status));
                });
            };

            _syncManager.ItemSynced += (s, item) =>
            {
                Application.Current.Dispatcher.Invoke(() =>
                {
                    // Add to beginning of list
                    SyncItems.Insert(0, item);
                    // Limit to 200 items to avoid memory issues
                    if (SyncItems.Count > 200) SyncItems.RemoveAt(SyncItems.Count - 1);
                });
            };

            // Initialize Commands
            StartSyncCommand = new RelayCommand(StartSync);
            StopSyncCommand = new RelayCommand(StopSync);
            ManualSyncCommand = new RelayCommand(async () => await ManualSync());
            SaveSettingsCommand = new RelayCommand(SaveSettings);
            TestConnectionCommand = new RelayCommand(async () => await TestConnection());

            // Redirect Console to UI
            Console.SetOut(new ConsoleWriter(this));
            
            // Initial functionality check
            Task.Run(async () => await LoadLogs());
        }

        private void StartSync()
        {
            try
            {
                _syncManager.StartSync();
                IsSyncing = true;
                Log("Background sync started.");
            }
            catch (Exception ex)
            {
                Log($"Error starting sync: {ex.Message}");
            }
        }

        private void StopSync()
        {
            _syncManager.StopSync();
            IsSyncing = false;
            Log("Background sync stopped.");
        }

        private async Task ManualSync()
        {
            IsSyncing = true;
            Log("Starting manual sync...");
            await _syncManager.RunManualSyncAsync();
            await LoadLogs();
            IsSyncing = false;
        }

        private void SaveSettings()
        {
            try
            {
                _syncManager.SaveSettings(Settings);
                Log("Settings saved successfully.");
                MessageBox.Show("Settings saved!", "Success", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                Log($"Failed to save settings: {ex.Message}");
                MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async Task TestConnection()
        {
            Log("Testing connections...");
            var (tallyOk, serverOk, error) = await _syncManager.TestConnectionsAsync();

            string result = $"Tally: {(tallyOk ? "Connected ✅" : "Failed ❌")}\n" +
                          $"Server: {(serverOk ? "Connected ✅" : "Failed ❌")}";

            if (error != null) result += $"\nError: {error}";

            Log(result);
            MessageBox.Show(result, "Connection Test", MessageBoxButton.OK, 
                (tallyOk && serverOk) ? MessageBoxImage.Information : MessageBoxImage.Warning);
        }

        private async Task LoadLogs()
        {
            var logs = await _syncManager.GetSyncLogsAsync();
            Application.Current.Dispatcher.Invoke(() =>
            {
                RecentLogs.Clear();
                foreach (var log in logs) RecentLogs.Add(log);
            });
        }

        public void Log(string message)
        {
            string logMsg = $"[{DateTime.Now:HH:mm:ss}] {message}";
            Application.Current.Dispatcher.Invoke(() =>
            {
                ConsoleOutput = logMsg + Environment.NewLine + ConsoleOutput;
                // Keep only last 100 lines
                if (ConsoleOutput.Length > 10000) 
                    ConsoleOutput = ConsoleOutput.Substring(0, 10000);
            });
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? name = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        }
    }

    // Simple Command Implementation
    public class RelayCommand : ICommand
    {
        private readonly Action _execute;
        public event EventHandler? CanExecuteChanged;

        public RelayCommand(Action execute) => _execute = execute;

        public bool CanExecute(object? parameter) => true;
        public void Execute(object? parameter) => _execute();
    }

    // Capture Console Output
    public class ConsoleWriter : System.IO.StringWriter
    {
        private readonly MainViewModel _vm;
        public ConsoleWriter(MainViewModel vm) => _vm = vm;

        public override void WriteLine(string? value)
        {
            if (value != null) _vm.Log(value);
        }
    }
}
