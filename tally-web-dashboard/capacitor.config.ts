import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.syncoraa.app',
    appName: 'SYNCORA',
    webDir: 'dist',
    server: {
        androidScheme: 'https'
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 0,
            launchAutoHide: true,
            backgroundColor: '#f8f9ff',
            androidSplashResourceName: 'splash',
            androidScaleType: 'CENTER_CROP',
            showSpinner: false,
        },
        StatusBar: {
            style: 'DEFAULT',
            backgroundColor: '#f8f9ff'
        },
        Keyboard: {
            resize: 'body',
            style: 'DARK',
            resizeOnFullScreen: true
        }
    },
    android: {
        allowMixedContent: false,
        backgroundColor: '#f8f9ff'
    }
};

export default config;
