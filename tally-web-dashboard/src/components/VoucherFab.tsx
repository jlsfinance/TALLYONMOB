import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { VOUCHER_TYPES } from '../lib/voucherTypes';

/** Global + button: every voucher type reachable from any page. */
export default function VoucherFab() {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();

    return (
        <>
            {open && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setOpen(false)} />}
            <div className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-50 flex flex-col items-end gap-2">
                {open && (
                    // Two columns on phones so all eight fit above the button, one column on desktop.
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:justify-items-end max-h-[calc(100dvh-11rem)] overflow-y-auto overscroll-contain">
                        {VOUCHER_TYPES.map(v => (
                            <button
                                key={v.type}
                                onClick={() => { setOpen(false); navigate(`/create-voucher?type=${encodeURIComponent(v.type)}`); }}
                                className="flex items-center gap-1.5 pl-1.5 pr-2 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-lg text-[13px] text-[var(--on-surface)] whitespace-nowrap active:scale-95 transition-transform"
                            >
                                <span className={`w-7 h-7 rounded-lg border flex items-center justify-center ${v.color}`}>
                                    <v.icon size={14} />
                                </span>
                                {v.type}
                            </button>
                        ))}
                    </div>
                )}
                <button
                    onClick={() => setOpen(!open)}
                    aria-label="Create voucher"
                    className="w-14 h-14 rounded-full bg-[var(--primary)] text-white shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
                >
                    {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                </button>
            </div>
        </>
    );
}
