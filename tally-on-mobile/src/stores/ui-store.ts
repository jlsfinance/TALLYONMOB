import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  darkMode: boolean;
  searchQuery: string;
  dateRange: { fromDate: string; toDate: string };

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleDarkMode: () => void;
  setSearchQuery: (query: string) => void;
  setDateRange: (range: { fromDate: string; toDate: string }) => void;
}

function getDefaultDateRange() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fromDate = `${year}-04-01`;
  const toDate = `${year + 1}-03-31`;
  return { fromDate, toDate };
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  darkMode: typeof window !== 'undefined' && localStorage.getItem('tom_dark_mode') === 'true',
  searchQuery: '',
  dateRange: getDefaultDateRange(),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      if (typeof window !== 'undefined') {
        localStorage.setItem('tom_dark_mode', String(next));
        document.documentElement.classList.toggle('dark', next);
      }
      return { darkMode: next };
    }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setDateRange: (dateRange) => set({ dateRange }),
}));
