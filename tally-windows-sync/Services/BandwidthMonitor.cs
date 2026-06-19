using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Threading;

namespace TallySyncApp.Services
{
    public class BandwidthMonitor : INotifyPropertyChanged
    {
        private long _totalBytesUploaded;
        private long _totalBytesDownloaded;
        private long _sessionBytesUploaded;
        private long _sessionBytesDownloaded;
        private long _currentSyncBytesUploaded;
        private long _currentSyncBytesDownloaded;

        public long TotalBytesUploaded => Interlocked.Read(ref _totalBytesUploaded);
        public long TotalBytesDownloaded => Interlocked.Read(ref _totalBytesDownloaded);
        public long SessionBytesUploaded => Interlocked.Read(ref _sessionBytesUploaded);
        public long SessionBytesDownloaded => Interlocked.Read(ref _sessionBytesDownloaded);
        public long CurrentSyncBytesUploaded => Interlocked.Read(ref _currentSyncBytesUploaded);
        public long CurrentSyncBytesDownloaded => Interlocked.Read(ref _currentSyncBytesDownloaded);

        public string TotalUploadedFormatted => FormatBytes(TotalBytesUploaded);
        public string TotalDownloadedFormatted => FormatBytes(TotalBytesDownloaded);
        public string SessionUploadedFormatted => FormatBytes(SessionBytesUploaded);
        public string SessionDownloadedFormatted => FormatBytes(SessionBytesDownloaded);
        public string CurrentSyncUploadedFormatted => FormatBytes(CurrentSyncBytesUploaded);
        public string CurrentSyncDownloadedFormatted => FormatBytes(CurrentSyncBytesDownloaded);

        public void AddUpload(long bytes)
        {
            Interlocked.Add(ref _totalBytesUploaded, bytes);
            Interlocked.Add(ref _sessionBytesUploaded, bytes);
            Interlocked.Add(ref _currentSyncBytesUploaded, bytes);
            NotifyAll();
        }

        public void AddDownload(long bytes)
        {
            Interlocked.Add(ref _totalBytesDownloaded, bytes);
            Interlocked.Add(ref _sessionBytesDownloaded, bytes);
            Interlocked.Add(ref _currentSyncBytesDownloaded, bytes);
            NotifyAll();
        }

        public void TrackRequest(long requestBytes, long responseBytes)
        {
            if (requestBytes > 0) AddUpload(requestBytes);
            if (responseBytes > 0) AddDownload(responseBytes);
        }

        public void ResetCurrentSync()
        {
            Interlocked.Exchange(ref _currentSyncBytesUploaded, 0);
            Interlocked.Exchange(ref _currentSyncBytesDownloaded, 0);
            NotifyAll();
        }

        public void ResetSession()
        {
            Interlocked.Exchange(ref _sessionBytesUploaded, 0);
            Interlocked.Exchange(ref _sessionBytesDownloaded, 0);
            ResetCurrentSync();
            NotifyAll();
        }

        private static string FormatBytes(long bytes)
        {
            string[] sizes = ["B", "KB", "MB", "GB", "TB"];
            int order = 0;
            double size = bytes;
            while (size >= 1024 && order < sizes.Length - 1)
            {
                order++;
                size /= 1024;
            }
            return $"{size:0.##} {sizes[order]}";
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        private void NotifyAll()
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(TotalBytesUploaded)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(TotalBytesDownloaded)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(SessionBytesUploaded)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(SessionBytesDownloaded)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(CurrentSyncBytesUploaded)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(CurrentSyncBytesDownloaded)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(TotalUploadedFormatted)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(TotalDownloadedFormatted)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(SessionUploadedFormatted)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(SessionDownloadedFormatted)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(CurrentSyncUploadedFormatted)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(CurrentSyncDownloadedFormatted)));
        }
    }
}
