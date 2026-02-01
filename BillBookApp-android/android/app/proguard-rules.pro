# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Capacitor Rules
-keep public class * extends com.getcapacitor.Plugin
-keep public class com.getcapacitor.PluginHandle { *; }
-keep public class com.getcapacitor.MessageHandler { *; }
-keep public class com.getcapacitor.Bridge { *; }
-keep public class com.getcapacitor.BridgeActivity { *; }

# Keep common Capacitor classes
-keep class com.getcapacitor.** { *; }

# Keep line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*

# Capacitor Rules
-keep public class * extends com.getcapacitor.Plugin
-keep public class com.getcapacitor.PluginHandle { *; }
-keep public class com.getcapacitor.MessageHandler { *; }
-keep public class com.getcapacitor.Bridge { *; }
-keep public class com.getcapacitor.BridgeActivity { *; }
-keep class com.getcapacitor.** { *; }

# Google Play Services (AdMob & Auth)
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.gms.auth.** { *; }
-keep class com.google.android.gms.common.** { *; }

# Prevent warnings for common library issues
-dontwarn androidx.**
-dontwarn com.google.android.gms.**
-dontwarn android.webkit.**

# Keep webview interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
