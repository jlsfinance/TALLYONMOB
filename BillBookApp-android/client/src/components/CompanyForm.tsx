import React, { useState, useEffect } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { Building2, Save, AlertCircle } from 'lucide-react';

export const CompanyForm = () => {
  const { company, saveCompany, createCompany, loading } = useCompany();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [gst, setGst] = useState('');
  const [gstEnabled, setGstEnabled] = useState(true);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name || '');
      setAddress(company.address || '');
      setGst(company.gst || '');
      setGstEnabled(company.gst_enabled ?? true);
    }
  }, [company]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Company name is required');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const companyData = {
        name,
        address,
        gst,
        gst_enabled: gstEnabled
      };

      // If company is null (new signup), create a new company
      // Otherwise update the existing company
      if (!company) {
        await createCompany(companyData);
      } else {
        await saveCompany(companyData);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save company details');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-50 dark:bg-slate-900 flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="bg-blue-600 dark:bg-blue-700 p-4 flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Company Details</h2>
            <p className="text-blue-100 text-xs">Please complete your profile to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-md flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Company Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              placeholder="e.g. Acme Corp"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Address</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              placeholder="Full business address"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">GST / Tax ID</label>
            <input
              type="text"
              value={gst}
              onChange={(e) => setGst(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              placeholder="Optional"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="gstEnabled"
              checked={gstEnabled}
              onChange={(e) => setGstEnabled(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
            />
            <label htmlFor="gstEnabled" className="text-sm text-slate-700 dark:text-slate-200">Enable GST calculations</label>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full flex justify-center items-center gap-2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>Processing...</>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save & Continue
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
