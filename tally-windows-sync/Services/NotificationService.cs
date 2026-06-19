extern alias WinForms;

using System;
using System.Media;
using System.Windows;

namespace TallySyncApp.Services
{
    public static class NotificationService
    {
        private static TrayService? _trayService;

        public static void Initialize(TrayService trayService)
        {
            _trayService = trayService;
        }

        public static void NotifySyncCompleted(string companyName, int recordsProcessed, TimeSpan duration)
        {
            var title = "Sync Completed";
            var message = $"{companyName}: {recordsProcessed} records synced in {duration.TotalSeconds:F0}s";

            _trayService?.ShowNotification(title, message, WinForms::System.Windows.Forms.ToolTipIcon.Info);

            try { SystemSounds.Asterisk.Play(); } catch { }
        }

        public static void NotifySyncFailed(string companyName, string error)
        {
            var title = "Sync Failed";
            var message = $"{companyName}: {error}";

            _trayService?.ShowNotification(title, message, WinForms::System.Windows.Forms.ToolTipIcon.Error);

            try { SystemSounds.Exclamation.Play(); } catch { }
        }

        public static void NotifySyncStarted(string companyName)
        {
            _trayService?.UpdateTooltip($"TallyLink - Syncing {companyName}...");
        }

        public static void NotifyIdle()
        {
            _trayService?.UpdateTooltip("TallyLink - Idle");
        }

        public static void NotifyStaleSync(int hoursSinceLastSync)
        {
            if (hoursSinceLastSync >= 48)
            {
                _trayService?.ShowNotification(
                    "Sync Overdue",
                    $"Last sync was {hoursSinceLastSync / 24} day(s) ago. Please sync your data.",
                    WinForms::System.Windows.Forms.ToolTipIcon.Warning);
            }
        }
    }
}
