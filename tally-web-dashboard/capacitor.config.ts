import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.tallysync.app',
    appName: 'TallySync',
    webDir: 'dist',
    server: {
        androidScheme: 'https'
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 2000,
            launchAutoHide: true,
            backgroundColor: '#030712',
            androidSplashResourceName: 'splash',
            androidScaleType: 'CENTER_CROP',
            showSpinner: false,
        },
        StatusBar: {
            style: 'DARK',
            backgroundColor: '#030712'
        },
        Keyboard: {
            resize: 'body',
            style: 'DARK',
            resizeOnFullScreen: true
        }
    },
    android: {
        buildOptions: {
            keystorePath: undefined,
            keystoreAlias: undefined
        },
        allowMixedContent: false,
        backgroundColor: '#030712'
    }
};

export default config;
