import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App'
import AppErrorBoundary from './components/common/AppErrorBoundary'
import './index.css'

if ('serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
    window.addEventListener('load', () => {
        if (import.meta.env.DEV) {
            // Replace a production Workbox worker left on localhost with the
            // push-only worker. Its fetches must never serve stale dev modules.
            const staleController = navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js');
            if (!staleController) sessionStorage.removeItem('syncora-dev-worker-refresh');
            navigator.serviceWorker.register('/reminder-push-worker.js', { scope: '/' })
                .then(async registration => {
                    if (!staleController) return;
                    await registration.update();
                    const reload = () => {
                        if (!sessionStorage.getItem('syncora-dev-worker-refresh')) {
                            sessionStorage.setItem('syncora-dev-worker-refresh', '1');
                            window.location.reload();
                        }
                    };
                    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
                    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
                }).catch(error => console.warn('Could not update localhost service worker:', error));
        } else {
            navigator.serviceWorker.register('/sw.js').catch(() => {})
        }
    })
}

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
