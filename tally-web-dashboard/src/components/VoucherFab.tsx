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
            <div className="fixed bottom-44 right-4 md:bottom-28 md:right-8 z-50 flex flex-col items-end gap-2">
                {open && VOUCHER_TYPES.map(v => (
                    <button
                        key={v.type}
                        onClick={() => { setOpen(false); navigate(`/create-voucher?type=${encodeURIComponent(v.type)}`); }}
                        className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-lg text-sm text-[var(--on-surface)] active:scale-95 transition-transform"
                    >
                        <span className={`w-7 h-7 rounded-lg border flex items-center justify-center ${v.color}`}>
                            <v.icon size={14} />
                        </span>
                        {v.type}
                    </button>
                ))}
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
