extern alias WinForms;

using System;
using System.Drawing;
using System.Linq;
using System.Windows;
using Application = System.Windows.Application;

namespace TallySyncApp.Services
{
    public class TrayService : IDisposable
    {
        private WinForms::System.Windows.Forms.NotifyIcon? _trayIcon;
        private readonly Action _showMainWindow;
        private readonly Action _startSync;
        private readonly Action _stopSync;
        private readonly Func<bool> _isSyncing;

        public bool IsMinimizedToTray { get; private set; }

        public TrayService(Action showMainWindow, Action startSync, Action stopSync, Func<bool> isSyncing)
        {
            _showMainWindow = showMainWindow;
            _startSync = startSync;
            _stopSync = stopSync;
            _isSyncing = isSyncing;
        }

        public void Initialize()
        {
            if (_trayIcon != null) return;

            var icon = LoadEmbeddedIcon();
            _trayIcon = new WinForms::System.Windows.Forms.NotifyIcon
            {
                Icon = icon ?? SystemIcons.Application,
                Text = "TallyLink - Syncing Tally Data",
                Visible = true,
                BalloonTipTitle = "TallyLink",
            };

            var contextMenu = new WinForms::System.Windows.Forms.ContextMenuStrip();

            var showItem = new WinForms::System.Windows.Forms.ToolStripMenuItem("Show TallyLink");
            showItem.Click += (s, e) => RestoreFromTray();
            contextMenu.Items.Add(showItem);

            contextMenu.Items.Add(new WinForms::System.Windows.Forms.ToolStripSeparator());

            var syncItem = new WinForms::System.Windows.Forms.ToolStripMenuItem("Sync Now");
            syncItem.Click += (s, e) => _startSync();
            contextMenu.Items.Add(syncItem);

            var stopItem = new WinForms::System.Windows.Forms.ToolStripMenuItem("Stop Sync");
            stopItem.Click += (s, e) => _stopSync();
            contextMenu.Items.Add(stopItem);

            contextMenu.Items.Add(new WinForms::System.Windows.Forms.ToolStripSeparator());

            var exitItem = new WinForms::System.Windows.Forms.ToolStripMenuItem("Exit");
            exitItem.Click += (s, e) => ExitApplication();
            contextMenu.Items.Add(exitItem);

            _trayIcon.ContextMenuStrip = contextMenu;

            _trayIcon.DoubleClick += (s, e) => RestoreFromTray();

            _trayIcon.BalloonTipClicked += (s, e) => RestoreFromTray();
        }

        public void MinimizeToTray(Window window)
        {
            if (_trayIcon == null) Initialize();

            window.Hide();
            IsMinimizedToTray = true;

            _trayIcon!.ShowBalloonTip(
                3000,
                "TallyLink",
                "App minimized to tray. Sync continues in background.",
                WinForms::System.Windows.Forms.ToolTipIcon.Info);
        }

        public void RestoreFromTray()
        {
            if (_trayIcon == null) return;

            IsMinimizedToTray = false;
            _showMainWindow();
        }

        public void ShowNotification(string title, string message, WinForms::System.Windows.Forms.ToolTipIcon icon = WinForms::System.Windows.Forms.ToolTipIcon.Info)
        {
            _trayIcon?.ShowBalloonTip(5000, title, message, icon);
        }

        public void UpdateTooltip(string text)
        {
            if (_trayIcon != null)
                _trayIcon.Text = text.Length > 63 ? text.Substring(0, 60) + "..." : text;
        }

        private void ExitApplication()
        {
            _trayIcon?.Dispose();
            _trayIcon = null;
            Application.Current.Shutdown();
        }

        private Icon? LoadEmbeddedIcon()
        {
            try
            {
                var assembly = System.Reflection.Assembly.GetExecutingAssembly();
                var resourceName = assembly.GetManifestResourceNames()
                    .FirstOrDefault(n => n.EndsWith("app_icon.ico", StringComparison.OrdinalIgnoreCase));

                if (resourceName != null)
                {
                    using var stream = assembly.GetManifestResourceStream(resourceName);
                    if (stream != null) return new Icon(stream);
                }
            }
            catch { }

            try
            {
                var icoPath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app_icon.ico");
                if (System.IO.File.Exists(icoPath))
                    return new Icon(icoPath);
            }
            catch { }

            return null;
        }

        public void Dispose()
        {
            _trayIcon?.Dispose();
            _trayIcon = null;
        }
    }
}
