
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState } from '../types';
import {
  LayoutDashboard, FileText, Users, Package, Settings, Sun, Moon, X,
  RotateCcw, ShoppingCart, BarChart3, ArrowDownLeft, Calculator, Cloud,
  BookOpen, User, ChevronRight, Plus, Search, RefreshCw,
  TrendingUp, FileBarChart, Receipt, Wallet, PieChart,
  Bell, DollarSign, FileSpreadsheet
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { HapticService } from '@/services/hapticService';
import { useSearch } from '@/contexts/SearchContext';
import { useCompany } from '@/contexts/CompanyContext';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  isOpen: boolean;
  onClose: () => void;
  isCloudConnected: boolean;
  onOpenBackup?: () => void;
}

// --- Types ---
interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  isSpecial?: boolean;
  children?: NavItem[];
  badge?: string;
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

// --- Stagger animation for container children ---
const staggerContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.04, delayChildren: 0.1 }
  }
};

const staggerItem = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 350, damping: 28 } }
};

const sidebarSlide = {
  open: { x: 0, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 28 } },
  closed: { x: "-100%", opacity: 0, transition: { type: "spring", stiffness: 300, damping: 30 } }
};

// --- Nested menu expand icon rotation ---
const chevronSpring = {
  collapsed: { rotate: 0 },
  expanded: { rotate: 90 }
};

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, isOpen, onClose, isCloudConnected, onOpenBackup }) => {
  const { theme, setTheme } = useTheme();
  const { company } = useCompany();
  const { setSearchVisible } = useSearch();

  // Track which nested sections are expanded
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Reports': false,
    'Management': false,
  });

  const toggleSection = (sectionKey: string) => {
    HapticService.light();
    setExpandedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  // --- Navigation items with sub-items for nested menus ---
  const navGroups: NavGroup[] = [
    {
      section: 'Main',
      items: [
        { id: ViewState.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
        { id: ViewState.INVOICES, label: 'Sales', icon: FileText },
        { id: ViewState.CREATE_CREDIT_NOTE, label: 'Return (CN)', icon: RotateCcw },
        { id: ViewState.PURCHASES, label: 'Purchases', icon: ShoppingCart },
      ]
    },
    {
      section: 'Management',
      items: [
        {
          id: 'MANAGEMENT_GROUP', label: 'Management', icon: Users,
          children: [
            { id: ViewState.CUSTOMERS, label: 'Customers', icon: Users },
            { id: 'CUSTOMER_LEDGER_SEARCH', label: 'Customer Ledger', icon: BookOpen },
            { id: ViewState.INVENTORY, label: 'Inventory', icon: Package },
            { id: ViewState.DAYBOOK, label: 'Daybook', icon: ArrowDownLeft },
            { id: ViewState.LEDGERS, label: 'Ledgers', icon: Receipt },
            { id: ViewState.VOUCHERS, label: 'Vouchers', icon: FileSpreadsheet },
            { id: ViewState.SMART_CALCULATOR, label: 'Calculator', icon: Calculator },
          ]
        },
      ]
    },
    {
      section: 'Reports',
      items: [
        {
          id: 'REPORTS_GROUP', label: 'Reports', icon: BarChart3,
          children: [
            { id: ViewState.REPORTS, label: 'Reports Hub', icon: PieChart },
            { id: ViewState.ANALYTICS_DASHBOARD, label: 'Analytics', icon: TrendingUp },
            { id: 'BALANCE_SHEET', label: 'Balance Sheet', icon: Wallet },
            { id: 'PROFIT_LOSS', label: 'Profit & Loss', icon: DollarSign },
            { id: 'GST_REPORTS', label: 'GST Reports', icon: FileBarChart },
          ]
        },
        { id: ViewState.SETTINGS, label: 'Settings', icon: Settings },
      ]
    },
    {
      section: 'Cloud',
      items: [
        { id: 'BACKUP' as any, label: 'Backup & Sync', icon: Cloud, isSpecial: true },
      ]
    }
  ];

  // --- Quick action shortcuts ---
  const quickActions = [
    { icon: Plus, label: 'Invoice', action: () => { onNavigate(ViewState.CREATE_INVOICE); onClose(); } },
    { icon: Search, label: 'Search', action: () => { onClose(); setTimeout(() => setSearchVisible(true), 300); } },
    { icon: Calculator, label: 'Calc', action: () => { onNavigate(ViewState.SMART_CALCULATOR); onClose(); } },
    { icon: RefreshCw, label: 'Sync', action: () => { if (onOpenBackup) { onOpenBackup(); onClose(); } } },
  ];

  // --- Render a nav item (handles nested, active, special) ---
  const renderNavItem = (item: NavItem, groupIndex: number, itemIndex: number, isNested: boolean = false) => {
    const isActive = currentView === item.id && !item.isSpecial && !item.children;
    const hasChildren = item.children && item.children.length > 0;
    const sectionKey = item.id;
    const isExpanded = expandedSections[item.label] || false;

    if (hasChildren) {
      return (
        <motion.div key={item.id} variants={staggerItem}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => toggleSection(item.label)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 relative overflow-hidden group ${
              isExpanded
                ? 'bg-primary/10 text-primary border border-primary/15 shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent'
            }`}
          >
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors ${
              isExpanded
                ? 'bg-primary/20 text-primary'
                : 'bg-white/5 text-muted-foreground group-hover:text-foreground'
            }`}>
              <item.icon className="w-4 h-4" strokeWidth={2} />
            </div>
            <span className="font-semibold text-sm flex-1 text-left">{item.label}</span>
            <motion.div
              variants={chevronSpring}
              animate={isExpanded ? 'expanded' : 'collapsed'}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
            </motion.div>
          </motion.button>

          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                key={`${item.id}-children`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className="overflow-hidden"
              >
                <div className="ml-4 mt-1 pl-3 border-l-2 border-primary/20 space-y-0.5">
                  {item.children.map((child, childIdx) => (
                    <motion.button
                      key={child.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: childIdx * 0.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        HapticService.light();
                        if (child.id === 'CUSTOMER_LEDGER_SEARCH') {
                          onClose();
                          setTimeout(() => setSearchVisible(true), 300);
                        } else {
                          onNavigate(child.id as ViewState);
                          onClose();
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative ${
                        currentView === child.id
                          ? 'bg-primary/10 text-primary border border-primary/15'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className={`flex items-center justify-center w-6 h-6 rounded-md shrink-0 ${
                        currentView === child.id ? 'bg-primary/20 text-primary' : 'bg-white/5 text-muted-foreground'
                      }`}>
                        <child.icon className="w-3.5 h-3.5" strokeWidth={currentView === child.id ? 2.5 : 2} />
                      </div>
                      <span className="text-xs font-medium">{child.label}</span>
                      {currentView === child.id && (
                        <motion.div
                          layoutId={`nested-active-${item.id}`}
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r-full"
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                      )}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );
    }

    // --- Leaf item ---
    return (
      <motion.button
        key={item.id}
        variants={staggerItem}
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          HapticService.light();
          if (item.isSpecial && onOpenBackup) {
            onOpenBackup();
            onClose();
          } else if (item.id === 'CUSTOMER_LEDGER_SEARCH') {
            onClose();
            setTimeout(() => setSearchVisible(true), 300);
          } else {
            onNavigate(item.id as ViewState);
            onClose();
          }
        }}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 relative overflow-hidden group ${
          item.isSpecial
            ? 'bg-success/10 border border-success/20 text-success hover:bg-success/15'
            : isActive
              ? 'bg-primary/15 text-primary border border-primary/20 shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent'
        }`}
      >
        {/* Active indicator bar */}
        {isActive && (
          <motion.div
            layoutId="sidebar-active-indicator"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
          item.isSpecial
            ? 'bg-success/20 text-success'
            : isActive
              ? 'bg-primary/20 text-primary'
              : 'bg-white/5 text-muted-foreground group-hover:text-foreground'
        } transition-colors`}>
          <item.icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
        </div>
        <span className="font-semibold text-sm flex-1 text-left">{item.label}</span>
        {item.badge && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-destructive/15 text-destructive rounded-full">
            {item.badge}
          </span>
        )}
        {isActive && (
          <ChevronRight className="w-3.5 h-3.5 text-primary/60 shrink-0" />
        )}
      </motion.button>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="sidebar-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Panel */}
      <motion.aside
        key="sidebar"
        variants={sidebarSlide}
        initial="closed"
        animate={isOpen ? 'open' : 'closed'}
        className="fixed top-0 left-0 h-full w-[280px] z-50 lg:translate-x-0 lg:static flex flex-col shadow-2xl shadow-black/25"
        style={{
          background: 'linear-gradient(135deg, hsla(var(--card) / 0.7) 0%, hsla(var(--card) / 0.35) 100%)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid hsla(var(--border) / 0.4)',
        }}
      >
        {/* ============ TOP: User Profile Card ============ */}
        <div className="relative overflow-hidden shrink-0">
          {/* Glass gradient header background with subtle noise */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/25 via-primary/10 to-transparent" />
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%%25\' height=\'100%%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
            backgroundSize: '200px 200px',
          }} />

          <div className="relative px-5 pt-safe pt-4 pb-6">
            {/* Top row: avatar + close */}
            <div className="flex items-center justify-between mb-4">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-primary/30 ring-2 ring-white/20"
              >
                <User className="w-6 h-6 text-white" strokeWidth={2.5} />
              </motion.div>
              <div className="flex items-center gap-1">
                {/* Notification bell */}
                <button className="p-2 rounded-xl hover:bg-white/10 transition-colors relative">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-destructive rounded-full" />
                </button>
                <button onClick={onClose} className="lg:hidden p-2 rounded-xl hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Company info */}
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="font-heading text-xl font-bold text-foreground leading-tight"
            >
              {company?.name || 'My Business'}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-xs text-muted-foreground mt-0.5 font-medium"
            >
              TallyOnMobile
            </motion.p>
          </div>
        </div>

        {/* ============ MIDDLE: Nav Items with Nested Menus ============ */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5 no-scrollbar">
          {navGroups.map((group, idx) => (
            <motion.div
              key={group.section}
              variants={staggerContainer}
              initial="hidden"
              animate="show"
            >
              {/* Section header */}
              <motion.div variants={staggerItem}>
                <h3 className="px-3 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 mb-2 font-heading flex items-center gap-2">
                  <span className="flex-1">{group.section}</span>
                  <span className="h-px flex-1 bg-border/30" />
                </h3>
              </motion.div>

              <div className="space-y-1">
                {group.items.map((item, itemIdx) =>
                  renderNavItem(item, idx, itemIdx, false)
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* ============ BOTTOM: Quick Actions + Footer ============ */}
        <div className="shrink-0 border-t border-border/40 bg-gradient-to-t from-background/70 to-transparent pt-3">
          {/* Quick Action Shortcuts */}
          <div className="px-4 mb-3">
            <div className="flex gap-2">
              {quickActions.map((action, idx) => (
                <motion.button
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + idx * 0.05 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={action.action}
                  className="flex-1 flex flex-col items-center gap-1 p-2 rounded-xl glass hover:bg-white/10 transition-all duration-200 border border-border/20 group"
                  style={{
                    background: 'linear-gradient(135deg, hsla(var(--primary) / 0.12) 0%, hsla(var(--primary) / 0.04) 100%)',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                    <action.icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{action.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Cloud Status */}
          <div className="px-4 mb-2">
            <div className="flex items-center gap-3 p-2.5 rounded-xl glass border border-border/40" style={{
              background: 'linear-gradient(135deg, hsla(var(--card) / 0.5) 0%, hsla(var(--card) / 0.2) 100%)',
              backdropFilter: 'blur(16px)',
            }}>
              <div className={`w-2.5 h-2.5 rounded-full ${isCloudConnected ? 'bg-success shadow-lg shadow-success/30' : 'bg-destructive animate-pulse'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-foreground/80 truncate">
                  {isCloudConnected ? 'Cloud Sync Active' : 'Sync Paused'}
                </p>
                <p className="text-[9px] text-muted-foreground/60 truncate">
                  {isCloudConnected ? 'All data backed up' : 'Tap to reconnect'}
                </p>
              </div>
              <Cloud className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
            </div>
          </div>

          {/* Theme Toggle + Branding */}
          <div className="px-4 pb-4 flex items-center justify-between">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-border/20 group"
            >
              <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                {theme === 'dark'
                  ? <Moon className="w-3.5 h-3.5 text-primary" />
                  : <Sun className="w-3.5 h-3.5 text-amber-400" />
                }
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground capitalize">{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </motion.button>

            <p className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground/25 font-heading flex items-center gap-1">
              Made with <span className="text-destructive text-[10px]">❤</span>
            </p>
          </div>
        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;
