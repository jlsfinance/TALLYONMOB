import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function GSTReportsPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [reportData, setReportData] = useState(null);
    const [activeTab, setActiveTab] = useState('summary');

    useEffect(() => {
        if (selectedCompany?.id && period) {
            loadGSTData();
        }
    }, [selectedCompany, period]);

    const getDateRange = () => {
        const [year, month] = period.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        return {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0]
        };
    };

    const loadGSTData = async () => {
        setLoading(true);
        try {
            const { start, end } = getDateRange();

            // Fetch sales data (without FK join - was causing 400 error)
            const { data: sales, error: salesError } = await supabase
                .from('sales')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', start)
                .lte('invoice_date', end)
                .eq('is_cancelled', false);

            if (salesError) throw salesError;

            // Fetch sales_items separately for all sales
            if (sales && sales.length > 0) {
                const saleIds = sales.map(s => s.id);
                const { data: allItems } = await supabase
                    .from('sales_items')
                    .select('*')
                    .in('sale_id', saleIds);

                // Attach items to each sale
                sales.forEach(sale => {
                    sale.sales_items = (allItems || []).filter(item => item.sale_id === sale.id);
                });
            }

            // Fetch purchases data
            const { data: purchases, error: purchasesError } = await supabase
                .from('purchases')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', start)
                .lte('invoice_date', end)
                .eq('is_cancelled', false);

            if (purchasesError) throw purchasesError;

            // Process data for reports
            const processed = processGSTData(sales || [], purchases || []);
            setReportData(processed);

        } catch (error) {
            console.error('Error loading GST data:', error);
        }
        setLoading(false);
    };

    const processGSTData = (sales, purchases) => {
        // ========== GSTR-1 B2B (Business to Business) ==========
        const b2b = sales
            .filter(s => s.party_gstin && s.party_gstin.length === 15)
            .map(s => ({
                gstin: s.party_gstin,
                partyName: s.party_ledger_name,
                invoiceNumber: s.invoice_number,
                invoiceDate: s.invoice_date,
                invoiceValue: s.net_amount || 0,
                taxableValue: s.taxable_amount || 0,
                cgst: s.cgst_amount || 0,
                sgst: s.sgst_amount || 0,
                igst: s.igst_amount || 0,
                cess: s.cess_amount || 0,
                placeOfSupply: s.place_of_supply || ''
            }));

        // ========== GSTR-1 B2C (Business to Consumer) ==========
        const b2c = sales
            .filter(s => !s.party_gstin || s.party_gstin.length !== 15)
            .reduce((acc, s) => {
                acc.taxableValue += s.taxable_amount || 0;
                acc.cgst += s.cgst_amount || 0;
                acc.sgst += s.sgst_amount || 0;
                acc.igst += s.igst_amount || 0;
                acc.cess += s.cess_amount || 0;
                acc.invoiceValue += s.net_amount || 0;
                acc.count += 1;
                return acc;
            }, { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, invoiceValue: 0, count: 0 });

        // ========== HSN Summary ==========
        const hsnMap = new Map();
        sales.forEach(sale => {
            (sale.sales_items || []).forEach(item => {
                const hsn = item.hsn_code || 'N/A';
                if (!hsnMap.has(hsn)) {
                    hsnMap.set(hsn, {
                        hsn,
                        description: item.item_name || '',
                        uqc: item.unit || 'NOS',
                        quantity: 0,
                        taxableValue: 0,
                        cgst: 0,
                        sgst: 0,
                        igst: 0,
                        totalValue: 0
                    });
                }
                const entry = hsnMap.get(hsn);
                entry.quantity += item.quantity || 0;
                entry.taxableValue += item.taxable_amount || item.amount || 0;
                entry.cgst += item.cgst_amount || 0;
                entry.sgst += item.sgst_amount || 0;
                entry.igst += item.igst_amount || 0;
                entry.totalValue += item.total_amount || item.amount || 0;
            });
        });
        const hsnSummary = Array.from(hsnMap.values());

        // ========== GSTR-3B Summary ==========
        const outwardSupplies = {
            taxable: sales.reduce((sum, s) => sum + (s.taxable_amount || 0), 0),
            cgst: sales.reduce((sum, s) => sum + (s.cgst_amount || 0), 0),
            sgst: sales.reduce((sum, s) => sum + (s.sgst_amount || 0), 0),
            igst: sales.reduce((sum, s) => sum + (s.igst_amount || 0), 0),
            cess: sales.reduce((sum, s) => sum + (s.cess_amount || 0), 0)
        };

        const inputTaxCredit = {
            taxable: purchases.reduce((sum, p) => sum + (p.taxable_amount || 0), 0),
            cgst: purchases.reduce((sum, p) => sum + (p.cgst_amount || 0), 0),
            sgst: purchases.reduce((sum, p) => sum + (p.sgst_amount || 0), 0),
            igst: purchases.reduce((sum, p) => sum + (p.igst_amount || 0), 0),
            cess: purchases.reduce((sum, p) => sum + (p.cess_amount || 0), 0)
        };

        const netPayable = {
            cgst: Math.max(0, outwardSupplies.cgst - inputTaxCredit.cgst),
            sgst: Math.max(0, outwardSupplies.sgst - inputTaxCredit.sgst),
            igst: Math.max(0, outwardSupplies.igst - inputTaxCredit.igst),
            cess: Math.max(0, outwardSupplies.cess - inputTaxCredit.cess)
        };
        netPayable.total = netPayable.cgst + netPayable.sgst + netPayable.igst + netPayable.cess;

        return {
            b2b,
            b2c,
            hsnSummary,
            gstr3b: {
                outwardSupplies,
                inputTaxCredit,
                netPayable
            },
            totals: {
                salesCount: sales.length,
                purchasesCount: purchases.length,
                totalSales: sales.reduce((sum, s) => sum + (s.net_amount || 0), 0),
                totalPurchases: purchases.reduce((sum, p) => sum + (p.net_amount || 0), 0)
            }
        };
    };

    const exportJSON = (type) => {
        if (!reportData) return;

        let exportData = {};
        const { start, end } = getDateRange();

        if (type === 'gstr1') {
            exportData = {
                gstin: selectedCompany.gstin || 'GSTIN_NOT_SET',
                fp: period.replace('-', ''),
                b2b: reportData.b2b.reduce((acc, inv) => {
                    const existing = acc.find(g => g.ctin === inv.gstin);
                    if (existing) {
                        existing.inv.push({
                            inum: inv.invoiceNumber,
                            idt: inv.invoiceDate,
                            val: inv.invoiceValue,
                            pos: inv.placeOfSupply?.slice(0, 2) || '09',
                            itms: [{
                                num: 1,
                                itm_det: {
                                    txval: inv.taxableValue,
                                    camt: inv.cgst,
                                    samt: inv.sgst,
                                    iamt: inv.igst,
                                    csamt: inv.cess
                                }
                            }]
                        });
                    } else {
                        acc.push({
                            ctin: inv.gstin,
                            inv: [{
                                inum: inv.invoiceNumber,
                                idt: inv.invoiceDate,
                                val: inv.invoiceValue,
                                pos: inv.placeOfSupply?.slice(0, 2) || '09',
                                itms: [{
                                    num: 1,
                                    itm_det: {
                                        txval: inv.taxableValue,
                                        camt: inv.cgst,
                                        samt: inv.sgst,
                                        iamt: inv.igst,
                                        csamt: inv.cess
                                    }
                                }]
                            }]
                        });
                    }
                    return acc;
                }, []),
                b2cs: [{
                    sply_ty: 'INTRA',
                    pos: '09',
                    txval: reportData.b2c.taxableValue,
                    camt: reportData.b2c.cgst,
                    samt: reportData.b2c.sgst,
                    iamt: reportData.b2c.igst,
                    csamt: reportData.b2c.cess
                }],
                hsn: {
                    data: reportData.hsnSummary.map((h, i) => ({
                        num: i + 1,
                        hsn_sc: h.hsn,
                        desc: h.description,
                        uqc: h.uqc,
                        qty: h.quantity,
                        txval: h.taxableValue,
                        camt: h.cgst,
                        samt: h.sgst,
                        iamt: h.igst
                    }))
                }
            };
        } else if (type === 'gstr3b') {
            exportData = {
                gstin: selectedCompany.gstin || 'GSTIN_NOT_SET',
                ret_period: period.replace('-', ''),
                sup_details: {
                    osup_det: {
                        txval: reportData.gstr3b.outwardSupplies.taxable,
                        camt: reportData.gstr3b.outwardSupplies.cgst,
                        samt: reportData.gstr3b.outwardSupplies.sgst,
                        iamt: reportData.gstr3b.outwardSupplies.igst,
                        csamt: reportData.gstr3b.outwardSupplies.cess
                    }
                },
                itc_elg: {
                    itc_avl: [{
                        ty: 'IMPG',
                        iamt: reportData.gstr3b.inputTaxCredit.igst,
                        camt: reportData.gstr3b.inputTaxCredit.cgst,
                        samt: reportData.gstr3b.inputTaxCredit.sgst,
                        csamt: reportData.gstr3b.inputTaxCredit.cess
                    }]
                }
            };
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type.toUpperCase()}_${period}_${selectedCompany.name}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    if (!selectedCompany) {
        return (
            <div className="p-8 text-center">
                <p className="text-gray-500">Please select a company first</p>
                <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">
                    Select Company
                </button>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">📊 GST Reports</h1>
                    <p className="text-gray-500">{selectedCompany.name}</p>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="month"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                        onClick={() => exportJSON('gstr1')}
                        disabled={!reportData}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                        📥 GSTR-1 JSON
                    </button>
                    <button
                        onClick={() => exportJSON('gstr3b')}
                        disabled={!reportData}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        📥 GSTR-3B JSON
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b">
                {['summary', 'b2b', 'b2c', 'hsn', 'gstr3b'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 font-medium border-b-2 transition ${activeTab === tab
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {tab === 'summary' && '📈 Summary'}
                        {tab === 'b2b' && '🏢 B2B'}
                        {tab === 'b2c' && '👤 B2C'}
                        {tab === 'hsn' && '📦 HSN'}
                        {tab === 'gstr3b' && '📋 GSTR-3B'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="p-12 text-center">
                    <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto"></div>
                    <p className="text-gray-500 mt-4">Loading GST data...</p>
                </div>
            ) : !reportData ? (
                <div className="p-12 text-center">
                    <p className="text-gray-500">No data available for this period</p>
                </div>
            ) : (
                <>
                    {/* Summary Tab */}
                    {activeTab === 'summary' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white rounded-xl p-6 shadow-sm border">
                                <p className="text-sm text-gray-500">Total Sales</p>
                                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(reportData.totals.totalSales)}</p>
                                <p className="text-xs text-gray-400 mt-1">{reportData.totals.salesCount} invoices</p>
                            </div>
                            <div className="bg-white rounded-xl p-6 shadow-sm border">
                                <p className="text-sm text-gray-500">Total Purchases</p>
                                <p className="text-2xl font-bold text-red-600">{formatCurrency(reportData.totals.totalPurchases)}</p>
                                <p className="text-xs text-gray-400 mt-1">{reportData.totals.purchasesCount} invoices</p>
                            </div>
                            <div className="bg-white rounded-xl p-6 shadow-sm border">
                                <p className="text-sm text-gray-500">Output Tax</p>
                                <p className="text-2xl font-bold text-orange-600">
                                    {formatCurrency(reportData.gstr3b.outwardSupplies.cgst + reportData.gstr3b.outwardSupplies.sgst + reportData.gstr3b.outwardSupplies.igst)}
                                </p>
                            </div>
                            <div className="bg-white rounded-xl p-6 shadow-sm border">
                                <p className="text-sm text-gray-500">Net GST Payable</p>
                                <p className="text-2xl font-bold text-purple-600">{formatCurrency(reportData.gstr3b.netPayable.total)}</p>
                            </div>
                        </div>
                    )}

                    {/* B2B Tab */}
                    {activeTab === 'b2b' && (
                        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                            <div className="p-4 border-b bg-gray-50">
                                <h2 className="font-semibold">B2B Invoices (Registered Parties)</h2>
                                <p className="text-sm text-gray-500">{reportData.b2b.length} invoices</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left">GSTIN</th>
                                            <th className="px-4 py-3 text-left">Party Name</th>
                                            <th className="px-4 py-3 text-left">Invoice</th>
                                            <th className="px-4 py-3 text-right">Taxable</th>
                                            <th className="px-4 py-3 text-right">CGST</th>
                                            <th className="px-4 py-3 text-right">SGST</th>
                                            <th className="px-4 py-3 text-right">IGST</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {reportData.b2b.map((inv, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-mono text-xs">{inv.gstin}</td>
                                                <td className="px-4 py-3">{inv.partyName}</td>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium">{inv.invoiceNumber}</p>
                                                    <p className="text-xs text-gray-400">{inv.invoiceDate}</p>
                                                </td>
                                                <td className="px-4 py-3 text-right">{formatCurrency(inv.taxableValue)}</td>
                                                <td className="px-4 py-3 text-right">{formatCurrency(inv.cgst)}</td>
                                                <td className="px-4 py-3 text-right">{formatCurrency(inv.sgst)}</td>
                                                <td className="px-4 py-3 text-right">{formatCurrency(inv.igst)}</td>
                                                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(inv.invoiceValue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* B2C Tab */}
                    {activeTab === 'b2c' && (
                        <div className="bg-white rounded-xl shadow-sm border p-6">
                            <h2 className="font-semibold mb-4">B2C Summary (Unregistered Parties)</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-500">Invoice Count</p>
                                    <p className="text-xl font-bold">{reportData.b2c.count}</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-500">Taxable Value</p>
                                    <p className="text-xl font-bold">{formatCurrency(reportData.b2c.taxableValue)}</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-500">CGST</p>
                                    <p className="text-xl font-bold">{formatCurrency(reportData.b2c.cgst)}</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-500">SGST</p>
                                    <p className="text-xl font-bold">{formatCurrency(reportData.b2c.sgst)}</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-500">IGST</p>
                                    <p className="text-xl font-bold">{formatCurrency(reportData.b2c.igst)}</p>
                                </div>
                                <div className="p-4 bg-indigo-50 rounded-lg">
                                    <p className="text-sm text-indigo-600">Total Value</p>
                                    <p className="text-xl font-bold text-indigo-700">{formatCurrency(reportData.b2c.invoiceValue)}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* HSN Tab */}
                    {activeTab === 'hsn' && (
                        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                            <div className="p-4 border-b bg-gray-50">
                                <h2 className="font-semibold">HSN-wise Summary</h2>
                                <p className="text-sm text-gray-500">{reportData.hsnSummary.length} HSN codes</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left">HSN Code</th>
                                            <th className="px-4 py-3 text-left">Description</th>
                                            <th className="px-4 py-3 text-right">Qty</th>
                                            <th className="px-4 py-3 text-right">Taxable</th>
                                            <th className="px-4 py-3 text-right">CGST</th>
                                            <th className="px-4 py-3 text-right">SGST</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {reportData.hsnSummary.map((hsn, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-mono font-medium">{hsn.hsn}</td>
                                                <td className="px-4 py-3 text-gray-600">{hsn.description}</td>
                                                <td className="px-4 py-3 text-right">{hsn.quantity} {hsn.uqc}</td>
                                                <td className="px-4 py-3 text-right">{formatCurrency(hsn.taxableValue)}</td>
                                                <td className="px-4 py-3 text-right">{formatCurrency(hsn.cgst)}</td>
                                                <td className="px-4 py-3 text-right">{formatCurrency(hsn.sgst)}</td>
                                                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(hsn.totalValue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* GSTR-3B Tab */}
                    {activeTab === 'gstr3b' && (
                        <div className="space-y-6">
                            {/* Outward Supplies */}
                            <div className="bg-white rounded-xl shadow-sm border p-6">
                                <h2 className="font-semibold mb-4 text-lg">3.1 Outward Supplies (Sales)</h2>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <div className="p-4 bg-emerald-50 rounded-lg">
                                        <p className="text-sm text-emerald-600">Taxable Value</p>
                                        <p className="text-xl font-bold text-emerald-700">{formatCurrency(reportData.gstr3b.outwardSupplies.taxable)}</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg">
                                        <p className="text-sm text-gray-500">CGST</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.outwardSupplies.cgst)}</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg">
                                        <p className="text-sm text-gray-500">SGST</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.outwardSupplies.sgst)}</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg">
                                        <p className="text-sm text-gray-500">IGST</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.outwardSupplies.igst)}</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg">
                                        <p className="text-sm text-gray-500">Cess</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.outwardSupplies.cess)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Input Tax Credit */}
                            <div className="bg-white rounded-xl shadow-sm border p-6">
                                <h2 className="font-semibold mb-4 text-lg">4. Input Tax Credit (Purchases)</h2>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <div className="p-4 bg-blue-50 rounded-lg">
                                        <p className="text-sm text-blue-600">Taxable Value</p>
                                        <p className="text-xl font-bold text-blue-700">{formatCurrency(reportData.gstr3b.inputTaxCredit.taxable)}</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg">
                                        <p className="text-sm text-gray-500">CGST</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.inputTaxCredit.cgst)}</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg">
                                        <p className="text-sm text-gray-500">SGST</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.inputTaxCredit.sgst)}</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg">
                                        <p className="text-sm text-gray-500">IGST</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.inputTaxCredit.igst)}</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg">
                                        <p className="text-sm text-gray-500">Cess</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.inputTaxCredit.cess)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Net Payable */}
                            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
                                <h2 className="font-semibold mb-4 text-lg">6. Net Tax Payable</h2>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <div className="p-4 bg-white/20 rounded-lg">
                                        <p className="text-sm text-white/80">CGST</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.netPayable.cgst)}</p>
                                    </div>
                                    <div className="p-4 bg-white/20 rounded-lg">
                                        <p className="text-sm text-white/80">SGST</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.netPayable.sgst)}</p>
                                    </div>
                                    <div className="p-4 bg-white/20 rounded-lg">
                                        <p className="text-sm text-white/80">IGST</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.netPayable.igst)}</p>
                                    </div>
                                    <div className="p-4 bg-white/20 rounded-lg">
                                        <p className="text-sm text-white/80">Cess</p>
                                        <p className="text-xl font-bold">{formatCurrency(reportData.gstr3b.netPayable.cess)}</p>
                                    </div>
                                    <div className="p-4 bg-white/30 rounded-lg">
                                        <p className="text-sm text-white">TOTAL PAYABLE</p>
                                        <p className="text-2xl font-bold">{formatCurrency(reportData.gstr3b.netPayable.total)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
