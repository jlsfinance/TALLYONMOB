import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jls.billbook',
  appName: 'JLS Bill',
  webDir: 'dist',
  plugins: {
    GoogleAuth: {
      scopes: ["profile", "email", "https://www.googleapis.com/auth/drive.file"],
      serverClientId: "231225025529-fsoqcbbggrk0hu3kfpvsmdj54j4gt2e5.apps.googleusercontent.com",
      forceCodeForRefreshToken: true
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DEFAULT'
    },
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    LocalNotifications: {
      smallIcon: "ic_stat_name",
      iconColor: "#4285F4",
      sound: "default"
    }
  }
};

export default config;

