using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using Hardcodet.Wpf.TaskbarNotification;

// Tray/notification code is only ever reachable on Windows.
#pragma warning disable CA1416

namespace TallySyncApp.Services
{
    /// <summary>
    /// One notification that was shown to the user (kept for the in-memory history).
    /// </summary>
    public sealed record ToastEntry(
        string Title,
        string Message,
        bool IsError,
        DateTimeOffset Timestamp);

    /// <summary>
    /// Shows Windows notification-area balloon messages.
    ///
    /// This service deliberately owns NO tray icon of its own: it borrows an icon from the
    /// caller. Attach either a <see cref="TaskbarIcon"/> (preferred - used by <see cref="TrayService"/>)
    /// or a raw Win32 icon handle (<see cref="IntPtr"/>, e.g. an HICON from LoadImage).
    /// If nothing is attached, <see cref="Show"/> only records the message in the in-memory
    /// history instead of failing.
    /// </summary>
    public static class ToastService
    {
        private static readonly object Gate = new object();
        private static readonly List<ToastEntry> History = new List<ToastEntry>(32);

        private const int MaxHistory = 50;

        private static TaskbarIcon? _trayIcon;
        private static IntPtr _iconHandle;
        private static string? _tooltip;

        /// <summary>Number of notifications retained in memory.</summary>
        public static int HistoryCount
        {
            get { lock (Gate) return History.Count; }
        }

        /// <summary>The icon currently borrowed from the caller (Win32 handle), zero when none.</summary>
        public static IntPtr AttachedIconHandle => _iconHandle;

        /// <summary>The attached Hardcodet tray icon, or null.</summary>
        public static TaskbarIcon? AttachedTrayIcon => _trayIcon;

        /// <summary>
        /// Attaches a caller-owned Hardcodet tray icon. Balloons are shown through it, so this
        /// service never creates its own icon.
        /// </summary>
        public static void Attach(TaskbarIcon trayIcon)
        {
            if (trayIcon is null)
                throw new ArgumentNullException(nameof(trayIcon));

            lock (Gate)
            {
                DetachCore();
                _trayIcon = trayIcon;
                _iconHandle = IntPtr.Zero;
                _tooltip = null;
            }
        }

        /// <summary>
        /// Attaches a caller-owned Win32 icon handle (HICON). A lightweight hidden window is used
        /// only to receive the notification-area callback; the icon itself is always the caller's.
        /// </summary>
        public static void Attach(IntPtr iconHandle, string? tooltip = null)
        {
            if (iconHandle == IntPtr.Zero)
                throw new ArgumentNullException(nameof(iconHandle));

            lock (Gate)
            {
                DetachCore();
                _trayIcon = null;
                _iconHandle = iconHandle;
                _tooltip = string.IsNullOrWhiteSpace(tooltip) ? "TallyLink" : tooltip;
            }
        }

        /// <summary>Releases whatever icon was attached (does not destroy a caller-owned HICON).</summary>
        public static void Detach()
        {
            lock (Gate)
            {
                DetachCore();
            }
        }

        /// <summary>
        /// Shows a balloon notification.
        /// Returns true when it was actually handed to the notification area.
        /// </summary>
        public static bool Show(string title, string message, bool isError = false)
        {
            if (string.IsNullOrWhiteSpace(message))
                return false;

            var safeTitle = string.IsNullOrWhiteSpace(title) ? "TallyLink" : title;
            var safeMessage = message.Trim();

            lock (Gate)
            {
                Record(safeTitle, safeMessage, isError);

                try
                {
                    if (_trayIcon is not null)
                    {
                        var balloon = isError ? BalloonIcon.Error : BalloonIcon.Info;
                        _trayIcon.ShowBalloonTip(safeTitle, safeMessage, balloon);
                        return true;
                    }

                    if (_iconHandle != IntPtr.Zero)
                        return ShowWin32Balloon(_iconHandle, safeTitle, safeMessage, isError);
                }
                catch
                {
                    // A notification must never take the app down - history already has the entry.
                    return false;
                }

                return false;
            }
        }

        /// <summary>Returns up to <paramref name="count"/> most recent notifications, newest first.</summary>
        public static IReadOnlyList<ToastEntry> Recent(int count)
        {
            if (count <= 0)
                return Array.Empty<ToastEntry>();

            lock (Gate)
            {
                var take = Math.Min(count, History.Count);
                return History.GetRange(History.Count - take, take).AsReadOnly();
            }
        }

        /// <summary>Returns all retained notifications, newest first.</summary>
        public static IReadOnlyList<ToastEntry> All()
        {
            lock (Gate)
            {
                return History.AsReadOnly();
            }
        }

        /// <summary>Drops the retained history.</summary>
        public static void ClearHistory()
        {
            lock (Gate)
            {
                History.Clear();
            }
        }

        private static void Record(string title, string message, bool isError)
        {
            History.Add(new ToastEntry(title, message, isError, DateTimeOffset.Now));
            while (History.Count > MaxHistory)
                History.RemoveAt(0);
        }

        private static void DetachCore()
        {
            try
            {
                if (_iconHandle != IntPtr.Zero)
                {
                    Win32Remove();
                    _iconHandle = IntPtr.Zero;
                }

                _trayIcon = null;
                _tooltip = null;
            }
            catch
            {
                // Best effort detach.
            }
        }

        #region Win32 notification area (used only when the caller supplies an HICON)

        private const int NIM_ADD = 0x00000000;
        private const int NIM_MODIFY = 0x00000001;
        private const int NIM_DELETE = 0x00000002;

        private const int NIF_MESSAGE = 0x00000001;
        private const int NIF_ICON = 0x00000002;
        private const int NIF_TIP = 0x00000004;
        private const int NIF_INFO = 0x00000010;

        private const int NIIF_INFO = 0x00000001;
        private const int NIIF_WARNING = 0x00000002;
        private const int NIIF_ERROR = 0x00000003;

        private const int WM_DESTROY = 0x0002;
        private const int WM_USER = 0x0400;
        private const int WM_NOTIFYICON = WM_USER + 2001;
        private const int IDC_ARROW = 32512;

        private const string HiddenWindowClass = "TallyLink.ToastService.NotifySink";
        private const string HiddenWindowName = "TallyLink Toast Notification Sink";

        private static nint _sinkWindow;
        private static readonly int SinkWindowId = 1;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        private struct NOTIFYICONDATA
        {
            public int cbSize;
            public nint hWnd;
            public int uID;
            public int uFlags;
            public int uCallbackMessage;
            public nint hIcon;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
            public int dwState;
            public int dwStateMask;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
            public int uTimeoutOrVersion;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
            public int dwInfoFlags;
            public Guid guidItem;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct WNDCLASS
        {
            public uint style;
            public nint lpfnWndProc;
            public int cbClsExtra;
            public int cbWndExtra;
            public nint hInstance;
            public nint hIcon;
            public nint hCursor;
            public nint hbrBackground;
            public string? lpszMenuName;
            public string lpszClassName;
        }

        [DllImport("shell32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool Shell_NotifyIcon(int message, ref NOTIFYICONDATA data);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern nint CreateWindowEx(int exStyle, string className, string windowName,
            uint style, int x, int y, int width, int height, nint parent, nint menu, nint instance, nint param);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool DestroyWindow(nint hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnregisterClass(string className, nint instance);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern ushort RegisterClass(ref WNDCLASS lpWndClass);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern nint DefWindowProc(nint hWnd, uint msg, nint wParam, nint lParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern nint LoadCursor(nint hInstance, nint lpCursorName);

        [DllImport("kernel32.dll")]
        private static extern nint GetModuleHandle(string? lpModuleName);

        private static bool ShowWin32Balloon(IntPtr iconHandle, string title, string message, bool isError)
        {
            try
            {
                EnsureSinkWindow();

                if (_sinkWindow == nint.Zero)
                    return false;

                var data = new NOTIFYICONDATA
                {
                    cbSize = Marshal.SizeOf<NOTIFYICONDATA>(),
                    hWnd = _sinkWindow,
                    uID = SinkWindowId,
                    uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_INFO,
                    uCallbackMessage = WM_NOTIFYICON,
                    hIcon = iconHandle,
                    szTip = (_tooltip ?? "TallyLink").Length > 127 ? (_tooltip ?? "TallyLink")[..127] : (_tooltip ?? "TallyLink"),
                    szInfo = message.Length > 255 ? message[..255] : message,
                    szInfoTitle = title.Length > 63 ? title[..63] : title,
                    dwInfoFlags = isError ? NIIF_ERROR : NIIF_INFO,
                    guidItem = Guid.Empty,
                };

                // First call registers the icon, later calls only refresh it / show the balloon.
                if (!Shell_NotifyIcon(NIM_ADD, ref data))
                {
                    // Already registered (or registration refused) - try to update it.
                    data.uFlags = NIF_ICON | NIF_TIP | NIF_INFO;
                    Shell_NotifyIcon(NIM_MODIFY, ref data);
                    return true;
                }

                data.uFlags = NIF_ICON | NIF_TIP | NIF_INFO;
                Shell_NotifyIcon(NIM_MODIFY, ref data);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static void EnsureSinkWindow()
        {
            if (_sinkWindow != nint.Zero)
                return;

            var wndProc = new WindowProcedure(SinkWndProc);
            var wndClass = new WNDCLASS
            {
                style = 0,
                lpfnWndProc = Marshal.GetFunctionPointerForDelegate(wndProc),
                hInstance = GetModuleHandle(null),
                hCursor = LoadCursor(nint.Zero, new nint(IDC_ARROW)),
                lpszClassName = HiddenWindowClass,
            };

            // Re-registering an existing class fails - that is fine, the class is already there.
            RegisterClass(ref wndClass);

            _sinkWindow = CreateWindowEx(
                0,
                HiddenWindowClass,
                HiddenWindowName,
                0,
                0, 0, 0, 0,
                new nint(-3), // HWND_MESSAGE - a message-only window
                nint.Zero,
                wndClass.hInstance,
                nint.Zero);
        }

        private static nint SinkWndProc(nint hWnd, uint msg, nint wParam, nint lParam)
        {
            if (msg == WM_NOTIFYICON)
            {
                // Balloon dismissed / closed / clicked - nothing to do, the message is consumed.
                return nint.Zero;
            }

            if (msg == WM_DESTROY)
            {
                Win32Remove();
                return nint.Zero;
            }

            return DefWindowProc(hWnd, msg, wParam, lParam);
        }

        private static void Win32Remove()
        {
            try
            {
                if (_sinkWindow == nint.Zero)
                    return;

                var data = new NOTIFYICONDATA
                {
                    cbSize = Marshal.SizeOf<NOTIFYICONDATA>(),
                    hWnd = _sinkWindow,
                    uID = SinkWindowId,
                };

                Shell_NotifyIcon(NIM_DELETE, ref data);
            }
            catch
            {
                // Ignore - removing an icon that was never added is harmless.
            }
        }

        private delegate nint WindowProcedure(nint hWnd, uint msg, nint wParam, nint lParam);

        #endregion
    }
}
