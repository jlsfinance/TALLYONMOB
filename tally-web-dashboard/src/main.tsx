import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App'
import AppErrorBoundary from './components/common/AppErrorBoundary'
import './index.css'

const logRuntimeIssue = (type: 'error' | 'rejection', payload: unknown) => {
    console.error(`[runtime:${type}]`, payload)
}

window.addEventListener('error', (event) => {
    logRuntimeIssue('error', event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
    logRuntimeIssue('rejection', event.reason)
    event.preventDefault()
})

if (Capacitor.isNativePlatform()) {
    void (async () => {
        try {
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
        } catch (error) {
            logRuntimeIssue('error', error)
        }
    })()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AppErrorBoundary>
            <App />
        </AppErrorBoundary>
    </React.StrictMode>,
)
