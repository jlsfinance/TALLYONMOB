using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace TallySyncApp.Models
{
    /// <summary>
    /// View-item representing one Tally/Cloud company card in Dashboard and Sync Status.
    /// </summary>
    public class CompanyCardItem : INotifyPropertyChanged
    {
        private string _companyId = string.Empty;
        private string _name = string.Empty;
        private string? _tallyGuid;
        private string? _dataPath;
        private string _financialYearText = string.Empty;
        private string _recordsSummaryText = string.Empty;
        private bool _isOpenInTally;
        private bool _isSyncing;
        private int _progressPercent;
        private string _progressMessage = "Ready";
        private DateTime? _lastSyncAt;
        private bool _hasWarning;
        private string _warningTitle = string.Empty;
        private string _warningMessage = string.Empty;

        public string CompanyId
        {
            get => _companyId;
            set { _companyId = value; OnPropertyChanged(); }
        }

        public string Name
        {
            get => _name;
            set { _name = value; OnPropertyChanged(); }
        }

        public string? TallyGuid
        {
            get => _tallyGuid;
            set { _tallyGuid = value; OnPropertyChanged(); }
        }

        public string? DataPath
        {
            get => _dataPath;
            set { _dataPath = value; OnPropertyChanged(); OnPropertyChanged(nameof(SubtitleText)); }
        }

        public string FinancialYearText
        {
            get => _financialYearText;
            set { _financialYearText = value; OnPropertyChanged(); OnPropertyChanged(nameof(SubtitleText)); }
        }

        public string RecordsSummaryText
        {
            get => _recordsSummaryText;
            set { _recordsSummaryText = value; OnPropertyChanged(); OnPropertyChanged(nameof(SubtitleText)); }
        }

        public bool IsOpenInTally
        {
            get => _isOpenInTally;
            set
            {
                _isOpenInTally = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(OpenBadgeText));
                OnPropertyChanged(nameof(OpenBadgeBg));
                OnPropertyChanged(nameof(OpenBadgeFg));
                OnPropertyChanged(nameof(OpenDotColor));
                OnPropertyChanged(nameof(OpenBadgeTooltip));
                OnPropertyChanged(nameof(IconBg));
                OnPropertyChanged(nameof(IconFg));
                OnPropertyChanged(nameof(CanSyncCompany));
                OnPropertyChanged(nameof(SyncStateLabel));
                OnPropertyChanged(nameof(SyncStatusBg));
                OnPropertyChanged(nameof(SyncStatusFg));
                OnPropertyChanged(nameof(ProgressBarColor));
            }
        }

        public bool IsSyncing
        {
            get => _isSyncing;
            set
            {
                _isSyncing = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CanSyncCompany));
                OnPropertyChanged(nameof(SyncStateLabel));
                OnPropertyChanged(nameof(SyncStatusBg));
                OnPropertyChanged(nameof(SyncStatusFg));
                OnPropertyChanged(nameof(ProgressBarColor));
            }
        }

        public int ProgressPercent
        {
            get => _progressPercent;
            set
            {
                _progressPercent = Math.Clamp(value, 0, 100);
                OnPropertyChanged();
            }
        }

        public string ProgressMessage
        {
            get => _progressMessage;
            set { _progressMessage = value; OnPropertyChanged(); }
        }

        public DateTime? LastSyncAt
        {
            get => _lastSyncAt;
            set
            {
                _lastSyncAt = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(LastSyncText));
                OnPropertyChanged(nameof(SyncStateLabel));
                OnPropertyChanged(nameof(SyncStatusBg));
                OnPropertyChanged(nameof(SyncStatusFg));
                OnPropertyChanged(nameof(ProgressBarColor));
            }
        }

        public bool HasWarning
        {
            get => _hasWarning;
            set
            {
                _hasWarning = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(WarningTooltip));
                OnPropertyChanged(nameof(SyncStateLabel));
                OnPropertyChanged(nameof(SyncStatusBg));
                OnPropertyChanged(nameof(SyncStatusFg));
                OnPropertyChanged(nameof(ProgressBarColor));
            }
        }

        public string WarningTitle
        {
            get => _warningTitle;
            set { _warningTitle = value; OnPropertyChanged(); OnPropertyChanged(nameof(WarningTooltip)); }
        }

        public string WarningMessage
        {
            get => _warningMessage;
            set { _warningMessage = value; OnPropertyChanged(); OnPropertyChanged(nameof(WarningTooltip)); }
        }

        public string WarningTooltip => string.IsNullOrWhiteSpace(WarningMessage)
            ? (string.IsNullOrWhiteSpace(WarningTitle) ? "Sync attention needed" : WarningTitle)
            : (string.IsNullOrWhiteSpace(WarningTitle) ? WarningMessage : $"{WarningTitle}: {WarningMessage}");

        public string OpenBadgeText => IsOpenInTally ? "Open in Tally" : "Closed";
        public string OpenBadgeBg => IsOpenInTally ? "#ECFDF5" : "#F1F5F9";
        public string OpenBadgeFg => IsOpenInTally ? "#047857" : "#64748B";
        public string OpenDotColor => IsOpenInTally ? "#10B981" : "#94A3B8";
        public string OpenBadgeTooltip => IsOpenInTally
            ? "Currently loaded in Tally"
            : "Open this company in Tally to sync changes";

        public string IconBg => IsOpenInTally ? "#ECFDF5" : "#F1F5F9";
        public string IconFg => IsOpenInTally ? "#059669" : "#64748B";

        public string SyncStateLabel =>
            IsSyncing ? "Syncing" :
            HasWarning ? "Attention" :
            LastSyncAt.HasValue ? "Synced" : "Idle";

        public string SyncStatusBg =>
            IsSyncing ? "#EFF6FF" :
            HasWarning ? "#FEF3C7" :
            LastSyncAt.HasValue ? "#ECFDF5" : "#F1F5F9";

        public string SyncStatusFg =>
            IsSyncing ? "#1D4ED8" :
            HasWarning ? "#B45309" :
            LastSyncAt.HasValue ? "#047857" : "#64748B";

        public string ProgressBarColor =>
            IsSyncing ? "#2563EB" :
            HasWarning ? "#D97706" :
            LastSyncAt.HasValue ? "#059669" : "#CBD5E1";

        public bool CanSyncCompany => IsOpenInTally && !IsSyncing;

        public string LastSyncText => FormatLastSync(LastSyncAt);

        public string SubtitleText
        {
            get
            {
                var parts = new List<string>();
                if (!string.IsNullOrWhiteSpace(FinancialYearText))
                    parts.Add(FinancialYearText);
                if (!string.IsNullOrWhiteSpace(DataPath))
                    parts.Add(DataPath);
                if (!string.IsNullOrWhiteSpace(RecordsSummaryText))
                    parts.Add(RecordsSummaryText);
                return parts.Count > 0 ? string.Join(" · ", parts) : "Cloud synced company";
            }
        }

        public static string FormatLastSync(DateTime? timestamp)
        {
            if (!timestamp.HasValue) return "Not synced yet";
            var dt = timestamp.Value;
            var diff = DateTime.Now - dt;
            if (diff.TotalSeconds >= -60 && diff.TotalMinutes < 1) return "Just now";
            if (diff.TotalMinutes >= 1 && diff.TotalMinutes < 60) return $"{(int)diff.TotalMinutes}m ago";
            if (dt.Date == DateTime.Today) return $"Today, {dt:HH:mm}";
            return dt.ToString("dd MMM, HH:mm");
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        public void OnPropertyChanged([CallerMemberName] string? name = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        }
    }
}
