import { useState, useEffect } from 'react';
import { WifiOff, Wifi, CloudOff, RefreshCw } from 'lucide-react';

export default function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showBanner, setShowBanner] = useState(false);
    const [wasOffline, setWasOffline] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            if (wasOffline) {
                setShowBanner(true);
                setTimeout(() => setShowBanner(false), 3000);
            }
        };

        const handleOffline = () => {
            setIsOnline(false);
            setWasOffline(true);
            setShowBanner(true);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [wasOffline]);

    if (!showBanner && isOnline) return null;

    return (
        <div className={`fixed top-0 left-0 right-0 z-[9999] transition-all duration-300 ${showBanner ? 'translate-y-0' : '-translate-y-full'}`}>
            <div className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${isOnline
                    ? 'bg-emerald-500 text-white'
                    : 'bg-red-500 text-white'
                }`}>
                {isOnline ? (
                    <>
                        <Wifi size={16} />
                        <span>Back online! Syncing data...</span>
                        <RefreshCw size={14} className="animate-spin" />
                    </>
                ) : (
                    <>
                        <WifiOff size={16} />
                        <span>You're offline. Some features may not work.</span>
                        <CloudOff size={14} />
                    </>
                )}
            </div>
        </div>
    );
}
