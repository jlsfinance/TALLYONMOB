import React from 'react';
import { motion } from 'framer-motion';
import TransactionCard from './TransactionCard';

interface TransactionSliderProps {
    transactions: any[];
    compact?: boolean;
}

const TransactionSlider: React.FC<TransactionSliderProps> = ({ transactions, compact = false }) => {
    if (!transactions || transactions.length === 0) {
        return (
            <div className="py-2 px-6 text-[9px] font-black uppercase tracking-[2px] text-[var(--text-muted)] italic opacity-50">
                No recent activity
            </div>
        );
    }

    return (
        <div className="relative group">
            <div
                className="flex gap-2.5 overflow-x-auto pb-4 scrollbar-hide px-4 snap-x snap-mandatory"
                style={{ scrollBehavior: 'smooth' }}
            >
                {transactions.map((v, idx) => (
                    <div
                        key={v.voucher_id || idx}
                        className={`flex-shrink-0 snap-start transition-all ${compact
                                ? 'w-[160px] sm:w-[180px]'
                                : 'w-[85vw] sm:w-[400px]'
                            }`}
                    >
                        <TransactionCard
                            type={v.voucher_type}
                            partyName={v.party_name}
                            voucherNumber={v.voucher_number}
                            date={v.voucher_date}
                            amount={v.amount || v.total_amount}
                            status={v.sync_status || 'Synced'}
                            compact={compact}
                            onClick={() => window.location.href = `/vouchers/${encodeURIComponent(v.voucher_id)}`}
                        />
                    </div>
                ))}
            </div>

            {/* Hint of more items */}
            {!compact && (
                <div className="absolute top-0 right-0 bottom-4 w-12 bg-gradient-to-l from-[var(--background)]/20 to-transparent pointer-events-none" />
            )}
        </div>
    );
};

export default TransactionSlider;
