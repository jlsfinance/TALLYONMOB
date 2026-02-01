import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

export interface CompanyData {
  id: string;
  name: string;
  address: string;
  state?: string;
  gst: string;
  gstin?: string;
  gst_enabled: boolean;
  phone?: string;
  email?: string;
  show_hsn_summary?: boolean;
  roundUpDefault?: 0 | 10 | 100;
  upiId?: string;
  invoiceTemplate?: string;
  owner_id: string;
  owner_uid: string; // Mapped for compatibility
  owner_email: string;
  created_at: string;
  updated_at: string;
  invoiceSettings?: {
    format: string;
    showWatermark?: boolean;
    watermarkText?: string;
    primaryColor?: string;
    language?: 'English' | 'Hindi' | 'Hinglish';
    invoicePrefix?: string;
    invoiceSuffix?: string;
    nextInvoiceNumber?: number;
  };
  allowed_emails?: string[];
}

interface CompanyContextType {
  company: CompanyData | null;
  companies: CompanyData[];
  loading: boolean;
  permissionError: boolean;
  saveCompany: (data: Partial<CompanyData>) => Promise<void>;
  createCompany: (data: Partial<CompanyData>) => Promise<string>;
  switchCompany: (companyId: string) => void;
  reloadCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);

  const fetchCompanies = async () => {
    if (!user) {
      setCompanies([]);
      setCompany(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setPermissionError(false);

      // Fetch companies where user is owner OR allowed
      // Note: Supabase RLS should handle the "Allowed" logic ideally, 
      // but for now we query where owner_id matches.
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', user.id);

      if (error) {
        throw error;
      }

      const fetchedCompanies: CompanyData[] = (data || []).map((c: any) => ({
        ...c,
        owner_uid: c.owner_id // Map for compatibility
      }));

      setCompanies(fetchedCompanies);

      // Active Company Logic
      const activeCompanyId = localStorage.getItem('active_company_id');
      if (activeCompanyId) {
        const activeCompany = fetchedCompanies.find(c => c.id === activeCompanyId);
        if (activeCompany) {
          setCompany(activeCompany);
        } else if (fetchedCompanies.length > 0) {
          setCompany(fetchedCompanies[0]);
          localStorage.setItem('active_company_id', fetchedCompanies[0].id);
        }
      } else if (fetchedCompanies.length > 0) {
        setCompany(fetchedCompanies[0]);
        localStorage.setItem('active_company_id', fetchedCompanies[0].id);
      } else {
        setCompany(null);
      }

    } catch (error: any) {
      console.error('Error fetching companies:', error);
      // Supabase permission error code handling could be added here
      setCompanies([]);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [user]);

  const saveCompany = async (data: Partial<CompanyData>) => {
    if (!user || !company) return;

    try {
      const { error } = await supabase
        .from('companies')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', company.id);

      if (error) throw error;

      await fetchCompanies();
    } catch (error: any) {
      console.error('Error saving company:', error);
      throw error;
    }
  };

  const createCompany = async (data: Partial<CompanyData>): Promise<string> => {
    if (!user) throw new Error('User not authenticated');

    try {
      const newCompany = {
        name: data.name || 'New Company',
        address: data.address || '',
        gst: data.gst || '',
        gst_enabled: data.gst_enabled ?? true,
        phone: data.phone || '',
        email: data.email || user.email,
        show_hsn_summary: data.show_hsn_summary ?? true,
        round_up_default: data.roundUpDefault ?? 0, // Note snake_case mapping
        upi_id: data.upiId || '',
        owner_id: user.id,
        owner_email: user.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: inserted, error } = await supabase
        .from('companies')
        .insert(newCompany)
        .select()
        .single();

      if (error) throw error;
      if (!inserted) throw new Error('Failed to create company');

      await fetchCompanies();
      localStorage.setItem('active_company_id', inserted.id);

      return inserted.id;

    } catch (error: any) {
      console.error('Error creating company:', error);
      throw error;
    }
  };

  const switchCompany = (companyId: string) => {
    const selectedCompany = companies.find(c => c.id === companyId);
    if (selectedCompany) {
      setCompany(selectedCompany);
      localStorage.setItem('active_company_id', companyId);
      window.location.reload();
    }
  };

  return (
    <CompanyContext.Provider value={{
      company,
      companies,
      loading,
      permissionError,
      saveCompany,
      createCompany,
      switchCompany,
      reloadCompanies: fetchCompanies
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
