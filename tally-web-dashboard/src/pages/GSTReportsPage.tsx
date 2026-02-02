import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { FileText, Download, Building2, User, Package, Receipt } from 'lucide-react';
import { GlassCard, MetricCard } from '@/components/ui/GlassUI';

export default function GSTReportsPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [reportData, setReportData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'summary' | 'b2b' | 'b2c' | 'hsn' | 'gstr3b'>('summary');

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

            const { data: sales } = await supabase
                .from('sales')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', start)
                .lte('invoice_date', end)
                .eq('is_cancelled', false);

            if (sales?.length) {
                const saleIds = sales.map((s: any) => s.id);
                const { data: allItems } = await supabase.from('sales_items').select('*').in('sale_id', saleIds);
                sales.forEach((sale: any) => { sale.sales_items = (allItems || []).filter((item: any) => item.sale_id === sale.id); });
            }

            const { data: purchases } = await supabase
                .from('purchases')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', start)
                .lte('invoice_date', end)
                .eq('is_cancelled', false);

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
            (sale.sales_items || []).forEach((item: any) => {
                const hsn = item.hsn_code || 'N/A';
                if (!hsnMap.has(hsn)) hsnMap.set(hsn, { hsn, description: item.item_name || '', uqc: item.unit || 'NOS', quantity: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalValue: 0 });
                const entry = hsnMap.get(hsn);
                entry.quantity += item.quantity || 0; entry.taxableValue += item.taxable_amount || item.amount || 0;
                entry.cgst += item.cgst_amount || 0; entry.sgst += item.sgst_amount || 0; entry.igst += item.igst_amount || 0; entry.totalValue += item.total_amount || item.amount || 0;
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

    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount || 0);

    if (!selectedCompany) return null;

    const tabs = [
        { key: 'summary', label: 'Summary', icon: <Receipt size={16} /> },
        { key: 'b2b', label: 'B2B', icon: <Building2 size={16} /> },
        { key: 'b2c', label: 'B2C', icon: <User size={16} /> },
        { key: 'hsn', label: 'HSN', icon: <Package size={16} /> },
        { key: 'gstr3b', label: 'GSTR-3B', icon: <FileText size={16} /> },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">GST Reports</h1>
                    <p className="text-gray-500 mt-1">{selectedCompany.name}</p>
                </div>
                <div className="flex items-center gap-3">
                    <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="px-4 py-2.5 bg-[#121214] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20" />
                    <button onClick={() => exportJSON('gstr1')} disabled={!reportData} className="px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/20 disabled:opacity-50 flex items-center gap-2">
                        <Download size={16} /> GSTR-1
                    </button>
                    <button onClick={() => exportJSON('gstr3b')} disabled={!reportData} className="px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl hover:bg-blue-500/20 disabled:opacity-50 flex items-center gap-2">
                        <Download size={16} /> GSTR-3B
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-white/5">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key as any)}
                        className={`px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.key ? 'bg-[#121214] text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-white'}`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-500">Loading GST data...</p>
                </div>
            ) : !reportData ? (
                <div className="text-center py-16 text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 opacity-30" />
                    <p>No data for this period</p>
                </div>
            ) : (
                <>
                    {/* Summary Tab */}
                    {activeTab === 'summary' && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <MetricCard title="Total Sales" value={formatCurrency(reportData.totals.totalSales)} icon={<Receipt size={20} />} color="green" />
                            <MetricCard title="Total Purchases" value={formatCurrency(reportData.totals.totalPurchases)} icon={<Receipt size={20} />} color="orange" />
                            <MetricCard title="Output Tax" value={formatCurrency(reportData.gstr3b.outwardSupplies.cgst + reportData.gstr3b.outwardSupplies.sgst + reportData.gstr3b.outwardSupplies.igst)} icon={<FileText size={20} />} color="purple" />
                            <MetricCard title="Net GST Payable" value={formatCurrency(reportData.gstr3b.netPayable.total)} icon={<FileText size={20} />} color="blue" />
                        </div>
                    )}

                    {/* B2B Tab */}
                    {activeTab === 'b2b' && (
                        <GlassCard className="p-0 overflow-hidden">
                            <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                                <h2 className="font-semibold text-white">B2B Invoices (Registered Parties)</h2>
                                <p className="text-xs text-gray-500">{reportData.b2b.length} invoices</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/[0.02] text-left text-xs text-gray-500 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">GSTIN</th>
                                            <th className="px-6 py-4">Party</th>
                                            <th className="px-6 py-4">Invoice</th>
                                            <th className="px-6 py-4 text-right">Taxable</th>
                                            <th className="px-6 py-4 text-right">CGST</th>
                                            <th className="px-6 py-4 text-right">SGST</th>
                                            <th className="px-6 py-4 text-right">IGST</th>
                                            <th className="px-6 py-4 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {reportData.b2b.map((inv: any, i: number) => (
                                            <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="px-6 py-4 font-mono text-xs text-gray-400">{inv.gstin}</td>
                                                <td className="px-6 py-4 text-white">{inv.partyName}</td>
                                                <td className="px-6 py-4"><p className="font-medium text-white">{inv.invoiceNumber}</p><p className="text-xs text-gray-500">{inv.invoiceDate}</p></td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-300">{formatCurrency(inv.taxableValue)}</td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-300">{formatCurrency(inv.cgst)}</td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-300">{formatCurrency(inv.sgst)}</td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-300">{formatCurrency(inv.igst)}</td>
                                                <td className="px-6 py-4 text-right font-mono font-semibold text-white">{formatCurrency(inv.invoiceValue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </GlassCard>
                    )}

                    {/* B2C Tab */}
                    {activeTab === 'b2c' && (
                        <GlassCard className="p-6">
                            <h2 className="font-semibold text-white mb-4">B2C Summary (Unregistered Parties)</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">Invoice Count</p><p className="text-xl font-bold text-white">{reportData.b2c.count}</p></div>
                                <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">Taxable Value</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.b2c.taxableValue)}</p></div>
                                <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">CGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.b2c.cgst)}</p></div>
                                <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">SGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.b2c.sgst)}</p></div>
                                <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">IGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.b2c.igst)}</p></div>
                                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl"><p className="text-sm text-blue-400">Total Value</p><p className="text-xl font-bold text-blue-400">{formatCurrency(reportData.b2c.invoiceValue)}</p></div>
                            </div>
                        </GlassCard>
                    )}

                    {/* HSN Tab */}
                    {activeTab === 'hsn' && (
                        <GlassCard className="p-0 overflow-hidden">
                            <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                                <h2 className="font-semibold text-white">HSN-wise Summary</h2>
                                <p className="text-xs text-gray-500">{reportData.hsnSummary.length} HSN codes</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/[0.02] text-left text-xs text-gray-500 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">HSN</th>
                                            <th className="px-6 py-4">Description</th>
                                            <th className="px-6 py-4 text-right">Qty</th>
                                            <th className="px-6 py-4 text-right">Taxable</th>
                                            <th className="px-6 py-4 text-right">CGST</th>
                                            <th className="px-6 py-4 text-right">SGST</th>
                                            <th className="px-6 py-4 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {reportData.hsnSummary.map((hsn: any, i: number) => (
                                            <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="px-6 py-4 font-mono font-medium text-white">{hsn.hsn}</td>
                                                <td className="px-6 py-4 text-gray-400">{hsn.description}</td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-300">{hsn.quantity} {hsn.uqc}</td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-300">{formatCurrency(hsn.taxableValue)}</td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-300">{formatCurrency(hsn.cgst)}</td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-300">{formatCurrency(hsn.sgst)}</td>
                                                <td className="px-6 py-4 text-right font-mono font-semibold text-white">{formatCurrency(hsn.totalValue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </GlassCard>
                    )}

                    {/* GSTR-3B Tab */}
                    {activeTab === 'gstr3b' && (
                        <div className="space-y-6">
                            <GlassCard className="p-6">
                                <h2 className="font-semibold text-white mb-4 text-lg">3.1 Outward Supplies (Sales)</h2>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl"><p className="text-sm text-emerald-400">Taxable Value</p><p className="text-xl font-bold text-emerald-400">{formatCurrency(reportData.gstr3b.outwardSupplies.taxable)}</p></div>
                                    <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">CGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.outwardSupplies.cgst)}</p></div>
                                    <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">SGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.outwardSupplies.sgst)}</p></div>
                                    <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">IGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.outwardSupplies.igst)}</p></div>
                                    <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">Cess</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.outwardSupplies.cess)}</p></div>
                                </div>
                            </GlassCard>

                            <GlassCard className="p-6">
                                <h2 className="font-semibold text-white mb-4 text-lg">4. Input Tax Credit (Purchases)</h2>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl"><p className="text-sm text-blue-400">Taxable Value</p><p className="text-xl font-bold text-blue-400">{formatCurrency(reportData.gstr3b.inputTaxCredit.taxable)}</p></div>
                                    <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">CGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.inputTaxCredit.cgst)}</p></div>
                                    <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">SGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.inputTaxCredit.sgst)}</p></div>
                                    <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">IGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.inputTaxCredit.igst)}</p></div>
                                    <div className="p-4 bg-white/5 rounded-xl"><p className="text-sm text-gray-400">Cess</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.inputTaxCredit.cess)}</p></div>
                                </div>
                            </GlassCard>

                            <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/20 rounded-2xl p-6">
                                <h2 className="font-semibold text-white mb-4 text-lg">6. Net Tax Payable</h2>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <div className="p-4 bg-white/10 rounded-xl"><p className="text-sm text-white/80">CGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.netPayable.cgst)}</p></div>
                                    <div className="p-4 bg-white/10 rounded-xl"><p className="text-sm text-white/80">SGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.netPayable.sgst)}</p></div>
                                    <div className="p-4 bg-white/10 rounded-xl"><p className="text-sm text-white/80">IGST</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.netPayable.igst)}</p></div>
                                    <div className="p-4 bg-white/10 rounded-xl"><p className="text-sm text-white/80">Cess</p><p className="text-xl font-bold text-white">{formatCurrency(reportData.gstr3b.netPayable.cess)}</p></div>
                                    <div className="p-4 bg-white/20 rounded-xl"><p className="text-sm text-white font-bold">TOTAL PAYABLE</p><p className="text-2xl font-bold text-white">{formatCurrency(reportData.gstr3b.netPayable.total)}</p></div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
