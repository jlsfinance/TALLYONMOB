import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import {
    ArrowLeft, Edit, MessageCircle, Share2, Download, Printer, Share
} from 'lucide-react';
import '../styles/Material3.css';

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const absNumber = (value) => Math.abs(toNumber(value));

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const parseStateCodeFromGstin = (gstin) => {
    const text = String(gstin || '').trim().toUpperCase();
    const match = text.match(/^(\d{2})/);
    return match ? match[1] : '';
};

const normalizeStateKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const isTrueish = (value) => (
    value === true
    || value === 1
    || value === '1'
    || String(value || '').trim().toLowerCase() === 'true'
);

const areDifferentStates = (companyState, partyState, companyGstin, partyGstin) => {
    const companyStateCode = parseStateCodeFromGstin(companyGstin);
    const partyStateCode = parseStateCodeFromGstin(partyGstin);

    if (companyStateCode && partyStateCode) {
        return companyStateCode !== partyStateCode;
    }

    const normalizedCompanyState = normalizeStateKey(companyState);
    const normalizedPartyState = normalizeStateKey(partyState);

    if (normalizedCompanyState && normalizedPartyState) {
        return normalizedCompanyState !== normalizedPartyState;
    }

    return false;
};

const queryErrorText = (error) => `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

const isMissingColumnError = (error, table, column) => {
    const text = queryErrorText(error);
    return (
        String(error?.code || '') === '42703'
        || text.includes(`column ${table}.${column}`)
        || text.includes(`'${column}' column`)
    );
};

const withOptionalLedgerState = async (buildQuery, ...fieldAttempts) => {
    const attempts = ['*', ...fieldAttempts.filter(Boolean)];
    let lastResult = null;

    for (const fields of attempts) {
        const result = await buildQuery(fields);
        lastResult = result;

        if (!result?.error) {
            if (result?.data) {
                if (Array.isArray(result.data)) {
                    result.data = result.data.map((row) => ({ ...row, state: row?.state || '' }));
                } else if (typeof result.data === 'object') {
                    result.data = { ...result.data, state: result.data?.state || '' };
                }
            }
            return result;
        }

        const missingAnyOptionalLedgerField = ['state', 'gstin', 'address', 'email', 'phone']
            .some((column) => isMissingColumnError(result.error, 'ledgers', column));

        if (!missingAnyOptionalLedgerField) {
            return result;
        }
    }

    return lastResult;
};

const buildInvoiceSeed = (voucherData) => {
    if (!voucherData) return null;

    const netAmount = absNumber(voucherData.net_amount ?? voucherData.grand_total ?? voucherData.total_amount);

    return {
        ...voucherData,
        invoice_number: voucherData.invoice_number || voucherData.voucher_number || '---',
        invoice_date: voucherData.invoice_date || voucherData.voucher_date || voucherData.date,
        party_ledger_name: voucherData.party_ledger_name || voucherData.party_name || voucherData.customerName || 'Unknown party',
        net_amount: netAmount,
        taxable_amount: absNumber(voucherData.taxable_amount ?? voucherData.total_amount ?? voucherData.grand_total),
        voucher_type: voucherData.voucher_type || voucherData.transaction_type || 'Sales'
    };
};

const isSalesVoucherType = (value) => {
    const type = String(value || '').trim().toLowerCase();
    return type === 'sales' || type === 'sales invoice';
};

export default function InvoicePDFPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { selectedCompany } = useAuth();
    const printRef = useRef();
    const navigationVoucher = location.state?.voucher || null;
    const backTarget = location.state?.from || (isSalesVoucherType(navigationVoucher?.voucher_type || navigationVoucher?.transaction_type) ? '/sales' : '/vouchers');

    const [invoice, setInvoice] = useState(() => buildInvoiceSeed(navigationVoucher));
    const [companyInfo, setCompanyInfo] = useState(() => selectedCompany || null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(!navigationVoucher);
    const [template, setTemplate] = useState('professional');
    const [upiId, setUpiId] = useState('');
    const [scale, setScale] = useState(1);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            if (typeof window !== 'undefined') {
                const mobile = window.innerWidth < 768;
                setIsMobile(mobile);
                if (mobile) {
                    setScale(1);
                } else {
                    const sidebarWidth = 240;
                    const padding = 48;
                    const availableWidth = window.innerWidth - sidebarWidth - padding;
                    const s = Math.min(availableWidth / (210 * 3.7795), 1.15);
                    setScale(s);
                }
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (id && selectedCompany?.id) {
            loadInvoice();
            const savedUpi = localStorage.getItem(`upi_${selectedCompany.id}`);
            if (savedUpi) setUpiId(savedUpi);
        }
    }, [id, selectedCompany?.id]);

    useEffect(() => {
        const seededInvoice = buildInvoiceSeed(navigationVoucher);
        if (seededInvoice) {
            setInvoice((current) => current || seededInvoice);
        }
    }, [id, navigationVoucher]);

    const loadInvoice = async () => {
        setLoading((current) => current || !invoice);
        try {
            const decodedId = decodeURIComponent(id || '');
            const navigationIds = [navigationVoucher?.id, navigationVoucher?.voucher_id].filter(Boolean).map(String);
            let voucherData = navigationIds.includes(decodedId) ? navigationVoucher : null;

            const { data: primaryVoucher } = await supabase
                .from('vouchers')
                .select('*')
                .eq('id', decodedId)
                .maybeSingle();

            if (primaryVoucher) {
                voucherData = { ...(voucherData || {}), ...primaryVoucher };
            }

            if (!voucherData) {
                const { data: fallback } = await supabase
                    .from('vouchers')
                    .select('*')
                    .eq('voucher_id', decodedId)
                    .maybeSingle();
                voucherData = fallback;
            }

            if (voucherData) {
                setInvoice((current) => current || buildInvoiceSeed(voucherData));

                const baseCompanyInfo = { ...(selectedCompany || {}) };
                const companyName = baseCompanyInfo?.name || voucherData.company_name || '';
                const partyQuery = voucherData.party_ledger_id
                    ? withOptionalLedgerState(
                        (fields) => supabase
                            .from('ledgers')
                            .select(fields)
                            .eq('id', voucherData.party_ledger_id)
                            .maybeSingle(),
                        'id, address, gstin, state, email, phone',
                        'id, address, gstin, email, phone'
                    )
                    : voucherData.party_name
                        ? withOptionalLedgerState(
                            (fields) => supabase
                                .from('ledgers')
                                .select(fields)
                                .eq('company_id', voucherData.company_id)
                                .ilike('name', voucherData.party_name.trim())
                                .maybeSingle(),
                            'id, address, gstin, state, email, phone',
                            'id, address, gstin, email, phone'
                        )
                        : Promise.resolve({ data: null });

                const [
                    companyResult,
                    partyResult,
                    companyLedgerResult,
                    bankResult
                ] = await Promise.all([
                    supabase
                        .from('companies')
                        .select('*')
                        .eq('id', voucherData.company_id)
                        .maybeSingle(),
                    partyQuery,
                    withOptionalLedgerState(
                        (fields) => supabase
                            .from('ledgers')
                            .select(fields)
                            .eq('company_id', voucherData.company_id)
                            .ilike('name', companyName)
                            .maybeSingle(),
                        'gstin, address, email, phone, state',
                        'gstin, address, email, phone'
                    ),
                    supabase
                        .from('ledgers')
                        .select('name, address')
                        .eq('company_id', voucherData.company_id)
                        .or('parent.eq.Bank Accounts,parent_group.eq.Bank Accounts')
                        .limit(1)
                        .maybeSingle()
                ]);

                const companyData = companyResult.data;
                const partyDetails = partyResult.data || {};
                const cLedger = companyLedgerResult.data;
                const bLedger = bankResult.data;
                let resolvedCompanyInfo = companyData
                    ? {
                        ...baseCompanyInfo,
                        ...Object.fromEntries(
                            Object.entries(companyData).filter(([_, v]) => v != null && v !== '')
                        )
                    }
                    : baseCompanyInfo;

                if (cLedger) {
                    resolvedCompanyInfo = {
                        ...resolvedCompanyInfo,
                        gstin: resolvedCompanyInfo?.gstin || cLedger.gstin,
                        address: resolvedCompanyInfo?.address || cLedger.address,
                        email: resolvedCompanyInfo?.email || cLedger.email,
                        phone: resolvedCompanyInfo?.phone || cLedger.phone,
                        state: resolvedCompanyInfo?.state || cLedger.state
                    };
                }

                if (bLedger) {
                    resolvedCompanyInfo = {
                        ...resolvedCompanyInfo,
                        bank_name: resolvedCompanyInfo?.bank_name || bLedger.name,
                        bank_account: resolvedCompanyInfo?.bank_account || (bLedger.address?.match(/\d{10,}/)?.[0] || '')
                    };
                }

                setCompanyInfo(resolvedCompanyInfo);

                // Fetch ledger entries to get GST amounts (CGST, SGST, IGST are posted as ledgers in Tally)
                const voucherLookupIds = Array.from(new Set([voucherData.id, voucherData.voucher_id, decodedId].filter(Boolean)));

                // Fetch stock entries, ledger entries, and stock items in PARALLEL
                const [stockResult, ledgerResult, stockItemsResult] = await Promise.all([
                    supabase.from('voucher_stock_entries').select('*').in('voucher_id', voucherLookupIds),
                    supabase.from('voucher_ledger_entries').select('*').in('voucher_id', voucherLookupIds),
                    supabase.from('stock_items').select('id, name, hsn_code, unit, gst_rate').eq('company_id', voucherData.company_id)
                ]);

                const stockEntries = stockResult.data;
                const ledgerEntries = ledgerResult.data;
                const stockItems = stockItemsResult.data;

                const stockLookup = {};
                stockItems?.forEach(item => {
                    stockLookup[item.name] = item;
                    stockLookup[String(item.name || '').toLowerCase()] = item;
                });

                // Robust item detection: voucher_stock_entries -> raw_data -> inventory_entries
                let inventoryItems = stockEntries || [];

                if (inventoryItems.length === 0) {
                    const parsedRawData = (() => {
                        if (!voucherData.raw_data) return {};
                        if (typeof voucherData.raw_data === 'object') return voucherData.raw_data;
                        if (typeof voucherData.raw_data === 'string') {
                            try { return JSON.parse(voucherData.raw_data); } catch (_) { return {}; }
                        }
                        return {};
                    })();

                    inventoryItems =
                        parsedRawData.inventory_entries ||
                        parsedRawData.inventoryEntries ||
                        parsedRawData.items ||
                        parsedRawData.stock_entries ||
                        voucherData.inventory_entries ||
                        voucherData.items ||
                        [];
                }

                // Final Fallback: Check related Sales/Purchase tables for items
                if (inventoryItems.length === 0) {
                    const isSales = voucherData.voucher_type === 'Sales' || (!voucherData.voucher_type && voucherData.grand_total > 0);
                    const isPurchase = voucherData.voucher_type === 'Purchase' || voucherData.voucher_type === 'Purchase Voucher';

                    if (isSales || isPurchase) {
                        try {
                            const parentTable = isSales ? 'sales' : 'purchases';
                            const childTable = isSales ? 'sales_items' : 'purchase_items';
                            const childFK = isSales ? 'sale_id' : 'purchase_id';

                            // Try lookup by voucher lookup IDs in parent table first
                            const { data: parents } = await supabase
                                .from(parentTable)
                                .select('id')
                                .in('voucher_id', voucherLookupIds);

                            const parentIdList = (parents || []).map(p => p.id);
                            if (parentIdList.length > 0) {
                                const { data: relatedItems } = await supabase
                                    .from(childTable)
                                    .select('*')
                                    .in(childFK, parentIdList);
                                if (relatedItems?.length > 0) inventoryItems = relatedItems;
                            }
                        } catch (e) {
                            console.error('Error fetching related items:', e);
                        }
                    }
                }

                // Detect if this voucher has CGST/SGST (intra-state) or IGST (inter-state)
                // This is critical: Tally's RATEOFTAXCALCULATION stores the per-component rate
                // (e.g., 2.5% for CGST when total GST is 5%). We need to double it for intra-state.
                let hasIntraStateLedgers = false;  // CGST+SGST = intra-state
                let hasInterStateLedgers = false;  // IGST = inter-state
                let invoiceDiscountFromLedger = 0;
                if (ledgerEntries && ledgerEntries.length > 0) {
                    ledgerEntries.forEach(entry => {
                        const name = (entry.ledger_name || '').toUpperCase();
                        if (name.includes('CGST') || name.includes('SGST') || name.includes('UTGST')) {
                            hasIntraStateLedgers = true;
                        }
                        if (name.includes('IGST')) {
                            hasInterStateLedgers = true;
                        }
                        // Also detect discount ledger entries
                        if (name.includes('DISCOUNT') || name.includes('DISC')) {
                            invoiceDiscountFromLedger += Math.abs(Number(entry.amount) || 0);
                        }
                    });
                }

                // Enrich items with GST info and handle various field name conventions
                const enrichedItems = inventoryItems.map((item, itemIdx) => {
                    const itemName = item.item_name || item.stock_item_name || item.item_label || item.StockItemName || 'Item';
                    const master = stockLookup[itemName] || stockLookup[String(itemName).toLowerCase()] || {};

                    // --- GST RATE DETECTION ---
                    // tax_rate from voucher_stock_entries = Tally's RATEOFTAXCALCULATION
                    // CRITICAL: This is the PER-COMPONENT rate (e.g., 2.5% CGST, not 5% total)
                    // For intra-state (CGST+SGST): multiply by 2 to get total GST rate
                    // For inter-state (IGST): use as-is (it's already the total rate)
                    let rawTaxRate = Number(item.tax_rate || 0);
                    let gstRate = 0;

                    if (rawTaxRate > 0) {
                        if (hasIntraStateLedgers && !hasInterStateLedgers) {
                            // Intra-state: tax_rate is CGST component rate, double it for total
                            gstRate = rawTaxRate * 2;
                        } else if (hasInterStateLedgers && !hasIntraStateLedgers) {
                            // Inter-state: tax_rate is IGST rate (already total)
                            gstRate = rawTaxRate;
                        } else {
                            // Ambiguous: check if doubling gives a standard rate
                            const doubled = rawTaxRate * 2;
                            const stdRates = [5, 12, 18, 28];
                            if (stdRates.includes(doubled)) {
                                gstRate = doubled;  // Likely component rate
                            } else if (stdRates.includes(rawTaxRate)) {
                                gstRate = rawTaxRate;  // Already total rate
                            } else {
                                gstRate = doubled;  // Default to doubling (most common case)
                            }
                        }
                    }

                    // Fallback: check other direct field names
                    if (gstRate === 0) {
                        const directGst = Number(item.gst_rate || item.GSTRate || item.tax_percent || 0);
                        if (directGst > 0) gstRate = directGst;
                    }
                    // Fallback: master stock item gst_rate
                    if (gstRate === 0) gstRate = Number(master.gst_rate || 0);

                    // Fallback: Scan nested tax_entries for rates (Common in Tally JSON/raw_data)
                    if (gstRate === 0 && item.tax_entries) {
                        const taxEntries = Array.isArray(item.tax_entries) ? item.tax_entries : [item.tax_entries];
                        taxEntries.forEach(te => {
                            const rate = Number(te.rate ?? te.Rate ?? te.rate_percent ?? te.RatePercent ?? 0);
                            if (rate > 0) {
                                const name = (te.ledger_name || te.LedgerName || '').toUpperCase();
                                if (name.includes('CGST') || name.includes('SGST') || name.includes('UTGST')) {
                                    gstRate = Math.max(gstRate, rate * 2);
                                } else {
                                    gstRate = Math.max(gstRate, rate);
                                }
                            }
                        });
                    }

                    // Last resort: Derive GST rate from voucher_ledger_entries by parsing % from name
                    if (gstRate === 0 && ledgerEntries && ledgerEntries.length > 0) {
                        let totalGstFromLedgers = 0;
                        ledgerEntries.forEach(entry => {
                            const name = (entry.ledger_name || '').toUpperCase();
                            const amt = Math.abs(Number(entry.amount) || 0);
                            const rateMatch = name.match(/(\d+\.?\d*)\s*%/);
                            if (rateMatch) {
                                const parsedRate = Number(rateMatch[1]);
                                if (name.includes('CGST') || name.includes('SGST') || name.includes('UTGST')) {
                                    gstRate = Math.max(gstRate, parsedRate * 2);
                                } else if (name.includes('IGST')) {
                                    gstRate = Math.max(gstRate, parsedRate);
                                }
                            }
                            if (name.includes('CGST') || name.includes('SGST') || name.includes('UTGST') || name.includes('IGST')) {
                                totalGstFromLedgers += amt;
                            }
                        });
                        // Ratio fallback: if still 0 and single item
                        if (gstRate === 0 && totalGstFromLedgers > 0 && inventoryItems.length === 1) {
                            const itemAmt = Math.abs(Number(item.amount || 0));
                            if (itemAmt > 0) {
                                const derivedRate = (totalGstFromLedgers / itemAmt) * 100;
                                const stdRates = [5, 12, 18, 28];
                                const nearest = stdRates.reduce((a, b) => Math.abs(b - derivedRate) < Math.abs(a - derivedRate) ? b : a);
                                if (Math.abs(nearest - derivedRate) < 2) gstRate = nearest;
                            }
                        }
                    }

                    // --- QUANTITY, RATE, AMOUNT ---
                    const quantity = Number(item.quantity ?? item.billed_qty ?? item.Quantity ?? 0);
                    const rate = Number(item.rate ?? item.unit_price ?? item.Rate ?? 0);
                    const amount = Number(item.amount ?? item.Amount ?? (quantity * rate));

                    // --- DISCOUNT DETECTION ---
                    // discount_percent comes from voucher_stock_entries (synced from Tally's DISCOUNT field)
                    let discountVal = 0;
                    const rawDiscount = item.discount_percent ?? item.discount ?? item.Discount ?? item.DiscountPercent ?? item.discount_amount;
                    if (rawDiscount !== undefined && rawDiscount !== null) {
                        discountVal = Math.abs(Number(String(rawDiscount).replace(/[^0-9.-]/g, '')) || 0);
                    }

                    // DERIVED DISCOUNT: If discount_percent is 0 in DB but amount < rate * quantity,
                    // Tally applied discount implicitly. Calculate from the difference.
                    if (discountVal === 0 && quantity > 0 && rate > 0) {
                        const grossAmount = Math.abs(quantity * rate);
                        const netAmount = Math.abs(amount);
                        if (grossAmount > netAmount && (grossAmount - netAmount) > 0.5) {
                            // There's an implicit discount
                            discountVal = Math.round(((grossAmount - netAmount) / grossAmount) * 100 * 100) / 100;
                        }
                    }

                    // Fallback: If still no per-item discount but invoice has a discount ledger, distribute proportionally
                    if (discountVal === 0 && invoiceDiscountFromLedger > 0 && inventoryItems.length > 0) {
                        const totalItemsAmount = inventoryItems.reduce((s, i) => s + Math.abs(Number(i.amount || 0)), 0);
                        if (totalItemsAmount > 0) {
                            const itemProportion = Math.abs(amount) / totalItemsAmount;
                            const itemDiscountAmt = invoiceDiscountFromLedger * itemProportion;
                            const preDiscountAmt = Math.abs(amount) + itemDiscountAmt;
                            if (preDiscountAmt > 0) {
                                discountVal = Math.round((itemDiscountAmt / preDiscountAmt) * 100 * 100) / 100;
                            }
                        }
                    }

                    if (itemIdx === 0) {
                    }

                    // Tally's amount is already post-discount, so taxable = amount
                    const taxable = amount;

                    return {
                        ...item,
                        stock_item_id: master.id,
                        stock_item_name: itemName,
                        hsn_code: item.hsn_code || item.hsn || item.HsnCode || master.hsn_code || '',
                        unit: item.unit || item.Unit || master.unit || 'pcs',
                        gst_rate: gstRate,
                        quantity: quantity,
                        rate: rate,
                        amount: amount,
                        discount: discountVal,
                        discount_percent: discountVal, // keep both names for columnVisibility check
                        taxable_value: taxable
                    };
                });

                setItems(enrichedItems);



                const voucherTax = {
                    cgst: absNumber(voucherData.cgst_amount),
                    sgst: absNumber(voucherData.sgst_amount),
                    igst: absNumber(voucherData.igst_amount)
                };
                const ledgerTax = { cgst: 0, sgst: 0, igst: 0 };
                let discountLedgerAmount = 0;
                let roundOffLedgerAmount = 0;

                // Extract GST and Discount from ledger entries without double-counting voucher totals.
                if (ledgerEntries) {
                    ledgerEntries.forEach(entry => {
                        const ledgerName = (entry.ledger_name || '').toUpperCase();
                        const amount = absNumber(entry.amount);

                        if (ledgerName.includes('CGST') || ledgerName.includes('CENTRAL GST')) {
                            ledgerTax.cgst += amount;
                        } else if (ledgerName.includes('SGST') || ledgerName.includes('STATE GST') || ledgerName.includes('UTGST')) {
                            ledgerTax.sgst += amount;
                        } else if (ledgerName.includes('IGST') || ledgerName.includes('INTEGRATED GST')) {
                            ledgerTax.igst += amount;
                        } else if (ledgerName.includes('DISCOUNT')) {
                            discountLedgerAmount += amount;
                        } else if (ledgerName.includes('ROUND')) {
                            roundOffLedgerAmount += round2(Number(entry.amount) || 0);
                        }
                    });
                }

                const voucherTaxTotal = voucherTax.cgst + voucherTax.sgst + voucherTax.igst;
                const ledgerTaxTotal = ledgerTax.cgst + ledgerTax.sgst + ledgerTax.igst;
                const companyState = resolvedCompanyInfo?.state || '';
                const partyState = voucherData.party_state || voucherData.place_of_supply || partyDetails.state || '';
                const companyGstin = resolvedCompanyInfo?.gstin || '';
                const partyGstin = voucherData.party_gstin || partyDetails.gstin || '';
                const explicitVoucherInterState =
                    isTrueish(voucherData.is_inter_state)
                    || isTrueish(voucherData.is_interstate)
                    || (voucherTax.igst > 0 && (voucherTax.cgst + voucherTax.sgst) === 0);

                const resolvedIsInterState =
                    hasInterStateLedgers
                    || (!hasIntraStateLedgers && (
                        ledgerTax.igst > 0
                        || explicitVoucherInterState
                        || areDifferentStates(companyState, partyState, companyGstin, partyGstin)
                    ));

                const preferredTax = ledgerTaxTotal > 0 ? ledgerTax : voucherTax;
                let cgstAmount = 0;
                let sgstAmount = 0;
                let igstAmount = 0;
                let totalGST = preferredTax.cgst + preferredTax.sgst + preferredTax.igst;

                if (totalGST <= 0) {
                    totalGST = voucherTaxTotal > 0 ? voucherTaxTotal : ledgerTaxTotal;
                }

                if (totalGST > 0) {
                    if (resolvedIsInterState) {
                        igstAmount = round2(preferredTax.igst > 0 ? preferredTax.igst : totalGST);
                    } else {
                        const explicitIntraTotal = preferredTax.cgst + preferredTax.sgst;
                        if (explicitIntraTotal > 0) {
                            cgstAmount = round2(preferredTax.cgst);
                            sgstAmount = round2(preferredTax.sgst);
                        } else {
                            cgstAmount = round2(totalGST / 2);
                            sgstAmount = round2(totalGST - cgstAmount);
                        }
                    }
                }

                // If GST totals are absent, calculate them from item values or voucher totals.
                if (cgstAmount === 0 && sgstAmount === 0 && igstAmount === 0) {
                    totalGST = 0;
                    let hasGSTRates = false;

                    enrichedItems.forEach(item => {
                        const itemAmount = absNumber(item.amount);
                        const gstRate = toNumber(item.gst_rate);
                        if (gstRate > 0 && itemAmount > 0) {
                            hasGSTRates = true;
                            totalGST += (itemAmount * gstRate) / 100;
                        }
                    });

                    if (!hasGSTRates || totalGST === 0) {
                        const grandTotal = absNumber(voucherData.grand_total);
                        const taxableValue = absNumber(voucherData.taxable_value || voucherData.taxable_amount);
                        const totalAmount = absNumber(voucherData.total_amount);

                        if (grandTotal > taxableValue && taxableValue > 0) {
                            totalGST = grandTotal - taxableValue;
                        } else if (grandTotal > totalAmount && totalAmount > 0) {
                            totalGST = grandTotal - totalAmount;
                        }
                    }

                    totalGST = round2(totalGST);

                    if (totalGST > 0) {
                        if (resolvedIsInterState) {
                            igstAmount = totalGST;
                        } else {
                            cgstAmount = round2(totalGST / 2);
                            sgstAmount = round2(totalGST - cgstAmount);
                        }
                    }
                }

                // Calculate taxable amount (excluding GST)
                const totalGSTAmount = cgstAmount + sgstAmount + igstAmount;
                const netAmount = Math.abs(Number(voucherData.grand_total) || Number(voucherData.total_amount) || 0);
                const taxableAmount = totalGSTAmount > 0 ? (netAmount - totalGSTAmount) : Math.abs(Number(voucherData.taxable_value) || netAmount);

                const sale = {
                    ...voucherData,
                    invoice_number: voucherData.voucher_number,
                    invoice_date: voucherData.voucher_date,
                    party_ledger_name: voucherData.party_name,
                    party_ledger_id: partyDetails.id || voucherData.party_ledger_id,
                    party_gstin: voucherData.party_gstin || partyDetails.gstin || '',
                    party_address: voucherData.party_address || partyDetails.address || '',
                    party_state: voucherData.party_state || voucherData.place_of_supply || partyDetails.state || '',
                    party_email: partyDetails.email || '',
                    party_phone: partyDetails.phone || '',
                    place_of_supply: voucherData.place_of_supply || '',
                    net_amount: netAmount,
                    taxable_amount: taxableAmount,
                    cgst_amount: cgstAmount,
                    sgst_amount: sgstAmount,
                    igst_amount: igstAmount,
                    discount_amount: discountLedgerAmount,
                    round_off: round2(Number(voucherData.round_off) || roundOffLedgerAmount),
                    voucher_type: voucherData.voucher_type || 'Sales'
                };
                setInvoice(sale);


            }
        } catch (error) {
            console.error('Error loading invoice:', error);
        }
        setLoading(false);
    };

    // Smart column detection - Tally-style: hide every column with no data
    const columnVisibility = useMemo(() => {
        if (!items || !invoice) return {};

        const hasHSN = items.some(i => i.hsn_code && i.hsn_code !== '-' && i.hsn_code.trim() !== '');
        const hasGST = items.some(i => Number(i.gst_rate) > 0) || Number(invoice?.cgst_amount) > 0 || Number(invoice?.igst_amount) > 0;
        const hasDiscount = items.some(i => Number(i.discount) > 0 || Number(i.discount_percent) > 0);
        const hasUnit = items.some(i => i.unit && i.unit.trim() !== '');
        const hasRate = items.some(i => Number(i.rate) > 0);
        const hasQty = items.some(i => Number(i.quantity) > 0);
        const isIGST = Number(invoice?.igst_amount) > 0;
        const hasCGST = Number(invoice?.cgst_amount) > 0;
        const hasSGST = Number(invoice?.sgst_amount) > 0;
        const hasRoundOff = Math.abs(Number(invoice?.round_off)) > 0.001;

        // Critical Fix: Use companyInfo instead of invoice.selectedCompany
        const hasBankDetails = !!(companyInfo?.bank_name || companyInfo?.bank_account);

        return { hasHSN, hasGST, hasDiscount, hasUnit, hasRate, hasQty, isIGST, hasCGST, hasSGST, hasRoundOff, hasBankDetails };
    }, [items, invoice, companyInfo]);

    // HSN Summary calculation - distribute invoice GST proportionally
    const hsnSummary = useMemo(() => {
        const summary = {};
        let totalTaxable = 0;

        // First pass: calculate taxable amounts per HSN
        items.forEach(item => {
            const hsn = item.hsn_code || 'NIL';
            const gstRate = item.gst_rate || 0;
            const key = `${hsn}_${gstRate}`;
            if (!summary[key]) {
                summary[key] = { hsn, gst_rate: gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
            }
            const taxable = item.amount || 0;
            summary[key].taxable += taxable;
            totalTaxable += taxable;
        });

        // Second pass: distribute GST proportionally
        const invoiceCGST = invoice?.cgst_amount || 0;
        const invoiceSGST = invoice?.sgst_amount || 0;
        const invoiceIGST = invoice?.igst_amount || 0;
        const totalInvoiceGST = invoiceCGST + invoiceSGST + invoiceIGST;

        Object.values(summary).forEach(row => {
            const proportion = totalTaxable > 0 ? row.taxable / totalTaxable : 0;

            // If items have GST rates, use them; otherwise distribute invoice GST
            if (row.gst_rate > 0) {
                if (columnVisibility.isIGST) {
                    row.igst = (row.taxable * row.gst_rate) / 100;
                } else {
                    row.cgst = (row.taxable * row.gst_rate) / 200;
                    row.sgst = (row.taxable * row.gst_rate) / 200;
                }
            } else if (totalInvoiceGST > 0) {
                // Distribute invoice GST proportionally
                row.cgst = Math.round(invoiceCGST * proportion * 100) / 100;
                row.sgst = Math.round(invoiceSGST * proportion * 100) / 100;
                row.igst = Math.round(invoiceIGST * proportion * 100) / 100;
                // Calculate effective GST rate
                const itemGST = row.cgst + row.sgst + row.igst;
                row.gst_rate = row.taxable > 0 ? Math.round((itemGST / row.taxable) * 100 * 10) / 10 : 0;
            }

            row.total = row.taxable + row.cgst + row.sgst + row.igst;
        });

        return Object.values(summary);
    }, [items, invoice, columnVisibility.isIGST]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    const formatNumber = (num) => {
        return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const numberToWords = (num) => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        if (num === 0) return 'Zero Rupees Only';
        num = Math.round(num);

        const crore = Math.floor(num / 10000000);
        const lakh = Math.floor((num % 10000000) / 100000);
        const thousand = Math.floor((num % 100000) / 1000);
        const hundred = Math.floor((num % 1000) / 100);
        const remainder = Math.floor(num % 100);

        let words = '';
        if (crore > 0) words += `${convertLessThanHundred(crore)} Crore `;
        if (lakh > 0) words += `${convertLessThanHundred(lakh)} Lakh `;
        if (thousand > 0) words += `${convertLessThanHundred(thousand)} Thousand `;
        if (hundred > 0) words += `${ones[hundred]} Hundred `;
        if (remainder > 0) words += convertLessThanHundred(remainder);

        words += ' Rupees Only';
        return words.trim();

        function convertLessThanHundred(n) {
            if (n < 20) return ones[n];
            return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        }
    };

    // Generate Professional PDF using jsPDF
    const generatePDF = async (action = 'download') => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;
        let y = 15;

        // --- STYLES ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);

        // --- HEADER ---
        // Header Box
        const headerH = 30; // Compact height
        doc.rect(margin, y, pageWidth - 2 * margin, headerH);

        // Vertical Divider
        const midX = margin + (pageWidth - 2 * margin) * 0.55; // 55% Left, 45% Right for better balance
        doc.line(midX, y, midX, y + headerH);

        // LEFT: Company Info
        let leftY = y + 5;
        const leftX = margin + 4;
        const maxLeftW = midX - leftX - 2;

        doc.setFontSize(12); // Slightly smaller but bold
        doc.setFont('helvetica', 'bold');

        // Handle long company names by wrapping
        const companyName = companyInfo?.name || 'Company Name';
        const nameLines = doc.splitTextToSize(companyName, maxLeftW);
        doc.text(nameLines, leftX, leftY);
        leftY += (nameLines.length * 5); // Dynamic height adjustment

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        if (companyInfo?.phone) {
            doc.text(`Contact: ${companyInfo.phone}`, leftX, leftY);
            leftY += 4;
        }
        if (companyInfo?.gstin) {
            doc.text(`GSTIN/UIN: ${companyInfo.gstin}`, leftX, leftY);
            leftY += 4;
        }
        if (companyInfo?.state) {
            doc.text(`State: ${companyInfo.state}`, leftX, leftY);
            leftY += 4;
        }
        if (companyInfo?.address) {
            const addrLines = doc.splitTextToSize(companyInfo.address, maxLeftW);
            doc.text(addrLines, leftX, leftY);
        }

        // RIGHT: Invoice Title & Details
        let rightY = y + 6;
        const rightX = midX + 4;
        const isPurchase = invoice?.voucher_type?.toLowerCase().includes('purchase') || invoice?.voucher_type?.toLowerCase().includes('payment');
        const title = isPurchase ? 'PURCHASE VOUCHER' : 'TAX INVOICE';

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(title, midX + ((pageWidth - margin - midX) / 2), rightY, { align: 'center' });

        const subY1 = y + 10;
        const subY2 = y + 22; // Compacted rows

        doc.line(midX, subY1, pageWidth - margin, subY1);
        doc.line(midX, subY2, pageWidth - margin, subY2);

        // Invoice No | Date
        const subMidX = midX + ((pageWidth - margin - midX) / 2);
        doc.line(subMidX, subY1, subMidX, y + headerH);

        // Row 1: Invoice No | Date
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text("Invoice No.", rightX, subY1 + 4);
        doc.text("Dated", subMidX + 2, subY1 + 4);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(invoice?.invoice_number || '-', rightX, subY1 + 9);
        doc.text(formatDate(invoice?.invoice_date), subMidX + 2, subY1 + 9);

        // Row 2: Mode/Terms
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text("Mode/Terms of Payment", rightX, subY2 + 4);

        y += headerH;

        // --- BORDERS & GRID ---
        const contentStartY = y;

        // --- BILL TO / BUYER SECTION ---
        // Auto-calculate height based on address length
        doc.setFontSize(9);
        const partyAddrLines = invoice?.party_address ? doc.splitTextToSize(invoice.party_address, pageWidth - 2 * margin - 10) : [];
        const partySectionH = Math.max(25, 15 + (partyAddrLines.length * 4)); // Compact dynamic height

        doc.rect(margin, y, pageWidth - 2 * margin, partySectionH);

        let partyY = y + 5;
        // const leftX = margin + 4; // Reusing leftX from above

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        const partyLabel = isPurchase ? 'SUPPLIER (BILL FROM)' : 'BUYER (BILL TO)';
        doc.text(partyLabel, leftX, partyY);
        partyY += 5;

        doc.setFontSize(10);
        doc.text(invoice?.party_ledger_name || 'Cash', leftX, partyY);
        partyY += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        if (partyAddrLines.length > 0) {
            doc.text(partyAddrLines, leftX, partyY);
            partyY += (partyAddrLines.length * 4);
        }

        partyY += 2;
        if (invoice?.party_gstin) {
            doc.setFont('helvetica', 'bold');
            doc.text(`GSTIN/UIN: ${invoice.party_gstin}`, leftX, partyY);
            if (invoice?.party_state || invoice?.place_of_supply) {
                doc.text(`State Name: ${invoice?.party_state || invoice?.place_of_supply}`, leftX + 80, partyY);
            }
            doc.setFont('helvetica', 'normal');
        }

        y += partySectionH; // Move Y past party section

        // --- ITEMS TABLE ---
        const hasItems = items.length > 0;
        const _hasHSN = hasItems && items.some(i => i.hsn_code);
        const _hasGST = hasItems;
        const _hasDisc = columnVisibility.hasDiscount;

        const tableColumns = [
            { header: 'SI No.', dataKey: 'sno' },
            { header: 'Description of Goods', dataKey: 'desc' },
        ];

        if (_hasHSN || true) tableColumns.push({ header: 'HSN/SAC', dataKey: 'hsn' });
        if (_hasGST || true) tableColumns.push({ header: 'GST Rate', dataKey: 'gst' }); // Corrected logic below
        tableColumns.push({ header: 'Quantity', dataKey: 'qty' });
        tableColumns.push({ header: 'Rate', dataKey: 'rate' });
        tableColumns.push({ header: 'Per', dataKey: 'unit' });
        if (_hasDisc) tableColumns.push({ header: 'Disc %', dataKey: 'disc' });
        tableColumns.push({ header: 'Amount', dataKey: 'amount' });

        const tableBody = items.map((item, index) => {
            // Logic to find valid GST Rate: Item Rate > Master Rate > HSN Summary Rate
            let displayGst = 0;
            if (Number(item.gst_rate) > 0) {
                displayGst = Number(item.gst_rate);
            } else {
                const hsnMatch = hsnSummary.find(h => h.hsn === (item.hsn_code || 'NIL'));
                if (hsnMatch && hsnMatch.gst_rate > 0) displayGst = hsnMatch.gst_rate;
            }

            return {
                sno: index + 1,
                desc: item.stock_item_name || 'Item',
                hsn: item.hsn_code || '-',
                gst: displayGst > 0 ? `${displayGst}%` : '0%', // Format cleanly
                qty: item.quantity || 0,
                rate: formatNumber(item.rate),
                unit: item.unit || '',
                disc: item.discount ? `${item.discount}%` : '',
                amount: formatNumber(item.amount)
            };
        });

        autoTable(doc, {
            startY: y,
            columns: tableColumns,
            body: tableBody,
            theme: 'plain',
            styles: {
                lineWidth: 0.1,
                lineColor: [0, 0, 0],
                textColor: [0, 0, 0],
                fontSize: 9,
                valign: 'middle', // Better vertical alignment
                cellPadding: 2,   // More breathing room
            },
            headStyles: {
                fillColor: [255, 255, 255],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                halign: 'center',
                lineWidth: 0.1,
                lineColor: [0, 0, 0]
            },
            columnStyles: {
                sno: { halign: 'center', cellWidth: 10 },
                desc: { halign: 'left' },
                hsn: { halign: 'center', cellWidth: 20 },
                gst: { halign: 'center', cellWidth: 15 },
                qty: { halign: 'right', cellWidth: 20 },
                rate: { halign: 'right', cellWidth: 25 },
                unit: { halign: 'center', cellWidth: 15 },
                disc: { halign: 'center', cellWidth: 15 },
                amount: { halign: 'right', cellWidth: 30 }
            },
            margin: { left: margin, right: margin },
            tableLineWidth: 0.1,
            tableLineColor: [0, 0, 0],
        });

        y = doc.lastAutoTable.finalY;

        // --- TOTALS ROW ---
        doc.line(margin, y, pageWidth - margin, y);
        y += 1;

        const totalQtyVal = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

        // Align totals with columns - simplified approach
        doc.setFont('helvetica', 'bold');
        doc.text('Total', margin + 60, y + 5, { align: 'right' });
        doc.text(totalQtyVal.toString(), pageWidth - margin - 85, y + 5, { align: 'right' }); // Approx Qty col
        doc.text(formatNumber(invoice.taxable_amount), pageWidth - margin - 2, y + 5, { align: 'right' }); // Amount col

        y += 6;
        doc.line(margin, y, pageWidth - margin, y);

        // --- AMOUNT IN WORDS & TAXES ---
        const bottomSectionStart = y;

        // Left: Amount in words
        doc.setFontSize(9);
        doc.text('Amount Chargeable (in words)', margin + 2, y + 4);
        doc.setFont('helvetica', 'bold');

        const words = numberToWords(invoice?.net_amount || 0);
        const wordLines = doc.splitTextToSize(words, (pageWidth / 2) - 10);
        doc.text(wordLines, margin + 2, y + 9);

        // Right: Tax Breakdown
        let taxY = y + 2;
        const rightXStart = pageWidth - 80;

        doc.line(rightXStart, y, rightXStart, y + 40);

        const drawTaxRow = (label, amount) => {
            if (amount !== 0) {
                doc.setFont('helvetica', 'normal');
                doc.text(label, rightXStart + 2, taxY + 3);
                doc.setFont('helvetica', 'bold');
                doc.text(formatNumber(amount), pageWidth - margin - 2, taxY + 3, { align: 'right' });
                taxY += 5;
            }
        };

        if (invoice?.cgst_amount) drawTaxRow('CGST Amount', invoice.cgst_amount);
        if (invoice?.sgst_amount) drawTaxRow('SGST Amount', invoice.sgst_amount);
        if (invoice?.igst_amount) drawTaxRow('IGST Amount', invoice.igst_amount);
        if (invoice?.discount_amount) drawTaxRow('Discount', -Math.abs(invoice.discount_amount)); // Show as negative
        if (invoice?.round_off) drawTaxRow('Round Off', invoice.round_off);

        // Grand Total Line
        doc.line(rightXStart, taxY, pageWidth - margin, taxY);
        taxY += 5;
        doc.text('Total (INR)', rightXStart + 2, taxY);
        doc.text(formatNumber(invoice.net_amount), pageWidth - margin - 2, taxY, { align: 'right' });

        y = Math.max(y + 10, taxY + 2);
        y = Math.max(y, bottomSectionStart + 30); // Reduced min height

        doc.line(margin, y, pageWidth - margin, y);

        // --- TAX ANALYSIS (HSN SUMMARY) ---
        if (columnVisibility.hasGST && hsnSummary.length > 0) {
            y += 4;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text("Tax Analysis:", margin, y);
            y += 2;

            const taxColumns = [
                { header: 'HSN/SAC', dataKey: 'hsn' },
                { header: 'Taxable Value', dataKey: 'taxable', halign: 'right' },
            ];

            if (columnVisibility.isIGST) {
                taxColumns.push({ header: 'IGST Rate', dataKey: 'rate', halign: 'center' });
                taxColumns.push({ header: 'IGST Amount', dataKey: 'tax', halign: 'right' });
            } else {
                taxColumns.push({ header: 'CGST Rate', dataKey: 'crate', halign: 'center' });
                taxColumns.push({ header: 'CGST Amount', dataKey: 'cval', halign: 'right' });
                taxColumns.push({ header: 'SGST Rate', dataKey: 'srate', halign: 'center' });
                taxColumns.push({ header: 'SGST Amount', dataKey: 'sval', halign: 'right' });
            }
            taxColumns.push({ header: 'Total Tax', dataKey: 'total_tax', halign: 'right' });

            const taxBody = hsnSummary.map(row => {
                const base = {
                    hsn: row.hsn,
                    taxable: formatNumber(row.taxable),
                    total_tax: formatNumber(row.total - row.taxable)
                };

                if (columnVisibility.isIGST) {
                    return { ...base, rate: `${row.gst_rate}%`, tax: formatNumber(row.igst) };
                } else {
                    return {
                        ...base,
                        crate: `${row.gst_rate / 2}%`,
                        cval: formatNumber(row.cgst),
                        srate: `${row.gst_rate / 2}%`,
                        sval: formatNumber(row.sgst)
                    };
                }
            });

            autoTable(doc, {
                startY: y,
                columns: taxColumns,
                body: taxBody,
                theme: 'plain',
                styles: { lineWidth: 0.1, lineColor: [0, 0, 0], textColor: [0, 0, 0], fontSize: 7, cellPadding: 1, overflow: 'linebreak' },
                headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0], halign: 'center' },
                columnStyles: {
                    hsn: { halign: 'center' },
                    taxable: { halign: 'right' },
                    rate: { halign: 'center' },
                    tax: { halign: 'right' },
                    crate: { halign: 'center' },
                    cval: { halign: 'right' },
                    srate: { halign: 'center' },
                    sval: { halign: 'right' },
                    total_tax: { halign: 'right' }
                },
                margin: { left: margin, right: margin },
                tableLineWidth: 0.1,
                tableLineColor: [0, 0, 0],
            });

            y = doc.lastAutoTable.finalY + 2;
        } else {
            y += 2;
        }

        // --- FOOTER (Bank & Sign) ---
        const footerY = y;
        const footerH = 30;
        const contentW = pageWidth - 2 * margin;

        if (upiId) {
            // 3 Columns: Bank (40%), QR (20%), Sign (40%)
            const col1X = margin + (contentW * 0.4);
            const col2X = margin + (contentW * 0.6);

            doc.line(col1X, footerY, col1X, footerY + footerH);
            doc.line(col2X, footerY, col2X, footerY + footerH);

            // Fetch and Draw QR
            try {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(companyInfo?.name || '')}&am=${invoice.net_amount}&cu=INR`)}`;

                const loadImage = (src) => new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = src;
                });

                const qrImg = await loadImage(qrUrl);
                const qrSize = 20;
                const qrX = col1X + ((col2X - col1X) - qrSize) / 2;
                const qrY = footerY + (footerH - qrSize) / 2 - 2;
                doc.addImage(qrImg, 'PNG', qrX, qrY, qrSize, qrSize);
                doc.setFontSize(8);
                doc.text("Scan to Pay", col1X + ((col2X - col1X) / 2), qrY + qrSize + 4, { align: 'center' });

            } catch (err) {
                console.error("Failed to load QR for PDF", err);
            }
        } else {
            const middleX = pageWidth / 2;
            doc.line(middleX, footerY, middleX, footerY + footerH); // Vertical split
        }

        // Left: Bank Details
        doc.setFontSize(9);
        doc.text('Company\'s Bank Details', margin + 2, footerY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(`Bank Name: ${companyInfo?.bank_name || '-'}`, margin + 2, footerY + 9);
        doc.text(`A/C No: ${companyInfo?.bank_account || '-'}`, margin + 2, footerY + 14);
        doc.text(`IFS Code: ${companyInfo?.bank_ifsc || '-'}`, margin + 2, footerY + 19);
        if (companyInfo?.bank_branch) {
            doc.text(`Branch: ${companyInfo?.bank_branch}`, margin + 2, footerY + 24);
        }
        doc.setFont('helvetica', 'normal');

        // Right: Signature
        doc.text(`for ${companyInfo?.name}`, pageWidth - margin - 2, footerY + 4, { align: 'right' });
        doc.setFontSize(8);
        doc.text('Authorized Signatory', pageWidth - margin - 2, footerY + 28, { align: 'right' });

        // Bottom border
        doc.rect(margin, contentStartY, pageWidth - 2 * margin, (footerY + 30) - contentStartY); // Re-draw outer box to be sure it covers all

        const filename = `Invoice_${invoice?.invoice_number || 'Draft'}.pdf`;

        if (action === 'share') {
            const blob = doc.output('blob');
            const file = new File([blob], filename, { type: 'application/pdf' });
            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: filename,
                    text: `Invoice #${invoice?.invoice_number} from ${companyInfo?.name}`
                });
            } else {
                console.warn('Web Share API not supported or validation failed');
                // Fallback to download
                doc.save(filename);
            }
        } else {
            doc.save(filename);
        }
    };

    const handleWhatsAppShare = () => {
        const message = `*TAX INVOICE*
    -------------------
    *Invoice #${invoice?.invoice_number}*
    Date: ${formatDate(invoice?.invoice_date)}

    *From:*
    ${companyInfo?.name}
    GSTIN: ${companyInfo?.gstin || 'N/A'}

    *To:*
    ${invoice?.party_ledger_name}
    GSTIN: ${invoice?.party_gstin || 'N/A'}

    -------------------
    *Amount Details:*

    Taxable: ${formatCurrency(invoice?.taxable_amount)}
    ${invoice?.cgst_amount > 0 ? `CGST: ${formatCurrency(invoice?.cgst_amount)}` : ''}
    ${invoice?.sgst_amount > 0 ? `SGST: ${formatCurrency(invoice?.sgst_amount)}` : ''}
    ${invoice?.igst_amount > 0 ? `IGST: ${formatCurrency(invoice?.igst_amount)}` : ''}
    -------------------
    *TOTAL: ${formatCurrency(invoice?.net_amount)}*
    -------------------

    Thank you for your business!
    Generated via JLS BillBook`;

        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    };

    if (!selectedCompany) {
        return <div className="page-m3 flex justify-center items-center"><p>Please select a company first</p></div>;
    }

    if (loading && !invoice) {
        return (
            <div className="page-m3">
                <div className="page-m3__loading">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700 mb-2"></div>
                    <p className="text-sm text-gray-500">Loading Invoice...</p>
                </div>
            </div>
        );
    }

    if (!invoice) {
        return <div className="page-m3 flex justify-center items-center"><p>Invoice not found</p></div>;
    }

    const totalQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);

    return (
        <div className="bg-[#f8f9fa] min-h-screen pb-10 font-sans">
            {/* Header Actions Portal */}
            <HeaderPortal type="title">
                <div className="flex flex-col">
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] tracking-tighter uppercase leading-none">Invoice #{invoice?.invoice_number}</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{invoice?.voucher_type} - {formatDate(invoice?.invoice_date)}</p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <div className="flex items-center gap-1 md:gap-2">
                    <button
                        onClick={handleWhatsAppShare}
                        className="p-1.5 md:p-2 md:px-3 md:py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg md:rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                        title="WhatsApp"
                    >
                        <MessageCircle size={16} />
                        <span className="hidden md:inline text-[10px] font-bold uppercase tracking-wider">WhatsApp</span>
                    </button>
                    <button
                        onClick={() => generatePDF('share')}
                        className="p-1.5 md:p-2 md:px-3 md:py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg md:rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                        title="Share"
                    >
                        <Share size={16} />
                        <span className="hidden md:inline text-[10px] font-bold uppercase tracking-wider">Share</span>
                    </button>
                    <button
                        onClick={() => generatePDF('download')}
                        className="p-1.5 md:p-2 md:px-3 md:py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg md:rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                        title="Download"
                    >
                        <Download size={16} />
                        <span className="hidden md:inline text-[10px] font-bold uppercase tracking-wider">Download</span>
                    </button>
                    <button
                        onClick={() => navigate(`/edit-invoice/${id}`)}
                        className="p-1.5 md:p-2 md:px-3 md:py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg md:rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                        title="Edit"
                    >
                        <Edit size={16} />
                        <span className="hidden md:inline text-[10px] font-bold uppercase tracking-wider">Edit</span>
                    </button>
                </div>
            </HeaderPortal>

            {/* Universal Document Preview (Scales for Mobile) */}
            <div className="w-full flex justify-center items-start overflow-hidden">
                <div className="relative w-full">
                    <div
                        className="shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] bg-white border border-gray-300 printable-content text-slate-900 mx-auto"
                        style={{
                            width: isMobile ? '100%' : `${210 * scale}mm`,
                            transformOrigin: 'top center',
                            transition: 'width 0.2s ease-out',
                            color: '#0f172a',
                            WebkitTextFillColor: '#0f172a'
                        }}
                    >
                        <div className={`${isMobile ? 'p-2' : 'p-6 md:p-8'} h-full flex flex-col relative`}>
                            {/* Tally Style Border Container */}
                            <div className="border-2 border-black h-full flex flex-col text-[10px] md:text-xs">

                                {/* Header Section - Tally Style: Only show fields that have data */}
                                <div className="border-b-2 border-black">
                                    {/* Mobile: All-in-one compact row */}
                                    <div className="md:hidden">
                                        <div className="flex items-center justify-between p-1 border-b border-black bg-gray-50">
                                            <span className="text-[8px] font-bold uppercase">Tax Invoice</span>
                                            <span className="text-[7px] font-bold">#{invoice.invoice_number}</span>
                                            <span className="text-[7px]">{formatDate(invoice.invoice_date)}</span>
                                        </div>
                                        <div className="grid grid-cols-[1fr_auto] gap-x-2 p-1">
                                            <div className="min-w-0">
                                                <p className="text-[9px] font-black uppercase truncate">{companyInfo?.name}</p>
                                                {companyInfo?.gstin && <p className="text-[7px]"><span className="font-semibold">GSTIN:</span> {companyInfo.gstin}</p>}
                                                {companyInfo?.state && <p className="text-[7px]">{companyInfo.state}</p>}
                                            </div>
                                            <div className="text-right text-[7px] space-y-px">
                                                {companyInfo?.address && <p className="truncate max-w-[120px]">{companyInfo.address}</p>}
                                                {invoice.payment_mode && <p className="font-semibold">{invoice.payment_mode}</p>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Desktop: Full Tally-style layout */}
                                    <div className="hidden md:grid md:grid-cols-2">
                                        {/* Company Info - Left */}
                                        <div className="p-4 border-r-2 border-black flex flex-col justify-center">
                                            <h1 className="text-lg font-bold uppercase tracking-tight mb-1">{companyInfo?.name}</h1>

                                            {(companyInfo?.address) && (
                                                <p className="text-xs whitespace-pre-wrap leading-tight mb-2">
                                                    {companyInfo?.address}
                                                </p>
                                            )}

                                            <div className="text-xs space-y-0">
                                                {(companyInfo?.gstin) && (
                                                    <p><span className="font-semibold">GSTIN/UIN:</span> {companyInfo.gstin}</p>
                                                )}
                                                {(companyInfo?.state) && (
                                                    <p><span className="font-semibold">State:</span> {companyInfo.state}</p>
                                                )}
                                                {(companyInfo?.email) && (
                                                    <p><span className="font-semibold">Email:</span> {companyInfo.email}</p>
                                                )}
                                                {(companyInfo?.phone) && (
                                                    <p><span className="font-semibold">Contact:</span> {companyInfo.phone}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Invoice Info - Right (Tally: only show filled fields) */}
                                        <div className="flex flex-col">
                                            <div className="p-2 border-b-2 border-black text-center bg-gray-50">
                                                <h2 className="text-base font-bold uppercase tracking-wider">
                                                    {invoice.voucher_type?.toLowerCase().includes('purchase') ? 'Purchase Voucher' : 'Tax Invoice'}
                                                </h2>
                                            </div>
                                            <div className="flex-grow text-xs">
                                                {/* Invoice No & Date - always shown */}
                                                <div className="grid grid-cols-2">
                                                    <div className="p-2 border-r border-black border-b border-black">
                                                        <p className="font-semibold">Invoice No.</p>
                                                        <p className="font-bold text-sm">{invoice.invoice_number}</p>
                                                    </div>
                                                    <div className="p-2 border-b border-black">
                                                        <p className="font-semibold">Dated</p>
                                                        <p className="font-bold">{formatDate(invoice.invoice_date)}</p>
                                                    </div>
                                                </div>
                                                {/* Only show Delivery Note / Mode of Payment if data exists */}
                                                {(invoice.delivery_note || invoice.payment_mode || invoice.voucher_type) && (
                                                    <div className="grid grid-cols-2">
                                                        {invoice.delivery_note ? (
                                                            <div className="p-2 border-r border-black border-b border-black">
                                                                <p className="font-semibold">Delivery Note</p>
                                                                <p>{invoice.delivery_note}</p>
                                                            </div>
                                                        ) : (
                                                            <div className="p-2 border-r border-black border-b border-black"></div>
                                                        )}
                                                        <div className="p-2 border-b border-black">
                                                            <p className="font-semibold">Mode/Terms</p>
                                                            <p>{invoice.payment_mode || invoice.voucher_type}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Buyer's Order - only if exists */}
                                                {(invoice.buyers_order_number || invoice.dispatch_through || invoice.destination) && (
                                                    <div className="grid grid-cols-2">
                                                        <div className="p-2 border-r border-black">
                                                            {invoice.buyers_order_number && (
                                                                <><p className="font-semibold">Buyer's Order No.</p><p>{invoice.buyers_order_number}</p></>
                                                            )}
                                                            {invoice.dispatch_through && (
                                                                <><p className="font-semibold mt-1">Dispatch Through</p><p>{invoice.dispatch_through}</p></>
                                                            )}
                                                        </div>
                                                        <div className="p-2">
                                                            {invoice.destination && (
                                                                <><p className="font-semibold">Destination</p><p>{invoice.destination}</p></>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Buyer Info */}
                                <div className="border-b-2 border-black p-0">
                                    {/* Mobile: Compact single-line buyer */}
                                    <div className="md:hidden flex items-center justify-between p-1 bg-gray-100 border-b border-black">
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[7px] font-bold uppercase">Buyer: </span>
                                            <span className="text-[8px] font-black uppercase truncate">{invoice.party_ledger_name}</span>
                                            {invoice.party_gstin && <span className="text-[7px] ml-1">GSTIN: {invoice.party_gstin}</span>}
                                        </div>
                                        {(invoice.party_state || invoice.place_of_supply) && (
                                            <span className="text-[7px] shrink-0 ml-1">{invoice.party_state || invoice.place_of_supply}</span>
                                        )}
                                    </div>
                                    {/* Desktop: Full buyer details */}
                                    <div className="hidden md:block">
                                        <div className="bg-gray-100 px-2 py-1 text-[10px] font-bold border-b border-black uppercase">Buyer (Bill to)</div>
                                        <div className="p-2 text-[10px]">
                                            <p
                                                className="font-bold text-sm uppercase cursor-pointer hover:text-blue-600 transition-colors"
                                                onClick={() => invoice.party_ledger_id && navigate(`/ledgers/${invoice.party_ledger_id}`)}
                                            >
                                                {invoice.party_ledger_name}
                                            </p>
                                            <p className="whitespace-pre-wrap max-w-md my-1">{invoice.party_address || ''}</p>
                                            <div className="flex gap-4 mt-2">
                                                {invoice.party_gstin && <p><span className="font-semibold">GSTIN/UIN:</span> {invoice.party_gstin}</p>}
                                                {(invoice.party_state || invoice.place_of_supply) && (
                                                    <p><span className="font-semibold">State Name:</span> {invoice.party_state || invoice.place_of_supply}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Items Table - Tally Style: only show columns that have data */}
                                <div className="flex-grow flex flex-col border-b-2 border-black relative overflow-x-auto">
                                    {/* Table Header */}
                                    <div className={`flex text-[7px] md:text-[10px] font-bold border-b border-black text-center bg-gray-50 ${isMobile ? 'overflow-x-auto' : 'min-w-[400px]'}`}>
                                        <div className="w-5 md:w-10 p-0.5 md:p-1.5 border-r border-black">#</div>
                                        <div className="flex-1 min-w-[60px] p-0.5 md:p-1.5 border-r border-black text-left">Description</div>
                                        {columnVisibility.hasHSN && <div className="w-8 md:w-16 p-0.5 md:p-1.5 border-r border-black hidden sm:block">HSN</div>}
                                        {columnVisibility.hasGST && <div className="w-7 md:w-12 p-0.5 md:p-1.5 border-r border-black hidden md:block">GST</div>}
                                        {columnVisibility.hasQty && <div className="w-7 md:w-14 p-0.5 md:p-1.5 border-r border-black">Qty</div>}
                                        {columnVisibility.hasRate && <div className="w-10 md:w-20 p-0.5 md:p-1.5 border-r border-black">Rate</div>}
                                        {columnVisibility.hasUnit && <div className="w-5 md:w-10 p-0.5 md:p-1.5 border-r border-black hidden md:block">Per</div>}
                                        {columnVisibility.hasDiscount && <div className="w-8 md:w-16 p-0.5 md:p-1.5 border-r border-black hidden lg:block">Disc</div>}
                                        <div className="w-12 md:w-24 p-0.5 md:p-1.5 text-right">Amount</div>
                                    </div>

                                    {/* Table Body - Rows */}
                                    <div className={`flex-grow text-[8px] md:text-[10px] relative ${isMobile ? '' : 'min-w-[400px]'}`}>
                                        {items.map((item, idx) => {
                                            const hsnData = hsnSummary.find(h => h.hsn === (item.hsn_code || 'NIL'));
                                            const displayGstRate = item.gst_rate > 0 ? item.gst_rate : (hsnData?.gst_rate || 0);

                                            return (
                                                <div key={idx} className="flex border-b border-gray-300 last:border-0 sticky-row">
                                                    <div className="w-5 md:w-10 p-0.5 md:p-1.5 border-r border-black text-center">{idx + 1}</div>
                                                    <div className="flex-1 min-w-[60px] p-0.5 md:p-1.5 border-r border-black font-semibold text-left">
                                                        <span
                                                            className="cursor-pointer hover:text-blue-600 transition-colors"
                                                            onClick={() => item.stock_item_id && navigate(`/stock/${item.stock_item_id}`)}
                                                        >
                                                            {item.stock_item_name}
                                                        </span>
                                                    </div>
                                                    {columnVisibility.hasHSN && <div className="w-8 md:w-16 p-0.5 md:p-1.5 border-r border-black text-center hidden sm:block">{item.hsn_code || ''}</div>}
                                                    {columnVisibility.hasGST && <div className="w-7 md:w-12 p-0.5 md:p-1.5 border-r border-black text-center hidden md:block">{displayGstRate > 0 ? `${displayGstRate}%` : ''}</div>}
                                                    {columnVisibility.hasQty && <div className="w-7 md:w-14 p-0.5 md:p-1.5 border-r border-black text-center font-bold">{item.quantity}</div>}
                                                    {columnVisibility.hasRate && <div className="w-10 md:w-20 p-0.5 md:p-1.5 border-r border-black text-right">{formatNumber(item.rate)}</div>}
                                                    {columnVisibility.hasUnit && <div className="w-5 md:w-10 p-0.5 md:p-1.5 border-r border-black text-center hidden md:block">{item.unit}</div>}
                                                    {columnVisibility.hasDiscount && <div className="w-8 md:w-16 p-0.5 md:p-1.5 border-r border-black text-right hidden lg:block">
                                                        {(Number(item.discount) > 0 || Number(item.discount_percent) > 0) ? (item.discount || item.discount_percent) + '%' : ''}
                                                    </div>}
                                                    <div className="w-12 md:w-24 p-0.5 md:p-1.5 text-right font-bold">{formatNumber(item.amount)}</div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Totals Row */}
                                    <div className="flex border-t-2 border-black font-bold text-[8px] md:text-[10px] bg-gray-50">
                                        <div className="w-5 md:w-10 p-0.5 md:p-1.5 border-r border-black text-center"></div>
                                        <div className="flex-1 min-w-[60px] p-0.5 md:p-1.5 border-r border-black text-right font-bold">Total</div>
                                        {columnVisibility.hasHSN && <div className="w-8 md:w-16 p-0.5 md:p-1.5 border-r border-black hidden sm:block"></div>}
                                        {columnVisibility.hasGST && <div className="w-7 md:w-12 p-0.5 md:p-1.5 border-r border-black hidden md:block"></div>}
                                        {columnVisibility.hasQty && <div className="w-7 md:w-14 p-0.5 md:p-1.5 border-r border-black text-center font-bold">{totalQty}</div>}
                                        {columnVisibility.hasRate && <div className="w-10 md:w-20 p-0.5 md:p-1.5 border-r border-black"></div>}
                                        {columnVisibility.hasUnit && <div className="w-5 md:w-10 p-0.5 md:p-1.5 border-r border-black hidden md:block"></div>}
                                        {columnVisibility.hasDiscount && <div className="w-8 md:w-16 p-0.5 md:p-1.5 border-r border-black hidden lg:block"></div>}
                                        <div className="w-12 md:w-24 p-0.5 md:p-1.5 text-right font-bold">{formatNumber(invoice.taxable_amount)}</div>
                                    </div>
                                </div>

                                {/* Bottom Section: Words & Tax Breakdown */}
                                <div className="grid grid-cols-1 md:grid-cols-2 border-b-2 border-black text-[8px] md:text-[10px]">
                                    {/* Left: Amount in Words */}
                                    <div className="p-1 md:p-2 border-r-0 md:border-r-2 border-black">
                                        <p className="text-[7px] md:text-[10px] text-gray-500 mb-0.5">Amount Chargeable (in words)</p>
                                        <p className="font-bold italic text-[9px] md:text-sm">{numberToWords(invoice.net_amount)}</p>
                                    </div>

                                    {/* Right: Tax Amounts */}
                                    <div className="text-right">
                                        {invoice.cgst_amount > 0 && (
                                            <div className="flex justify-between p-0.5 md:p-1.5 border-b border-dotted border-gray-400">
                                                <span className="italic px-1 md:px-2">CGST Amount</span>
                                                <span className="font-semibold px-1 md:px-2">{formatNumber(invoice.cgst_amount)}</span>
                                            </div>
                                        )}
                                        {invoice.sgst_amount > 0 && (
                                            <div className="flex justify-between p-0.5 md:p-1.5 border-b border-dotted border-gray-400">
                                                <span className="italic px-1 md:px-2">SGST Amount</span>
                                                <span className="font-semibold px-1 md:px-2">{formatNumber(invoice.sgst_amount)}</span>
                                            </div>
                                        )}
                                        {invoice.igst_amount > 0 && (
                                            <div className="flex justify-between p-0.5 md:p-1.5 border-b border-dotted border-gray-400">
                                                <span className="italic px-1 md:px-2">IGST Amount</span>
                                                <span className="font-semibold px-1 md:px-2">{formatNumber(invoice.igst_amount)}</span>
                                            </div>
                                        )}
                                        {columnVisibility.hasRoundOff && (
                                            <div className="flex justify-between p-0.5 md:p-1.5 border-b border-dotted border-gray-400">
                                                <span className="italic px-1 md:px-2">Round Off</span>
                                                <span className="font-semibold px-1 md:px-2">{formatNumber(invoice.round_off)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between p-1 md:p-2 bg-gray-100 font-bold text-[9px] md:text-sm border-t border-black">
                                            <span>Total (INR)</span>
                                            <span>INR {formatNumber(invoice.net_amount)}</span>
                                        </div>
                                    </div>
                                </div>
                                {/* HSN/SAC Summary (If GST) */}
                                {columnVisibility.hasGST && (
                                    <div className="border-b-2 border-black p-1 md:p-2">
                                        <p className="text-[7px] md:text-[10px] font-bold underline mb-1">Tax Analysis:</p>
                                        <div className="overflow-x-auto">
                                        <table className="w-full text-[7px] md:text-[9px] border border-black text-center min-w-[300px]">
                                            <thead>
                                                <tr className="bg-gray-100 border-b border-black">
                                                    <th className="border-r border-black">HSN/SAC</th>
                                                    <th className="border-r border-black">Taxable Value</th>
                                                    {columnVisibility.isIGST ? (
                                                        <>
                                                            <th className="border-r border-black" colSpan="2">Integrated Tax</th>
                                                            <th>Total Tax</th>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <th className="border-r border-black" colSpan="2">Central Tax</th>
                                                            <th className="border-r border-black" colSpan="2">State Tax</th>
                                                            <th>Total Tax</th>
                                                        </>
                                                    )}
                                                </tr>
                                                <tr className="bg-gray-50 border-b border-black">
                                                    <th className="border-r border-black"></th>
                                                    <th className="border-r border-black"></th>
                                                    {columnVisibility.isIGST ? (
                                                        <>
                                                            <th className="border-r border-black">Rate</th>
                                                            <th className="border-r border-black">Amount</th>
                                                            <th>Amount</th>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <th className="border-r border-black">Rate</th>
                                                            <th className="border-r border-black">Amount</th>
                                                            <th className="border-r border-black">Rate</th>
                                                            <th className="border-r border-black">Amount</th>
                                                            <th>Amount</th>
                                                        </>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {hsnSummary.map((row, i) => (
                                                    <tr key={i} className="border-b border-gray-300 last:border-0">
                                                        <td className="border-r border-black p-1">{row.hsn}</td>
                                                        <td className="border-r border-black p-1 text-right">{formatNumber(row.taxable)}</td>
                                                        {columnVisibility.isIGST ? (
                                                            <>
                                                                <td className="border-r border-black p-1">{row.gst_rate}%</td>
                                                                <td className="border-r border-black p-1 text-right">{formatNumber(row.igst)}</td>
                                                                <td className="p-1 text-right">{formatNumber(row.total)}</td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td className="border-r border-black p-1">{row.gst_rate / 2}%</td>
                                                                <td className="border-r border-black p-1 text-right">{formatNumber(row.cgst)}</td>
                                                                <td className="border-r border-black p-1">{row.gst_rate / 2}%</td>
                                                                <td className="border-r border-black p-1 text-right">{formatNumber(row.sgst)}</td>
                                                                <td className="p-1 text-right">{formatNumber(row.total)}</td>
                                                            </>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        </div>
                                    </div>
                                )}

                                {/* Footer Section - Tally: only show bank if filled */}
                                {/* Mobile: Compact footer */}
                                <div className="md:hidden min-h-[3rem]">
                                    <div className="grid grid-cols-2 gap-0 text-[7px]">
                                        {/* Left: Bank + Declaration */}
                                        <div className="p-1 border-r border-b border-black">
                                            {(companyInfo?.bank_name || companyInfo?.bank_account) && (
                                                <div className="mb-0.5">
                                                    <p className="font-bold underline">Bank Details:</p>
                                                    {companyInfo?.bank_name && <p>{companyInfo.bank_name}</p>}
                                                    {companyInfo?.bank_account && <p>A/C: {companyInfo.bank_account}</p>}
                                                    {companyInfo?.bank_ifsc && <p>IFSC: {companyInfo.bank_ifsc}</p>}
                                                </div>
                                            )}
                                            <p className="text-[6px] opacity-70">We declare that this invoice shows the actual price of the goods described.</p>
                                        </div>
                                        {/* Right: QR + Signatory */}
                                        <div className="p-1 flex flex-col items-center justify-between">
                                            {upiId && (
                                                <img
                                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(companyInfo?.name || '')}&am=${invoice.net_amount}&cu=INR`)}`}
                                                    alt="UPI QR"
                                                    className="w-8 h-8 mix-blend-multiply"
                                                    crossOrigin="anonymous"
                                                />
                                            )}
                                            <p className="text-right w-full text-[6px] mt-0.5">for <span className="font-bold">{companyInfo?.name}</span></p>
                                        </div>
                                    </div>
                                </div>

                                {/* Desktop: Full footer */}
                                <div className="hidden md:grid md:grid-cols-5 flex-grow min-h-[8rem]">
                                    {/* Bank & Terms (40%) */}
                                    <div className="col-span-2 border-r-2 border-black p-2 text-[10px] flex flex-col justify-between h-full">
                                        {(companyInfo?.bank_name || companyInfo?.bank_account) ? (
                                            <div>
                                                <p className="font-bold underline mb-1">Company's Bank Details:</p>
                                                {companyInfo?.bank_name && <p>Bank Name: <span className="font-semibold">{companyInfo.bank_name}</span></p>}
                                                {companyInfo?.bank_account && <p>A/C No.: <span className="font-semibold">{companyInfo.bank_account}</span></p>}
                                                {companyInfo?.bank_ifsc && <p>Branch & IFS Code: <span className="font-semibold">{companyInfo.bank_ifsc}</span></p>}
                                            </div>
                                        ) : <div />}
                                        <div className="mt-2 text-[10px]">
                                            <p className="underline mb-0.5">Declaration:</p>
                                            <p>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>
                                        </div>
                                    </div>

                                    {/* QR Code (20%) */}
                                    <div className="col-span-1 border-r-2 border-black flex flex-col items-center justify-center p-2">
                                        {upiId && (
                                            <>
                                                <div className="bg-white p-0.5">
                                                    <img
                                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(companyInfo?.name || '')}&am=${invoice.net_amount}&cu=INR`)}`}
                                                        alt="UPI QR"
                                                        className="w-16 h-16 mix-blend-multiply"
                                                        crossOrigin="anonymous"
                                                    />
                                                </div>
                                                <p className="text-[9px] font-bold mt-1 text-center uppercase tracking-tight">Scan to Pay</p>
                                            </>
                                        )}
                                    </div>

                                    {/* Signatory (40%) */}
                                    <div className="col-span-2 p-2 flex flex-col justify-between h-full text-center">
                                        <p className="text-right text-xs font-bold">for {companyInfo?.name}</p>
                                        <div className="h-16"></div>
                                        <div className="text-right">
                                            <p className="border-t border-black inline-block px-8 pt-1 text-xs font-bold">Authorized Signatory</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="text-center text-[7px] md:text-[10px] text-gray-400 mt-1 md:mt-2">
                                SUBJECT TO JURISDICTION | This is a Computer Generated Invoice
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

