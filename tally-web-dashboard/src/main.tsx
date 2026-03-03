import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { Capacitor } from '@capacitor/core'

if (Capacitor.isNativePlatform()) {
    void (async () => {
        const [{ StatusBar, Style }, { SplashScreen }, { App: CapApp }] = await Promise.all([
            import('@capacitor/status-bar'),
            import('@capacitor/splash-screen'),
            import('@capacitor/app')
        ])

        StatusBar.setStyle({ style: Style.Dark }).catch(() => { })
        StatusBar.setBackgroundColor({ color: '#030712' }).catch(() => { })
        SplashScreen.hide().catch(() => { })

        CapApp.addListener('backButton', ({ canGoBack }) => {
            if (canGoBack) {
                window.history.back()
            } else {
                CapApp.exitApp()
            }
        })
    })()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
