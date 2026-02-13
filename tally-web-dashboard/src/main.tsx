import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { App as CapApp } from '@capacitor/app'

// Initialize Capacitor plugins when running on native
if (Capacitor.isNativePlatform()) {
    // Dark status bar matching the app theme
    StatusBar.setStyle({ style: Style.Dark }).catch(() => { });
    StatusBar.setBackgroundColor({ color: '#030712' }).catch(() => { });

    // Hide splash screen after app loads
    SplashScreen.hide().catch(() => { });

    // Handle Android back button
    CapApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
            window.history.back();
        } else {
            CapApp.exitApp();
        }
    });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
