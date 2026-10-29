using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace TallySyncApp.Services
{
    // DPAPI protects the file for the Windows account that created it.
    internal sealed class SessionStore
    {
        private const string Prefix = "SYNCORA-DPAPI-1:";
        private readonly string _path;

        internal SessionStore(string path) => _path = path;

        internal void Save(string json)
        {
            var directory = Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);

            byte[] plaintext = Encoding.UTF8.GetBytes(json);
            try
            {
                var protectedBytes = ProtectedData.Protect(plaintext, null, DataProtectionScope.CurrentUser);
                var contents = Prefix + Convert.ToBase64String(protectedBytes);
                // Only encrypted data is written to disk. Replace the old file after the write succeeds.
                string temporary = _path + "." + Guid.NewGuid().ToString("N") + ".tmp";
                try
                {
                    File.WriteAllText(temporary, contents, Encoding.UTF8);
                    File.Move(temporary, _path, true);
                }
                finally
                {
                    if (File.Exists(temporary)) File.Delete(temporary);
                }
            }
            finally { CryptographicOperations.ZeroMemory(plaintext); }
        }

        internal string? Load(out bool legacy)
        {
            legacy = false;
            if (!File.Exists(_path)) return null;
            string contents = File.ReadAllText(_path, Encoding.UTF8);
            if (!contents.StartsWith(Prefix, StringComparison.Ordinal))
            {
                legacy = true;
                return contents;
            }

            byte[] encrypted = Convert.FromBase64String(contents.Substring(Prefix.Length));
            byte[] plaintext = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
            try { return Encoding.UTF8.GetString(plaintext); }
            finally { CryptographicOperations.ZeroMemory(plaintext); }
        }
    }
}
