
import React, { useState } from 'react';
import { ViewState } from '../types';
import { LayoutDashboard, BookOpen, FileText, BarChart3, Grid, Plus, Users, Settings, LogOut, Upload, X, Receipt, ArrowDownLeft, ChevronRight, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { HapticService } from '@/services/hapticService';
import { useSearch } from '@/contexts/SearchContext';

interface MobileBottomNavProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  onFabClick?: () => void;
  badgeCounts?: {
    [key: string]: number;
  };
}

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentView, onChangeView, onFabClick, badgeCounts = {} }) => {
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

  const isActiveWithGroup = (views: (ViewState | string)[]) =>
    views.some(v => currentView === v || (typeof v === 'string' && currentView === v));

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
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-card border border-t border-border/50 rounded-t-[32px] shadow-2xl z-50 flex flex-col max-h-[85vh] glass-strong"
            >
              {/* Drag Handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-12 h-1.5 bg-border rounded-full" />
              </div>

              <div className="px-6 py-4 flex justify-between items-center shrink-0 border-b border-border/30">
                <h3 className="font-heading text-xl font-bold text-foreground tracking-tight">More Actions</h3>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 rounded-full bg-white/5 hover:bg-white/10 active:scale-90 transition-all">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-1.5 overscroll-contain no-scrollbar">
                <div className="grid grid-cols-1 gap-2">
                  {menuItems.map((item) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        if (item.id === 'CUSTOMER_LEDGER_SEARCH') {
                          setIsMenuOpen(false);
                          setTimeout(() => setSearchVisible(true), 300);
                        } else {
                          handleNavClick(item.id as ViewState);
                        }
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-[20px] hover:bg-white/5 transition-all group border border-transparent hover:border-border/30 active:border-border/50"
                    >
                      <div className={`w-10 h-10 rounded-full ${item.bgColor} dark:bg-white/5 flex items-center justify-center border border-border/30 shrink-0 group-hover:scale-105 transition-transform`}>
                        <item.icon className={`w-5 h-5 ${item.color} dark:text-foreground/70`} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-semibold text-foreground text-sm">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground/60 line-clamp-1">
                          {item.id === ViewState.CUSTOMERS ? 'Manage your client base' :
                            item.id === 'CUSTOMER_LEDGER_SEARCH' ? 'Search and view customer khata' :
                              item.id === ViewState.EXPENSES ? 'Track business spending' :
                                item.id === ViewState.PAYMENTS ? 'View payment history' :
                                  item.id === ViewState.IMPORT ? 'Backup and restore data' :
                                    'App configuration'}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                    </motion.button>
                  ))}
                </div>

                <div className="pt-4 pb-8">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      HapticService.medium();
                      signOut();
                    }}
                    className="w-full flex items-center gap-3 p-3 text-destructive font-semibold bg-destructive/5 border border-destructive/10 rounded-[20px] hover:bg-destructive/10 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                      <LogOut className="w-5 h-5 text-destructive" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-bold text-sm">Sign Out</p>
                      <p className="text-[10px] text-destructive/60">Exit your account safely</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-destructive/40" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Action Button (M3 Extended FAB) */}
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
            className="h-14 px-5 rounded-2xl bg-gradient-to-r from-primary to-purple-600 text-white shadow-xl shadow-primary/40 flex items-center gap-2.5 hover:shadow-2xl hover:shadow-primary/50 transition-all active:scale-95 glow-primary"
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

      {/* Material 3 Bottom Navigation Bar - Redesigned */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border/80 pb-safe z-30 shadow-[0_-4px_30px_rgba(0,0,0,0.15)]">
        <div className="flex justify-around items-center px-2 max-w-lg mx-auto py-1.5">
          <NavButton
            active={currentView === ViewState.DASHBOARD}
            onClick={() => handleNavClick(ViewState.DASHBOARD)}
            icon={LayoutDashboard}
            label="Home"
            badgeCount={badgeCounts[ViewState.DASHBOARD]}
          />
          <NavButton
            active={currentView === ViewState.LEDGERS || currentView === ViewState.LEDGER_DETAIL}
            onClick={() => handleNavClick(ViewState.LEDGERS)}
            icon={BookOpen}
            label="Ledgers"
            badgeCount={badgeCounts[ViewState.LEDGERS]}
          />
          <NavButton
            active={currentView === ViewState.VOUCHERS || currentView === ViewState.VOUCHER_DETAIL}
            onClick={() => handleNavClick(ViewState.VOUCHERS)}
            icon={FileText}
            label="Vouchers"
            badgeCount={badgeCounts[ViewState.VOUCHERS]}
          />
          <NavButton
            active={currentView === ViewState.REPORTS_HUB || currentView === ViewState.REPORTS || currentView === ViewState.DAYBOOK}
            onClick={() => handleNavClick(ViewState.REPORTS_HUB)}
            icon={BarChart3}
            label="Reports"
            badgeCount={badgeCounts[ViewState.REPORTS_HUB]}
          />
          <NavButton
            active={isMenuOpen || currentView === ViewState.MORE_MENU}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            icon={Grid}
            label="More"
            badgeCount={badgeCounts['more']}
          />
        </div>
      </div>
    </>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: any; label: string; badgeCount?: number }> = ({ active, onClick, icon: Icon, label, badgeCount }) => {
  const [tapFlash, setTapFlash] = useState(false);

  const handleClick = () => {
    HapticService.light();
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 200);
    onClick();
  };

  return (
    <motion.button
      onClick={handleClick}
      whileTap={{ scale: 0.92 }}
      className="flex flex-col items-center justify-center flex-1 h-full group relative"
    >
      <div className="relative flex items-center justify-center w-14 h-10 rounded-xl mb-0.5">
        {/* Animated active tab indicator with snappy spring physics */}
        {active && (
          <motion.div
            layoutId="bottom-nav-indicator"
            className="absolute inset-0 rounded-xl border border-primary/20"
            style={{
              background: 'linear-gradient(135deg, hsla(var(--primary), 0.30) 0%, hsla(var(--primary), 0.08) 50%, rgba(147, 51, 234, 0.12) 100%)'
            }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 35,
              mass: 0.8,
              restDelta: 0.5,
            }}
          />
        )}

        {/* Icon with haptic flash and scale bounce on active */}
        <motion.div
          className="relative z-10"
          animate={{
            scale: active ? [1, 1.15, 1] : 1,
          }}
          transition={{
            duration: 0.4,
            ease: "easeOut",
          }}
        >
          <Icon
            className={`w-6 h-6 transition-all duration-200 ${
              active
                ? 'text-primary drop-shadow-[0_0_10px_hsla(var(--primary)/0.6)]'
                : tapFlash
                  ? 'text-foreground/90 scale-110'
                  : 'text-muted-foreground/60 group-hover:text-foreground/80'
            }`}
            strokeWidth={active ? 2.5 : 2}
          />
        </motion.div>

        {/* Animated badge with spring entrance */}
        {badgeCount !== undefined && badgeCount > 0 && (
          <motion.span
            key={badgeCount}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 700,
              damping: 18,
              mass: 0.4,
            }}
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-black flex items-center justify-center shadow-lg shadow-destructive/30"
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </motion.span>
        )}
      </div>

      {/* Label with gradient text when active */}
      <motion.span
        animate={active ? { y: 1 } : { y: 0 }}
        className={`text-[10px] font-semibold tracking-tight transition-all duration-300 ${
          active
            ? 'font-extrabold bg-gradient-to-r from-primary via-primary to-purple-600 bg-clip-text text-transparent drop-shadow-[0_1px_2px_hsla(var(--primary)/0.3)]'
            : 'text-muted-foreground/60'
        }`}
      >
        {label}
      </motion.span>
    </motion.button>
  );
};

export default MobileBottomNav;
