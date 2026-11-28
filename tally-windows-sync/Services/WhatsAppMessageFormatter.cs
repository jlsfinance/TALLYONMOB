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

        private static (string Label, string Possessive, string NewAdjective, string CheckLine) GetDesiHindiVoucherCopy(string? voucherType)
        {
            var raw = (voucherType ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(raw))
                return ("वाउचर", "आपका", "नया", "कृपया वाउचर में अमाउंट चेक कर लीजिएगा।");

            if (raw.StartsWith("Sales", StringComparison.OrdinalIgnoreCase))
                return ("बिल (Sales)", "आपका", "नया", "कृपया बिल चेक कर लीजिएगा।");
            if (raw.StartsWith("Receipt", StringComparison.OrdinalIgnoreCase))
                return ("रसीद (Receipt)", "आपकी", "नई", "कृपया रसीद में अमाउंट चेक कर लीजिएगा।");
            if (raw.StartsWith("Payment", StringComparison.OrdinalIgnoreCase))
                return ("पेमेंट स्लिप (Payment)", "आपकी", "नई", "कृपया पेमेंट स्लिप में अमाउंट चेक कर लीजिएगा।");
            if (raw.StartsWith("Credit Note", StringComparison.OrdinalIgnoreCase))
                return ("क्रेडिट नोट (Credit Note)", "आपका", "नया", "कृपया क्रेडिट नोट में अमाउंट चेक कर लीजिएगा।");
            if (raw.StartsWith("Debit Note", StringComparison.OrdinalIgnoreCase))
                return ("डेबिट नोट (Debit Note)", "आपका", "नया", "कृपया डेबिट नोट में अमाउंट चेक कर लीजिएगा।");
            if (raw.StartsWith("Purchase", StringComparison.OrdinalIgnoreCase))
                return ("खरीद बिल (Purchase)", "आपका", "नया", "कृपया बिल चेक कर लीजिएगा।");

            return ($"वाउचर ({raw})", "आपका", "नया", "कृपया वाउचर में अमाउंट चेक कर लीजिएगा।");
        }

        public static string GetDesiHindiVoucherLabel(string? voucherType) =>
            GetDesiHindiVoucherCopy(voucherType).Label;

        public static string BuildPartyVoucherCaption(
            string companyName,
            string voucherType,
            string voucherNumber,
            DateTime voucherDate,
            string? partyName,
            decimal totalAmount)
        {
            var copy = GetDesiHindiVoucherCopy(voucherType);
            var greeting = string.IsNullOrWhiteSpace(partyName)
                ? "🙏 *राम-राम / नमस्ते जी,*"
                : $"🙏 *राम-राम / नमस्ते {partyName.Trim()} जी,*";
            return $"{greeting}\n\n" +
                   $"*{companyName.Trim()}* की तरफ से {copy.Possessive} *{copy.Label} #{voucherNumber}* तैयार है और हमने PDF साथ में भेज दी है।\n\n" +
                   $"📅 *तारीख:* {voucherDate:dd-MM-yyyy}\n" +
                   $"💰 *कुल रकम:* *₹{totalAmount:N2}*\n\n" +
                   $"{copy.CheckLine} किसी भी बात या हिसाब-किताब के लिए बेझिझक कॉल या मैसेज करें।\n" +
                   "हमारे साथ जुड़े रहने के लिए दिल से धन्यवाद! 🤝";
        }

        public static string BuildOwnerVoucherCaption(
            string companyName,
            string voucherType,
            string voucherNumber,
            DateTime voucherDate,
            string? partyName,
            decimal totalAmount)
        {
            var copy = GetDesiHindiVoucherCopy(voucherType);
            var partyLine = string.IsNullOrWhiteSpace(partyName)
                ? string.Empty
                : $"👤 *पार्टी:* {partyName.Trim()}\n";
            return $"🧾 *{copy.NewAdjective} {copy.Label} तैयार — {companyName.Trim()}*\n\n" +
                   $"{partyLine}" +
                   $"🔢 *नंबर:* #{voucherNumber}\n" +
                   $"📅 *तारीख:* {voucherDate:dd-MM-yyyy}\n" +
                   $"💰 *कुल रकम:* *₹{totalAmount:N2}*\n\n" +
                   "PDF कॉपी साथ में भेज दी है। ✅";
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
