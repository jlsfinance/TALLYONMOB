import { create } from 'zustand';

interface Company {
  id: string;
  name: string;
  gstin: string | null;
  tallyCompany: string | null;
}

interface CompanyState {
  companies: Company[];
  activeCompany: Company | null;
  isLoading: boolean;
  setCompanies: (companies: Company[]) => void;
  setActiveCompany: (company: Company | null) => void;
  fetchCompanies: () => Promise<void>;
}

export const useCompanyStore = create<CompanyState>((set, get) => ({
  companies: [],
  activeCompany: null,
  isLoading: false,

  setCompanies: (companies) => {
    set({ companies });
    if (!get().activeCompany && companies.length > 0) {
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('activeCompanyId') : null;
      const saved = companies.find((c) => c.id === savedId);
      set({ activeCompany: saved || companies[0] });
    }
  },

  setActiveCompany: (company) => {
    set({ activeCompany: company });
    if (company && typeof window !== 'undefined') {
      localStorage.setItem('activeCompanyId', company.id);
    }
  },

  fetchCompanies: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/companies');
      const data = await res.json();
      if (data.ok) {
        get().setCompanies(data.data);
      }
    } catch (e) {
      console.error('Failed to fetch companies:', e);
    } finally {
      set({ isLoading: false });
    }
  },
}));
