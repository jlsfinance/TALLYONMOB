using System;
using System.Net;
using System.Text;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Voucher → printable HTML. Kept free of WPF/WebView2 so it stays testable.
    /// </summary>
    public static class VoucherPdfHtml
    {
        private static string Esc(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);

        public static string Build(Company company, Voucher v)
        {
            var sb = new StringBuilder();
            sb.Append("<!DOCTYPE html><html><head><meta charset='utf-8'><style>");
            sb.Append("body{font-family:Segoe UI,Arial,sans-serif;color:#111;margin:24px;font-size:12px}");
            sb.Append("h1{font-size:18px;margin:0 0 2px}.muted{color:#666;font-size:11px}");
            sb.Append("table{width:100%;border-collapse:collapse;margin-top:10px}");
            sb.Append("th,td{border-bottom:1px solid #ddd;padding:5px 4px;text-align:left}");
            sb.Append("th{background:#f2f5f7;font-size:11px;text-transform:uppercase;letter-spacing:.03em}");
            sb.Append("td.num,th.num{text-align:right}");
            sb.Append("h2{font-size:12px;margin:16px 0 0;text-transform:uppercase;color:#0B7A5A}");
            sb.Append(".total{margin-top:12px;text-align:right;font-size:14px;font-weight:600}");
            sb.Append("</style></head><body>");

            sb.Append($"<h1>{Esc(company.Name)}</h1>");
            sb.Append($"<div class='muted'>{Esc(v.VoucherType)} #{Esc(v.VoucherNumber)} &nbsp;·&nbsp; {v.VoucherDate:dd-MM-yyyy}</div>");
            if (!string.IsNullOrWhiteSpace(v.PartyName))
                sb.Append($"<div class='muted'>Party: {Esc(v.PartyName)}</div>");
            if (!string.IsNullOrWhiteSpace(v.Narration))
                sb.Append($"<div class='muted'>Narration: {Esc(v.Narration)}</div>");

            if (v.InventoryEntries.Count > 0)
            {
                sb.Append("<h2>Items</h2><table><tr><th>Item</th><th>HSN</th><th class='num'>Qty</th><th class='num'>Rate</th><th class='num'>Amount</th></tr>");
                foreach (var item in v.InventoryEntries)
                {
                    sb.Append("<tr>");
                    sb.Append($"<td>{Esc(item.StockItemName)}</td>");
                    sb.Append($"<td>{Esc(item.HsnCode)}</td>");
                    sb.Append($"<td class='num'>{item.Quantity:N2} {Esc(item.Unit)}</td>");
                    sb.Append($"<td class='num'>{item.Rate:N2}</td>");
                    sb.Append($"<td class='num'>{item.Amount:N2}</td>");
                    sb.Append("</tr>");
                }
                sb.Append("</table>");
            }

            if (v.LedgerEntries.Count > 0)
            {
                sb.Append("<h2>Ledger Entries</h2><table><tr><th>Ledger</th><th class='num'>Debit</th><th class='num'>Credit</th></tr>");
                foreach (var entry in v.LedgerEntries)
                {
                    sb.Append("<tr>");
                    sb.Append($"<td>{Esc(entry.LedgerName)}</td>");
                    sb.Append($"<td class='num'>{(entry.IsDebit ? entry.Amount.ToString("N2") : string.Empty)}</td>");
                    sb.Append($"<td class='num'>{(entry.IsDebit ? string.Empty : entry.Amount.ToString("N2"))}</td>");
                    sb.Append("</tr>");
                }
                sb.Append("</table>");
            }

            sb.Append($"<div class='total'>Total: ₹{v.TotalAmount:N2}</div>");
            sb.Append($"<div class='muted' style='margin-top:18px'>SYNCORA · {DateTime.Now:dd-MM-yyyy HH:mm}</div>");
            sb.Append("</body></html>");
            return sb.ToString();
        }
    }
}
