import React from 'react';
import { useLocation } from 'react-router-dom';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { Home } from 'lucide-react';

const pathNameMap: Record<string, string> = {
    '': 'Dashboard',
    'dashboard': 'Dashboard',
    'billing': 'Billing',
    'vouchers': 'Vouchers',
    'ledgers': 'Parties',
    'stock': 'Inventory',
    'sales': 'Sales',
    'purchases': 'Purchases',
    'profit-loss': 'Profit & Loss',
    'balance-sheet': 'Balance Sheet',
    'business-health': 'Business Health',
    'gst-reports': 'GST Reports',
    'eway-bill': 'E-Way Bill',
    'ai-assistant': 'AI Assistant',
    'ai-entry': 'Smart Entry',
    'invoice-scanner': 'Invoice Scanner',
    'settings': 'Settings',
    'sync-history': 'Sync Status',
    'recurring-invoices': 'Recurring Invoices',
    'bank-automation': 'Bank Automation',
    'invoice-import': 'Invoice Import',
    'gst': 'GST Automation',
    'admin': 'Admin Panel',
    'create-invoice': 'New Invoice',
    'edit-voucher': 'Edit Voucher'
};

export const Breadcrumbs: React.FC = () => {
    const location = useLocation();
    const { navigate } = useSafeNavigate();
    const pathnames = location.pathname.split('/').filter((x) => x);

    if (location.pathname === '/' || location.pathname === '/dashboard' || location.pathname === '/billing') {
        return null; // Don't show on root pages
    }

    return (
        <nav className="flex items-center gap-2 mb-4 text-xs font-mono font-bold tracking-wide uppercase text-[var(--text-muted)] select-none">
            <button 
                onClick={() => navigate('/')}
                className="flex items-center gap-1 hover:text-[var(--on-background)] transition-colors border-b border-transparent hover:border-[var(--on-background)] pb-0.5"
            >
                <Home size={12} />
                <span>Home</span>
            </button>

            {pathnames.map((value, index) => {
                const last = index === pathnames.length - 1;
                const to = `/${pathnames.slice(0, index + 1).join('/')}`;
                const displayName = pathNameMap[value] || value.replace(/-/g, ' ');

                return (
                    <React.Fragment key={to}>
                        <span className="opacity-50 font-sans">/</span>
                        {last ? (
                            <span className="text-[var(--on-background)] border-b-2 border-[var(--on-background)] pb-0.5">
                                {displayName}
                            </span>
                        ) : (
                            <button
                                onClick={() => navigate(to)}
                                className="hover:text-[var(--on-background)] transition-colors border-b border-transparent hover:border-[var(--on-background)] pb-0.5"
                            >
                                {displayName}
                            </button>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
};
