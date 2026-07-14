import { useState, useEffect } from 'react';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { Plus, Trash2, Building2, ArrowRight, RefreshCw, ArrowLeft, Clock, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthContextType } from '@/contexts/types';

export default function SelectCompanyPage() {
    const { companies, selectCompany, deleteCompany, refreshCompanies, setAppMode, appMode } = useAuth() as AuthContextType;
    const { navigate } = useSafeNavigate();

    useEffect(() => {
        refreshCompanies();
    }, []);

    const handleBack = () => {
        setAppMode(null);
        navigate('/select-mode');
    };

    const handleSelect = (company: any) => {
        selectCompany(company);
        navigate(appMode === 'billing' ? '/billing' : '/dashboard');
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this company? This action cannot be undone.')) return;

        try {
            const { success, error } = await deleteCompany(id);
            if (success) {
                toast.success('Company deleted');
            } else {
                toast.error(error || 'Failed to delete');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const getInitialColor = (name: string) => {
        const colors = [
            'bg-blue-600', 'bg-emerald-600', 'bg-amber-600',
            'bg-rose-600', 'bg-indigo-600', 'bg-teal-600',
        ];
        const index = name.charCodeAt(0) % colors.length;
        return colors[index];
    };

    return (
        <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-6 transition-colors duration-300">

            <div className="w-full max-w-4xl">
                {/* Back Button */}
                <motion.button
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={handleBack}
                    className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--on-surface)] transition-colors mb-8 group"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">Change Module</span>
                </motion.button>

                {/* Header */}
                <div className="mb-10">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2.5 mb-3"
                    >
                        <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--primary-container)] flex items-center justify-center text-[var(--primary)]">
                            <Building2 size={16} />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Workspace Selection</span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="text-2xl md:text-3xl font-bold text-[var(--on-surface)] tracking-tight"
                    >
                        Select a company
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-[var(--text-muted)] mt-1.5 text-sm"
                    >
                        Choose a Tally company to manage, or connect a new one.
                    </motion.p>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
                    {/* Add New Card */}
                    <div
                        onClick={() => navigate('/onboarding')}
                        className="cursor-pointer group"
                    >
                        <div className="h-48 bg-[var(--surface)] border-2 border-dashed border-[var(--outline-variant)] rounded-[var(--radius-lg)] p-6 flex flex-col items-center justify-center text-center hover:border-[var(--primary)] hover:bg-[var(--primary-glow)] transition-all duration-200">
                            <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--primary-container)] flex items-center justify-center text-[var(--primary)] mb-3 group-hover:scale-105 transition-transform">
                                <Plus size={24} />
                            </div>
                            <h3 className="font-semibold text-[var(--on-surface)] text-sm">Add Company</h3>
                            <p className="text-xs text-[var(--text-muted)] mt-1">Download Sync App</p>
                        </div>
                    </div>

                    {/* Company Cards */}
                    {companies.map((company, index) => (
                        <div
                            key={company.id}
                            onClick={() => handleSelect(company)}
                            className="cursor-pointer group"
                        >
                            <div className="h-48 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-5 flex flex-col justify-between hover:border-[var(--outline)] hover:shadow-[var(--shadow-md)] transition-all duration-200 relative overflow-hidden">

                                <div>
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`w-10 h-10 rounded-[var(--radius-md)] ${getInitialColor(company.name)} flex items-center justify-center text-white font-bold text-sm`}>
                                            {company.name.charAt(0)}
                                        </div>
                                        <button
                                            onClick={(e) => handleDelete(e, company.id)}
                                            className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error-bg)] transition-colors opacity-0 group-hover:opacity-100"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>

                                    <h3 className="font-semibold text-[var(--on-surface)] text-base truncate group-hover:text-[var(--primary)] transition-colors">
                                        {company.name}
                                    </h3>

                                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-2">
                                        <Clock size={12} />
                                        <span>
                                            {company.last_sync_at
                                                ? `Synced ${formatDistanceToNow(new Date(company.last_sync_at))} ago`
                                                : 'Not synced yet'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                                    <span className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider">
                                        {company.id.substring(0, 8)}
                                    </span>
                                    <span className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity">
                                        Open <ArrowRight size={12} />
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}


