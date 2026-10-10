import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App'
import AppErrorBoundary from './components/common/AppErrorBoundary'
import './index.css'

const CHUNK_RECOVERY_KEY = 'tally_chunk_recovery_attempted'

// Vite emits this event when an old tab requests a chunk removed by a new deploy.
// Reload once so the tab picks up the new manifest; the error boundary handles a
// second failure without creating an infinite reload loop.
window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    if (sessionStorage.getItem(CHUNK_RECOVERY_KEY) === '1') return
    sessionStorage.setItem(CHUNK_RECOVERY_KEY, '1')
    window.location.reload()
})

window.addEventListener('load', () => {
    sessionStorage.removeItem(CHUNK_RECOVERY_KEY)
    if ('serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
        const serviceWorkerUrl = `${import.meta.env.BASE_URL || '/'}sw.js`
        navigator.serviceWorker.register(serviceWorkerUrl, { updateViaCache: 'none' }).catch((error) => {
            logRuntimeIssue('error', error)
        })
    }
})

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
