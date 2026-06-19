using System;
using System.IO;
using System.Text;
using System.Windows;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    public static class PdfExportService
    {
        public static string ExportSyncReport(SyncStatus status, string companyName, BandwidthMonitor bandwidth)
        {
            var filename = $"TallyLink_SyncReport_{DateTime.Now:yyyyMMdd_HHmmss}.html";
            var filePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), filename);

            var html = new StringBuilder();
            html.AppendLine("<!DOCTYPE html>");
            html.AppendLine("<html><head><meta charset='utf-8'>");
            html.AppendLine("<title>TallyLink Sync Report</title>");
            html.AppendLine("<style>");
            html.AppendLine("body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #1e293b; }");
            html.AppendLine("h1 { color: #0f172a; border-bottom: 3px solid #1e3a5f; padding-bottom: 10px; }");
            html.AppendLine("h2 { color: #1e3a5f; margin-top: 30px; }");
            html.AppendLine(".header { display: flex; justify-content: space-between; align-items: center; }");
            html.AppendLine(".badge { padding: 4px 12px; border-radius: 20px; color: white; font-weight: bold; font-size: 12px; }");
            html.AppendLine(".badge-green { background: #059669; }");
            html.AppendLine(".badge-red { background: #dc2626; }");
            html.AppendLine(".badge-amber { background: #d97706; }");
            html.AppendLine("table { width: 100%; border-collapse: collapse; margin: 16px 0; }");
            html.AppendLine("th { background: #f1f5f9; color: #64748b; font-size: 11px; text-transform: uppercase; padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }");
            html.AppendLine("td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }");
            html.AppendLine(".stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 8px 0; }");
            html.AppendLine(".stat-label { color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; }");
            html.AppendLine(".stat-value { font-size: 24px; font-weight: bold; color: #0f172a; }");
            html.AppendLine(".footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; }");
            html.AppendLine("</style></head><body>");

            // Header
            html.AppendLine("<div class='header'>");
            html.AppendLine("<div><h1>TallyLink Sync Report</h1>");
            html.AppendLine($"<p>Company: <strong>{companyName}</strong> | Generated: {DateTime.Now:dd MMM yyyy HH:mm:ss}</p></div>");

            var statusBadge = status.State switch
            {
                SyncState.Completed => "badge-green",
                SyncState.Error => "badge-red",
                SyncState.Retrying => "badge-amber",
                _ => "badge-green"
            };
            html.AppendLine($"<span class='badge {statusBadge}'>{status.State}</span>");
            html.AppendLine("</div>");

            // Summary Stats
            html.AppendLine("<h2>Sync Summary</h2>");
            html.AppendLine("<table><tr>");
            html.AppendLine($"<td><div class='stat-card'><div class='stat-label'>Status</div><div class='stat-value'>{status.State}</div></div></td>");
            html.AppendLine($"<td><div class='stat-card'><div class='stat-label'>Records Processed</div><div class='stat-value'>{status.ProcessedRecords}</div></div></td>");
            html.AppendLine($"<td><div class='stat-card'><div class='stat-label'>Last Sync</div><div class='stat-value'>{status.LastSyncTime?.ToString("HH:mm:ss") ?? "Never"}</div></div></td>");
            html.AppendLine("</tr></table>");

            // Connection Status
            html.AppendLine("<h2>Connection Status</h2>");
            html.AppendLine("<table>");
            html.AppendLine("<tr><th>Component</th><th>Status</th></tr>");
            html.AppendLine($"<td>Tally ERP</td><td>{(status.IsTallyConnected ? "<span style='color:#059669'>Connected</span>" : "<span style='color:#dc2626'>Disconnected</span>")}</td></tr>");
            html.AppendLine($"<td>Cloud Server</td><td>{(status.IsServerConnected ? "<span style='color:#059669'>Connected</span>" : "<span style='color:#dc2626'>Disconnected</span>")}</td></tr>");
            html.AppendLine("</table>");

            // Bandwidth
            html.AppendLine("<h2>Bandwidth Usage</h2>");
            html.AppendLine("<table>");
            html.AppendLine("<tr><th>Metric</th><th>Value</th></tr>");
            html.AppendLine($"<td>Total Uploaded</td><td>{bandwidth.TotalUploadedFormatted}</td></tr>");
            html.AppendLine($"<td>Total Downloaded</td><td>{bandwidth.TotalDownloadedFormatted}</td></tr>");
            html.AppendLine($"<td>Session Uploaded</td><td>{bandwidth.SessionUploadedFormatted}</td></tr>");
            html.AppendLine($"<td>Session Downloaded</td><td>{bandwidth.SessionDownloadedFormatted}</td></tr>");
            html.AppendLine("</table>");

            // Footer
            html.AppendLine("<div class='footer'>");
            html.AppendLine($"<p>TallyLink v3.1.0 | Report generated on {DateTime.Now:yyyy-MM-dd HH:mm:ss}</p>");
            html.AppendLine("<p>Print this page (Ctrl+P) and select 'Save as PDF' to export as PDF.</p>");
            html.AppendLine("</div>");

            html.AppendLine("</body></html>");

            File.WriteAllText(filePath, html.ToString(), Encoding.UTF8);
            return filePath;
        }

        public static void ExportAndOpen(SyncStatus status, string companyName, BandwidthMonitor bandwidth)
        {
            try
            {
                var path = ExportSyncReport(status, companyName, bandwidth);
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = path,
                    UseShellExecute = true
                };
                System.Diagnostics.Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to export report: {ex.Message}", "Export Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}
