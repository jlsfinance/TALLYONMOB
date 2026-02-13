import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { Plus, Trash2, Building2, Calendar, ArrowRight, RefreshCw, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthContextType } from '@/contexts/types';

export default function SelectCompanyPage() {
    const { companies, selectCompany, deleteCompany, refreshCompanies, setAppMode } = useAuth() as AuthContextType;
    const navigate = useNavigate();

    useEffect(() => {
        refreshCompanies();
    }, []);

    // Redirect new users with no companies to onboarding
    // Redirect logic removed as per user request
    // useEffect(() => {
    //     if (companies.length === 0) {
    //         const timer = setTimeout(() => {
    //             if (companies.length === 0) {
    //                 navigate('/onboarding');
    //             }
    //         }, 1500);
    //         return () => clearTimeout(timer);
    //     }
    // }, [companies, navigate]);


    const handleBack = () => {
        setAppMode(null);
        navigate('/select-mode');
    };

    const handleSelect = (company: any) => {
        selectCompany(company);
        navigate('/dashboard');
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

    return (
        <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-[-400px] left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-cyan-600/10 rounded-full blur-[150px]" />

            <div className="relative z-10 w-full max-w-4xl">
                {/* Back to Modules */}
                <motion.button
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={handleBack}
                    className="absolute -top-12 left-0 flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">Change Module</span>
                </motion.button>

                {/* Header */}
                <div className="text-center mb-12">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-gray-400 mb-6"
                    >
                        <Building2 size={14} />
                        Workspace Selection
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-4xl md:text-5xl font-bold text-white mb-4"
                    >
                        Choose a workspace
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-gray-500 max-w-md mx-auto"
                    >
                        Select a Tally company to manage or connect a new instance.
                    </motion.p>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {/* Add New Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                        onClick={() => navigate('/onboarding')}
                        className="group cursor-pointer"
                    >
                        <div className="h-52 bg-[#0F172A] border-2 border-dashed border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center text-center hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all duration-300">
                            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition-transform">
                                <Plus size={28} />
                            </div>
                            <h3 className="font-semibold text-white mb-1">Add Company</h3>
                            <p className="text-xs text-gray-500">Download Sync App</p>
                        </div>
                    </motion.div>

                    {/* Company Cards */}
                    {companies.map((company, index) => (
                        <motion.div
                            key={company.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.3 + (index * 0.05) }}
                            onClick={() => handleSelect(company)}
                            className="group cursor-pointer"
                        >
                            <div className="h-52 bg-[#0F172A] border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:border-white/20 hover:bg-[#1E293B] transition-all duration-300 relative overflow-hidden">
                                {/* Hover gradient */}
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/0 to-violet-600/0 group-hover:from-cyan-600/5 group-hover:to-violet-600/5 transition-all duration-500" />

                                <div className="relative z-10">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-700 border border-white/10 flex items-center justify-center text-white font-bold text-lg">
                                            {company.name.charAt(0)}
                                        </div>
                                        <button
                                            onClick={(e) => handleDelete(e, company.id)}
                                            className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <h3 className="font-bold text-white text-lg truncate group-hover:text-cyan-400 transition-colors">
                                        {company.name}
                                    </h3>

                                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                                        <RefreshCw size={12} />
                                        <span>
                                            {company.last_sync_at
                                                ? `Synced ${formatDistanceToNow(new Date(company.last_sync_at))} ago`
                                                : 'Not synced yet'}
                                        </span>
                                    </div>
                                </div>

                                <div className="relative z-10 flex items-center justify-between pt-4 border-t border-white/5">
                                    <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">
                                        ID: {company.id.substring(0, 8)}
                                    </span>
                                    <span className="flex items-center gap-1 text-sm font-medium text-cyan-400 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all">
                                        Open <ArrowRight size={14} />
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}
