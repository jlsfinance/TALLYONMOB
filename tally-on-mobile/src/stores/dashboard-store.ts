import { create } from 'zustand';

interface DashboardStats {
  totalSales: number;
  totalPurchase: number;
  cashBankBalance: number;
  receivables: number;
  payables: number;
  ledgerCount: number;
  voucherCount: number;
  stockCount: number;
  recentVouchers: Array<{
    id: string;
    voucherNumber: string;
    voucherType: string;
    voucherDate: string;
    partyName: string;
    grandTotal: number;
  }>;
}

interface DashboardState {
  stats: DashboardStats | null;
  isLoading: boolean;
  lastFetched: number | null;
  fetchStats: (companyId: string) => Promise<void>;
}

const CACHE_TTL = 60 * 1000; // 1 minute

export const useDashboardStore = create<DashboardState>((set, get) => ({
  stats: null,
  isLoading: false,
  lastFetched: null,

  fetchStats: async (companyId: string) => {
    const last = get().lastFetched;
    if (last && Date.now() - last < CACHE_TTL && get().stats) return;

    set({ isLoading: true });
    try {
      const res = await fetch(`/api/reports?companyId=${companyId}`);
      const data = await res.json();
      if (data.ok) {
        set({ stats: data.data, lastFetched: Date.now() });
      }
    } catch (e) {
      console.error('Failed to fetch dashboard stats:', e);
    } finally {
      set({ isLoading: false });
    }
  },
}));
