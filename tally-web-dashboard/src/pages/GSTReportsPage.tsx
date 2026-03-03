import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { FileText, Download, Building2, User, Package, Receipt, Calendar, ShieldCheck, PieChart, Activity } from 'lucide-react';
import { GlassCard, MetricCard, Badge, Spinner } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';
import { CompactYearFilter } from '../components/shared/CompactYearFilter';
import { HeaderPortal } from '@/components/layout/HeaderPortal';

// Helper component for empty states
const EmptyState = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-[var(--text-muted)] opacity-30 mb-4">{icon}</div>
        <h3 className="text-lg font-black text-[var(--on-surface)] uppercase tracking-tight">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] mt-1">{description}</p>
    </div>
);

const SALE_VOUCHER_TYPES = ['Sales', 'Sales Invoice'];
const PURCHASE_VOUCHER_TYPES = ['Purchase', 'Purchase Invoice'];
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;
const toNumber = (value: any) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};
const absNumber = (value: any) => Math.abs(toNumber(value));
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const parseStateCodeFromGstin = (gstin: any) => {
    const text = String(gstin || '').trim().toUpperCase();
    const match = text.match(/^(\d{2})/);
    return match ? match[1] : null;
};
const parseStateCodeFromPos = (pos: any) => {
    const text = String(pos || '').trim().toUpperCase();
    if (!text) return null;
    const match = text.match(/^(\d{1,2})(?:\D|$)/);
    if (!match) return null;
    return match[1].padStart(2, '0');
};
const getLedgerTaxTotals = (ledgerRows: any[]) => {
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let cess = 0;
    (ledgerRows || []).forEach((entry: any) => {
        const ledgerName = String(
            entry.ledger_name
            || entry.name
            || entry.ledgerName
            || entry.account_name
            || ''
        ).toLowerCase();
        const amount = absNumber(entry.amount ?? entry.total_amount ?? entry.value);
        if (!amount || !ledgerName) return;
        if (ledgerName.includes('igst')) {
            igst += amount;
            return;
        }
        if (ledgerName.includes('cgst')) {
            cgst += amount;
            return;
        }
        if (ledgerName.includes('sgst') || ledgerName.includes('utgst')) {
            sgst += amount;
            return;
        }
        if (ledgerName.includes('cess')) {
            cess += amount;
        }
    });
    return { cgst: round2(cgst), sgst: round2(sgst), igst: round2(igst), cess: round2(cess) };
};
const inferInterState = (
    voucher: any,
    companyStateCode: string | null,
    companyStateText: string
) => {
    const cgst = absNumber(voucher.cgst_amount ?? voucher.cgst);
    const sgst = absNumber(voucher.sgst_amount ?? voucher.sgst);
    const igst = absNumber(voucher.igst_amount ?? voucher.igst);
    if (igst > 0 && (cgst + sgst) === 0) return true;
    if ((cgst + sgst) > 0) return false;
    const posCode = parseStateCodeFromPos(voucher.place_of_supply ?? voucher.pos ?? voucher.placeOfSupply);
    if (posCode && companyStateCode) return posCode !== companyStateCode;
    const posText = String(voucher.place_of_supply || voucher.pos || '').trim().toLowerCase();
    if (posText && companyStateText) {
        return !posText.includes(companyStateText);
    }
    return false;
};
const normalizeVoucherWithEntries = (
    voucher: any,
    stockRows: any[],
    ledgerRows: any[],
    companyStateCode: string | null,
    companyStateText: string
) => {
    const normalizedLines = (stockRows || []).map((row: any) => {
        let taxable = absNumber(row.amount ?? row.total_amount ?? row.value);
        let quantity = absNumber(row.quantity ?? row.qty);
        let rate = absNumber(row.rate);
        const taxRate = absNumber(row.tax_rate ?? row.gst_rate ?? row.gstRate);
        if (taxable <= 0 && quantity > 0 && rate > 0) {
            taxable = quantity * rate;
        }
        if (rate <= 0 && quantity > 0 && taxable > 0) {
            rate = taxable / quantity;
        }
        if (quantity <= 0 && rate > 0 && taxable > 0) {
            quantity = taxable / rate;
        }
        if (quantity <= 0 && taxable > 0) {
            quantity = 1;
        }
        return {
            hsn_code: String(row.hsn_code || row.hsn || '').trim() || 'N/A',
            description: String(row.stock_item_name || row.item_name || row.name || voucher.party_name || 'N/A').trim(),
            quantity,
            unit: String(row.unit || row.uqc || 'NOS').trim() || 'NOS',
            taxable,
            rate,
            taxRate
        };
    }).filter((line: any) => line.taxable > 0 || line.quantity > 0);
    const lineTaxableTotal = normalizedLines.reduce((sum: number, line: any) => sum + line.taxable, 0);
    const voucherLedgerTax = getLedgerTaxTotals(ledgerRows || []);
    let taxable = absNumber(voucher.taxable_value);
    if (taxable <= 0) taxable = lineTaxableTotal;
    if (taxable <= 0) taxable = absNumber(voucher.total_amount ?? voucher.amount ?? voucher.grand_total);
    let cgst = absNumber(voucher.cgst_amount ?? voucher.cgst);
    let sgst = absNumber(voucher.sgst_amount ?? voucher.sgst);
    let igst = absNumber(voucher.igst_amount ?? voucher.igst);
    let cess = absNumber(voucher.cess_amount ?? voucher.cess);
    if ((cgst + sgst + igst + cess) <= 0 && (voucherLedgerTax.cgst + voucherLedgerTax.sgst + voucherLedgerTax.igst + voucherLedgerTax.cess) > 0) {
        cgst = voucherLedgerTax.cgst;
        sgst = voucherLedgerTax.sgst;
        igst = voucherLedgerTax.igst;
        cess = voucherLedgerTax.cess;
    }
    const isInterState = inferInterState(voucher, companyStateCode, companyStateText);
    const voucherTaxTotal = cgst + sgst + igst + cess;
    let lineItems = normalizedLines.map((line: any) => {
        const ratio = lineTaxableTotal > 0 ? (line.taxable / lineTaxableTotal) : 0;
        const allocatedCgst = voucherTaxTotal > 0 ? cgst * ratio : 0;
        const allocatedSgst = voucherTaxTotal > 0 ? sgst * ratio : 0;
        const allocatedIgst = voucherTaxTotal > 0 ? igst * ratio : 0;
        const allocatedCess = voucherTaxTotal > 0 ? cess * ratio : 0;
        const allocatedTax = allocatedCgst + allocatedSgst + allocatedIgst + allocatedCess;
        const effectiveRate = line.taxable > 0 ? (allocatedTax / line.taxable) * 100 : 0;
        return {
            ...line,
            cgst: allocatedCgst,
            sgst: allocatedSgst,
            igst: allocatedIgst,
            cess: allocatedCess,
            tax: allocatedTax,
            effectiveRate: line.taxRate > 0 ? line.taxRate : effectiveRate
        };
    });
    if (voucherTaxTotal <= 0 && lineItems.length > 0) {
        lineItems = lineItems.map((line: any) => {
            const lineTax = line.taxable * (line.taxRate / 100);
            const lineCgst = !isInterState ? lineTax / 2 : 0;
            const lineSgst = !isInterState ? lineTax / 2 : 0;
            const lineIgst = isInterState ? lineTax : 0;
            return {
                ...line,
                cgst: lineCgst,
                sgst: lineSgst,
                igst: lineIgst,
                cess: 0,
                tax: lineTax,
                effectiveRate: line.taxRate
            };
        });
        cgst = lineItems.reduce((sum: number, line: any) => sum + line.cgst, 0);
        sgst = lineItems.reduce((sum: number, line: any) => sum + line.sgst, 0);
        igst = lineItems.reduce((sum: number, line: any) => sum + line.igst, 0);
        cess = lineItems.reduce((sum: number, line: any) => sum + line.cess, 0);
    }
    if (lineItems.length === 0 && taxable > 0) {
        const totalTax = cgst + sgst + igst + cess;
        lineItems = [{
            hsn_code: 'N/A',
            description: String(voucher.party_name || voucher.party_ledger_name || 'N/A'),
            quantity: 1,
            unit: 'NOS',
            taxable,
            rate: taxable,
            taxRate: taxable > 0 ? (totalTax / taxable) * 100 : 0,
            cgst,
            sgst,
            igst,
            cess,
            tax: totalTax,
            effectiveRate: taxable > 0 ? (totalTax / taxable) * 100 : 0
        }];
    }
    const lineTaxableReconciled = lineItems.reduce((sum: number, line: any) => sum + line.taxable, 0);
    if (lineTaxableReconciled > 0) {
        taxable = lineTaxableReconciled;
    }
    let netAmount = absNumber(voucher.grand_total ?? voucher.total_amount ?? voucher.amount);
    if (netAmount <= 0) {
        netAmount = taxable + cgst + sgst + igst + cess;
    }
    return {
        ...voucher,
        invoice_number: voucher.voucher_number || voucher.invoice_number || voucher.invoiceNumber || voucher.id,
        invoice_date: voucher.voucher_date || voucher.invoice_date,
        party_ledger_name: voucher.party_name || voucher.party_ledger_name || 'Unknown Party',
        party_gstin: String(voucher.party_gstin || voucher.gstin || '').trim().toUpperCase(),
        net_amount: round2(netAmount),
        taxable_amount: round2(taxable),
        cgst_amount: round2(cgst),
        sgst_amount: round2(sgst),
        igst_amount: round2(igst),
        cess_amount: round2(cess),
        place_of_supply: String(voucher.place_of_supply || voucher.pos || '').trim(),
        line_items: lineItems.map((line: any) => ({
            ...line,
            taxable: round2(line.taxable),
            cgst: round2(line.cgst),
            sgst: round2(line.sgst),
            igst: round2(line.igst),
            cess: round2(line.cess),
            tax: round2(line.tax),
            effectiveRate: round2(line.effectiveRate)
        }))
    };
};
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
    const [activeTab, setActiveTab] = useState<'summary' | 'b2b' | 'b2c' | 'hsn' | 'gstr3b' | 'rates' | 'pos'>('summary');

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
            const gstVoucherTypes = [...SALE_VOUCHER_TYPES, ...PURCHASE_VOUCHER_TYPES];
            const { data: vouchersData, error: vouchersError } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .in('voucher_type', gstVoucherTypes)
                .gte('voucher_date', start)
                .lte('voucher_date', end)
                .or('is_deleted.is.null,is_deleted.eq.false');
            if (vouchersError) throw vouchersError;
            const vouchers = vouchersData || [];
            const voucherIds = vouchers.map((v: any) => v.id).filter(Boolean);
            let stockEntries: any[] = [];
            let ledgerEntries: any[] = [];
            if (voucherIds.length > 0) {
                const [{ data: seData }, { data: leData }] = await Promise.all([
                    supabase.from('voucher_stock_entries').select('*').in('voucher_id', voucherIds),
                    supabase.from('voucher_ledger_entries').select('*').in('voucher_id', voucherIds)
                ]);
                stockEntries = seData || [];
                ledgerEntries = leData || [];
            }
            const stockByVoucher = (stockEntries || []).reduce((acc: any, entry: any) => {
                if (!acc[entry.voucher_id]) acc[entry.voucher_id] = [];
                acc[entry.voucher_id].push(entry);
                return acc;
            }, {});
            const ledgerByVoucher = (ledgerEntries || []).reduce((acc: any, entry: any) => {
                if (!acc[entry.voucher_id]) acc[entry.voucher_id] = [];
                acc[entry.voucher_id].push(entry);
                return acc;
            }, {});
            const companyStateCode = parseStateCodeFromGstin(selectedCompany?.gstin);
            const companyStateText = String(selectedCompany?.state || '').trim().toLowerCase();
            const sales = vouchers
                .filter((v: any) => SALE_VOUCHER_TYPES.includes(v.voucher_type))
                .map((voucher: any) => normalizeVoucherWithEntries(
                    voucher,
                    stockByVoucher[voucher.id] || [],
                    ledgerByVoucher[voucher.id] || [],
                    companyStateCode,
                    companyStateText
                ));
            const purchases = vouchers
                .filter((v: any) => PURCHASE_VOUCHER_TYPES.includes(v.voucher_type))
                .map((voucher: any) => normalizeVoucherWithEntries(
                    voucher,
                    stockByVoucher[voucher.id] || [],
                    ledgerByVoucher[voucher.id] || [],
                    companyStateCode,
                    companyStateText
                ));
            const processed = processGSTData(sales, purchases);
            setReportData(processed);
        } catch (error) {
            console.error('Error loading GST data:', error);
        }
        setLoading(false);
    };

    const processGSTData = (sales: any[], purchases: any[]) => {
        const b2b = sales
            .filter((s: any) => GSTIN_REGEX.test(String(s.party_gstin || '')))
            .map((s: any) => ({
                gstin: s.party_gstin,
                partyName: s.party_ledger_name,
                invoiceNumber: s.invoice_number,
                invoiceDate: s.invoice_date,
                invoiceValue: round2(s.net_amount || 0),
                taxableValue: round2(s.taxable_amount || 0),
                cgst: round2(s.cgst_amount || 0),
                sgst: round2(s.sgst_amount || 0),
                igst: round2(s.igst_amount || 0),
                cess: round2(s.cess_amount || 0),
                placeOfSupply: s.place_of_supply || ''
            }));
        const b2c = sales
            .filter((s: any) => !GSTIN_REGEX.test(String(s.party_gstin || '')))
            .reduce((acc: any, s: any) => {
                acc.taxableValue += s.taxable_amount || 0;
                acc.cgst += s.cgst_amount || 0;
                acc.sgst += s.sgst_amount || 0;
                acc.igst += s.igst_amount || 0;
                acc.cess += s.cess_amount || 0;
                acc.invoiceValue += s.net_amount || 0;
                acc.count += 1;
                return acc;
            }, { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, invoiceValue: 0, count: 0 });
        const rateMap = new Map();
        const hsnMap = new Map();
        const posMap = new Map();
        sales.forEach((sale: any) => {
            const pos = String(sale.place_of_supply || '').trim() || 'Unknown';
            if (!posMap.has(pos)) {
                posMap.set(pos, { state: pos, taxable: 0, igst: 0, cgst: 0, sgst: 0, count: 0 });
            }
            const posEntry = posMap.get(pos);
            posEntry.taxable += sale.taxable_amount || 0;
            posEntry.igst += sale.igst_amount || 0;
            posEntry.cgst += sale.cgst_amount || 0;
            posEntry.sgst += sale.sgst_amount || 0;
            posEntry.count += 1;
            (sale.line_items || []).forEach((line: any) => {
                const rate = round2(line.effectiveRate || line.taxRate || 0);
                if (!rateMap.has(rate)) {
                    rateMap.set(rate, { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 });
                }
                const rateEntry = rateMap.get(rate);
                rateEntry.taxable += line.taxable || 0;
                rateEntry.cgst += line.cgst || 0;
                rateEntry.sgst += line.sgst || 0;
                rateEntry.igst += line.igst || 0;
                rateEntry.cess += line.cess || 0;
                rateEntry.total += (line.taxable || 0) + (line.tax || 0) + (line.cess || 0);
                const hsn = String(line.hsn_code || 'N/A').trim() || 'N/A';
                if (!hsnMap.has(hsn)) {
                    hsnMap.set(hsn, {
                        hsn,
                        description: line.description || '',
                        uqc: line.unit || 'NOS',
                        quantity: 0,
                        taxableValue: 0,
                        cgst: 0,
                        sgst: 0,
                        igst: 0,
                        cess: 0,
                        totalValue: 0
                    });
                }
                const hsnEntry = hsnMap.get(hsn);
                hsnEntry.quantity += line.quantity || 0;
                hsnEntry.taxableValue += line.taxable || 0;
                hsnEntry.cgst += line.cgst || 0;
                hsnEntry.sgst += line.sgst || 0;
                hsnEntry.igst += line.igst || 0;
                hsnEntry.cess += line.cess || 0;
                hsnEntry.totalValue += line.taxable || 0;
            });
        });
        const outwardSupplies = {
            taxable: round2(sales.reduce((sum: number, s: any) => sum + (s.taxable_amount || 0), 0)),
            cgst: round2(sales.reduce((sum: number, s: any) => sum + (s.cgst_amount || 0), 0)),
            sgst: round2(sales.reduce((sum: number, s: any) => sum + (s.sgst_amount || 0), 0)),
            igst: round2(sales.reduce((sum: number, s: any) => sum + (s.igst_amount || 0), 0)),
            cess: round2(sales.reduce((sum: number, s: any) => sum + (s.cess_amount || 0), 0))
        };
        const inputTaxCredit = {
            taxable: round2(purchases.reduce((sum: number, p: any) => sum + (p.taxable_amount || 0), 0)),
            cgst: round2(purchases.reduce((sum: number, p: any) => sum + (p.cgst_amount || 0), 0)),
            sgst: round2(purchases.reduce((sum: number, p: any) => sum + (p.sgst_amount || 0), 0)),
            igst: round2(purchases.reduce((sum: number, p: any) => sum + (p.igst_amount || 0), 0)),
            cess: round2(purchases.reduce((sum: number, p: any) => sum + (p.cess_amount || 0), 0))
        };
        const netLiability = {
            igst: outwardSupplies.igst,
            cgst: outwardSupplies.cgst,
            sgst: outwardSupplies.sgst,
            cess: outwardSupplies.cess
        };
        let igstCredit = inputTaxCredit.igst;
        let cgstCredit = inputTaxCredit.cgst;
        let sgstCredit = inputTaxCredit.sgst;
        let cessCredit = inputTaxCredit.cess;
        const utilization = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
        const useCredit = (type: 'igst' | 'cgst' | 'sgst' | 'cess', available: number) => {
            if (available <= 0) return { remainingCredit: 0, utilized: 0 };
            const utilized = Math.min(netLiability[type], available);
            netLiability[type] -= utilized;
            return { remainingCredit: available - utilized, utilized };
        };
        let usage = useCredit('igst', igstCredit);
        igstCredit = usage.remainingCredit;
        utilization.igst += usage.utilized;
        usage = useCredit('cgst', igstCredit);
        igstCredit = usage.remainingCredit;
        utilization.cgst += usage.utilized;
        usage = useCredit('sgst', igstCredit);
        igstCredit = usage.remainingCredit;
        utilization.sgst += usage.utilized;
        usage = useCredit('cgst', cgstCredit);
        cgstCredit = usage.remainingCredit;
        utilization.cgst += usage.utilized;
        usage = useCredit('igst', cgstCredit);
        cgstCredit = usage.remainingCredit;
        utilization.igst += usage.utilized;
        usage = useCredit('sgst', sgstCredit);
        sgstCredit = usage.remainingCredit;
        utilization.sgst += usage.utilized;
        usage = useCredit('igst', sgstCredit);
        sgstCredit = usage.remainingCredit;
        utilization.igst += usage.utilized;
        usage = useCredit('cess', cessCredit);
        cessCredit = usage.remainingCredit;
        utilization.cess += usage.utilized;
        const netPayable = {
            cgst: round2(Math.max(0, netLiability.cgst)),
            sgst: round2(Math.max(0, netLiability.sgst)),
            igst: round2(Math.max(0, netLiability.igst)),
            cess: round2(Math.max(0, netLiability.cess)),
            total: 0
        };
        netPayable.total = round2(netPayable.cgst + netPayable.sgst + netPayable.igst + netPayable.cess);
        return {
            b2b,
            b2c: {
                taxableValue: round2(b2c.taxableValue),
                cgst: round2(b2c.cgst),
                sgst: round2(b2c.sgst),
                igst: round2(b2c.igst),
                cess: round2(b2c.cess),
                invoiceValue: round2(b2c.invoiceValue),
                count: b2c.count
            },
            hsnSummary: Array.from(hsnMap.values()).map((row: any) => ({
                ...row,
                quantity: round2(row.quantity),
                taxableValue: round2(row.taxableValue),
                cgst: round2(row.cgst),
                sgst: round2(row.sgst),
                igst: round2(row.igst),
                cess: round2(row.cess),
                totalValue: round2(row.totalValue)
            })).sort((a: any, b: any) => b.taxableValue - a.taxableValue),
            rateSummary: Array.from(rateMap.values()).map((row: any) => ({
                ...row,
                taxable: round2(row.taxable),
                cgst: round2(row.cgst),
                sgst: round2(row.sgst),
                igst: round2(row.igst),
                cess: round2(row.cess),
                total: round2(row.total)
            })).sort((a: any, b: any) => b.rate - a.rate),
            posSummary: Array.from(posMap.values()).map((row: any) => ({
                ...row,
                taxable: round2(row.taxable),
                cgst: round2(row.cgst),
                sgst: round2(row.sgst),
                igst: round2(row.igst)
            })).sort((a: any, b: any) => b.taxable - a.taxable),
            gstr3b: {
                outwardSupplies,
                inputTaxCredit,
                utilization: {
                    igst: round2(utilization.igst),
                    cgst: round2(utilization.cgst),
                    sgst: round2(utilization.sgst),
                    cess: round2(utilization.cess)
                },
                netPayable
            },
            totals: {
                salesCount: sales.length,
                purchasesCount: purchases.length,
                totalSales: round2(sales.reduce((sum: number, s: any) => sum + (s.net_amount || 0), 0)),
                totalPurchases: round2(purchases.reduce((sum: number, p: any) => sum + (p.net_amount || 0), 0)),
                exemptedSales: round2(sales
                    .filter((s: any) => (s.cgst_amount + s.sgst_amount + s.igst_amount + s.cess_amount) === 0)
                    .reduce((sum: number, s: any) => sum + (s.taxable_amount || 0), 0))
            }
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
        { key: 'rates', label: 'Rates', icon: <ShieldCheck size={16} /> },
        { key: 'pos', label: 'Places', icon: <Building2 size={16} /> },
        { key: 'b2b', label: 'B2B Flow', icon: <Building2 size={16} /> },
        { key: 'b2c', label: 'B2C Flow', icon: <User size={16} /> },
        { key: 'hsn', label: 'HSN Core', icon: <Package size={16} /> },
        { key: 'gstr3b', label: 'GSTR-3B', icon: <Activity size={16} /> },
    ];

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] uppercase tracking-tighter leading-none">Compliance Hub</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest leading-none mt-1">{selectedCompany.name} ? GST</p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <div className="flex items-center gap-2">
                    <button onClick={() => exportJSON('gstr1')} disabled={!reportData || loading} className="px-3 py-2 text-[var(--success)] text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[var(--success)]/10 transition-all disabled:opacity-30 flex items-center gap-1.5 border border-[var(--success)]/20 shadow-sm">
                        <Download size={14} /> <span className="hidden sm:inline">GSTR-1</span>
                    </button>
                    <button onClick={() => exportJSON('gstr3b')} disabled={!reportData || loading} className="px-3 py-2 text-[var(--primary)] text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[var(--primary)]/10 transition-all disabled:opacity-30 flex items-center gap-1.5 border border-[var(--primary)]/20 shadow-sm">
                        <Download size={14} /> <span className="hidden sm:inline">GSTR-3B</span>
                    </button>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <CompactYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />
            </HeaderPortal>

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
                                        <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Outward Taxable</p>
                                        <p className="text-lg font-black text-[var(--on-surface)] mt-1">{formatCurrency(reportData.gstr3b.outwardSupplies.taxable)}</p>
                                    </div>
                                    <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                                        <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Exempted/Nil</p>
                                        <p className="text-lg font-black text-blue-500 mt-1">{formatCurrency(reportData.totals.exemptedSales)}</p>
                                    </div>
                                    <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                                        <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Input Tax Credit</p>
                                        <p className="text-lg font-black text-emerald-500 mt-1">{formatCurrency(reportData.gstr3b.inputTaxCredit.cgst + reportData.gstr3b.inputTaxCredit.sgst + reportData.gstr3b.inputTaxCredit.igst + reportData.gstr3b.inputTaxCredit.cess)}</p>
                                    </div>
                                    <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                                        <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Net Tax Payable</p>
                                        <p className="text-lg font-black text-amber-500 mt-1">{formatCurrency(reportData.gstr3b.netPayable.total)}</p>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="bg-[var(--surface-variant)]/50 p-6 rounded-3xl border border-[var(--border)]">
                                        <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <ShieldCheck size={14} className="text-[var(--primary)]" /> Top GST Rates
                                        </h3>
                                        <div className="space-y-3">
                                            {reportData.rateSummary.slice(0, 3).map((r: any) => (
                                                <div key={r.rate} className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-[var(--on-surface)]">{r.rate}% GST</span>
                                                    <div className="text-right">
                                                        <p className="text-xs font-black">{formatCurrency(r.taxable)}</p>
                                                        <div className="w-32 h-1 bg-[var(--border)] rounded-full mt-1 overflow-hidden">
                                                            <div
                                                                className="h-full bg-[var(--primary)] text-right"
                                                                style={{ width: `${Math.min(100, (r.taxable / (reportData.gstr3b.outwardSupplies.taxable || 1)) * 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-[var(--surface-variant)]/50 p-6 rounded-3xl border border-[var(--border)]">
                                        <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <Building2 size={14} className="text-[var(--primary)]" /> Place of Supply
                                        </h3>
                                        <div className="space-y-3">
                                            {reportData.posSummary.slice(0, 3).map((p: any) => (
                                                <div key={p.state} className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-[var(--on-surface)] truncate max-w-[100px]">{p.state}</span>
                                                    <div className="text-right">
                                                        <p className="text-xs font-black">{formatCurrency(p.taxable)}</p>
                                                        <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-tighter">{p.count} Invoices</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Rate-wise Tab */}
                        {activeTab === 'rates' && (
                            <div className="space-y-3">
                                <div className="bg-[var(--surface-variant)] p-4 rounded-t-2xl border border-[var(--border)] grid grid-cols-5 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                    <div className="col-span-1">Tax Rate</div>
                                    <div className="text-right">Taxable Val</div>
                                    <div className="text-right">IGST</div>
                                    <div className="text-right">CGST/SGST</div>
                                    <div className="text-right">Total</div>
                                </div>
                                <div className="grid gap-2">
                                    {reportData.rateSummary.map((r: any) => (
                                        <div key={r.rate} className="bg-[var(--surface-variant)]/30 p-4 rounded-xl border border-[var(--border)] grid grid-cols-5 items-center">
                                            <div className="text-xs font-black">{r.rate}% GST</div>
                                            <div className="text-right text-[11px] font-bold">{formatCurrency(r.taxable)}</div>
                                            <div className="text-right text-[11px] font-bold text-amber-500">{formatCurrency(r.igst)}</div>
                                            <div className="text-right text-[11px] font-bold text-emerald-500">{formatCurrency(r.cgst + r.sgst)}</div>
                                            <div className="text-right text-xs font-black">{formatCurrency(r.total)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* POS Tab */}
                        {activeTab === 'pos' && (
                            <div className="grid gap-3">
                                {reportData.posSummary.map((p: any) => (
                                    <div key={p.state} className="bg-[var(--surface-variant)]/50 p-4 rounded-2xl border border-[var(--border)] flex justify-between items-center">
                                        <div>
                                            <h4 className="text-xs font-black text-[var(--on-surface)] uppercase">{p.state}</h4>
                                            <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{p.count} Transactions</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-[var(--primary)]">{formatCurrency(p.taxable)}</p>
                                            <div className="flex gap-2 justify-end mt-1">
                                                <span className="text-[8px] font-bold text-emerald-500">C+S: {formatCurrency(p.cgst + p.sgst)}</span>
                                                <span className="text-[8px] font-bold text-amber-500">I: {formatCurrency(p.igst)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* B2B Tab */}
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

                        {/* B2C Tab */}
                        {activeTab === 'b2c' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <GlassCard className="p-6">
                                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4">Retail Aggregate</p>
                                    <div className="space-y-4">
                                        <div className="flex justify-between">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Volume</span>
                                            <span className="text-lg font-black">{reportData.b2c.count} bills</span>
                                        </div>
                                        <div className="flex justify-between border-t border-[var(--border)] pt-4">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Grand Total</span>
                                            <span className="text-xl font-black text-[var(--primary)]">{formatCurrency(reportData.b2c.invoiceValue)}</span>
                                        </div>
                                    </div>
                                </GlassCard>
                                <GlassCard className="p-6">
                                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4">Tax Components</p>
                                    <div className="space-y-4">
                                        <div className="flex justify-between">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">CGST</span>
                                            <span className="text-sm font-black">{formatCurrency(reportData.b2c.cgst)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">SGST</span>
                                            <span className="text-sm font-black">{formatCurrency(reportData.b2c.sgst)}</span>
                                        </div>
                                        <div className="flex justify-between border-t border-[var(--border)] pt-4">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">IGST</span>
                                            <span className="text-sm font-black text-amber-500">{formatCurrency(reportData.b2c.igst)}</span>
                                        </div>
                                    </div>
                                </GlassCard>
                                <GlassCard className="p-6 flex flex-col justify-center items-center text-center">
                                    <PieChart size={24} className="text-[var(--primary)] mb-2" />
                                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Tax to Value Ratio</p>
                                    <p className="text-2xl font-black text-[var(--on-surface)]">
                                        {Math.round(((reportData.b2c.cgst + reportData.b2c.sgst + reportData.b2c.igst + reportData.b2c.cess) / (reportData.b2c.taxableValue || 1)) * 100)}%
                                    </p>
                                </GlassCard>
                            </div>
                        )}

                        {/* HSN Tab */}
                        {activeTab === 'hsn' && (
                            <div className="space-y-3">
                                <div className="bg-[var(--surface-variant)] p-4 rounded-t-2xl border border-[var(--border)] grid grid-cols-6 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                    <div className="col-span-2">HSN/Description</div>
                                    <div className="text-right">Quantity</div>
                                    <div className="text-right">Taxable</div>
                                    <div className="text-right">Tax (I+C+S+Cess)</div>
                                    <div className="text-right">Total</div>
                                </div>
                                <div className="grid gap-2">
                                    {reportData.hsnSummary.map((hsn: any, i: number) => (
                                        <div key={i} className="bg-[var(--surface-variant)]/30 p-4 rounded-xl border border-[var(--border)] grid grid-cols-6 items-center">
                                            <div className="col-span-2 min-w-0">
                                                <p className="text-[10px] font-black text-[var(--primary)] tracking-widest">{hsn.hsn}</p>
                                                <h4 className="text-[10px] font-bold text-[var(--on-surface)] uppercase truncate pr-4">{hsn.description}</h4>
                                            </div>
                                            <div className="text-right text-xs font-bold text-[var(--on-surface)]">{hsn.quantity} {hsn.uqc}</div>
                                            <div className="text-right text-[11px] font-medium opacity-70">{formatCurrency(hsn.taxableValue)}</div>
                                            <div className="text-right text-[11px] font-bold text-amber-500">{formatCurrency(hsn.igst + hsn.cgst + hsn.sgst + (hsn.cess || 0))}</div>
                                            <div className="text-right text-xs font-black text-[var(--on-surface)]">{formatCurrency(hsn.totalValue + hsn.igst + hsn.cgst + hsn.sgst + (hsn.cess || 0))}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* GSTR-3B Tab */}
                        {activeTab === 'gstr3b' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <GlassCard className="p-8">
                                        <h3 className="text-xs font-black uppercase text-emerald-500 mb-6 border-b pb-3 flex justify-between items-center">
                                            3.1 Outbound Supply Metrics
                                            <Badge variant="success" className="text-[8px]">LIABILITY</Badge>
                                        </h3>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center"><span className="text-[10px] font-black opacity-50 uppercase tracking-widest">Taxable Value</span><span className="text-sm font-black">{formatCurrency(reportData.gstr3b.outwardSupplies.taxable)}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-[10px] font-black opacity-50 uppercase tracking-widest">Integrated Tax (IGST)</span><span className="text-sm font-black text-amber-500">{formatCurrency(reportData.gstr3b.outwardSupplies.igst)}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-[10px] font-black opacity-50 uppercase tracking-widest">Central Tax (CGST)</span><span className="text-sm font-black text-blue-500">{formatCurrency(reportData.gstr3b.outwardSupplies.cgst)}</span></div>
                                            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3"><span className="text-[10px] font-black opacity-50 uppercase tracking-widest">State Tax (SGST)</span><span className="text-sm font-black text-blue-600">{formatCurrency(reportData.gstr3b.outwardSupplies.sgst)}</span></div>
                                            <div className="flex justify-between items-center pt-2"><span className="text-[11px] font-black uppercase tracking-widest">Gross Liability</span><span className="text-lg font-black text-[var(--primary)]">{formatCurrency(reportData.gstr3b.outwardSupplies.cgst + reportData.gstr3b.outwardSupplies.sgst + reportData.gstr3b.outwardSupplies.igst + reportData.gstr3b.outwardSupplies.cess)}</span></div>
                                        </div>
                                    </GlassCard>

                                    <GlassCard className="p-8">
                                        <h3 className="text-xs font-black uppercase text-blue-500 mb-6 border-b pb-3 flex justify-between items-center">
                                            4.0 Inbound Credit Summary
                                            <Badge variant="default" className="text-[8px]">INPUT ASSET</Badge>
                                        </h3>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center"><span className="text-[10px] font-black opacity-50 uppercase tracking-widest">All Other ITC</span><span className="text-sm font-black">{formatCurrency(reportData.gstr3b.inputTaxCredit.cgst + reportData.gstr3b.inputTaxCredit.sgst + reportData.gstr3b.inputTaxCredit.igst + reportData.gstr3b.inputTaxCredit.cess)}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-[10px] font-black opacity-50 uppercase tracking-widest">Integrated Tax (IGST)</span><span className="text-sm font-black text-amber-500">{formatCurrency(reportData.gstr3b.inputTaxCredit.igst)}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-[10px] font-black opacity-50 uppercase tracking-widest">Central Tax (CGST)</span><span className="text-sm font-black text-blue-500">{formatCurrency(reportData.gstr3b.inputTaxCredit.cgst)}</span></div>
                                            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3"><span className="text-[10px] font-black opacity-50 uppercase tracking-widest">State Tax (SGST)</span><span className="text-sm font-black text-blue-600">{formatCurrency(reportData.gstr3b.inputTaxCredit.sgst)}</span></div>
                                            <div className="flex justify-between items-center pt-2"><span className="text-[11px] font-black uppercase tracking-widest">Total Eligible ITC</span><span className="text-lg font-black text-emerald-500">{formatCurrency(reportData.gstr3b.inputTaxCredit.cgst + reportData.gstr3b.inputTaxCredit.sgst + reportData.gstr3b.inputTaxCredit.igst + reportData.gstr3b.inputTaxCredit.cess)}</span></div>
                                        </div>
                                    </GlassCard>
                                </div>

                                <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[40px] text-white overflow-hidden relative">
                                    <div className="absolute -right-10 -bottom-10 opacity-5">
                                        <PieChart size={300} />
                                    </div>
                                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                                        <div>
                                            <h4 className="text-[10px] font-black uppercase tracking-[4px] text-slate-400 mb-2">Settlement Forecast</h4>
                                            <p className="text-4xl font-black text-white tracking-tighter">
                                                {formatCurrency(reportData.gstr3b.netPayable.total)}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-500 mt-2 uppercase tracking-widest italic">
                                                * Net tax payable after adjustment of eligible ITC.
                                            </p>
                                        </div>
                                        <button onClick={() => exportJSON('gstr3b')} className="bg-white text-slate-900 hover:bg-slate-200 border-none px-10 py-5 rounded-[20px] text-[11px] font-black uppercase tracking-widest h-auto cursor-pointer">
                                            Download 3B Draft
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
