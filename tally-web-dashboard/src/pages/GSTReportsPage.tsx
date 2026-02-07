import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { FileText, Download, Building2, User, Package, Receipt, Calendar, ShieldCheck, PieChart, Activity } from 'lucide-react';
import { GlassCard, MetricCard, Badge, Spinner } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';
import { FinancialYearFilter } from '@/components/shared/FinancialYearFilter';

// Helper component for empty states
const EmptyState = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-[var(--text-muted)] opacity-30 mb-4">{icon}</div>
        <h3 className="text-lg font-black text-[var(--on-surface)] uppercase tracking-tight">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] mt-1">{description}</p>
    </div>
);

export default function GSTReportsPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);

    // Calculate current FY dynamically (FY starts in April)
    const getCurrentFy = () => {
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const endYear = (currentYear + 1).toString().slice(2);
        return `FY ${currentYear}-${endYear}`;
    };

    const [selectedFy, setSelectedFy] = useState(getCurrentFy());
    const [period, setPeriod] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [reportData, setReportData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'summary' | 'b2b' | 'b2c' | 'hsn' | 'gstr3b'>('summary');

    // Generate months for the selected FY
    const monthsInFy = useMemo(() => {
        const startYearText = selectedFy.split(' ')[1].split('-')[0];
        const startYear = parseInt(startYearText);
        const months = [];
        for (let i = 0; i < 12; i++) {
            const date = new Date(startYear, 3 + i, 1);
            months.push({
                key: format(date, 'yyyy-MM'),
                label: format(date, 'MMM yy'),
                start: format(startOfMonth(date), 'yyyy-MM-dd'),
                end: format(endOfMonth(date), 'yyyy-MM-dd')
            });
        }
        return months;
    }, [selectedFy]);

    useEffect(() => {
        if (selectedCompany?.id && period) loadGSTData();
    }, [selectedCompany, period]);

    const getDateRange = () => {
        const [year, month] = period.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        return { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] };
    };

    const loadGSTData = async () => {
        setLoading(true);
        try {
            const { start, end } = getDateRange();

            // Fetch sales vouchers
            const { data: salesVouchers } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .gte('voucher_date', start)
                .lte('voucher_date', end)
                .eq('is_deleted', false);

            // Fetch stock entries for all vouchers
            const voucherIds = (salesVouchers || []).map((v: any) => v.id);
            const { data: stockEntries } = await supabase
                .from('voucher_stock_entries')
                .select('*')
                .in('voucher_id', voucherIds);

            // Group stock entries by voucher_id
            const entriesByVoucher = (stockEntries || []).reduce((acc: any, entry: any) => {
                if (!acc[entry.voucher_id]) acc[entry.voucher_id] = [];
                acc[entry.voucher_id].push(entry);
                return acc;
            }, {});

            // Map vouchers with their stock entries
            const sales = (salesVouchers || []).map((s: any) => ({
                ...s,
                invoice_number: s.voucher_number,
                invoice_date: s.voucher_date,
                party_ledger_name: s.party_name,
                party_gstin: s.party_gstin || '',
                net_amount: Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0),
                taxable_amount: Math.abs(Number(s.taxable_value) || Number(s.total_amount) || 0),
                cgst_amount: Number(s.cgst_amount) || 0,
                sgst_amount: Number(s.sgst_amount) || 0,
                igst_amount: Number(s.igst_amount) || 0,
                cess_amount: Number(s.cess_amount) || 0,
                place_of_supply: s.place_of_supply || '',
                stock_entries: entriesByVoucher[s.id] || []
            }));

            // Fetch purchase vouchers
            const { data: purchaseVouchers } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Purchase')
                .gte('voucher_date', start)
                .lte('voucher_date', end)
                .eq('is_deleted', false);

            const purchases = (purchaseVouchers || []).map((p: any) => ({
                ...p,
                net_amount: Math.abs(Number(p.grand_total) || Number(p.total_amount) || 0),
                taxable_amount: Math.abs(Number(p.taxable_value) || Number(p.total_amount) || 0),
                cgst_amount: Number(p.cgst_amount) || 0,
                sgst_amount: Number(p.sgst_amount) || 0,
                igst_amount: Number(p.igst_amount) || 0,
                cess_amount: Number(p.cess_amount) || 0
            }));

            const processed = processGSTData(sales || [], purchases || []);
            setReportData(processed);
        } catch (error) {
            console.error('Error loading GST data:', error);
        }
        setLoading(false);
    };

    const processGSTData = (sales: any[], purchases: any[]) => {
        const b2b = sales.filter((s: any) => s.party_gstin?.length === 15).map((s: any) => ({
            gstin: s.party_gstin, partyName: s.party_ledger_name, invoiceNumber: s.invoice_number,
            invoiceDate: s.invoice_date, invoiceValue: s.net_amount || 0, taxableValue: s.taxable_amount || 0,
            cgst: s.cgst_amount || 0, sgst: s.sgst_amount || 0, igst: s.igst_amount || 0, cess: s.cess_amount || 0, placeOfSupply: s.place_of_supply || ''
        }));

        const b2c = sales.filter((s: any) => !s.party_gstin || s.party_gstin.length !== 15).reduce((acc: any, s: any) => {
            acc.taxableValue += s.taxable_amount || 0; acc.cgst += s.cgst_amount || 0; acc.sgst += s.sgst_amount || 0;
            acc.igst += s.igst_amount || 0; acc.cess += s.cess_amount || 0; acc.invoiceValue += s.net_amount || 0; acc.count += 1; return acc;
        }, { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, invoiceValue: 0, count: 0 });

        const hsnMap = new Map();
        sales.forEach((sale: any) => {
            (sale.stock_entries || []).forEach((item: any) => {
                const hsn = item.hsn_code || 'N/A';
                if (!hsnMap.has(hsn)) hsnMap.set(hsn, { hsn, description: item.stock_item_name || '', uqc: item.unit || 'NOS', quantity: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalValue: 0 });
                const entry = hsnMap.get(hsn);
                entry.quantity += item.quantity || 0;
                entry.taxableValue += item.amount || 0;
                entry.totalValue += item.amount || 0;
                // Note: GST breakdown per line item may need to be calculated from voucher-level GST
            });
        });

        const outwardSupplies = {
            taxable: sales.reduce((sum: number, s: any) => sum + (s.taxable_amount || 0), 0),
            cgst: sales.reduce((sum: number, s: any) => sum + (s.cgst_amount || 0), 0),
            sgst: sales.reduce((sum: number, s: any) => sum + (s.sgst_amount || 0), 0),
            igst: sales.reduce((sum: number, s: any) => sum + (s.igst_amount || 0), 0),
            cess: sales.reduce((sum: number, s: any) => sum + (s.cess_amount || 0), 0)
        };

        const inputTaxCredit = {
            taxable: purchases.reduce((sum: number, p: any) => sum + (p.taxable_amount || 0), 0),
            cgst: purchases.reduce((sum: number, p: any) => sum + (p.cgst_amount || 0), 0),
            sgst: purchases.reduce((sum: number, p: any) => sum + (p.sgst_amount || 0), 0),
            igst: purchases.reduce((sum: number, p: any) => sum + (p.igst_amount || 0), 0),
            cess: purchases.reduce((sum: number, p: any) => sum + (p.cess_amount || 0), 0)
        };

        const netPayable = {
            cgst: Math.max(0, outwardSupplies.cgst - inputTaxCredit.cgst),
            sgst: Math.max(0, outwardSupplies.sgst - inputTaxCredit.sgst),
            igst: Math.max(0, outwardSupplies.igst - inputTaxCredit.igst),
            cess: Math.max(0, outwardSupplies.cess - inputTaxCredit.cess),
            total: 0
        };
        netPayable.total = netPayable.cgst + netPayable.sgst + netPayable.igst + netPayable.cess;

        return {
            b2b, b2c, hsnSummary: Array.from(hsnMap.values()),
            gstr3b: { outwardSupplies, inputTaxCredit, netPayable },
            totals: { salesCount: sales.length, purchasesCount: purchases.length, totalSales: sales.reduce((sum: number, s: any) => sum + (s.net_amount || 0), 0), totalPurchases: purchases.reduce((sum: number, p: any) => sum + (p.net_amount || 0), 0) }
        };
    };

    const exportJSON = (type: 'gstr1' | 'gstr3b') => {
        if (!reportData) return;
        let exportData: any = {};
        if (type === 'gstr1') {
            exportData = { gstin: selectedCompany.gstin || 'GSTIN_NOT_SET', fp: period.replace('-', ''), b2b: reportData.b2b, b2cs: [reportData.b2c], hsn: { data: reportData.hsnSummary } };
        } else {
            exportData = { gstin: selectedCompany.gstin || 'GSTIN_NOT_SET', ret_period: period.replace('-', ''), sup_details: { osup_det: reportData.gstr3b.outwardSupplies }, itc_elg: { itc_avl: [reportData.gstr3b.inputTaxCredit] } };
        }
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${type.toUpperCase()}_${period}_${selectedCompany.name}.json`; a.click();
        URL.revokeObjectURL(url);
    };

    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount || 0);

    if (!selectedCompany) return null;

    const tabs = [
        { key: 'summary', label: 'Matrix', icon: <PieChart size={16} /> },
        { key: 'b2b', label: 'B2B Flow', icon: <Building2 size={16} /> },
        { key: 'b2c', label: 'B2C Flow', icon: <User size={16} /> },
        { key: 'hsn', label: 'HSN Core', icon: <Package size={16} /> },
        { key: 'gstr3b', label: 'GSTR-3B', icon: <Activity size={16} /> },
    ];

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-black text-[var(--on-surface)] uppercase tracking-tighter">Compliance Hub</h1>
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest leading-none mt-1">{selectedCompany.name}</p>
            </header>

            {/* Global FY Slider */}
            <FinancialYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />

            {/* Month Segment Slider */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide py-1">
                {monthsInFy.map((m) => {
                    const isActive = period === m.key;
                    return (
                        <button
                            key={m.key}
                            onClick={() => setPeriod(m.key)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap border ${isActive ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-lg' : 'bg-[var(--surface-variant)] border-[var(--border)] text-[var(--on-surface-variant)]'}`}
                        >
                            {m.label}
                        </button>
                    );
                })}
            </div>

            {/* Quick Export Bar */}
            <div className="flex items-center gap-2 p-2 bg-[var(--surface-variant)]/50 rounded-2xl border border-[var(--border)] justify-end">
                <button onClick={() => exportJSON('gstr1')} disabled={!reportData || loading} className="px-4 py-2 text-[var(--success)] text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[var(--success)]/10 transition-all disabled:opacity-30 flex items-center gap-2">
                    <Download size={14} /> GSTR-1 JSON
                </button>
                <button onClick={() => exportJSON('gstr3b')} disabled={!reportData || loading} className="px-4 py-2 text-[var(--primary)] text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[var(--primary)]/10 transition-all disabled:opacity-30 flex items-center gap-2">
                    <Download size={14} /> GSTR-3B JSON
                </button>
            </div>

            {/* Navigation Matrix */}
            <div className="flex gap-2 p-1.5 bg-[var(--surface-variant)] rounded-2xl border border-[var(--border)] overflow-x-auto scrollbar-hide">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key as any)}
                        className={`px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.key ? 'bg-[var(--on-surface)] text-[var(--surface)]' : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-active)]'}`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <Spinner size="md" />
                    </div>
                ) : !reportData ? (
                    <EmptyState icon={<FileText size={48} />} title="Zero Data" description="No tax events found in this segment" />
                ) : (
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Summary Tab */}
                        {activeTab === 'summary' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                                        <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Outward Gross</p>
                                        <p className="text-lg font-black text-[var(--on-surface)] mt-1">{formatCurrency(reportData.totals.totalSales)}</p>
                                    </div>
                                    <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                                        <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Inward Gross</p>
                                        <p className="text-lg font-black text-[var(--on-surface)] mt-1">{formatCurrency(reportData.totals.totalPurchases)}</p>
                                    </div>
                                    <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                                        <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Total Liability</p>
                                        <p className="text-lg font-black text-amber-500 mt-1">{formatCurrency(reportData.gstr3b.outwardSupplies.cgst + reportData.gstr3b.outwardSupplies.sgst + reportData.gstr3b.outwardSupplies.igst)}</p>
                                    </div>
                                    <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                                        <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">ITC Assets</p>
                                        <p className="text-lg font-black text-emerald-500 mt-1">{formatCurrency(reportData.gstr3b.inputTaxCredit.cgst + reportData.gstr3b.inputTaxCredit.sgst + reportData.gstr3b.inputTaxCredit.igst)}</p>
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-8 opacity-10">
                                        <ShieldCheck size={100} />
                                    </div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                                        Net Tax Settlement Profile
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-widest mb-1 opacity-70">CGST Net</p>
                                            <p className="text-xl font-black">{formatCurrency(reportData.gstr3b.netPayable.cgst)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-widest mb-1 opacity-70">SGST Net</p>
                                            <p className="text-xl font-black">{formatCurrency(reportData.gstr3b.netPayable.sgst)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-widest mb-1 opacity-70">IGST Net</p>
                                            <p className="text-xl font-black">{formatCurrency(reportData.gstr3b.netPayable.igst)}</p>
                                        </div>
                                        <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20">
                                            <p className="text-[8px] font-black uppercase tracking-widest mb-1">Global Flow</p>
                                            <p className="text-2xl font-black">{formatCurrency(reportData.gstr3b.netPayable.total)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Rest of the tabs remain similar but with updated styling for high density */}
                        {activeTab === 'b2b' && (
                            <div className="space-y-4">
                                {reportData.b2b.length === 0 ? (
                                    <EmptyState icon={<Building2 size={40} />} title="No B2B Events" description="No registered dealer sales found" />
                                ) : (
                                    <div className="grid gap-3">
                                        {reportData.b2b.map((inv: any, i: number) => (
                                            <div key={i} className="bg-[var(--surface-variant)]/50 p-4 rounded-2xl border border-[var(--border)] flex justify-between items-center gap-4">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[8px] font-black text-[var(--primary)] tracking-widest uppercase">{inv.gstin}</span>
                                                        <span className="text-[8px] font-bold text-[var(--text-muted)] uppercase">#{inv.invoiceNumber}</span>
                                                    </div>
                                                    <h4 className="text-xs font-black text-[var(--on-surface)] uppercase truncate mt-1">{inv.partyName}</h4>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] mt-0.5">{inv.invoiceDate}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-emerald-500">{formatCurrency(inv.invoiceValue)}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)]">GST: {formatCurrency(inv.cgst + inv.sgst + inv.igst)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Simplified B2C view */}
                        {activeTab === 'b2c' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <GlassCard className="p-6">
                                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4">Retail Aggregate</p>
                                    <div className="space-y-4">
                                        <div className="flex justify-between">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Clients Count</span>
                                            <span className="text-lg font-black">{reportData.b2c.count}</span>
                                        </div>
                                        <div className="flex justify-between border-t border-[var(--border)] pt-4">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Total Invoice Vol</span>
                                            <span className="text-xl font-black text-[var(--primary)]">{formatCurrency(reportData.b2c.invoiceValue)}</span>
                                        </div>
                                    </div>
                                </GlassCard>
                                <GlassCard className="p-6">
                                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4">Tax Component</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[8px] uppercase font-bold text-[var(--text-muted)]">CGST</p>
                                            <p className="text-sm font-black">{formatCurrency(reportData.b2c.cgst)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[8px] uppercase font-bold text-[var(--text-muted)]">SGST</p>
                                            <p className="text-sm font-black">{formatCurrency(reportData.b2c.sgst)}</p>
                                        </div>
                                    </div>
                                </GlassCard>
                            </div>
                        )}

                        {/* Simplified HSN view */}
                        {activeTab === 'hsn' && (
                            <div className="space-y-3">
                                {reportData.hsnSummary.map((hsn: any, i: number) => (
                                    <div key={i} className="bg-[var(--surface-variant)]/50 p-4 rounded-2xl border border-[var(--border)] flex justify-between items-center">
                                        <div>
                                            <p className="text-[9px] font-black text-[var(--primary)] tracking-widest">{hsn.hsn}</p>
                                            <h4 className="text-[10px] font-bold text-[var(--on-surface)] uppercase truncate max-w-[150px]">{hsn.description}</h4>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-black">{formatCurrency(hsn.totalValue)}</p>
                                            <p className="text-[8px] font-bold text-[var(--text-muted)]">{hsn.quantity} {hsn.uqc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Simplified GSTR-3B view */}
                        {activeTab === 'gstr3b' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <GlassCard className="p-6">
                                        <h3 className="text-xs font-black uppercase text-emerald-500 mb-4 border-b pb-2">3.1 Outbound Supply</h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between"><span className="text-[10px] font-bold opacity-60">Taxable</span><span className="text-xs font-black">{formatCurrency(reportData.gstr3b.outwardSupplies.taxable)}</span></div>
                                            <div className="flex justify-between"><span className="text-[10px] font-bold opacity-60">CGST</span><span className="text-xs font-black">{formatCurrency(reportData.gstr3b.outwardSupplies.cgst)}</span></div>
                                            <div className="flex justify-between"><span className="text-[10px] font-bold opacity-60">SGST</span><span className="text-xs font-black">{formatCurrency(reportData.gstr3b.outwardSupplies.sgst)}</span></div>
                                        </div>
                                    </GlassCard>
                                    <GlassCard className="p-6">
                                        <h3 className="text-xs font-black uppercase text-blue-500 mb-4 border-b pb-2">4.0 Inbound Credit</h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between"><span className="text-[10px] font-bold opacity-60">Eligible ITC</span><span className="text-xs font-black">{formatCurrency(reportData.gstr3b.inputTaxCredit.cgst + reportData.gstr3b.inputTaxCredit.sgst)}</span></div>
                                            <div className="flex justify-between"><span className="text-[10px] font-bold opacity-60">CGST Credit</span><span className="text-xs font-black">{formatCurrency(reportData.gstr3b.inputTaxCredit.cgst)}</span></div>
                                            <div className="flex justify-between"><span className="text-[10px] font-bold opacity-60">SGST Credit</span><span className="text-xs font-black">{formatCurrency(reportData.gstr3b.inputTaxCredit.sgst)}</span></div>
                                        </div>
                                    </GlassCard>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
