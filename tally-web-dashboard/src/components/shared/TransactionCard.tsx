import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownLeft, Plus, Minus } from 'lucide-react';
import { format } from 'date-fns';

interface TransactionCardProps {
    type: 'Sales' | 'Purchase' | 'Receipt' | 'Payment' | string;
    partyName?: string;
    voucherNumber?: string;
    date: string | Date;
    amount: number;
    status: 'Confirmed' | 'Pending' | 'Synced' | 'Failed';
    onClick?: () => void;
    highlighted?: boolean;
    compact?: boolean;
}

const TYPE_CONFIG: Record<string, { icon: typeof ArrowUpRight; color: string; bg: string }> = {
    Sales: { icon: ArrowUpRight, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    'Sales Invoice': { icon: ArrowUpRight, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    Purchase: { icon: ArrowDownLeft, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    'Purchase Invoice': { icon: ArrowDownLeft, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    Receipt: { icon: Plus, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    Payment: { icon: Minus, color: 'text-amber-500', bg: 'bg-amber-500/10' },
};

const formatCurrency = (val: any) => {
    const num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : Number(val);
    if (isNaN(num)) return '₹0';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(num));
};

const TransactionCard: React.FC<TransactionCardProps> = ({
    type, partyName, voucherNumber, date, amount, status, onClick, highlighted = false, compact = false
}) => {
    const config = TYPE_CONFIG[type] || { icon: ArrowUpRight, color: 'text-gray-500', bg: 'bg-gray-500/10' };
    const Icon = config.icon;
    const isCredit = type === 'Sales' || type === 'Sales Invoice' || type === 'Receipt';

    // COMPACT MODE — 55px height, single row, high density
    if (compact) {
        return (
            <motion.div
                whileTap={{ scale: 0.98 }}
                onClick={onClick}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-active)] cursor-pointer transition-all"
            >
                {/* Icon */}
                <div className={`w-8 h-8 flex items-center justify-center rounded-lg shrink-0 ${config.bg}`}>
                    <Icon size={14} className={config.color} />
                </div>

                {/* Party + Type/Date */}
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--on-surface)] truncate leading-tight">
                        {partyName || 'CASH'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--primary)] opacity-80">
                            {type}
                        </span>
                        <span className="w-0.5 h-0.5 rounded-full bg-[var(--text-muted)] opacity-40" />
                        <span className="text-[9px] font-medium text-[var(--text-muted)]">
                            {format(new Date(date), 'dd MMM yy')}
                        </span>
                    </div>
                </div>

                {/* Amount + Status */}
                <div className="text-right shrink-0">
                    <p className={`text-[14px] font-bold tracking-tight leading-tight ${isCredit ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isCredit ? '+' : '-'}{formatCurrency(amount)}
                    </p>
                    <div className={`inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-px rounded-full text-[7px] font-bold uppercase tracking-wider ${
                        status?.toLowerCase() === 'synced' ? 'bg-emerald-500/10 text-emerald-500' :
                        status?.toLowerCase() === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                        status?.toLowerCase() === 'failed' ? 'bg-red-500/10 text-red-500' :
                        'bg-[var(--surface-active)] text-[var(--text-muted)]'
                    }`}>
                        {status || 'SYNCED'}
                    </div>
                </div>
            </motion.div>
        );
    }

    // DEFAULT MODE — slightly compact but still readable
    return (
        <motion.div
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-active)] cursor-pointer transition-all"
        >
            <div className={`w-9 h-9 flex items-center justify-center rounded-lg shrink-0 ${config.bg}`}>
                <Icon size={16} className={config.color} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[var(--on-surface)] truncate leading-tight">
                    {partyName || 'CASH'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--primary)] opacity-80">{type}</span>
                    <span className="w-0.5 h-0.5 rounded-full bg-[var(--text-muted)] opacity-40" />
                    <span className="text-[9px] font-medium text-[var(--text-muted)]">{format(new Date(date), 'dd MMM yy')}</span>
                    {voucherNumber && (
                        <>
                            <span className="w-0.5 h-0.5 rounded-full bg-[var(--text-muted)] opacity-40" />
                            <span className="text-[9px] font-medium text-[var(--text-muted)]">#{voucherNumber}</span>
                        </>
                    )}
                </div>
            </div>
            <div className="text-right shrink-0">
                <p className={`text-[15px] font-bold tracking-tight leading-tight ${isCredit ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {isCredit ? '+' : '-'}{formatCurrency(amount)}
                </p>
                <div className={`inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-px rounded-full text-[8px] font-bold uppercase tracking-wider ${
                    status?.toLowerCase() === 'synced' ? 'bg-emerald-500/10 text-emerald-500' :
                    status?.toLowerCase() === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                    status?.toLowerCase() === 'failed' ? 'bg-red-500/10 text-red-500' :
                    'bg-[var(--surface-active)] text-[var(--text-muted)]'
                }`}>
                    {status || 'SYNCED'}
                </div>
            </div>
        </motion.div>
    );
};

export default TransactionCard;
