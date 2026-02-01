import React, { useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { Building2, Plus, Check, ChevronDown, X } from 'lucide-react';

export const CompanySwitcher: React.FC = () => {
    const { company, companies, switchCompany, createCompany } = useCompany();
    const [showDropdown, setShowDropdown] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newCompanyName, setNewCompanyName] = useState('');
    const [creating, setCreating] = useState(false);

    const handleCreateCompany = async () => {
        if (!newCompanyName.trim()) {
            alert('Please enter company name');
            return;
        }

        setCreating(true);
        try {
            await createCompany({ name: newCompanyName.trim() });
            setShowCreateDialog(false);
            setNewCompanyName('');
            alert('✅ Company created successfully!');
        } catch (error: any) {
            alert('❌ Failed to create company: ' + error.message);
        } finally {
            setCreating(false);
        }
    };

    if (!company) return null;

    return (
        <>
            {/* Company Switcher Button */}
            <div className="relative">
                <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current Company</p>
                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{company.name}</p>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown */}
                {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
                        <div className="max-h-64 overflow-y-auto">
                            {companies.map((comp) => (
                                <button
                                    key={comp.id}
                                    onClick={() => {
                                        if (comp.id !== company.id) {
                                            switchCompany(comp.id);
                                        }
                                        setShowDropdown(false);
                                    }}
                                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                        <Building2 className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{comp.name}</p>
                                        {comp.gst && <p className="text-xs text-slate-500 truncate">GST: {comp.gst}</p>}
                                    </div>
                                    {comp.id === company.id && (
                                        <Check className="w-5 h-5 text-green-600" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Add New Company Button */}
                        <button
                            onClick={() => {
                                setShowDropdown(false);
                                setShowCreateDialog(true);
                            }}
                            className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                            <span className="text-sm font-bold">Create New Company</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Create Company Dialog */}
            {showCreateDialog && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-xl font-black text-slate-800 dark:text-white">Create New Company</h2>
                            <button
                                onClick={() => {
                                    setShowCreateDialog(false);
                                    setNewCompanyName('');
                                }}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2">Company Name *</label>
                                <input
                                    type="text"
                                    value={newCompanyName}
                                    onChange={(e) => setNewCompanyName(e.target.value)}
                                    placeholder="Enter company name"
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !creating) {
                                            handleCreateCompany();
                                        }
                                    }}
                                />
                            </div>
                            <p className="text-xs text-slate-500">
                                You can update address, GST, and other details later from Settings.
                            </p>
                        </div>
                        <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex gap-3">
                            <button
                                onClick={() => {
                                    setShowCreateDialog(false);
                                    setNewCompanyName('');
                                }}
                                className="flex-1 px-6 py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                disabled={creating}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateCompany}
                                disabled={creating || !newCompanyName.trim()}
                                className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-bold hover:from-indigo-600 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {creating ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Click outside to close dropdown */}
            {showDropdown && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowDropdown(false)}
                />
            )}
        </>
    );
};
