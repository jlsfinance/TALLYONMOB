using System;

namespace TallySyncApp.Services;

public static class LicencePurchaseLink
{
    public const string ProjectSubscriptionUrl = "https://tallyonmob.vercel.app/subscription";
    public const string LocalSubscriptionUrl = "http://127.0.0.1:3011/subscription";
    public static string Resolve(string? configured, bool isDebug)
    {
        if (isDebug) return LocalSubscriptionUrl;
        if (Uri.TryCreate(configured, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps
            && !uri.Host.Equals("tallyonmobile.com", StringComparison.OrdinalIgnoreCase)
            && !uri.Host.Equals("www.tallyonmobile.com", StringComparison.OrdinalIgnoreCase))
            return new UriBuilder(uri) { Path = "/subscription", Query = "", Fragment = "" }.Uri.AbsoluteUri;
        return ProjectSubscriptionUrl;
    }
}
