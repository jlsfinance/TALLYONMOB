import { useState, useEffect } from 'react';
import { X, Download, ExternalLink } from 'lucide-react';
import { checkForUpdate, type UpdateInfo } from '@/lib/updateChecker';

export default function UpdateBanner() {
    const [update, setUpdate] = useState<UpdateInfo | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        checkForUpdate().then(info => {
            if (info?.available) {
                const dismissedVersion = localStorage.getItem('dismissed_update_version');
                if (dismissedVersion !== info.latestVersion) {
                    setUpdate(info);
                }
            }
        });
    }, []);

    if (!update || dismissed) return null;

    const dismiss = () => {
        setDismissed(true);
        localStorage.setItem('dismissed_update_version', update.latestVersion);
    };

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-slide-up">
            <div className="p-3 rounded-xl border border-cyan-400/30 bg-[var(--surface)] shadow-2xl shadow-cyan-500/10">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Download size={16} className="text-cyan-400 shrink-0" />
                        <div>
                            <p className="text-[11px] font-bold text-[var(--on-surface)]">Update Available</p>
                            <p className="text-[9px] text-[var(--text-muted)]">
                                v{update.latestVersion} (current: v{update.currentVersion})
                            </p>
                        </div>
                    </div>
                    <button onClick={dismiss} className="text-[var(--text-muted)] hover:text-[var(--on-surface)]">
                        <X size={14} />
                    </button>
                </div>
                {update.releaseNotes && (
                    <p className="text-[9px] text-[var(--text-muted)] mt-1 line-clamp-2">{update.releaseNotes}</p>
                )}
                <div className="flex gap-1 mt-2">
                    <a href={update.downloadUrl} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-center py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold text-cyan-400 hover:bg-cyan-500/20 transition-colors flex items-center justify-center gap-1">
                        <ExternalLink size={10} /> Download
                    </a>
                    <button onClick={dismiss}
                        className="px-3 py-1.5 rounded-lg bg-[var(--surface-container)] text-[10px] font-bold text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors">
                        Later
                    </button>
                </div>
            </div>
        </div>
    );
}
