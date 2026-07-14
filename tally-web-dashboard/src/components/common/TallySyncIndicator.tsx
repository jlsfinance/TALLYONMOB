import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface TallySyncIndicatorProps {
    port?: number;
    interval?: number;
    compact?: boolean;
}

export default function TallySyncIndicator({ port = 9000, interval = 30000, compact = false }: TallySyncIndicatorProps) {
    const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    const [lastCheck, setLastCheck] = useState<Date | null>(null);

    const checkConnection = useCallback(async () => {
        try {
            const res = await fetch(`http://localhost:${port}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`,
                signal: AbortSignal.timeout(3000),
            });
            setStatus(res.ok ? 'online' : 'offline');
        } catch {
            setStatus('offline');
        }
        setLastCheck(new Date());
    }, [port]);

    useEffect(() => {
        checkConnection();
        const timer = setInterval(checkConnection, interval);
        return () => clearInterval(timer);
    }, [checkConnection, interval]);

    const statusConfig = {
        checking: { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20', label: 'Checking...' },
        online: { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Tally Connected' },
        offline: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Tally Offline' },
    };

    const cfg = statusConfig[status];

    if (compact) {
        return (
            <button
                onClick={checkConnection}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold ${cfg.bg} ${cfg.color} ${cfg.border} border transition-all hover:scale-105`}
                title={`Last checked: ${lastCheck?.toLocaleTimeString() || 'never'}`}
            >
                {status === 'online' ? <Wifi size={12} /> : status === 'offline' ? <WifiOff size={12} /> : <RefreshCw size={12} className="animate-spin" />}
                {cfg.label}
            </button>
        );
    }

    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${cfg.bg} ${cfg.border}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                {status === 'online' ? <Wifi size={20} className={cfg.color} /> : status === 'offline' ? <WifiOff size={20} className={cfg.color} /> : <RefreshCw size={20} className={`${cfg.color} animate-spin`} />}
            </div>
            <div className="flex-1">
                <p className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                    {lastCheck ? `Last checked: ${lastCheck.toLocaleTimeString()}` : 'Checking...'}
                </p>
            </div>
            <button onClick={checkConnection} className="p-2 rounded-xl hover:bg-[var(--surface)] transition-all">
                <RefreshCw size={14} className="text-[var(--text-muted)]" />
            </button>
        </div>
    );
}
