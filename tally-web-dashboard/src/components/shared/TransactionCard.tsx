import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownLeft, Plus, Minus, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '../ui/GlassUI';

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

const TransactionCard: React.FC<TransactionCardProps> = ({
    type,
    partyName,
    voucherNumber,
    date,
    amount,
    status,
    onClick,
    highlighted = false,
    compact = false
}) => {
    const isSales = type === 'Sales';
    const isPurchase = type === 'Purchase';
    const isReceipt = type === 'Receipt';
    const isPayment = type === 'Payment';

    const getIcon = () => {
        const size = compact ? 14 : 20;
        if (isSales) return <ArrowUpRight className="text-emerald-500" size={size} />;
        if (isPurchase) return <ArrowDownLeft className="text-orange-500" size={size} />;
        if (isReceipt) return <Plus className="text-blue-500" size={size} />;
        if (isPayment) return <Minus className="text-amber-500" size={size} />;
        return <ArrowUpRight className="text-gray-500" size={size} />;
    };

    const getAmountColor = () => {
        if (isSales || isReceipt) return 'text-emerald-500';
        if (isPurchase || isPayment) return 'text-red-500';
        return 'text-[var(--on-surface)]';
    };

    const formatCurrency = (val: any) => {
        // Safe parsing handling strings with commas
        const num = typeof val === 'string'
            ? parseFloat(val.replace(/,/g, ''))
            : Number(val);

        if (isNaN(num)) return '₹0';

        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(Math.abs(num));
    };

    if (compact) {
        return (
            <motion.div
                whileTap={{ scale: 0.98 }}
                onClick={onClick}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface-active)]/50 border border-[var(--border)] hover:border-[var(--primary)] transition-all cursor-pointer"
            >
                <div className="p-2 rounded-lg bg-[var(--surface-variant)]">
                    {getIcon()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[10px] font-black uppercase text-[var(--on-surface)] truncate">
                                #{voucherNumber || '---'}
                            </span>
                            <span className="text-[7px] font-black text-[var(--primary)] uppercase tracking-[1px] opacity-80 truncate">
                                {type}
                            </span>
                        </div>
                        <span className={`text-[11px] font-bold whitespace-nowrap ${getAmountColor()}`}>
                            {formatCurrency(amount)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-[8px] font-bold text-[var(--text-muted)] opacity-60">
                            {format(new Date(date), 'dd MMM yy')}
                        </p>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            whileHover={{ scale: highlighted ? 1.01 : 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`
                grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-300
                ${highlighted
                    ? 'bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] border-none shadow-xl shadow-[var(--primary-glow)]'
                    : 'bg-[var(--surface-variant)] border border-[var(--border)] hover:border-[var(--primary)]'
                }
            `}
        >
            {/* 1. Icon Column */}
            <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${highlighted ? 'bg-white/20' : 'bg-[var(--surface-active)]'}`}>
                {getIcon()}
            </div>

            {/* 2. Content Column */}
            <div className="min-w-0 overflow-hidden">
                <h4 className={`text-[13px] font-black truncate uppercase tracking-tight ${highlighted ? 'text-white' : 'text-[var(--on-surface)]'}`}>
                    {partyName || 'CASH TRANSACTION'}
                </h4>
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-0.5">
                    <span className={`text-[9px] font-black uppercase tracking-[1px] ${highlighted ? 'text-white/80' : 'text-[var(--primary)] opacity-80'}`}>
                        {type}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-[var(--border)] opacity-30" />
                    <span className={`text-[9px] font-bold ${highlighted ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
                        {format(new Date(date), 'dd MMM yy')}
                    </span>
                </div>
            </div>

            {/* 3. Amount Column */}
            <div className="text-right flex flex-col items-end min-w-[80px]">
                <p className={`text-[13px] font-black tracking-tighter leading-tight ${highlighted ? 'text-white' : getAmountColor()}`}>
                    {(isSales || isReceipt) ? '+' : '-'} {formatCurrency(amount)}
                </p>
                <div className="mt-1">
                    <Badge
                        variant={status?.toLowerCase() === 'synced' ? 'success' : (status?.toLowerCase() === 'failed' ? 'error' : (status?.toLowerCase() === 'pending' ? 'warning' : 'default'))}
                        className={`text-[8px] font-black px-1.5 py-0 h-4 ${status?.toLowerCase() === 'failed' ? 'bg-red-500/10 text-red-500' : ''
                            }`}
                    >
                        {(status || 'SYNCED').toUpperCase()}
                    </Badge>
                </div>
            </div>
        </motion.div>
    );
};

export default TransactionCard;
