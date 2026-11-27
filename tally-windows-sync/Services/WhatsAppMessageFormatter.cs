using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Formats phone numbers and converts Telegram HTML snippets into clean WhatsApp markdown.
    /// </summary>
    public static class WhatsAppMessageFormatter
    {
        public static string NormalizePhone(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return string.Empty;

            var digits = new string(raw.Where(char.IsDigit).ToArray());
            if (digits.Length == 10)
                return "91" + digits;

            return digits.Length >= 10 ? digits : string.Empty;
        }

        /// <summary>
        /// Splits multi-number Tally contact strings (e.g. "0141-234567 / 9829012345")
        /// and picks a valid Indian mobile (91 + [6-9] + 9 digits) first if present.
        /// </summary>
        public static string ExtractPrimaryPhone(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return string.Empty;

            var parts = raw.Split(new[] { '/', ',', ';', '|' }, StringSplitOptions.RemoveEmptyEntries);
            string? firstValid = null;
            foreach (var part in parts)
            {
                var normalized = NormalizePhone(part);
                if (string.IsNullOrEmpty(normalized)) continue;
                firstValid ??= normalized;
                if (normalized.Length == 12 && normalized.StartsWith("91") && normalized[2] >= '6' && normalized[2] <= '9')
                {
                    return normalized;
                }
            }
            return firstValid ?? string.Empty;
        }

        public static bool ShouldSendToParty(string? voucherType, string? allowedTypesCsv)
        {
            if (string.IsNullOrWhiteSpace(voucherType) || string.IsNullOrWhiteSpace(allowedTypesCsv))
                return false;

            var vType = voucherType.Trim();
            var allowed = allowedTypesCsv.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var item in allowed)
            {
                var rule = item.Trim();
                if (string.IsNullOrEmpty(rule)) continue;
                if (vType.Equals(rule, StringComparison.OrdinalIgnoreCase) ||
                    vType.StartsWith(rule + " ", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        public static string BuildPartyVoucherCaption(
            string companyName,
            string voucherType,
            string voucherNumber,
            DateTime voucherDate,
            string? partyName,
            decimal totalAmount)
        {
            var greeting = string.IsNullOrWhiteSpace(partyName) ? "Dear Sir/Madam," : $"Dear {partyName.Trim()},";
            return $"*{companyName.Trim()}*\n{greeting}\n\n" +
                   $"Please find attached your *{voucherType} #{voucherNumber}* dated {voucherDate:dd-MM-yyyy} for *₹{totalAmount:N2}*.\n\n" +
                   "Thank you for your business.";
        }

        public static string ConvertHtmlToWhatsApp(string? html)
        {
            if (string.IsNullOrWhiteSpace(html))
                return string.Empty;

            var text = html;
            text = Regex.Replace(text, @"<b>(.*?)</b>", "*$1*", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"<strong>(.*?)</strong>", "*$1*", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"<i>(.*?)</i>", "_$1_", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"<em>(.*?)</em>", "_$1_", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"<code>(.*?)</code>", "`$1`", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"<[^>]*>", string.Empty);
            text = text.Replace("&amp;", "&").Replace("&lt;", "<").Replace("&gt;", ">");
            return text.Trim();
        }
    }
}
