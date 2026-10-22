using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Hardcodet.Wpf.TaskbarNotification;

// Tray/notification code is only ever reachable on Windows.
#pragma warning disable CA1416

namespace TallySyncApp.Services
{
    /// <summary>
    /// Callbacks the tray menu needs from the application. All are optional; anything left
    /// null becomes a no-op so <see cref="TrayService"/> can be constructed before the main
    /// window exists.
    /// </summary>
    public sealed class TrayOptions
    {
        /// <summary>Show / restore the main window (also bound to a double-click on the tray icon).</summary>
        public Action? ShowWindow { get; set; }

        /// <summary>Hide the main window to the tray.</summary>
        public Action? HideWindow { get; set; }

        /// <summary>Trigger an immediate sync.</summary>
        public Action? SyncNow { get; set; }

        /// <summary>Open the log folder in Explorer.</summary>
        public Action? OpenLogFolder { get; set; }

        /// <summary>Shut the application down.</summary>
        public Action? Exit { get; set; }

        /// <summary>First line of the tray tooltip. Defaults to "TallyLink".</summary>
        public string Tooltip { get; set; } = "TallyLink";

        /// <summary>Create the tray icon hidden (useful when starting minimized).</summary>
        public bool StartHidden { get; set; }
    }

    /// <summary>
    /// Owns the notification-area (system tray) icon for TallyLink.
    ///
    /// The icon is created from the <c>app_icon.ico</c> that ships next to the executable, so no
    /// icon resource has to be embedded in this file. This service never creates a WPF
    /// <see cref="Window"/> of its own - all window behaviour is supplied by the caller through
    /// <see cref="TrayOptions"/> (show/hide/sync/logs/exit), which keeps it independent of
    /// MainWindow and safe to unit-test.
    /// </summary>
    public sealed class TrayService : IDisposable
    {
        private TaskbarIcon? _icon;
        private TrayOptions? _options;
        private string _statusText = "Starting";
        private bool _isConnected;
        private bool _disposed;
        private bool _windowVisible = true;

        /// <summary>True once the tray icon has been created.</summary>
        public bool IsInitialized => _icon is not null;

        /// <summary>The underlying Hardcodet tray icon (also exposed so callers can attach toasts).</summary>
        public TaskbarIcon? Icon => _icon;

        /// <summary>Current status text shown in the tooltip and the menu header.</summary>
        public string StatusText => _statusText;

        /// <summary>True when the app currently has a working cloud connection.</summary>
        public bool IsConnected => _isConnected;

        /// <summary>Current tooltip text of the tray icon.</summary>
        public string TooltipText => $"{_options?.Tooltip ?? "TallyLink"} — {_statusText}";

        /// <summary>Creates the tray icon with default (no-op) callbacks.</summary>
        public void Initialize()
        {
            Initialize(new TrayOptions());
        }

        /// <summary>Creates the tray icon and wires the supplied menu callbacks.</summary>
        public void Initialize(TrayOptions options)
        {
            if (options is null)
                throw new ArgumentNullException(nameof(options));

            if (IsInitialized || _disposed)
                return;

            // TaskbarIcon needs an STA thread with a dispatcher; hop to the WPF dispatcher if needed.
            var dispatcher = Application.Current?.Dispatcher;
            if (dispatcher is not null && !dispatcher.CheckAccess())
            {
                dispatcher.Invoke(() => InitializeCore(options));
            }
            else
            {
                InitializeCore(options);
            }
        }

        /// <summary>Convenience overload taking the five menu callbacks directly.</summary>
        public void Initialize(Action? showWindow, Action? hideWindow, Action? syncNow,
                               Action? openLogFolder, Action? exit)
        {
            Initialize(new TrayOptions
            {
                ShowWindow = showWindow,
                HideWindow = hideWindow,
                SyncNow = syncNow,
                OpenLogFolder = openLogFolder,
                Exit = exit,
            });
        }

        private void InitializeCore(TrayOptions options)
        {
            if (IsInitialized || _disposed)
                return;

            _options = options;

            var icon = new TaskbarIcon();
            icon.ToolTipText = TooltipText;
            icon.ContextMenu = BuildMenu();

            var iconSource = LoadIconSource();
            if (iconSource is not null)
                icon.IconSource = iconSource;

            icon.TrayMouseDoubleClick += OnTrayDoubleClick;
            icon.TrayLeftMouseDown += OnTrayLeftMouseDown;

            if (options.StartHidden)
                icon.Visibility = Visibility.Hidden;

            _icon = icon;
            _windowVisible = !options.StartHidden;

            // Let ToastService reuse this icon instead of creating one of its own.
            try
            {
                ToastService.Attach(icon);
            }
            catch
            {
                // Toast notifications are optional.
            }
        }

        private ContextMenu BuildMenu()
        {
            var menu = new ContextMenu();

            var header = new MenuItem
            {
                Header = TooltipText,
                IsEnabled = false,
                FontWeight = FontWeights.Bold,
            };
            menu.Items.Add(header);

            menu.Items.Add(new Separator());

            menu.Items.Add(CreateItem("Show window", ShowWindow));
            menu.Items.Add(CreateItem("Hide window", HideWindow));
            menu.Items.Add(CreateItem("Sync now", () => SafeInvoke(_options?.SyncNow)));
            menu.Items.Add(CreateItem("Open log folder", OpenLogFolder));

            menu.Items.Add(new Separator());
            menu.Items.Add(CreateItem("Exit", () => SafeInvoke(_options?.Exit)));

            menu.Opened += (_, _) => header.Header = TooltipText;

            return menu;
        }

        private static MenuItem CreateItem(string header, Action action)
        {
            var item = new MenuItem { Header = header };
            item.Click += (_, _) => SafeInvoke(action);
            return item;
        }

        private static void SafeInvoke(Action? action)
        {
            try
            {
                action?.Invoke();
            }
            catch (Exception ex)
            {
                try
                {
                    LoggingService.AppLogger.Warn(ex, "Tray menu action failed");
                }
                catch
                {
                    // Never let a menu callback take the tray down.
                }
            }
        }

        /// <summary>Shows/restores the main window through the caller's callback.</summary>
        public void ShowWindow()
        {
            _windowVisible = true;
            SafeInvoke(_options?.ShowWindow);
        }

        /// <summary>Hides the main window through the caller's callback.</summary>
        public void HideWindow()
        {
            _windowVisible = false;
            SafeInvoke(_options?.HideWindow);
        }

        /// <summary>Opens the NLog log directory in Explorer.</summary>
        public void OpenLogFolder()
        {
            if (_options?.OpenLogFolder is not null)
            {
                SafeInvoke(_options.OpenLogFolder);
                return;
            }

            var folder = LoggingService.LogDirectory;

            try
            {
                Directory.CreateDirectory(folder);
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = folder,
                    UseShellExecute = true,
                });
            }
            catch
            {
                // Explorer may be unavailable - the caller's callback still ran.
            }
        }

        /// <summary>
        /// Updates the status shown in the tooltip, the context menu header and the tray icon.
        /// </summary>
        public void SetStatus(string stateText, bool isConnected)
        {
            _statusText = string.IsNullOrWhiteSpace(stateText) ? "Idle" : stateText.Trim();
            _isConnected = isConnected;

            RunOnDispatcher(() =>
            {
                if (_icon is null)
                    return;

                _icon.ToolTipText = TooltipText;
                if (_icon.ContextMenu is { } menu)
                {
                    foreach (var item in menu.Items)
                    {
                        if (item is MenuItem { Tag: null } menuItem &&
                            menuItem.Header is string header &&
                            header.StartsWith("TallyLink", StringComparison.OrdinalIgnoreCase))
                        {
                            menuItem.Header = TooltipText;
                        }
                    }
                }
            });
        }

        /// <summary>Shows a tray balloon through the icon this service owns.</summary>
        public void ShowBalloon(string title, string message)
        {
            ShowBalloon(title, message, isError: false);
        }

        /// <summary>Shows a tray balloon (error variant) through the icon this service owns.</summary>
        public void ShowBalloon(string title, string message, bool isError)
        {
            if (_disposed)
                return;

            RunOnDispatcher(() => ToastService.Show(title, message, isError));
        }

        /// <summary>Makes sure the tray icon is visible.</summary>
        public void ShowTrayIcon()
        {
            RunOnDispatcher(() =>
            {
                if (_icon is not null)
                    _icon.Visibility = Visibility.Visible;
            });
        }

        /// <summary>Hides the tray icon (the icon is re-created by <see cref="Initialize"/>).</summary>
        public void HideTrayIcon()
        {
            RunOnDispatcher(() =>
            {
                if (_icon is not null)
                    _icon.Visibility = Visibility.Hidden;
            });
        }

        /// <summary>Shows the tray icon when the main window is hidden, and vice versa.</summary>
        public void SyncVisibilityWithWindow(bool windowVisible)
        {
            _windowVisible = windowVisible;
        }

        private void OnTrayDoubleClick(object sender, RoutedEventArgs e)
        {
            ShowWindow();
        }

        private void OnTrayLeftMouseDown(object sender, RoutedEventArgs e)
        {
            // Single left click also restores the window when it is hidden.
            if (!_windowVisible)
                ShowWindow();
        }

        private void RunOnDispatcher(Action action)
        {
            try
            {
                var dispatcher = _icon?.Dispatcher ?? Application.Current?.Dispatcher;
                if (dispatcher is not null && !dispatcher.CheckAccess())
                {
                    dispatcher.BeginInvoke(action);
                    return;
                }

                action();
            }
            catch
            {
                // Tray UI updates must never throw into the caller.
            }
        }

        /// <summary>Releases the tray icon and detaches the toast service.</summary>
        public void Dispose()
        {
            if (_disposed)
                return;

            _disposed = true;

            try
            {
                ToastService.Detach();
            }
            catch
            {
                // Ignore.
            }

            var icon = _icon;
            _icon = null;

            if (icon is null)
                return;

            try
            {
                icon.TrayMouseDoubleClick -= OnTrayDoubleClick;
                icon.TrayLeftMouseDown -= OnTrayLeftMouseDown;
            }
            catch
            {
                // Ignore.
            }

            try
            {
                var dispatcher = icon.Dispatcher;
                if (dispatcher.CheckAccess())
                    icon.Dispose();
                else
                    dispatcher.BeginInvoke(icon.Dispose);
            }
            catch
            {
                // Best effort.
            }
        }

        #region Icon loading

        private const int IMAGE_ICON = 1;
        private const int LR_LOADFROMFILE = 0x00000010;

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "LoadImageW")]
        private static extern IntPtr LoadImageFromFile(IntPtr hInst, string lpszName, int uType,
                                                       int cxDesired, int cyDesired, int fuLoad);

        [DllImport("user32.dll", SetLastError = true, EntryPoint = "LoadImageW")]
        private static extern IntPtr LoadImageFromResource(IntPtr hInst, IntPtr lpszName, int uType,
                                                           int cxDesired, int cyDesired, int fuLoad);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DestroyIcon(IntPtr hIcon);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string? lpModuleName);

        /// <summary>Finds app_icon.ico next to the executable, falling back to the project folder (dev layout).</summary>
        private static string? LocateIconFile()
        {
            var roots = new[]
            {
                AppContext.BaseDirectory,
                AppDomain.CurrentDomain.BaseDirectory,
                Environment.CurrentDirectory,
            };

            var directory = new DirectoryInfo(AppContext.BaseDirectory);
            for (var depth = 0; depth < 8 && directory is not null; depth++)
            {
                roots = roots.Append(Path.Combine(directory.FullName, "app_icon.ico")).ToArray();
                directory = directory.Parent;
            }

            foreach (var candidate in roots)
            {
                try
                {
                    if (File.Exists(candidate))
                        return candidate;
                }
                catch
                {
                    // Ignore inaccessible paths.
                }
            }

            return null;
        }

        /// <summary>
        /// Builds a WPF ImageSource for the tray icon from app_icon.ico. Falls back to the
        /// executable's own associated icon, then to a WPF decode of the .ico file.
        /// </summary>
        private static ImageSource? LoadIconSource()
        {
            IntPtr hIcon = IntPtr.Zero;
            try
            {
                var iconPath = LocateIconFile();
                if (iconPath is not null)
                    hIcon = LoadImageFromFile(IntPtr.Zero, iconPath, IMAGE_ICON, 32, 32, LR_LOADFROMFILE);

                if (hIcon == IntPtr.Zero)
                {
                    // The exe's associated icon IS app_icon.ico (ApplicationIcon in the csproj).
                    hIcon = LoadImageFromResource(GetModuleHandle(null), new IntPtr(1), IMAGE_ICON, 32, 32, 0);
                }

                if (hIcon != IntPtr.Zero)
                {
                    var source = Imaging.CreateBitmapSourceFromHIcon(
                        hIcon, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
                    source.Freeze();
                    return source;
                }
            }
            catch
            {
                // Fall through to the WPF decoder.
            }
            finally
            {
                if (hIcon != IntPtr.Zero)
                {
                    try { DestroyIcon(hIcon); } catch { /* Ignore. */ }
                }
            }

            try
            {
                var iconPath = LocateIconFile();
                if (iconPath is not null)
                {
                    var bitmap = new BitmapImage();
                    bitmap.BeginInit();
                    bitmap.UriSource = new Uri(iconPath, UriKind.Absolute);
                    bitmap.CacheOption = BitmapCacheOption.OnLoad;
                    bitmap.EndInit();
                    bitmap.Freeze();
                    return bitmap;
                }
            }
            catch
            {
                // No icon available - TaskbarIcon still works, it just shows the default.
            }

            return null;
        }

        #endregion
    }
}
