import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Menu, Sparkles, Calendar, X, Users, Clock, Phone, Edit2, Trash2, ArrowUpRight, Package, Wallet, ArrowDown, ChevronRight, Building2, Check, Plus, FileText, BookOpen, ClipboardList, // Existing
    ArrowDownLeft, Undo2, Truck, Calculator, ShoppingCart, // New for Transaction Menu
    RefreshCw, AlertTriangle, CheckCircle2, Loader2, TrendingUp, TrendingDown // Dashboard Enhancements
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { DashboardService } from '../services/dashboardService';
import { AnalyticsService } from '../services/analyticsService';
import { Invoice, PromoSlide, PaymentReminder } from '../types';
import { HapticService } from '../services/hapticService';

import { useCompany } from '../contexts/CompanyContext';
import { DailyBriefing } from './DailyBriefing';
import { BackupSettings } from './BackupSettings';
import SponsoredSlide from './SponsoredSlide';
import { Card, CardContent } from '../components/ui/card';
import { useAuth } from '../contexts/AuthContext';
import admobService from '../services/AdmobService';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';

interface DashboardProps {
    onCreateInvoice: () => void;
    onCreateCreditNote: () => void;
    onViewInvoice: (invoice: Invoice) => void;
    onOpenReports: () => void;
    onOpenSmartCalc: () => void;
    onOpenAI: () => void;
    onToggleSidebar: () => void;
    onOpenDaybook: () => void;
    onOpenParties: (filter?: 'receivable' | 'payable') => void;
    onOpenSponsoredDetails: (type: 'SHOE' | 'TEA') => void;
    // Sync Status Banner
    onSync?: () => void;
    lastSyncTime?: string;
    syncStatus?: 'synced' | 'syncing' | 'error' | 'never';
    // Quick Stats Row
    monthlyRevenue?: number;
    monthlyExpenses?: number;
    netIncome?: number;
    revenueChange?: number;
    expensesChange?: number;
}

const Dashboard: React.FC<DashboardProps> = ({
    onCreateInvoice, onCreateCreditNote, onViewInvoice, onOpenReports, onOpenSmartCalc, onOpenAI, onToggleSidebar, onOpenDaybook, onOpenParties, onOpenSponsoredDetails,
    onSync, lastSyncTime, syncStatus = 'never', monthlyRevenue, monthlyExpenses, netIncome, revenueChange, expensesChange
}) => {
    // Get company data from CompanyContext (Firestore)
    const { company, companies: allCompanies, switchCompany } = useCompany();
    const { user } = useAuth();

    const [showDailyBriefing, setShowDailyBriefing] = useState(true);

    const [timeFilter] = useState<'ALL' | 'TODAY' | 'MONTH'>('MONTH');
    const [invoices, setInvoices] = useState<Invoice[]>([]);


    // Daybook Metrics
    const [toCollect, setToCollect] = useState(0);
    const [toPay, setToPay] = useState(0);
    const [stockValue, setStockValue] = useState(0);
    const [cashInHand, setCashInHand] = useState(0);

    // Sales Period Slider: 0=Today, 1=Month, 2=Total
    // Sales Period Slider: 0=Today, 1=Month, 2=Total
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newCompanyName, setNewCompanyName] = useState('');

    const [adminAds, setAdminAds] = useState<any[]>([]);
    const [showBackupSettings, setShowBackupSettings] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [scrolled, setScrolled] = useState(false);
    const [paused, setPaused] = useState(false); // Pause auto-slide if interacting with ad
    const [activeTab, setActiveTab] = useState<'TRANSACTION' | 'PARTY'>('TRANSACTION');

    // Transaction Menu Modal
    const [showTransactionModal, setShowTransactionModal] = useState(false);

    // NEW: Promo Slides from Firebase
    const [promoSlides, setPromoSlides] = useState<PromoSlide[]>([]);
    const [promoIndex, setPromoIndex] = useState(() => Math.floor(Math.random() * 5)); // Random start

    // NEW: Payment Reminders (Vasool Karo)
    const [todaysReminders, setTodaysReminders] = useState<PaymentReminder[]>([]);
    const [showReminderModal, setShowReminderModal] = useState(false);
    const [showAddReminderModal, setShowAddReminderModal] = useState(false);
    const [customers, setCustomers] = useState<any[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [newReminder, setNewReminder] = useState({
        customerId: '',
        customerName: '',
        amount: '',
        dueDate: '',
        note: ''
    });
    const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [showChart, setShowChart] = useState(false);
    const [revenueChartData, setRevenueChartData] = useState<{ month: string; revenue: number; expenses: number }[]>([]);

    useEffect(() => {
        loadData();
        // Force re-seed (Once for re-order)
        if (!localStorage.getItem('seed_v3')) {
            DashboardService.seedPromoSlides();
            localStorage.setItem('seed_v3', 'true');
        }

        // Initialize AdMob SDK on app start
        admobService.initialize().then(() => {
            console.log('[Dashboard] AdMob initialized, preparing ads...');
            // Preload interstitial for post-save
            admobService.prepareInterstitial();
        });

        const interval = setInterval(() => loadData(), 2000);

        // Auto slide for Card 2


        // Auto slide for Promo Slides (5 seconds)
        const promoTimer = setInterval(() => {
            if (!paused) {
                setPromoIndex(prev => prev + 1);
            }
        }, 5000);

        // Auto slide for Ads (legacy)


        const handleScroll = () => {
            const mainContent = document.querySelector('main');
            const scrollTop = mainContent ? mainContent.scrollTop : window.scrollY;
            setScrolled(scrollTop > 10);
        };

        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.addEventListener('scroll', handleScroll);
        }
        window.addEventListener('scroll', handleScroll, true);

        // Fetch Promo Slides from Firebase
        DashboardService.fetchPromoSlides().then(slides => {
            if (slides.length > 0) {
                setPromoSlides(slides);
                // Start from random slide
                setPromoIndex(Math.floor(Math.random() * slides.length));
            }
        });

        // Subscribe to today's reminders
        let unsubscribeReminders: (() => void) | undefined;
        if (user?.uid) {
            unsubscribeReminders = DashboardService.subscribeToTodaysReminders(
                user.uid,
                (reminders) => setTodaysReminders(reminders)
            );
        }

        // Fetch Promo Slides (NEW)
        DashboardService.fetchPromoSlides().then(slides => {
            console.log('Fetched slides:', slides);
            if (slides.length > 0) {
                setPromoSlides(slides);
            }
        });

        return () => {
            clearInterval(interval);
            clearInterval(promoTimer);
            if (mainContent) mainContent.removeEventListener('scroll', handleScroll);
            window.removeEventListener('scroll', handleScroll, true);
            if (unsubscribeReminders) unsubscribeReminders();
        };
    }, [timeFilter, user?.uid]);

    // Analytics: Track Impression (View) with Debounce
    useEffect(() => {
        // Use either firebase slides or local ads
        const slides = promoSlides.length > 0 ? promoSlides : adminAds;
        if (slides.length === 0) return;

        const currentSlide = slides[promoIndex % slides.length];

        // Only track if user views for > 2 seconds (Quality Impression)
        const timer = setTimeout(() => {
            if (currentSlide.id) {
                // Track view count
                AnalyticsService.trackImpression(currentSlide.id);
            }
        }, 2000);

        return () => clearTimeout(timer);
    }, [promoIndex, promoSlides, adminAds]);

    const loadData = async () => {
        const appMode = localStorage.getItem('app_mode');

        // --- TALLY SYNC MODE ---
        if (appMode === 'TALLY' && company?.id) {
            try {
                const stats = await DashboardService.getStats(company.id);
                if (stats) {
                    if (stats.total_outstanding > 0) {
                        setToCollect(stats.total_outstanding);
                        setToPay(0);
                    } else {
                        setToCollect(0);
                        setToPay(Math.abs(stats.total_outstanding));
                    }

                    // Use Sales This Month as a key metric
                    // setCashInHand(stats.sales_this_month); 

                    // Map Recent Invoices
                    const recentInvoices = stats.recent_invoices.map((inv: any) => ({
                        id: inv.invoice_number,
                        invoiceNumber: inv.invoice_number,
                        date: inv.invoice_date,
                        customerName: inv.party_ledger_name,
                        total: inv.net_amount,
                        // Defaults for UI safety
                        customerId: 'tally_sync',
                        customerAddress: '',
                        items: [],
                        subtotal: inv.net_amount,
                        status: 'PAID'
                    })) as unknown as Invoice[];

                    setInvoices(recentInvoices);
                }
            } catch (e) {
                console.error("Failed to load Tally Stats", e);
            }

            // Load auxiliary local data
            setAdminAds(StorageService.getAdminAds());
            setPromoSlides(await DashboardService.fetchPromoSlides());
            return;
        }

        // --- NORMAL BILLING MODE (Local Data) ---
        const allInvoices = StorageService.getInvoices();
        const allPayments = StorageService.getPayments();

        // Company is now from CompanyContext, not StorageService
        setAdminAds(StorageService.getAdminAds());

        // Load customers for reminder dropdown
        setCustomers(StorageService.getCustomers());

        // Date Filtering Logic
        // const now = new Date();
        // const todayStr = now.toISOString().split('T')[0];

        // 1. Calculate Daybook Metrics (Strictly for TODAY)
        // const todaysInvoices = allInvoices.filter(i => i.date === todayStr);
        // const todaysPayments = allPayments.filter(p => p.date === todayStr);

        // setTodaySales(todaysInvoices.reduce((sum, inv) => sum + inv.total, 0));

        // Vyapar Cards Calculations
        // 1. To Collect (Debtors) - Positive Balance
        // 2. To Pay (Creditors) - Negative Balance (Vendor)
        let collectAmount = 0;
        let payAmount = 0;

        const allCustomers = StorageService.getCustomers();
        allCustomers.forEach(c => {
            if (c.balance > 0) collectAmount += c.balance;
            if (c.balance < 0) payAmount += Math.abs(c.balance);
        });

        setToCollect(collectAmount);
        setToPay(payAmount);

        // 3. Stock Value
        const allProducts = StorageService.getProducts();
        const stockVal = allProducts.reduce((sum, p) => sum + (p.stock * p.price), 0);
        setStockValue(stockVal);

        // 4. Cash In Hand (Total Received - Expenses?)
        // For now, let's show Total Cash Received Today or Month
        // Or simplified: Total Sales - Expenses
        const totalReceived = allPayments.reduce((sum, p) => sum + p.amount, 0);
        // Note: We don't have expenses fully integrated yet in dashboard, using received as proxy or 0
        setCashInHand(totalReceived);

        // 2. Filter Main Dashboard List (Current selection)
        // const filteredInvoices = allInvoices.filter(inv => {
        //     const invDate = new Date(inv.date);
        //     if (timeFilter === 'TODAY') {
        //         return invDate.toDateString() === now.toDateString();
        //     } else if (timeFilter === 'MONTH') {
        //         return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
        //     }
        //     return true;
        // });

        // 3. Sort ALL invoices by date for Recent Transactions (Latest first)
        const sortedInvoices = [...allInvoices].sort((a, b) => {
            return new Date(b.date).getTime() - new Date(a.date).getTime() ||
                (parseInt(b.invoiceNumber.replace(/\D/g, '')) - parseInt(a.invoiceNumber.replace(/\D/g, '')));
        });

        setInvoices(sortedInvoices);

        // Generate revenue chart data from invoices (last 6 months)
        const chartData: { month: string; revenue: number; expenses: number }[] = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStr = d.toLocaleString('en-US', { month: 'short' });
            const yearStr = d.getFullYear().toString().slice(-2);
            const monthPrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            
            const monthInvoices = allInvoices.filter(inv => inv.date.startsWith(monthPrefix));
            const revenue = monthInvoices.reduce((sum, inv) => sum + inv.total, 0);
            const expenses = monthInvoices.filter(inv => inv.status === 'PAID').reduce((sum, inv) => sum + (inv.total * 0.3), 0); // Estimate 30% expenses
            
            chartData.push({
                month: `${monthStr} '${yearStr}`,
                revenue: Math.round(revenue * 100) / 100,
                expenses: Math.round(expenses * 100) / 100
            });
        }
        setRevenueChartData(chartData);

    };

    const createNewCompany = () => {
        if (!newCompanyName.trim()) return;
        alert("Multi-company support coming soon!");
        setShowCreateDialog(false);
        setNewCompanyName('');
    };

    return (
        <div className="pb-32 bg-background min-h-screen">
            {/* Daily Briefing Popup (Top) */}
            {showDailyBriefing && <DailyBriefing onClose={() => setShowDailyBriefing(false)} />}

            {/* Header Area - Redesigned with Glass Effect */}
            <div className="px-4 pb-2 glass sticky top-0 z-30 border-b border-border/50">
                <div className="flex items-center justify-between h-14 max-w-5xl mx-auto">

                    {/* Left: Nav Drawer Trigger */}
                    <div className="w-20 flex items-center justify-start gap-1">
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                                HapticService.light();
                                onToggleSidebar();
                            }}
                            className="p-2 rounded-xl hover:bg-white/10 transition-all active:scale-90"
                        >
                            <Menu className="w-5 h-5 text-foreground" />
                        </motion.button>

                    </div>

                    {/* Center: Brand Ident (M3 Title Large) */}
                    <div className="flex-1 flex justify-center relative">
                        <button
                            onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                            className="flex flex-col items-center justify-center active:scale-95 transition-transform"
                        >
                            <h2 className="font-heading text-lg font-bold text-foreground leading-none tracking-tight">
                                {company?.name || 'My Business'}
                            </h2>
                            <div className="flex items-center gap-1 text-[9px] font-semibold text-primary mt-0.5 uppercase tracking-widest bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                                <span>Switch</span>
                                <ChevronRight className="w-2 h-2" />
                            </div>
                        </button>

                        <AnimatePresence>
                            {showCompanyDropdown && (
                                <>
                                    <motion.div
                                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 10, scale: 1 }}
                                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                        className="absolute top-full mt-2 w-64 bg-surface-container-high rounded-[28px] shadow-elevation-3 border border-outline-variant p-2 z-50 origin-top text-left"
                                    >
                                        <div className="max-h-60 overflow-y-auto space-y-1">
                                            {allCompanies.map((comp, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => { switchCompany(comp.id || 'default'); setShowCompanyDropdown(false); }}
                                                    className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-all ${comp.id === company?.id ? 'bg-google-blue text-white' : 'hover:bg-surface-container-highest text-on-surface'}`}
                                                >
                                                    <Building2 className="w-4 h-4" />
                                                    <span className="flex-1 text-left font-bold text-xs truncate">{comp.name}</span>
                                                    {comp.id === company?.id && <Check className="w-3 h-3" />}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="h-px bg-outline-variant my-2 mx-2" />
                                        <button onClick={() => { setShowCompanyDropdown(false); setShowCreateDialog(true); }} className="w-full p-4 flex items-center gap-2 text-google-blue font-black text-xs rounded-2xl hover:bg-google-blue/5 transition-colors uppercase tracking-widest">
                                            <Plus className="w-4 h-4" /> Add Business
                                        </button>
                                    </motion.div>
                                    <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowCompanyDropdown(false)} />
                                </>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Right: JLS AI + Reminder */}
                    <div className="w-24 flex justify-end items-center gap-1">
                        {/* JLS AI Icon */}
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                                HapticService.light();
                                onOpenAI();
                            }}
                            className="p-2 rounded-xl bg-gradient-to-br from-primary to-purple-600 text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all relative overflow-hidden group glow-primary"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                            <Sparkles className="w-4 h-4" />
                        </motion.button>

                        {/* Reminder Icon */}
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                                HapticService.light();
                                setShowAddReminderModal(true);
                            }}
                            className="p-2 rounded-xl hover:bg-white/10 transition-all active:scale-90 relative"
                        >
                            <Calendar className="w-4 h-4 text-foreground" />
                            {todaysReminders.length > 0 && (
                                <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-destructive border-2 border-background rounded-full"></span>
                            )}
                        </motion.button>
                    </div>
                </div>

                {/* Animated Search Bar on Scroll - Buttery Smooth Spring Animation */}
                <AnimatePresence>
                    {scrolled && (
                        <motion.div
                            initial={{ height: 0, opacity: 0, y: -20, scale: 0.95 }}
                            animate={{
                                height: 'auto',
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                transition: {
                                    height: { type: "spring", stiffness: 300, damping: 30 },
                                    opacity: { duration: 0.2 },
                                    y: { type: "spring", stiffness: 300, damping: 30 },
                                    scale: { type: "spring", stiffness: 300, damping: 30 }
                                }
                            }}
                            exit={{
                                opacity: 0,
                                y: -20,
                                scale: 0.98,
                                transition: { duration: 0.15 }
                            }}
                            className="max-w-5xl mx-auto pb-4 pt-1 px-1 origin-top"
                        >
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                    <span className="material-symbols-outlined text-[18px] text-primary">search</span>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search bills, items, or customers..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-card border border-border/50 rounded-2xl py-3.5 pl-11 pr-10 text-sm font-medium text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 shadow-sm transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute inset-y-0 right-4 flex items-center text-muted-foreground/40 hover:text-foreground active:scale-90 transition-transform"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* TRANSACTION / PARTY DETAILS TABS - Redesigned */}
            <div className="px-4 mt-4 flex items-center gap-2">
                <button
                    onClick={() => setActiveTab('TRANSACTION')}
                    className={`flex-1 py-2.5 rounded-xl border text-[10px] font-semibold uppercase tracking-wider transition-all relative overflow-hidden group ${
                        activeTab === 'TRANSACTION'
                            ? 'bg-destructive/10 border-destructive/30 text-destructive shadow-sm'
                            : 'bg-transparent border-border/50 text-muted-foreground/60 hover:text-foreground/80 hover:border-border'
                    }`}
                >
                    Transaction Details
                </button>
                <button
                    onClick={() => {
                        HapticService.light();
                        onOpenParties();
                    }}
                    className={`flex-1 py-2.5 rounded-xl border text-[10px] font-semibold uppercase tracking-wider transition-all relative overflow-hidden group ${
                        activeTab === 'PARTY'
                            ? 'bg-info/10 border-info/30 text-info shadow-sm'
                            : 'bg-transparent border-border/50 text-muted-foreground/60 hover:text-foreground/80 hover:border-border'
                    }`}
                >
                    Party Details
                </button>
            </div>

            {/* QUICK ACTIONS - Redesigned with Glass + Hover Effects */}
            <div className="mt-4 px-3 grid grid-cols-4 gap-2.5">
                {/* Add Txn - Hero Action */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, type: "spring", stiffness: 200, damping: 20 }}
                    onClick={onCreateInvoice}
                    className="group relative flex flex-col items-center justify-center py-3 rounded-2xl glass hover-lift border border-primary/20"
                >
                    {/* Icon Container with Gradient */}
                    <div className="relative mb-1.5">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-destructive to-pink-600 flex items-center justify-center shadow-lg shadow-destructive/30 ring-2 ring-background group-hover:scale-110 transition-all duration-300">
                            <Plus className="w-5 h-5 text-white" strokeWidth={3} />
                        </div>
                    </div>
                    <span className="relative text-[9px] font-semibold text-foreground/80 group-hover:text-destructive transition-colors">Add Txn</span>
                </motion.button>

                {/* Report - Premium Glass Style */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
                    onClick={onOpenReports}
                    className="group relative flex flex-col items-center justify-center py-3 rounded-2xl glass hover-lift border border-border/30"
                >
                    <div className="relative mb-1.5">
                        <div className="w-11 h-11 rounded-xl bg-card flex items-center justify-center border border-border/30 shadow-sm group-hover:border-info/30 group-hover:shadow-md transition-all duration-300">
                            <ClipboardList className="w-5 h-5 text-info" />
                        </div>
                    </div>
                    <span className="relative text-[9px] font-semibold text-foreground/80 group-hover:text-info transition-colors">Report</span>
                </motion.button>

                {/* Day Book */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 20 }}
                    onClick={onOpenDaybook}
                    className="group relative flex flex-col items-center justify-center py-3 rounded-2xl glass hover-lift border border-border/30"
                >
                    <div className="relative mb-1.5">
                        <div className="w-11 h-11 rounded-xl bg-card flex items-center justify-center border border-border/30 shadow-sm group-hover:border-primary/30 group-hover:shadow-md transition-all duration-300">
                            <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                    </div>
                    <span className="relative text-[9px] font-semibold text-foreground/80 group-hover:text-primary transition-colors">Day Book</span>
                </motion.button>

                {/* Calculator */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
                    onClick={() => {
                        HapticService.light();
                        onOpenSmartCalc();
                    }}
                    className="group relative flex flex-col items-center justify-center py-3 rounded-2xl glass hover-lift border border-border/30"
                >
                    <div className="relative mb-1.5">
                        <div className="w-11 h-11 rounded-xl bg-card flex items-center justify-center border border-border/30 shadow-sm group-hover:border-success/30 group-hover:shadow-md transition-all duration-300">
                            <Calculator className="w-5 h-5 text-success" />
                        </div>
                    </div>
                    <span className="relative text-[9px] font-semibold text-foreground/80 group-hover:text-success transition-colors">Calculator</span>
                </motion.button>
            </div>

            {/* STATS CARDS - Redesigned with Gradient Backgrounds + Glass */}
            <div className="mt-3 px-3 grid grid-cols-2 gap-2.5">
                {/* 1. To Collect (You'll Get) */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, type: "spring", stiffness: 200, damping: 20 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onOpenParties('receivable')}
                    className="glass rounded-2xl p-4 relative cursor-pointer hover-lift group overflow-hidden"
                >
                    {/* Gradient accent bar */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-success to-emerald-400" />
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">You'll Get</span>
                        <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center">
                            <ArrowDown className="w-3.5 h-3.5 text-success" />
                        </div>
                    </div>
                    <h3 className="font-heading text-xl font-bold text-foreground leading-none">
                        ₹{toCollect.toLocaleString('en-IN')}
                    </h3>
                    <p className="text-[8px] text-success font-medium mt-1 flex items-center gap-1">
                        Outstanding <ChevronRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0" />
                    </p>
                </motion.div>

                {/* 2. To Pay (You'll Give) */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onOpenParties('payable')}
                    className="glass rounded-2xl p-4 relative cursor-pointer hover-lift group overflow-hidden"
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-destructive to-rose-400" />
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">You'll Give</span>
                        <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                            <ArrowUpRight className="w-3.5 h-3.5 text-destructive" />
                        </div>
                    </div>
                    <h3 className="font-heading text-xl font-bold text-foreground leading-none">
                        ₹{toPay.toLocaleString('en-IN')}
                    </h3>
                    <p className="text-[8px] text-destructive font-medium mt-1 flex items-center gap-1">
                        Payables <ChevronRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0" />
                    </p>
                </motion.div>

                {/* 3. Stock Value */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 20 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onOpenReports()}
                    className="glass rounded-2xl p-4 relative cursor-pointer hover-lift group overflow-hidden"
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-info to-blue-400" />
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">Stock Value</span>
                        <div className="w-7 h-7 rounded-lg bg-info/10 flex items-center justify-center">
                            <Package className="w-3.5 h-3.5 text-info" />
                        </div>
                    </div>
                    <h3 className="font-heading text-xl font-bold text-foreground leading-none">
                        ₹{stockValue.toLocaleString('en-IN')}
                    </h3>
                    <p className="text-[8px] text-info font-medium mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        View Details <ChevronRight className="w-2.5 h-2.5" />
                    </p>
                </motion.div>

                {/* 4. Cash in Hand */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onOpenDaybook()}
                    className="glass rounded-2xl p-4 relative cursor-pointer hover-lift group overflow-hidden"
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-warning to-amber-400" />
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">Cash Recd</span>
                        <div className="w-7 h-7 rounded-lg bg-warning/10 flex items-center justify-center">
                            <Wallet className="w-3.5 h-3.5 text-warning" />
                        </div>
                    </div>
                    <h3 className="font-heading text-xl font-bold text-foreground leading-none">
                        ₹{cashInHand.toLocaleString('en-IN')}
                    </h3>
                    <p className="text-[8px] text-warning font-medium mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        View Daybook <ChevronRight className="w-2.5 h-2.5" />
                    </p>
                </motion.div>
            </div>

            {/* ===== SYNC STATUS BANNER ===== Redesigned */}
            <div className="px-3 mt-3">
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => {
                        if (syncStatus !== 'syncing' && onSync) {
                            HapticService.light();
                            onSync();
                        }
                    }}
                    className={`glass rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-all border ${
                        syncStatus === 'synced' ? 'border-success/30' :
                        syncStatus === 'syncing' ? 'border-info/30' :
                        syncStatus === 'error' ? 'border-destructive/30' :
                        'border-border/30'
                    }`}
                >
                    {/* Icon */}
                    <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                        syncStatus === 'synced' ? 'bg-success/10 text-success' :
                        syncStatus === 'syncing' ? 'bg-info/10 text-info' :
                        syncStatus === 'error' ? 'bg-destructive/10 text-destructive' :
                        'bg-white/5 text-muted-foreground'
                    }`}>
                        {syncStatus === 'syncing' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : syncStatus === 'synced' ? (
                            <CheckCircle2 className="w-4 h-4" />
                        ) : syncStatus === 'error' ? (
                            <AlertTriangle className="w-4 h-4" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${
                            syncStatus === 'synced' ? 'text-success' :
                            syncStatus === 'syncing' ? 'text-info' :
                            syncStatus === 'error' ? 'text-destructive' :
                            'text-muted-foreground'
                        }`}>
                            {syncStatus === 'syncing' ? 'Syncing with Tally...' :
                             syncStatus === 'error' ? 'Sync failed — tap to retry' :
                             syncStatus === 'never' ? 'Not synced yet — tap to sync' :
                             `Last synced: ${lastSyncTime || 'just now'}`}
                        </p>
                        {syncStatus === 'syncing' && (
                            <div className="flex gap-1 mt-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-info animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-info animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-info animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        )}
                    </div>

                    {/* Refresh Button */}
                    <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (syncStatus !== 'syncing' && onSync) {
                                HapticService.light();
                                onSync();
                            }
                        }}
                        className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                            syncStatus === 'syncing'
                                ? 'bg-info/10 text-info cursor-not-allowed'
                                : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                        }`}
                        disabled={syncStatus === 'syncing'}
                    >
                        <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                    </motion.button>
                </motion.div>
            </div>

            {/* ===== QUICK STATS ROW (Redesigned with Glass + Gradient) ===== */}
            {(monthlyRevenue !== undefined || monthlyExpenses !== undefined || netIncome !== undefined) && (
                <div className="px-3 mt-3 grid grid-cols-3 gap-2.5">
                    {/* Revenue Card */}
                    <div className="glass rounded-2xl overflow-hidden border border-success/20">
                        <div className="p-3">
                            <p className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Revenue</p>
                            <p className="font-heading text-lg font-bold text-success leading-none mb-1">
                                ₹{(monthlyRevenue ?? 0).toLocaleString('en-IN')}
                            </p>
                            {revenueChange !== undefined && (
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold ${
                                    revenueChange >= 0 ? 'text-success' : 'text-destructive'
                                }`}>
                                    {revenueChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {Math.abs(revenueChange).toFixed(1)}%
                                </span>
                            )}
                            {/* Mini Recharts Sparkline */}
                            <div className="mt-2 h-6">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={revenueChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--spark-color, #10b981)" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="var(--spark-color, #10b981)" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="revenue" stroke="var(--spark-color, #10b981)" strokeWidth={1.5} fill="url(#sparkGrad)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Expenses Card */}
                    <div className="glass rounded-2xl overflow-hidden border border-destructive/20">
                        <div className="p-3">
                            <p className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Expenses</p>
                            <p className="font-heading text-lg font-bold text-destructive leading-none mb-1">
                                ₹{(monthlyExpenses ?? 0).toLocaleString('en-IN')}
                            </p>
                            {expensesChange !== undefined && (
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold ${
                                    expensesChange <= 0 ? 'text-success' : 'text-destructive'
                                }`}>
                                    {expensesChange <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                    {Math.abs(expensesChange).toFixed(1)}%
                                </span>
                            )}
                            {/* Mini Recharts Sparkline */}
                            <div className="mt-2 h-6">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={revenueChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--spark-color, #10b981)" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="var(--spark-color, #10b981)" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="revenue" stroke="var(--spark-color, #10b981)" strokeWidth={1.5} fill="url(#sparkGrad)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Net Income Card */}
                    <div className="glass rounded-2xl overflow-hidden border border-border/30">
                        <div className="p-3">
                            <p className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Net Income</p>
                            <p className={`font-heading text-lg font-bold leading-none mb-1 ${
                                (netIncome ?? 0) >= 0 ? 'text-success' : 'text-destructive'
                            }`}>
                                ₹{(netIncome ?? 0).toLocaleString('en-IN')}
                            </p>
                            {revenueChange !== undefined && expensesChange !== undefined && (
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold ${
                                    (netIncome ?? 0) >= 0 ? 'text-success' : 'text-destructive'
                                }`}>
                                    {(netIncome ?? 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {(netIncome ?? 0) >= 0 ? 'Profitable' : 'Loss'}
                                </span>
                            )}
                            {/* Mini Recharts Net Sparkline */}
                            <div className="mt-2 h-6">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={revenueChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="netSparkGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="netSparkGradDown" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={1.5} fill="url(#netSparkGrad)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* REVENUE TREND CHART - Recharts */}
            <div className="px-4 mt-3">
                <div
                    onClick={() => setShowChart(!showChart)}
                    className="glass rounded-2xl p-4 cursor-pointer hover:shadow-md transition-all"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <TrendingUp className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="font-heading font-semibold text-sm text-foreground">Revenue Trend</h3>
                                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                                    Last 6 months
                                </p>
                            </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${showChart ? 'rotate-90' : ''}`} />
                    </div>

                    {showChart && revenueChartData.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="h-52 mt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={revenueChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                fontWeight: 'bold'
                                            }}
                                            formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, undefined]}
                                        />
                                        <defs>
                                            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#lineGrad)" dot={{ r: 3, fill: 'hsl(var(--primary))' }} activeDot={{ r: 5, fill: 'hsl(var(--primary))' }} />
                                        <Line type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            {/* Legend */}
                            <div className="flex items-center justify-center gap-6 mt-2 text-[10px] font-bold text-muted-foreground">
                                <span className="flex items-center gap-2">
                                    <span className="w-3 h-0.5 bg-primary rounded-full" /> Revenue
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className="w-3 h-0.5 bg-rose-500 rounded-full" /> Estimated Expenses
                                </span>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* PROMO SLIDES CAROUSEL - Firebase Managed */}
            <div className="px-4 mt-2 mb-2 relative">
                <AnimatePresence mode="wait">
                    {(() => {
                        // Filter out legacy static slides that we have replaced with interactive ones
                        const rawSlides = (promoSlides.length > 0 ? promoSlides : adminAds)
                            .filter(s => s.id !== 'slide_ad_tea');

                        // Inject Interactive Sponsored Slide (TEA)
                        const sponsoredTeaSlide: any = {
                            id: 'sponsored_tea_interactive',
                            type: 'SPONSORED_INTERACTIVE',
                            title: 'Sponsored Tea',
                            gradient: 'from-slate-900 to-slate-800',
                            isActive: true,
                            subType: 'TEA'
                        };

                        const displaySlides = [...rawSlides];

                        // Insert Tea Slide at index 1
                        if (displaySlides.length >= 1) {
                            displaySlides.splice(1, 0, sponsoredTeaSlide);
                        } else {
                            displaySlides.push(sponsoredTeaSlide);
                        }

                        const currentSlide = displaySlides.length > 0 ? displaySlides[promoIndex % displaySlides.length] : {
                            id: 'default_premium',
                            title: 'Boost Your Growth',
                            subtitle: 'Track your daily sales with advanced analytics.',
                            type: 'FEATURE',
                            imageUrl: '/banners/slide_growth.png',
                            gradient: 'from-blue-600 to-purple-600'
                        } as PromoSlide;

                        if (currentSlide.type === 'SPONSORED_INTERACTIVE') {
                            return (
                                <motion.div
                                    key={currentSlide.id}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    drag="x"
                                    dragConstraints={{ left: 0, right: 0 }}
                                    dragElastic={0.2}
                                    onDragEnd={(_e, { offset }) => {
                                        const swipe = offset.x;
                                        if (swipe < -50) {
                                            setPromoIndex(prev => prev + 1);
                                        } else if (swipe > 50) {
                                            setPromoIndex(prev => (prev === 0 ? displaySlides.length - 1 : prev - 1));
                                        }
                                    }}
                                    className="w-full h-[110px] relative"
                                >
                                    <SponsoredSlide
                                        type={(currentSlide as any).subType || 'SHOE'}
                                        onInteraction={(isActive) => setPaused(isActive)}
                                        onOpenDetails={() => onOpenSponsoredDetails((currentSlide as any).subType || 'SHOE')}
                                    />
                                    {/* Indicators for consistency */}
                                    <div className="absolute bottom-2 left-6 flex gap-1 z-30 pointer-events-none">
                                        {displaySlides.slice(0, 7).map((_, i) => (
                                            <div key={i} className={`h-1 rounded-full transition-all ${i === (promoIndex % displaySlides.length) ? 'bg-white w-3 shadow-sm' : 'bg-white/30 w-1'}`} />
                                        ))}
                                    </div>
                                </motion.div>
                            );
                        }

                        return (
                            <motion.div
                                key={currentSlide.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                drag={paused ? false : "x"}
                                dragConstraints={{ left: 0, right: 0 }}
                                dragElastic={0.2}
                                onDragEnd={(_e, { offset }) => {
                                    if (paused) return;
                                    const swipe = offset.x;
                                    if (swipe < -50) {
                                        setPromoIndex(prev => prev + 1); // Next
                                    } else if (swipe > 50) {
                                        setPromoIndex(prev => (prev === 0 ? displaySlides.length - 1 : prev - 1)); // Prev
                                    }
                                }}
                                className={`w-full h-[110px] rounded-[16px] ${currentSlide.gradient?.startsWith('from') ? 'bg-gradient-to-br ' + currentSlide.gradient : currentSlide.gradient} pl-5 pr-0 py-0 flex flex-row items-center justify-between shadow-sm border border-slate-100 relative overflow-hidden cursor-grab active:cursor-grabbing`}
                            >
                                {/* Text Content (Left) */}
                                <div className={`relative z-10 w-[65%] flex flex-col justify-center h-full ${currentSlide.textColor || 'text-slate-900'} pointer-events-none`}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        {currentSlide.type && (
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${currentSlide.accentColor || 'bg-slate-900 text-white'}`}>
                                                {currentSlide.type}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-base font-bold leading-tight mb-0.5">{currentSlide.title}</h3>
                                    <p className="text-[10px] opacity-70 font-medium leading-snug mb-2 max-w-[95%] line-clamp-2">{currentSlide.content || currentSlide.subtitle}</p>

                                    {currentSlide.buttonText && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // Track Click Event
                                                AnalyticsService.trackClick(currentSlide, user?.uid || user?.email || 'guest');

                                                if (currentSlide.actionUrl) {
                                                    window.open(currentSlide.actionUrl, '_self');
                                                }
                                            }}
                                            className="bg-white text-slate-900 text-[9px] font-bold py-1 px-2.5 rounded shadow-sm self-start flex items-center gap-1 hover:bg-slate-50 border border-slate-200 transition-colors pointer-events-auto"
                                        >
                                            {currentSlide.buttonText}
                                        </button>
                                    )}
                                </div>

                                {/* Sticker Composition (Right) */}
                                <div className="w-[40%] h-full relative flex items-end justify-end p-0 overflow-hidden">
                                    {/* Background Glow for Depth */}
                                    <div className="absolute right-[-20%] top-[10%] w-[80%] h-[80%] bg-white/30 blur-2xl rounded-full mix-blend-overlay"></div>

                                    {/* Secondary Floating Element (e.g. Sale Tag) */}
                                    {currentSlide.secondaryImage && (
                                        <motion.img
                                            initial={{ scale: 0, rotate: -20 }}
                                            animate={{ scale: 1, rotate: 10 }}
                                            src={currentSlide.secondaryImage}
                                            className="absolute top-2 right-4 w-12 h-12 object-contain z-20 drop-shadow-sm brightness-110 contrast-125"
                                            style={{ mixBlendMode: 'multiply' }}
                                        />
                                    )}

                                    {/* Main Sticker with Seamless Mask */}
                                    {currentSlide.imageUrl && (
                                        <img
                                            src={currentSlide.imageUrl}
                                            alt="Banner"
                                            className="h-[110%] w-auto object-contain object-bottom drop-shadow-xl brightness-105 contrast-110 saturate-125 translate-y-2 translate-x-2"
                                            style={{
                                                mixBlendMode: 'multiply',
                                                maskImage: 'linear-gradient(to left, black 60%, transparent 100%)',
                                                WebkitMaskImage: 'linear-gradient(to left, black 70%, transparent 100%)'
                                            }}
                                        />
                                    )}
                                </div>

                                {/* Slide Indicators (Subtle) */}
                                <div className="absolute bottom-2 left-6 flex gap-1">
                                    {displaySlides.slice(0, 7).map((_, i) => (
                                        <div key={i} className={`h-1 rounded-full transition-all ${i === (promoIndex % displaySlides.length) ? 'bg-slate-900 w-3' : 'bg-slate-300 w-1'}`} />
                                    ))}
                                </div>
                            </motion.div>
                        );
                    })()}
                </AnimatePresence>
            </div>

            {/* PAYMENT REMINDERS SECTION - Redesigned with Glass */}
            {todaysReminders.length > 0 && (
                <div className="px-3 mt-3">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowReminderModal(true)}
                        className="glass rounded-2xl p-1.5 flex items-center justify-between relative overflow-hidden cursor-pointer hover-lift border border-warning/20"
                    >
                        <div className="flex items-center gap-3 relative z-10">
                            {/* Icon Circle */}
                            <div className="w-10 h-10 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center shrink-0">
                                <Calendar className="w-4 h-4 text-warning" />
                            </div>

                            {/* Single Line Text */}
                            <p className="text-foreground/80 text-xs font-medium truncate max-w-[220px]">
                                {todaysReminders.length === 1 ? (
                                    <>
                                        Payment due: <span className="font-bold text-foreground">{todaysReminders[0].customerName}</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="font-bold text-warning">{todaysReminders.length} Payments</span> scheduled for today
                                    </>
                                )}
                            </p>
                        </div>

                        {/* Arrow */}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                    </motion.div>
                </div>
            )}


            {/* RECENT TRANSACTIONS - Redesigned with Stagger Animations + Glass */}
            <div className="mt-3">
                <div className="flex items-center justify-between mb-2 px-3">
                    <h3 className="font-heading text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Recent Transactions</h3>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={onOpenReports} className="text-[9px] font-semibold text-info uppercase tracking-wider">
                        View All
                    </motion.button>
                </div>

                <div className="px-3">
                    <div className="glass rounded-2xl overflow-hidden border border-border/30">
                    {(() => {
                        const filtered = invoices.filter(inv =>
                            inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            inv.items.some(item => item.description.toLowerCase().includes(searchQuery.toLowerCase()))
                        );

                        if (filtered.length === 0) {
                            return (
                                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                    <FileText className="w-6 h-6 opacity-30 mb-2" />
                                    <p className="text-[9px] font-semibold uppercase tracking-widest opacity-50">
                                        {searchQuery ? "No matches found" : "No recent activity"}
                                    </p>
                                </div>
                            );
                        }

                        return (
                            <div className="divide-y divide-border/30">
                                {filtered.map((inv, idx) => (
                                    <motion.div
                                        key={inv.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.03, type: "spring", stiffness: 200, damping: 25 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                                        onClick={() => onViewInvoice(inv)}
                                    >
                                        {/* Left: Customer, Invoice & Date */}
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-foreground truncate">{inv.customerName}</span>
                                                <span className="text-[9px] text-muted-foreground/60 shrink-0 font-mono">#{inv.invoiceNumber}</span>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground/50 font-medium mt-0.5">
                                                {new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>

                                        {/* Right: Amount & Status */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-sm font-bold text-foreground">₹{inv.total.toLocaleString('en-IN')}</span>
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${
                                                inv.status === 'PAID' 
                                                  ? 'bg-success/15 text-success border border-success/20' 
                                                  : 'bg-destructive/15 text-destructive border border-destructive/20'
                                            }`}>
                                                {inv.status === 'PAID' ? 'P' : 'D'}
                                            </span>
                                        </div>
                                    </motion.div>
                                ))}
                                <div className="py-2 text-center">
                                    <span className="text-[8px] font-semibold text-muted-foreground/30 uppercase tracking-wider">End of list</span>
                                </div>
                            </div>
                        );
                    })()}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {showCreateDialog && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-6">
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-sm p-8">
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">New Business</h2>
                            <input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Company Name" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold mb-4 outline-none border focus:border-blue-500" autoFocus />
                            <div className="flex gap-3">
                                <button onClick={() => setShowCreateDialog(false)} className="flex-1 p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold text-xs uppercase tracking-widest">Cancel</button>
                                <button onClick={createNewCompany} className="flex-1 p-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest">Create</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div className="mt-12 mb-8 text-center opacity-30">
                <p className="text-[9px] font-heading font-bold uppercase tracking-[0.3em] text-muted-foreground">Made with ❤️ by Lavneet</p>
            </div>

            {showBackupSettings && <BackupSettings onClose={() => setShowBackupSettings(false)} />}

            {/* TRANSACTION TYPE MODAL (Vyapar Style Grid) */}
            <AnimatePresence>
                {showTransactionModal && (
                    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="bg-white dark:bg-slate-900 rounded-t-[32px] w-full max-w-md max-h-[90vh] overflow-y-auto pb-8"
                        >
                            {/* Modal Drag Handle / Header */}
                            <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pt-3 pb-2 px-6 border-b border-slate-100 dark:border-slate-800">
                                <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">New Transaction</h3>
                                    <button
                                        onClick={() => setShowTransactionModal(false)}
                                        className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Section 1: Sale Transactions */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Sale Transactions</h4>
                                    <div className="grid grid-cols-4 gap-y-6 gap-x-2">
                                        {/* Sale Invoice */}
                                        <button onClick={() => { setShowTransactionModal(false); onCreateInvoice(); }} className="flex flex-col items-center gap-2">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <FileText className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                                <div className="absolute top-1 right-2 w-3 h-3 bg-blue-600 rounded-full flex items-center justify-center border border-white dark:border-slate-900">
                                                    <span className="text-[8px] text-white font-bold">%</span>
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Sale<br />Invoice</span>
                                        </button>

                                        {/* Payment In */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Payment In */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <ArrowDownLeft className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Payment<br />In</span>
                                        </button>

                                        {/* Sale Return (Credit Note) */}
                                        <button onClick={() => { setShowTransactionModal(false); onCreateCreditNote(); }} className="flex flex-col items-center gap-2">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <Undo2 className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Sale<br />Return</span>
                                        </button>

                                        {/* Estimate / Quotation */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Estimate */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <Calculator className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Estimate/<br />Quotation</span>
                                        </button>

                                        {/* Delivery Challan */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <Truck className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Delivery<br />Challan</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Section 2: Purchase Transactions */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Purchase Transactions</h4>
                                    <div className="grid grid-cols-4 gap-y-6 gap-x-2">
                                        {/* Purchase */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Purchase */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <ShoppingCart className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Purchase<br />Bill</span>
                                        </button>

                                        {/* Payment Out */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Payment Out */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <ArrowUpRight className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Payment<br />Out</span>
                                        </button>

                                        {/* Purchase Return */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Purchase Return */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <Undo2 className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} transform="scale(-1, 1)" />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Purchase<br />Return</span>
                                        </button>

                                        {/* Purchase Order */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <ShoppingCart className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                                <div className="absolute top-0 right-0 w-3 h-3 bg-blue-600 rounded-full flex items-center justify-center border border-white dark:border-slate-900">
                                                    <Plus className="w-2 h-2 text-white" />
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Purchase<br />Order</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Section 3: Other Transactions */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Other Transactions</h4>
                                    <div className="grid grid-cols-4 gap-y-6 gap-x-2">
                                        {/* Expenses */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Expenses */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <Wallet className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Expenses</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {showTransactionModal && (
                    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="bg-white dark:bg-slate-900 rounded-t-[32px] w-full max-w-md max-h-[90vh] overflow-y-auto pb-8"
                        >
                            {/* Modal Drag Handle / Header */}
                            <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pt-3 pb-2 px-6 border-b border-slate-100 dark:border-slate-800">
                                <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">New Transaction</h3>
                                    <button
                                        onClick={() => setShowTransactionModal(false)}
                                        className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Section 1: Sale Transactions */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Sale Transactions</h4>
                                    <div className="grid grid-cols-4 gap-y-6 gap-x-2">
                                        {/* Sale Invoice */}
                                        <button onClick={() => { setShowTransactionModal(false); onCreateInvoice(); }} className="flex flex-col items-center gap-2">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <FileText className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                                <div className="absolute top-1 right-2 w-3 h-3 bg-blue-600 rounded-full flex items-center justify-center border border-white dark:border-slate-900">
                                                    <span className="text-[8px] text-white font-bold">%</span>
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Sale<br />Invoice</span>
                                        </button>

                                        {/* Payment In */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Payment In */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <ArrowDownLeft className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Payment<br />In</span>
                                        </button>

                                        {/* Sale Return (Credit Note) */}
                                        <button onClick={() => { setShowTransactionModal(false); onCreateCreditNote(); }} className="flex flex-col items-center gap-2">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <Undo2 className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Sale<br />Return</span>
                                        </button>

                                        {/* Estimate / Quotation */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Estimate */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <Calculator className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Estimate/<br />Quotation</span>
                                        </button>

                                        {/* Delivery Challan */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <Truck className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Delivery<br />Challan</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Section 2: Purchase Transactions */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Purchase Transactions</h4>
                                    <div className="grid grid-cols-4 gap-y-6 gap-x-2">
                                        {/* Purchase */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Purchase */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <ShoppingCart className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Purchase<br />Bill</span>
                                        </button>

                                        {/* Payment Out */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Payment Out */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <ArrowUpRight className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Payment<br />Out</span>
                                        </button>

                                        {/* Purchase Return */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Purchase Return */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <Undo2 className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} transform="scale(-1, 1)" />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Purchase<br />Return</span>
                                        </button>

                                        {/* Purchase Order */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <ShoppingCart className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                                <div className="absolute top-0 right-0 w-3 h-3 bg-blue-600 rounded-full flex items-center justify-center border border-white dark:border-slate-900">
                                                    <Plus className="w-2 h-2 text-white" />
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Purchase<br />Order</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Section 3: Other Transactions */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Other Transactions</h4>
                                    <div className="grid grid-cols-4 gap-y-6 gap-x-2">
                                        {/* Expenses */}
                                        <button onClick={() => { setShowTransactionModal(false); /* TODO: Expenses */ }} className="flex flex-col items-center gap-2 opacity-50">
                                            <div className="relative h-12 w-12 flex items-center justify-center">
                                                <div className="absolute bottom-0 w-10 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-lg" />
                                                <Wallet className="relative z-10 w-7 h-7 text-blue-600 dark:text-blue-400 mb-1" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">Expenses</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ADD REMINDER MODAL */}
            <AnimatePresence>
                {showAddReminderModal && (
                    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-md">
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="bg-white dark:bg-slate-900 rounded-t-[32px] w-full max-w-md p-6 pb-10"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-black text-slate-900 dark:text-white">Add Payment Reminder</h2>
                                <button onClick={() => setShowAddReminderModal(false)} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="relative">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Select Customer</label>
                                    <input
                                        value={customerSearch || newReminder.customerName}
                                        onChange={(e) => {
                                            setCustomerSearch(e.target.value);
                                            setShowCustomerDropdown(true);
                                        }}
                                        onFocus={() => setShowCustomerDropdown(true)}
                                        placeholder="Type to search customers..."
                                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold outline-none border border-transparent focus:border-orange-500"
                                    />

                                    {/* Customer Dropdown */}
                                    {showCustomerDropdown && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto z-50">
                                            {customers
                                                .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                                                .slice(0, 10)
                                                .map((customer) => (
                                                    <button
                                                        key={customer.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setNewReminder({
                                                                ...newReminder,
                                                                customerId: customer.id,
                                                                customerName: customer.name
                                                            });
                                                            setCustomerSearch('');
                                                            setShowCustomerDropdown(false);
                                                            HapticService.light();
                                                        }}
                                                        className="w-full p-3 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 last:border-0"
                                                    >
                                                        <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 font-black text-xs">
                                                            {customer.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-900 dark:text-white text-sm">{customer.name}</p>
                                                            {customer.balance > 0 && (
                                                                <p className="text-[10px] text-orange-600 font-bold">Balance: ₹{customer.balance.toLocaleString()}</p>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && (
                                                <p className="p-4 text-center text-slate-400 text-sm">No customers found</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Selected Customer Badge */}
                                    {newReminder.customerName && !showCustomerDropdown && (
                                        <div className="mt-2 inline-flex items-center gap-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1.5 rounded-full text-xs font-bold">
                                            <Users className="w-3 h-3" />
                                            {newReminder.customerName}
                                            <button onClick={() => setNewReminder({ ...newReminder, customerId: '', customerName: '' })} className="ml-1">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Amount (₹)</label>
                                    <input
                                        type="number"
                                        value={newReminder.amount}
                                        onChange={(e) => setNewReminder({ ...newReminder, amount: e.target.value })}
                                        placeholder="0"
                                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold outline-none border border-transparent focus:border-orange-500"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Due Date</label>
                                    <input
                                        type="date"
                                        value={newReminder.dueDate}
                                        onChange={(e) => setNewReminder({ ...newReminder, dueDate: e.target.value })}
                                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold outline-none border border-transparent focus:border-orange-500"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Note (Optional)</label>
                                    <input
                                        value={newReminder.note}
                                        onChange={(e) => setNewReminder({ ...newReminder, note: e.target.value })}
                                        placeholder="e.g., Said will pay on Sunday"
                                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold outline-none border border-transparent focus:border-orange-500"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={async () => {
                                    // Validation with alert
                                    if (!newReminder.customerName) {
                                        alert('Please select a customer');
                                        return;
                                    }
                                    if (!newReminder.amount) {
                                        alert('Please enter amount');
                                        return;
                                    }
                                    if (!newReminder.dueDate) {
                                        alert('Please select due date');
                                        return;
                                    }
                                    console.log('Save Reminder clicked. User:', user);
                                    if (!user?.uid) {
                                        alert('User not logged in. Please log in to save reminders.');
                                        console.error('User UID missing:', user);
                                        return;
                                    }

                                    try {
                                        const reminder: PaymentReminder = {
                                            id: `rem_${Date.now()}`,
                                            customerId: newReminder.customerId || '',
                                            customerName: newReminder.customerName,
                                            amount: parseFloat(newReminder.amount) || 0,
                                            dueDate: newReminder.dueDate,
                                            note: newReminder.note || '',
                                            status: 'PENDING',
                                            createdAt: new Date().toISOString()
                                        };

                                        console.log('Attempting to save reminder:', reminder);
                                        await DashboardService.savePaymentReminder(user.uid, reminder);
                                        console.log('Reminder saved successfully!');

                                        setNewReminder({ customerId: '', customerName: '', amount: '', dueDate: '', note: '' });
                                        setCustomerSearch('');
                                        setShowAddReminderModal(false);
                                        HapticService.medium();
                                    } catch (error) {
                                        console.error('Error saving reminder:', error);
                                        alert('Error saving reminder. Check console.');
                                    }
                                }}
                                className="w-full mt-6 p-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl font-black text-sm uppercase tracking-wider active:scale-95 transition-transform"
                            >
                                Save Reminder
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* VIEW ALL REMINDERS MODAL */}
            <AnimatePresence>
                {showReminderModal && (
                    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-md">
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="bg-white dark:bg-slate-900 rounded-t-[32px] w-full max-w-md p-6 pb-10 max-h-[80vh] overflow-y-auto"
                        >
                            <div className="flex items-center justify-between mb-6 sticky top-0 bg-white dark:bg-slate-900 pb-4">
                                <div>
                                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Payment Reminders</h2>
                                    <p className="text-xs text-slate-500">Today's Collections</p>
                                </div>
                                <button onClick={() => setShowReminderModal(false)} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {todaysReminders.map((reminder) => {
                                    const customer = customers.find(c => c.id === reminder.customerId);
                                    const isEditing = editingReminderId === reminder.id;
                                    const customerPhone = customer?.phone || customers.find(c => c.name === reminder.customerName)?.phone;

                                    return (
                                        <div
                                            key={reminder.id}
                                            className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden group"
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-900/40 dark:to-orange-900/10 flex items-center justify-center text-orange-600 dark:text-orange-400 font-black text-lg border border-orange-100/50">
                                                        {reminder.customerName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-black text-slate-800 dark:text-white text-base leading-tight">
                                                            {reminder.customerName}
                                                        </h3>
                                                        {reminder.note ? (
                                                            <p className="text-xs font-medium text-slate-400 mt-1 flex items-center gap-1">
                                                                <FileText className="w-3 h-3" /> {reminder.note}
                                                            </p>
                                                        ) : (
                                                            <p className="text-xs font-bold text-slate-400 mt-1">Pending Payment</p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end">
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg font-bold text-slate-400">₹</span>
                                                            <input
                                                                type="number"
                                                                value={editAmount}
                                                                onChange={(e) => setEditAmount(e.target.value)}
                                                                className="w-24 p-1 text-right font-black text-xl text-slate-900 bg-transparent border-b-2 border-orange-500 outline-none"
                                                                autoFocus
                                                            />
                                                        </div>
                                                    ) : (
                                                        <p className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                                                            ₹{reminder.amount.toLocaleString('en-IN')}
                                                        </p>
                                                    )}

                                                    <div className="flex items-center gap-1 mt-1">
                                                        <button
                                                            onClick={() => {
                                                                if (isEditing) {
                                                                    setEditingReminderId(null);
                                                                } else {
                                                                    setEditingReminderId(reminder.id);
                                                                    setEditAmount(reminder.amount.toString());
                                                                }
                                                            }}
                                                            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500 transition-colors"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (!user?.uid) return;
                                                                if (window.confirm('Delete this reminder?')) {
                                                                    await DashboardService.deletePaymentReminder(user.uid, reminder.id);
                                                                    HapticService.medium();
                                                                }
                                                            }}
                                                            className="p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="grid grid-cols-2 gap-3 items-center">
                                                {/* Left Side: Call or Secondary Action */}
                                                <div className="col-span-1">
                                                    {customerPhone ? (
                                                        <a
                                                            href={`tel:${customerPhone}`}
                                                            className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100 dark:border-blue-800/30"
                                                        >
                                                            <Phone className="w-4 h-4" />
                                                            <span>Call Now</span>
                                                        </a>
                                                    ) : (
                                                        <button
                                                            onClick={async () => {
                                                                if (!user?.uid) return;
                                                                const tomorrow = new Date();
                                                                tomorrow.setDate(tomorrow.getDate() + 1);
                                                                await DashboardService.postponeReminder(user.uid, reminder.id, tomorrow.toISOString().split('T')[0]);
                                                                HapticService.light();
                                                            }}
                                                            className="flex items-center justify-center gap-2 w-full py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                                                        >
                                                            <Clock className="w-4 h-4" />
                                                            <span>Postpone</span>
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Right Side: Main Action (Collect) */}
                                                <div className="col-span-1 flex gap-2">
                                                    {customerPhone && (
                                                        <button
                                                            onClick={async () => {
                                                                if (!user?.uid) return;
                                                                const tomorrow = new Date();
                                                                tomorrow.setDate(tomorrow.getDate() + 1);
                                                                await DashboardService.postponeReminder(user.uid, reminder.id, tomorrow.toISOString().split('T')[0]);
                                                                HapticService.light();
                                                            }}
                                                            className="w-12 flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-400 rounded-xl hover:bg-slate-200 transition-colors"
                                                        >
                                                            <Clock className="w-4 h-4" />
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={async () => {
                                                            if (!user?.uid) return;

                                                            const collectAmount = isEditing ? parseFloat(editAmount) : reminder.amount;

                                                            // Create Payment Receipt
                                                            const payment = {
                                                                id: `pay_${Date.now()}`,
                                                                customerId: reminder.customerId,
                                                                date: new Date().toISOString().split('T')[0],
                                                                amount: collectAmount,
                                                                mode: 'CASH' as const,
                                                                type: 'RECEIVED' as const,
                                                                note: `Collection from reminder: ${reminder.note || ''}`
                                                            };

                                                            // Save payment to storage
                                                            StorageService.savePayment(payment);

                                                            // Update customer balance
                                                            if (customer) {
                                                                const updatedCustomer = {
                                                                    ...customer,
                                                                    balance: customer.balance - collectAmount
                                                                };
                                                                StorageService.saveCustomer(updatedCustomer);
                                                            }

                                                            // Mark reminder as collected
                                                            await DashboardService.markReminderCollected(user.uid, reminder.id);
                                                            setEditingReminderId(null);
                                                            HapticService.medium();
                                                        }}
                                                        className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <Check className="w-4 h-4 stroke-[3]" />
                                                        <span>{isEditing ? `Confirm ₹${editAmount}` : 'Collected'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {todaysReminders.length === 0 && (
                                    <div className="text-center py-16 px-4">
                                        <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white dark:border-slate-900 shadow-sm">
                                            <Calendar className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <h3 className="text-slate-900 dark:text-white font-black text-lg mb-1">All Caught Up!</h3>
                                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">No pending payments for today.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >
        </div >
    );
};

export default Dashboard;
