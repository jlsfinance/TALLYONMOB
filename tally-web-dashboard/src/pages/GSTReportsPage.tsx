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
import { useFY } from '@/contexts/FYContext';
import { toast } from 'react-hot-toast';

// Helper component for empty states
const EmptyState = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-[var(--text-muted)] opacity-30 mb-4">{icon}</div>
        <h3 className="text-lg font-black text-[var(--on-surface)] uppercase tracking-tight">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] mt-1">{description}</p>
    </div>
);

// GST return style panel + table cells
const Panel = ({ title, subtitle, children }: { title: string, subtitle?: string, children: React.ReactNode }) => (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--on-surface)]">{title}</h3>
            {subtitle && <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
        </div>
        {children}
    </div>
);

const Th = ({ children, align = 'right' }: { children: React.ReactNode, align?: 'left' | 'right' }) => (
    <th className={`px-3 py-2.5 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}>{children}</th>
);

const Td = ({ children, align = 'right', bold = false }: { children: React.ReactNode, align?: 'left' | 'right', bold?: boolean }) => (
    <td className={`px-3 py-2.5 text-[11px] tabular-nums whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'} ${bold ? 'font-black text-[var(--on-surface)]' : 'font-semibold text-[var(--on-surface-variant)]'}`}>{children}</td>
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

    const { selectedFY: selectedFy, setSelectedFY: setSelectedFy } = useFY();
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
                    supabase.from('voucher_stock_entries').select('*').eq('is_deleted', false).eq('is_deleted', false).in('voucher_id', voucherIds),
                    supabase.from('voucher_ledger_entries').select('*').eq('is_deleted', false).eq('is_deleted', false).in('voucher_id', voucherIds)
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

    const handleExportCSV = () => {
        if (!reportData) return;
        
        let headers: { key: string; label: string }[] = [];
        let exportData: any[] = [];
        let filename = `${activeTab.toUpperCase()}_Report_${period}_${selectedCompany.name}.csv`;

        switch (activeTab) {
            case 'summary':
                headers = [
                    { key: 'metric', label: 'Metric' },
                    { key: 'value', label: 'Value' }
                ];
                exportData = [
                    { metric: 'Outward Taxable Value', value: reportData.gstr3b.outwardSupplies.taxable },
                    { metric: 'Exempted/Nil Rated Sales', value: reportData.totals.exemptedSales },
                    { metric: 'Input Tax Credit (ITC)', value: reportData.gstr3b.inputTaxCredit.cgst + reportData.gstr3b.inputTaxCredit.sgst + reportData.gstr3b.inputTaxCredit.igst + reportData.gstr3b.inputTaxCredit.cess },
                    { metric: 'Net Tax Payable', value: reportData.gstr3b.netPayable.total }
                ];
                break;

            case 'rates':
                headers = [
                    { key: 'rateLabel', label: 'Tax Rate' },
                    { key: 'taxable', label: 'Taxable Value' },
                    { key: 'igst', label: 'IGST' },
                    { key: 'cgst_sgst', label: 'CGST / SGST' },
                    { key: 'total', label: 'Total Value' }
                ];
                exportData = reportData.rateSummary.map((r: any) => ({
                    rateLabel: `${r.rate}% GST`,
                    taxable: r.taxable,
                    igst: r.igst,
                    cgst_sgst: r.cgst + r.sgst,
                    total: r.total
                }));
                break;

            case 'pos':
                headers = [
                    { key: 'state', label: 'Place of Supply' },
                    { key: 'count', label: 'Transactions Count' },
                    { key: 'taxable', label: 'Taxable Value' },
                    { key: 'cgst_sgst', label: 'CGST / SGST' },
                    { key: 'igst', label: 'IGST' }
                ];
                exportData = reportData.posSummary.map((p: any) => ({
                    state: p.state,
                    count: p.count,
                    taxable: p.taxable,
                    cgst_sgst: p.cgst + p.sgst,
                    igst: p.igst
                }));
                break;

            case 'b2b':
                headers = [
                    { key: 'gstin', label: 'GSTIN' },
                    { key: 'partyName', label: 'Party Name' },
                    { key: 'invoiceNumber', label: 'Invoice Number' },
                    { key: 'invoiceDate', label: 'Invoice Date' },
                    { key: 'invoiceValue', label: 'Invoice Value' },
                    { key: 'cgst_sgst', label: 'CGST + SGST' },
                    { key: 'igst', label: 'IGST' }
                ];
                exportData = reportData.b2b.map((inv: any) => ({
                    gstin: inv.gstin,
                    partyName: inv.partyName,
                    invoiceNumber: inv.invoiceNumber,
                    invoiceDate: inv.invoiceDate,
                    invoiceValue: inv.invoiceValue,
                    cgst_sgst: inv.cgst + inv.sgst,
                    igst: inv.igst
                }));
                break;

            case 'b2c':
                headers = [
                    { key: 'count', label: 'Total Bills' },
                    { key: 'taxableValue', label: 'Taxable Value' },
                    { key: 'cgst', label: 'CGST' },
                    { key: 'sgst', label: 'SGST' },
                    { key: 'igst', label: 'IGST' },
                    { key: 'cess', label: 'CESS' },
                    { key: 'invoiceValue', label: 'Invoice Value' }
                ];
                exportData = [reportData.b2c];
                break;

            case 'hsn':
                headers = [
                    { key: 'hsn', label: 'HSN Code' },
                    { key: 'description', label: 'Description' },
                    { key: 'quantity', label: 'Quantity' },
                    { key: 'uqc', label: 'UOM (Unit)' },
                    { key: 'taxableValue', label: 'Taxable Value' },
                    { key: 'tax', label: 'GST Tax (I+C+S+Cess)' },
                    { key: 'total', label: 'Total Value' }
                ];
                exportData = reportData.hsnSummary.map((hsn: any) => ({
                    hsn: hsn.hsn,
                    description: hsn.description,
                    quantity: hsn.quantity,
                    uqc: hsn.uqc,
                    taxableValue: hsn.taxableValue,
                    tax: hsn.igst + hsn.cgst + hsn.sgst + (hsn.cess || 0),
                    total: hsn.totalValue + hsn.igst + hsn.cgst + hsn.sgst + (hsn.cess || 0)
                }));
                break;

            case 'gstr3b':
                headers = [
                    { key: 'section', label: 'Section' },
                    { key: 'taxable', label: 'Taxable Value' },
                    { key: 'igst', label: 'IGST' },
                    { key: 'cgst', label: 'CGST' },
                    { key: 'sgst', label: 'SGST' },
                    { key: 'cess', label: 'CESS' },
                    { key: 'total', label: 'Total GST' }
                ];
                exportData = [
                    {
                        section: '3.1 Outward Supplies (Liability)',
                        taxable: reportData.gstr3b.outwardSupplies.taxable,
                        igst: reportData.gstr3b.outwardSupplies.igst,
                        cgst: reportData.gstr3b.outwardSupplies.cgst,
                        sgst: reportData.gstr3b.outwardSupplies.sgst,
                        cess: reportData.gstr3b.outwardSupplies.cess,
                        total: reportData.gstr3b.outwardSupplies.cgst + reportData.gstr3b.outwardSupplies.sgst + reportData.gstr3b.outwardSupplies.igst + reportData.gstr3b.outwardSupplies.cess
                    },
                    {
                        section: '4.0 Eligible ITC (Input Asset)',
                        taxable: reportData.gstr3b.inputTaxCredit.taxable || 0,
                        igst: reportData.gstr3b.inputTaxCredit.igst,
                        cgst: reportData.gstr3b.inputTaxCredit.cgst,
                        sgst: reportData.gstr3b.inputTaxCredit.sgst,
                        cess: reportData.gstr3b.inputTaxCredit.cess,
                        total: reportData.gstr3b.inputTaxCredit.cgst + reportData.gstr3b.inputTaxCredit.sgst + reportData.gstr3b.inputTaxCredit.igst + reportData.gstr3b.inputTaxCredit.cess
                    },
                    {
                        section: 'Net Payable Liability',
                        taxable: 'N/A',
                        igst: reportData.gstr3b.netPayable.igst,
                        cgst: reportData.gstr3b.netPayable.cgst,
                        sgst: reportData.gstr3b.netPayable.sgst,
                        cess: reportData.gstr3b.netPayable.cess,
                        total: reportData.gstr3b.netPayable.total
                    }
                ];
                break;

            default:
                break;
        }

        if (exportData.length === 0) {
            toast.error('No data to export.');
            return;
        }

        import('../lib/exportToCSV').then(({ exportToCSV }) => {
            exportToCSV(exportData, headers, filename);
            toast.success(`${activeTab.toUpperCase()} CSV Exported successfully.`);
        }).catch(err => {
            toast.error('Failed to export CSV: ' + err.message);
        });
    };

    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount || 0);

    if (!selectedCompany) return null;

    const tabs = [
        { key: 'summary', label: 'Dashboard', icon: <PieChart size={16} /> },
        { key: 'b2b', label: 'GSTR-1 · B2B', icon: <Building2 size={16} /> },
        { key: 'b2c', label: 'B2C', icon: <User size={16} /> },
        { key: 'hsn', label: 'HSN', icon: <Package size={16} /> },
        { key: 'rates', label: 'Rate-wise', icon: <ShieldCheck size={16} /> },
        { key: 'pos', label: 'Place of Supply', icon: <Building2 size={16} /> },
        { key: 'gstr3b', label: 'GSTR-3B', icon: <Activity size={16} /> },
    ];

    const os = reportData?.gstr3b?.outwardSupplies;
    const itc = reportData?.gstr3b?.inputTaxCredit;
    const np = reportData?.gstr3b?.netPayable;
    const outwardTax = os ? os.igst + os.cgst + os.sgst + os.cess : 0;
    const itcTotal = itc ? itc.igst + itc.cgst + itc.sgst + itc.cess : 0;
    const b2bTaxable = reportData ? reportData.b2b.reduce((s: number, i: any) => s + (i.taxableValue || 0), 0) : 0;
    const b2bTax = reportData ? reportData.b2b.reduce((s: number, i: any) => s + i.igst + i.cgst + i.sgst + i.cess, 0) : 0;
    const hsnTaxable = reportData ? reportData.hsnSummary.reduce((s: number, h: any) => s + h.taxableValue, 0) : 0;
    const hsnTax = reportData ? reportData.hsnSummary.reduce((s: number, h: any) => s + h.igst + h.cgst + h.sgst + (h.cess || 0), 0) : 0;
    const b2cTax = reportData ? reportData.b2c.cgst + reportData.b2c.sgst + reportData.b2c.igst + reportData.b2c.cess : 0;
    const periodLabel = monthsInFy.find((m) => m.key === period)?.label || period;
    const dueDate = (day: number) => {
        const [year, month] = period.split('-').map(Number);
        return format(new Date(year, month, day), 'dd MMM yyyy');
    };
    const rateMax = reportData ? Math.max(1, ...reportData.rateSummary.map((r: any) => r.taxable)) : 1;
    const rateTotals = (reportData?.rateSummary || []).reduce((a: any, r: any) => ({ taxable: a.taxable + r.taxable, igst: a.igst + r.igst, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, cess: a.cess + r.cess }), { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
    const gstin = selectedCompany?.gstin || 'GSTIN not set';

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24">
            <HeaderPortal type="title">
                <div className="min-w-0">
                    <h1 className="text-sm md:text-base font-black text-[var(--on-surface)] uppercase tracking-tight leading-none truncate">GST Reports</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest leading-none mt-1 truncate">{gstin} · FY {selectedFy}</p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <CompactYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />
            </HeaderPortal>

            {/* Period selector + return exports */}
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="-mx-1 flex gap-1.5 overflow-x-auto scrollbar-hide px-1 py-1">
                    {monthsInFy.map((m) => {
                        const isActive = period === m.key;
                        return (
                            <button
                                key={m.key}
                                onClick={() => setPeriod(m.key)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap border ${isActive ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-lg' : 'bg-[var(--surface-variant)] border-[var(--border)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-active)]'}`}
                            >
                                {m.label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => exportJSON('gstr1')} disabled={!reportData || loading} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--success)] text-[9px] font-black uppercase tracking-widest hover:bg-[var(--success)]/10 transition-all disabled:opacity-30 flex items-center gap-1.5">
                        <Download size={13} /> GSTR-1 JSON
                    </button>
                    <button onClick={() => exportJSON('gstr3b')} disabled={!reportData || loading} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] text-[9px] font-black uppercase tracking-widest hover:bg-[var(--primary)]/10 transition-all disabled:opacity-30 flex items-center gap-1.5">
                        <Download size={13} /> GSTR-3B JSON
                    </button>
                    <button onClick={handleExportCSV} disabled={!reportData || loading} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)] text-[9px] font-black uppercase tracking-widest hover:bg-[var(--surface-active)] transition-all disabled:opacity-30 flex items-center gap-1.5">
                        <Download size={13} /> CSV
                    </button>
                </div>
            </div>

            {/* Section navigation */}
            <div className="flex gap-1.5 p-1.5 bg-[var(--surface-variant)] rounded-2xl border border-[var(--border)] overflow-x-auto scrollbar-hide">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key as any)}
                        className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.key ? 'bg-[var(--on-surface)] text-[var(--surface)] shadow-sm' : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-active)]'}`}
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
                        className="space-y-4"
                    >
                        {/* ================= DASHBOARD ================= */}
                        {activeTab === 'summary' && (
                            <div className="space-y-4">
                                {/* Return status */}
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">GSTR-1 · Outward supplies · {periodLabel}</p>
                                            <p className="text-sm font-black text-[var(--on-surface)] mt-1">Statement of outward supplies</p>
                                            <p className="text-[10px] font-semibold text-[var(--text-muted)] mt-0.5">Due {dueDate(11)} · {reportData.totals.salesCount} invoices</p>
                                        </div>
                                        <Badge variant="warning" className="shrink-0 text-[8px]">DRAFT</Badge>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">GSTR-3B · Summary return · {periodLabel}</p>
                                            <p className="text-sm font-black text-[var(--on-surface)] mt-1">Self-assessed tax &amp; ITC</p>
                                            <p className="text-[10px] font-semibold text-[var(--text-muted)] mt-0.5">Due {dueDate(20)} · {reportData.totals.purchasesCount} purchases</p>
                                        </div>
                                        <Badge variant="warning" className="shrink-0 text-[8px]">DRAFT</Badge>
                                    </div>
                                </div>

                                {/* Key figures */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Outward Taxable Value</p>
                                        <p className="text-lg font-black text-[var(--on-surface)] mt-1">{formatCurrency(os.taxable)}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-1">{reportData.totals.salesCount} invoices</p>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Tax Liability</p>
                                        <p className="text-lg font-black text-amber-500 mt-1">{formatCurrency(outwardTax)}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-1">IGST {formatCurrency(os.igst)} · C+S {formatCurrency(os.cgst + os.sgst)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Input Tax Credit</p>
                                        <p className="text-lg font-black text-emerald-500 mt-1">{formatCurrency(itcTotal)}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-1">{reportData.totals.purchasesCount} purchase bills</p>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Net Tax Payable</p>
                                        <p className="text-lg font-black text-[var(--on-surface)] mt-1">{formatCurrency(np.total)}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-1">after ITC set-off</p>
                                    </div>
                                </div>

                                {/* 3.1 and 4.0 tables */}
                                <div className="grid lg:grid-cols-2 gap-4">
                                    <Panel title="3.1 Outward taxable supplies" subtitle="Other than zero-rated, nil and exempted">
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse">
                                                <thead className="bg-[var(--surface-variant)]/70">
                                                    <tr>
                                                        <Th align="left">Nature of supply</Th>
                                                        <Th>Taxable value</Th>
                                                        <Th>IGST</Th>
                                                        <Th>CGST</Th>
                                                        <Th>SGST</Th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[var(--border)]">
                                                    <tr>
                                                        <Td align="left">(a) Outward taxable supplies (other than zero rated, nil and exempted)</Td>
                                                        <Td>{formatCurrency(os.taxable)}</Td>
                                                        <Td>{formatCurrency(os.igst)}</Td>
                                                        <Td>{formatCurrency(os.cgst)}</Td>
                                                        <Td>{formatCurrency(os.sgst)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">(b) Outward taxable supplies (zero rated)</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">(c) Other outward supplies (nil rated, exempted)</Td>
                                                        <Td>{formatCurrency(reportData.totals.exemptedSales)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">(d) Inward supplies (liable to reverse charge)</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                    </tr>
                                                </tbody>
                                                <tfoot className="bg-[var(--surface-variant)]/70">
                                                    <tr>
                                                        <Td align="left" bold>Total</Td>
                                                        <Td bold>{formatCurrency(os.taxable + reportData.totals.exemptedSales)}</Td>
                                                        <Td bold>{formatCurrency(os.igst)}</Td>
                                                        <Td bold>{formatCurrency(os.cgst)}</Td>
                                                        <Td bold>{formatCurrency(os.sgst)}</Td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </Panel>

                                    <Panel title="4. Eligible ITC" subtitle="Credit available for set-off">
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse">
                                                <thead className="bg-[var(--surface-variant)]/70">
                                                    <tr>
                                                        <Th align="left">Details</Th>
                                                        <Th>IGST</Th>
                                                        <Th>CGST</Th>
                                                        <Th>SGST</Th>
                                                        <Th>Cess</Th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[var(--border)]">
                                                    <tr>
                                                        <Td align="left">(A) ITC available — all other ITC</Td>
                                                        <Td>{formatCurrency(itc.igst)}</Td>
                                                        <Td>{formatCurrency(itc.cgst)}</Td>
                                                        <Td>{formatCurrency(itc.sgst)}</Td>
                                                        <Td>{formatCurrency(itc.cess)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">(B) ITC reversed</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">(C) Net ITC available (A − B)</Td>
                                                        <Td>{formatCurrency(itc.igst)}</Td>
                                                        <Td>{formatCurrency(itc.cgst)}</Td>
                                                        <Td>{formatCurrency(itc.sgst)}</Td>
                                                        <Td>{formatCurrency(itc.cess)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">(D) Ineligible ITC</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                    </tr>
                                                </tbody>
                                                <tfoot className="bg-[var(--surface-variant)]/70">
                                                    <tr>
                                                        <Td align="left" bold>Total ITC available</Td>
                                                        <Td bold>{formatCurrency(itc.igst)}</Td>
                                                        <Td bold>{formatCurrency(itc.cgst)}</Td>
                                                        <Td bold>{formatCurrency(itc.sgst)}</Td>
                                                        <Td bold>{formatCurrency(itc.cess)}</Td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </Panel>
                                </div>

                                {/* GSTR-1 snapshot + rate distribution */}
                                <div className="grid lg:grid-cols-2 gap-4">
                                    <Panel title="GSTR-1 snapshot" subtitle={`Sections for ${periodLabel}`}>
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse">
                                                <thead className="bg-[var(--surface-variant)]/70">
                                                    <tr>
                                                        <Th align="left">Section</Th>
                                                        <Th>Records</Th>
                                                        <Th>Taxable value</Th>
                                                        <Th>Tax</Th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[var(--border)]">
                                                    <tr>
                                                        <Td align="left">4A · B2B invoices (registered)</Td>
                                                        <Td>{reportData.b2b.length}</Td>
                                                        <Td>{formatCurrency(b2bTaxable)}</Td>
                                                        <Td>{formatCurrency(b2bTax)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">7 · B2C (others)</Td>
                                                        <Td>{reportData.b2c.count}</Td>
                                                        <Td>{formatCurrency(reportData.b2c.taxableValue)}</Td>
                                                        <Td>{formatCurrency(b2cTax)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">8 · Nil rated / exempted</Td>
                                                        <Td>{reportData.totals.exemptedSales > 0 ? 'Yes' : '—'}</Td>
                                                        <Td>{formatCurrency(reportData.totals.exemptedSales)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">12 · HSN summary</Td>
                                                        <Td>{reportData.hsnSummary.length}</Td>
                                                        <Td>{formatCurrency(hsnTaxable)}</Td>
                                                        <Td>{formatCurrency(hsnTax)}</Td>
                                                    </tr>
                                                </tbody>
                                                <tfoot className="bg-[var(--surface-variant)]/70">
                                                    <tr>
                                                        <Td align="left" bold>Outward total</Td>
                                                        <Td bold>{reportData.totals.salesCount}</Td>
                                                        <Td bold>{formatCurrency(os.taxable)}</Td>
                                                        <Td bold>{formatCurrency(outwardTax)}</Td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </Panel>

                                    <Panel title="Rate-wise distribution" subtitle="Taxable value by GST rate">
                                        <div className="p-4 space-y-3">
                                            {reportData.rateSummary.length === 0 ? (
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] py-6 text-center">No rated supplies</p>
                                            ) : reportData.rateSummary.map((r: any) => (
                                                <div key={r.rate}>
                                                    <div className="flex items-center justify-between text-[11px] font-bold">
                                                        <span className="text-[var(--on-surface)]">{r.rate}% GST</span>
                                                        <span className="text-[var(--on-surface)]">{formatCurrency(r.taxable)} <span className="text-[var(--text-muted)] font-semibold">· tax {formatCurrency(r.cgst + r.sgst + r.igst + r.cess)}</span></span>
                                                    </div>
                                                    <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                                                        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.max(2, Math.min(100, (r.taxable / rateMax) * 100))}%` }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </Panel>
                                </div>

                                {/* Place of supply */}
                                <Panel title="Place of supply" subtitle="State-wise outward supplies">
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[560px] border-collapse">
                                            <thead className="bg-[var(--surface-variant)]/70">
                                                <tr>
                                                    <Th align="left">State</Th>
                                                    <Th>Invoices</Th>
                                                    <Th>Taxable value</Th>
                                                    <Th>IGST</Th>
                                                    <Th>CGST</Th>
                                                    <Th>SGST</Th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--border)]">
                                                {reportData.posSummary.map((p: any) => (
                                                    <tr key={p.state}>
                                                        <Td align="left">{p.state}</Td>
                                                        <Td>{p.count}</Td>
                                                        <Td>{formatCurrency(p.taxable)}</Td>
                                                        <Td>{formatCurrency(p.igst)}</Td>
                                                        <Td>{formatCurrency(p.cgst)}</Td>
                                                        <Td>{formatCurrency(p.sgst)}</Td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-[var(--surface-variant)]/70">
                                                <tr>
                                                    <Td align="left" bold>Total</Td>
                                                    <Td bold>{reportData.totals.salesCount}</Td>
                                                    <Td bold>{formatCurrency(os.taxable)}</Td>
                                                    <Td bold>{formatCurrency(os.igst)}</Td>
                                                    <Td bold>{formatCurrency(os.cgst)}</Td>
                                                    <Td bold>{formatCurrency(os.sgst)}</Td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </Panel>
                            </div>
                        )}

                        {/* ================= RATE-WISE ================= */}
                        {activeTab === 'rates' && (
                            <Panel title="Rate-wise summary" subtitle="Section 12 · tax rate wise outward supplies">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[640px] border-collapse">
                                        <thead className="bg-[var(--surface-variant)]/70">
                                            <tr>
                                                <Th align="left">GST rate</Th>
                                                <Th>Taxable value</Th>
                                                <Th>IGST</Th>
                                                <Th>CGST</Th>
                                                <Th>SGST</Th>
                                                <Th>Cess</Th>
                                                <Th>Total tax</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                            {reportData.rateSummary.map((r: any) => (
                                                <tr key={r.rate}>
                                                    <Td align="left" bold>{r.rate}%</Td>
                                                    <Td>{formatCurrency(r.taxable)}</Td>
                                                    <Td>{formatCurrency(r.igst)}</Td>
                                                    <Td>{formatCurrency(r.cgst)}</Td>
                                                    <Td>{formatCurrency(r.sgst)}</Td>
                                                    <Td>{formatCurrency(r.cess)}</Td>
                                                    <Td bold>{formatCurrency(r.cgst + r.sgst + r.igst + r.cess)}</Td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-[var(--surface-variant)]/70">
                                            <tr>
                                                <Td align="left" bold>Total</Td>
                                                <Td bold>{formatCurrency(rateTotals.taxable)}</Td>
                                                <Td bold>{formatCurrency(rateTotals.igst)}</Td>
                                                <Td bold>{formatCurrency(rateTotals.cgst)}</Td>
                                                <Td bold>{formatCurrency(rateTotals.sgst)}</Td>
                                                <Td bold>{formatCurrency(rateTotals.cess)}</Td>
                                                <Td bold>{formatCurrency(rateTotals.igst + rateTotals.cgst + rateTotals.sgst + rateTotals.cess)}</Td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </Panel>
                        )}

                        {/* ================= PLACE OF SUPPLY ================= */}
                        {activeTab === 'pos' && (
                            <Panel title="Place of supply" subtitle="State-wise outward supplies">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[560px] border-collapse">
                                        <thead className="bg-[var(--surface-variant)]/70">
                                            <tr>
                                                <Th align="left">State</Th>
                                                <Th>Invoices</Th>
                                                <Th>Taxable value</Th>
                                                <Th>IGST</Th>
                                                <Th>CGST</Th>
                                                <Th>SGST</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                            {reportData.posSummary.map((p: any) => (
                                                <tr key={p.state}>
                                                    <Td align="left">{p.state}</Td>
                                                    <Td>{p.count}</Td>
                                                    <Td>{formatCurrency(p.taxable)}</Td>
                                                    <Td>{formatCurrency(p.igst)}</Td>
                                                    <Td>{formatCurrency(p.cgst)}</Td>
                                                    <Td>{formatCurrency(p.sgst)}</Td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-[var(--surface-variant)]/70">
                                            <tr>
                                                <Td align="left" bold>Total</Td>
                                                <Td bold>{reportData.totals.salesCount}</Td>
                                                <Td bold>{formatCurrency(os.taxable)}</Td>
                                                <Td bold>{formatCurrency(os.igst)}</Td>
                                                <Td bold>{formatCurrency(os.cgst)}</Td>
                                                <Td bold>{formatCurrency(os.sgst)}</Td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </Panel>
                        )}

                        {/* ================= B2B ================= */}
                        {activeTab === 'b2b' && (
                            reportData.b2b.length === 0 ? (
                                <EmptyState icon={<Building2 size={40} />} title="No B2B Events" description="No registered dealer sales found" />
                            ) : (
                                <Panel title="4A · B2B invoices" subtitle={`Registered dealers · ${reportData.b2b.length} invoices`}>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[980px] border-collapse">
                                            <thead className="bg-[var(--surface-variant)]/70">
                                                <tr>
                                                    <Th align="left">GSTIN / Party</Th>
                                                    <Th align="left">Invoice</Th>
                                                    <Th>Date</Th>
                                                    <Th>Taxable value</Th>
                                                    <Th>IGST</Th>
                                                    <Th>CGST</Th>
                                                    <Th>SGST</Th>
                                                    <Th>Invoice value</Th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--border)]">
                                                {reportData.b2b.map((inv: any, i: number) => (
                                                    <tr key={i}>
                                                        <Td align="left">
                                                            <p className="text-[9px] font-black tracking-widest text-[var(--primary)]">{inv.gstin}</p>
                                                            <p className="text-[11px] font-bold text-[var(--on-surface)] mt-0.5">{inv.partyName}</p>
                                                        </Td>
                                                        <Td align="left">#{inv.invoiceNumber || '—'}</Td>
                                                        <Td>{inv.invoiceDate ? format(new Date(inv.invoiceDate), 'dd MMM yy') : '—'}</Td>
                                                        <Td>{formatCurrency(inv.taxableValue)}</Td>
                                                        <Td>{formatCurrency(inv.igst)}</Td>
                                                        <Td>{formatCurrency(inv.cgst)}</Td>
                                                        <Td>{formatCurrency(inv.sgst)}</Td>
                                                        <Td bold>{formatCurrency(inv.invoiceValue)}</Td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-[var(--surface-variant)]/70">
                                                <tr>
                                                    <Td align="left" bold>Total</Td>
                                                    <Td bold>{reportData.b2b.length} invoices</Td>
                                                    <Td bold>—</Td>
                                                    <Td bold>{formatCurrency(b2bTaxable)}</Td>
                                                    <Td bold>{formatCurrency(reportData.b2b.reduce((s: number, i: any) => s + i.igst, 0))}</Td>
                                                    <Td bold>{formatCurrency(reportData.b2b.reduce((s: number, i: any) => s + i.cgst, 0))}</Td>
                                                    <Td bold>{formatCurrency(reportData.b2b.reduce((s: number, i: any) => s + i.sgst, 0))}</Td>
                                                    <Td bold>{formatCurrency(reportData.b2b.reduce((s: number, i: any) => s + i.invoiceValue, 0))}</Td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </Panel>
                            )
                        )}

                        {/* ================= B2C ================= */}
                        {activeTab === 'b2c' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4">Retail aggregate</p>
                                        <div className="space-y-4">
                                            <div className="flex justify-between">
                                                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Volume</span>
                                                <span className="text-lg font-black text-[var(--on-surface)]">{reportData.b2c.count} bills</span>
                                            </div>
                                            <div className="flex justify-between border-t border-[var(--border)] pt-4">
                                                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Grand total</span>
                                                <span className="text-xl font-black text-[var(--primary)]">{formatCurrency(reportData.b2c.invoiceValue)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4">Tax components</p>
                                        <div className="space-y-4">
                                            <div className="flex justify-between">
                                                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">CGST</span>
                                                <span className="text-sm font-black text-[var(--on-surface)]">{formatCurrency(reportData.b2c.cgst)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">SGST</span>
                                                <span className="text-sm font-black text-[var(--on-surface)]">{formatCurrency(reportData.b2c.sgst)}</span>
                                            </div>
                                            <div className="flex justify-between border-t border-[var(--border)] pt-4">
                                                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">IGST</span>
                                                <span className="text-sm font-black text-amber-500">{formatCurrency(reportData.b2c.igst)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col justify-center items-center text-center">
                                        <PieChart size={24} className="text-[var(--primary)] mb-2" />
                                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Tax to value ratio</p>
                                        <p className="text-2xl font-black text-[var(--on-surface)]">
                                            {Math.round((b2cTax / (reportData.b2c.taxableValue || 1)) * 100)}%
                                        </p>
                                    </div>
                                </div>

                                <Panel title="7 · B2C (others)" subtitle="Unregistered and composition dealers, consolidated">
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[720px] border-collapse">
                                            <thead className="bg-[var(--surface-variant)]/70">
                                                <tr>
                                                    <Th align="left">Type</Th>
                                                    <Th>Bills</Th>
                                                    <Th>Taxable value</Th>
                                                    <Th>IGST</Th>
                                                    <Th>CGST</Th>
                                                    <Th>SGST</Th>
                                                    <Th>Cess</Th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--border)]">
                                                <tr>
                                                    <Td align="left">B2C (others) — consolidated</Td>
                                                    <Td>{reportData.b2c.count}</Td>
                                                    <Td>{formatCurrency(reportData.b2c.taxableValue)}</Td>
                                                    <Td>{formatCurrency(reportData.b2c.igst)}</Td>
                                                    <Td>{formatCurrency(reportData.b2c.cgst)}</Td>
                                                    <Td>{formatCurrency(reportData.b2c.sgst)}</Td>
                                                    <Td>{formatCurrency(reportData.b2c.cess)}</Td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </Panel>
                            </div>
                        )}

                        {/* ================= HSN ================= */}
                        {activeTab === 'hsn' && (
                            <Panel title="12 · HSN summary" subtitle={`${reportData.hsnSummary.length} HSN codes`}>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[860px] border-collapse">
                                        <thead className="bg-[var(--surface-variant)]/70">
                                            <tr>
                                                <Th align="left">HSN / Description</Th>
                                                <Th>UQC</Th>
                                                <Th>Quantity</Th>
                                                <Th>Taxable value</Th>
                                                <Th>IGST</Th>
                                                <Th>CGST</Th>
                                                <Th>SGST</Th>
                                                <Th>Total</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                            {reportData.hsnSummary.map((hsn: any, i: number) => (
                                                <tr key={i}>
                                                    <Td align="left">
                                                        <p className="text-[10px] font-black tracking-widest text-[var(--primary)]">{hsn.hsn}</p>
                                                        <p className="text-[10px] font-semibold text-[var(--text-muted)] mt-0.5">{hsn.description || '—'}</p>
                                                    </Td>
                                                    <Td>{hsn.uqc}</Td>
                                                    <Td>{hsn.quantity}</Td>
                                                    <Td>{formatCurrency(hsn.taxableValue)}</Td>
                                                    <Td>{formatCurrency(hsn.igst)}</Td>
                                                    <Td>{formatCurrency(hsn.cgst)}</Td>
                                                    <Td>{formatCurrency(hsn.sgst)}</Td>
                                                    <Td bold>{formatCurrency(hsn.taxableValue + hsn.igst + hsn.cgst + hsn.sgst + (hsn.cess || 0))}</Td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-[var(--surface-variant)]/70">
                                            <tr>
                                                <Td align="left" bold>Total</Td>
                                                <Td bold>—</Td>
                                                <Td bold>—</Td>
                                                <Td bold>{formatCurrency(hsnTaxable)}</Td>
                                                <Td bold>{formatCurrency(reportData.hsnSummary.reduce((s: number, h: any) => s + h.igst, 0))}</Td>
                                                <Td bold>{formatCurrency(reportData.hsnSummary.reduce((s: number, h: any) => s + h.cgst, 0))}</Td>
                                                <Td bold>{formatCurrency(reportData.hsnSummary.reduce((s: number, h: any) => s + h.sgst, 0))}</Td>
                                                <Td bold>{formatCurrency(hsnTaxable + hsnTax)}</Td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </Panel>
                        )}

                        {/* ================= GSTR-3B ================= */}
                        {activeTab === 'gstr3b' && (
                            <div className="space-y-4">
                                <div className="grid lg:grid-cols-2 gap-4">
                                    <Panel title="3.1 Outward supplies" subtitle="Liability for the period">
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse">
                                                <thead className="bg-[var(--surface-variant)]/70">
                                                    <tr>
                                                        <Th align="left">Nature of supply</Th>
                                                        <Th>Taxable value</Th>
                                                        <Th>IGST</Th>
                                                        <Th>CGST</Th>
                                                        <Th>SGST</Th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[var(--border)]">
                                                    <tr>
                                                        <Td align="left">(a) Outward taxable supplies (other than zero rated, nil and exempted)</Td>
                                                        <Td>{formatCurrency(os.taxable)}</Td>
                                                        <Td>{formatCurrency(os.igst)}</Td>
                                                        <Td>{formatCurrency(os.cgst)}</Td>
                                                        <Td>{formatCurrency(os.sgst)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">(c) Other outward supplies (nil rated, exempted)</Td>
                                                        <Td>{formatCurrency(reportData.totals.exemptedSales)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                        <Td>{formatCurrency(0)}</Td>
                                                    </tr>
                                                </tbody>
                                                <tfoot className="bg-[var(--surface-variant)]/70">
                                                    <tr>
                                                        <Td align="left" bold>Gross liability</Td>
                                                        <Td bold>{formatCurrency(os.taxable + reportData.totals.exemptedSales)}</Td>
                                                        <Td bold>{formatCurrency(os.igst)}</Td>
                                                        <Td bold>{formatCurrency(os.cgst)}</Td>
                                                        <Td bold>{formatCurrency(os.sgst)}</Td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </Panel>

                                    <Panel title="4. Eligible ITC" subtitle="Input tax credit">
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse">
                                                <thead className="bg-[var(--surface-variant)]/70">
                                                    <tr>
                                                        <Th align="left">Details</Th>
                                                        <Th>IGST</Th>
                                                        <Th>CGST</Th>
                                                        <Th>SGST</Th>
                                                        <Th>Cess</Th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[var(--border)]">
                                                    <tr>
                                                        <Td align="left">(A) ITC available — all other ITC</Td>
                                                        <Td>{formatCurrency(itc.igst)}</Td>
                                                        <Td>{formatCurrency(itc.cgst)}</Td>
                                                        <Td>{formatCurrency(itc.sgst)}</Td>
                                                        <Td>{formatCurrency(itc.cess)}</Td>
                                                    </tr>
                                                    <tr>
                                                        <Td align="left">(C) Net ITC available (A − B)</Td>
                                                        <Td>{formatCurrency(itc.igst)}</Td>
                                                        <Td>{formatCurrency(itc.cgst)}</Td>
                                                        <Td>{formatCurrency(itc.sgst)}</Td>
                                                        <Td>{formatCurrency(itc.cess)}</Td>
                                                    </tr>
                                                </tbody>
                                                <tfoot className="bg-[var(--surface-variant)]/70">
                                                    <tr>
                                                        <Td align="left" bold>Total ITC available</Td>
                                                        <Td bold>{formatCurrency(itc.igst)}</Td>
                                                        <Td bold>{formatCurrency(itc.cgst)}</Td>
                                                        <Td bold>{formatCurrency(itc.sgst)}</Td>
                                                        <Td bold>{formatCurrency(itc.cess)}</Td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </Panel>
                                </div>

                                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                                    <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--text-muted)]">5. Net tax payable</p>
                                            <p className="text-3xl font-black text-[var(--on-surface)] mt-1 tracking-tight">{formatCurrency(np.total)}</p>
                                            <p className="text-[10px] font-semibold text-[var(--text-muted)] mt-1">
                                                IGST {formatCurrency(np.igst)} · CGST {formatCurrency(np.cgst)} · SGST {formatCurrency(np.sgst)} · Cess {formatCurrency(np.cess)}
                                            </p>
                                            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-2">Net tax payable after adjustment of eligible ITC for {periodLabel}</p>
                                        </div>
                                        <button onClick={() => exportJSON('gstr3b')} className="shrink-0 px-5 py-3 rounded-xl bg-[var(--primary)] text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2">
                                            <Download size={14} /> Download 3B draft
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
