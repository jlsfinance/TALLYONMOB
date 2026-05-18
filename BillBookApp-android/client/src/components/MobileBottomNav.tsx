
import React, { useState } from 'react';
import { ViewState } from '../types';
import { LayoutDashboard, BookOpen, FileText, BarChart3, Grid, Plus, Users, Settings, LogOut, Upload, X, Receipt, ArrowDownLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { HapticService } from '@/services/hapticService';
import { useSearch } from '@/contexts/SearchContext';

interface MobileBottomNavProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  onFabClick?: () => void;
}

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentView, onChangeView, onFabClick }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { signOut } = useAuth();
  const { setSearchVisible } = useSearch();

  const handleNavClick = (view: ViewState) => {
    onChangeView(view);
    setIsMenuOpen(false);
  };

  const menuItems = [
    { id: ViewState.CUSTOMERS, label: 'Customers', icon: Users, color: 'text-orange-500', bgColor: 'bg-orange-50' },
    { id: 'CUSTOMER_LEDGER_SEARCH', label: 'Customer Ledger', icon: BookOpen, color: 'text-blue-500', bgColor: 'bg-blue-50' },
    { id: ViewState.EXPENSES, label: 'Expenses', icon: Receipt, color: 'text-red-500', bgColor: 'bg-red-50' },
    { id: ViewState.PAYMENTS, label: 'Receipts', icon: ArrowDownLeft, color: 'text-green-500', bgColor: 'bg-green-50' },
    { id: ViewState.IMPORT, label: 'Import Data', icon: Upload, color: 'text-purple-500', bgColor: 'bg-purple-50' },
    { id: ViewState.SYNC_SETTINGS, label: 'Sync Settings', icon: Upload, color: 'text-cyan-500', bgColor: 'bg-cyan-50' },
    { id: ViewState.SETTINGS, label: 'Settings', icon: Settings, color: 'text-gray-500', bgColor: 'bg-gray-50' },
  ];

  return (
    <>
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/40 z-40"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl z-50 flex flex-col max-h-[85vh]"
            >
              {/* Drag Handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full" />
              </div>

              <div className="px-6 py-4 flex justify-between items-center shrink-0 border-b border-slate-50 dark:border-slate-800/50">
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">More Actions</h3>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full active:scale-90 transition-transform">
                  <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-1.5 overscroll-contain custom-scrollbar">
                <div className="grid grid-cols-1 gap-2">
                  {menuItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.id === 'CUSTOMER_LEDGER_SEARCH') {
                          setIsMenuOpen(false);
                          setTimeout(() => setSearchVisible(true), 300);
                        } else {
                          handleNavClick(item.id as ViewState);
                        }
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-[20px] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group active:scale-[0.97] border border-transparent active:border-slate-100 dark:active:border-slate-700"
                    >
                      <div className={`w-10 h-10 rounded-full ${item.bgColor} dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-700 shrink-0`}>
                        <item.icon className={`w-5 h-5 ${item.color}`} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{item.label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                          {item.id === ViewState.CUSTOMERS ? 'Manage your client base' :
                            item.id === 'CUSTOMER_LEDGER_SEARCH' ? 'Search and view customer khata' :
                              item.id === ViewState.EXPENSES ? 'Track business spending' :
                                item.id === ViewState.PAYMENTS ? 'View payment history' :
                                  item.id === ViewState.IMPORT ? 'Backup and restore data' :
                                    'App configuration'}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </button>
                  ))}
                </div>

                <div className="pt-4 pb-8">
                  <button
                    onClick={() => {
                      HapticService.medium();
                      signOut();
                    }}
                    className="w-full flex items-center gap-3 p-3 text-red-600 dark:text-red-400 font-bold bg-red-50/50 dark:bg-red-500/5 rounded-[20px] hover:bg-red-100 dark:hover:bg-red-500/10 transition-all group active:scale-[0.97] border border-red-100/50 dark:border-red-900/20"
                  >
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                      <LogOut className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-bold text-sm">Sign Out</p>
                      <p className="text-[10px] text-red-400 opacity-60">Exit your account safely</p>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-40" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Action Button (M3 Extended FAB) - Context Aware */}
      {!['CREATE_INVOICE', 'EDIT_INVOICE', 'CREATE_PURCHASE', 'EDIT_PURCHASE'].includes(currentView) && (
        <div className="fixed bottom-24 right-4 z-40">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              HapticService.medium();
              if (onFabClick) {
                onFabClick();
              } else {
                handleNavClick(ViewState.CREATE_INVOICE);
              }
            }}
            className="h-14 px-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/40 flex items-center gap-2.5 hover:shadow-2xl hover:shadow-blue-500/50 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} />
            <span className="font-bold text-sm tracking-tight">
              {currentView === ViewState.PURCHASES ? 'Purchase' :
                currentView === ViewState.PAYMENTS ? 'Receipt' :
                  'Sale'}
            </span>
          </motion.button>
        </div>
      )}

      {/* Material 3 Bottom Navigation Bar - BizAnalyst Style */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 pb-safe z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex justify-around items-center px-2 max-w-lg mx-auto py-2">
          <NavButton
            active={currentView === ViewState.DASHBOARD}
            onClick={() => handleNavClick(ViewState.DASHBOARD)}
            icon={LayoutDashboard}
            label="Home"
          />
          <NavButton
            active={currentView === ViewState.LEDGERS || currentView === ViewState.LEDGER_DETAIL}
            onClick={() => handleNavClick(ViewState.LEDGERS)}
            icon={BookOpen}
            label="Ledgers"
          />
          <NavButton
            active={currentView === ViewState.VOUCHERS || currentView === ViewState.VOUCHER_DETAIL}
            onClick={() => handleNavClick(ViewState.VOUCHERS)}
            icon={FileText}
            label="Vouchers"
          />
          <NavButton
            active={currentView === ViewState.REPORTS_HUB || currentView === ViewState.REPORTS || currentView === ViewState.DAYBOOK}
            onClick={() => handleNavClick(ViewState.REPORTS_HUB)}
            icon={BarChart3}
            label="Reports"
          />
          <NavButton
            active={isMenuOpen || currentView === ViewState.MORE_MENU}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            icon={Grid}
            label="More"
          />
        </div>
      </div>
    </>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: any; label: string }> = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={() => {
      HapticService.light();
      onClick();
    }}
    className="flex flex-col items-center justify-center flex-1 h-full group"
  >
    <div className="relative flex items-center justify-center w-16 h-8 rounded-full mb-1 transition-all duration-300">
      {active && (
        <motion.div
          layoutId="nav-pill"
          className="absolute inset-0 bg-primary/20 dark:bg-primary/30 rounded-full"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
      <Icon className={`w-6 h-6 relative z-10 ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} strokeWidth={active ? 2.5 : 2} />
    </div>
    <span className={`text-[11px] font-bold tracking-tight transition-colors ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
      {label}
    </span>
  </button>
);

export default MobileBottomNav;
