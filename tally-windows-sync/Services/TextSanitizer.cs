using System;
using System.Collections.Generic;
using System.Text;

namespace TallySyncApp.Services
{
    internal static class TextSanitizer
    {
        private static readonly Dictionary<char, byte> Windows1252ExtensionMap = new()
        {
            ['€'] = 0x80,
            ['‚'] = 0x82,
            ['ƒ'] = 0x83,
            ['„'] = 0x84,
            ['…'] = 0x85,
            ['†'] = 0x86,
            ['‡'] = 0x87,
            ['ˆ'] = 0x88,
            ['‰'] = 0x89,
            ['Š'] = 0x8A,
            ['‹'] = 0x8B,
            ['Œ'] = 0x8C,
            ['Ž'] = 0x8E,
            ['‘'] = 0x91,
            ['’'] = 0x92,
            ['“'] = 0x93,
            ['”'] = 0x94,
            ['•'] = 0x95,
            ['–'] = 0x96,
            ['—'] = 0x97,
            ['˜'] = 0x98,
            ['™'] = 0x99,
            ['š'] = 0x9A,
            ['›'] = 0x9B,
            ['œ'] = 0x9C,
            ['ž'] = 0x9E,
            ['Ÿ'] = 0x9F
        };

        private static readonly (string OldValue, string NewValue)[] FallbackFixes =
        {
            ("ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹", "₹"),
            ("Ã¢â€šÂ¹", "₹"),
            ("â‚¹", "₹"),
            ("ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢", "•"),
            ("Ã¢â‚¬Â¢", "•"),
            ("â€¢", "•"),
            ("Ã¢â‚¬â€", "—"),
            ("Ã¢â‚¬â€œ", "–"),
            ("Ã¢â†’Â’", "→")
        };

        public static string Normalize(string? value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return value ?? string.Empty;
            }

            var normalized = value.Replace("\u0000", string.Empty);

            for (var i = 0; i < 4; i++)
            {
                if (!LooksLikeMojibake(normalized))
                {
                    break;
                }

                var decoded = DecodeWindows1252Utf8(normalized);
                if (decoded == normalized)
                {
                    break;
                }

                normalized = decoded;
            }

            foreach (var (oldValue, newValue) in FallbackFixes)
            {
                normalized = normalized.Replace(oldValue, newValue, StringComparison.Ordinal);
            }

            if (LooksLikeMojibake(normalized))
            {
                normalized = SanitizeResidualMojibake(normalized);
            }

            return normalized;
        }

        private static bool LooksLikeMojibake(string value)
        {
            return value.Contains("Ã", StringComparison.Ordinal)
                || value.Contains("Â", StringComparison.Ordinal)
                || value.Contains("â", StringComparison.Ordinal)
                || value.Contains("ð", StringComparison.Ordinal)
                || value.Contains("ï¸", StringComparison.Ordinal);
        }

        private static string SanitizeResidualMojibake(string value)
        {
            var builder = new StringBuilder(value.Length);

            foreach (var ch in value)
            {
                if (ch == '\r' || ch == '\n' || ch == '\t')
                {
                    builder.Append(ch);
                    continue;
                }

                if ((ch >= 0x20 && ch <= 0x7E) || ch == '₹')
                {
                    builder.Append(ch);
                }
            }

            var cleaned = builder.ToString();
            while (cleaned.Contains("  ", StringComparison.Ordinal))
            {
                cleaned = cleaned.Replace("  ", " ", StringComparison.Ordinal);
            }

            return cleaned.Trim();
        }

        private static string DecodeWindows1252Utf8(string value)
        {
            var bytes = new byte[value.Length];

            for (var i = 0; i < value.Length; i++)
            {
                var ch = value[i];

                if (ch <= 0x00FF)
                {
                    bytes[i] = (byte)ch;
                    continue;
                }

                if (Windows1252ExtensionMap.TryGetValue(ch, out var mappedByte))
                {
                    bytes[i] = mappedByte;
                    continue;
                }

                bytes[i] = (byte)'?';
            }

            try
            {
                return Encoding.UTF8.GetString(bytes);
            }
            catch
            {
                return value;
            }
        }
    }
}
