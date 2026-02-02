import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Material3.css';

// Number to words converter for Indian currency
const numberToWords = (num) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (num === 0) return 'Zero';

    const crore = Math.floor(num / 10000000);
    const lakh = Math.floor((num % 10000000) / 100000);
    const thousand = Math.floor((num % 100000) / 1000);
    const hundred = Math.floor((num % 1000) / 100);
    const remainder = Math.floor(num % 100);

    let words = '';

    if (crore > 0) {
        words += (crore < 20 ? ones[crore] : tens[Math.floor(crore / 10)] + ' ' + ones[crore % 10]) + ' Crore ';
    }
    if (lakh > 0) {
        words += (lakh < 20 ? ones[lakh] : tens[Math.floor(lakh / 10)] + ' ' + ones[lakh % 10]) + ' Lakh ';
    }
    if (thousand > 0) {
        words += (thousand < 20 ? ones[thousand] : tens[Math.floor(thousand / 10)] + ' ' + ones[thousand % 10]) + ' Thousand ';
    }
    if (hundred > 0) {
        words += ones[hundred] + ' Hundred ';
    }
    if (remainder > 0) {
        if (words !== '') words += 'and ';
        if (remainder < 20) {
            words += ones[remainder];
        } else {
            words += tens[Math.floor(remainder / 10)] + ' ' + ones[remainder % 10];
        }
    }

    return words.trim() + ' Rupees Only';
};

export default function VoucherDetailPage() {
    const { voucherId } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const [voucher, setVoucher] = useState(null);
    const [saleData, setSaleData] = useState(null);
    const [purchaseData, setPurchaseData] = useState(null);
    const [loading, setLoading] = useState(true);
    const printRef = useRef();

    useEffect(() => {
        if (voucherId && selectedCompany) {
            loadVoucherDetails();
        }
    }, [voucherId, selectedCompany]);

    const loadVoucherDetails = async () => {
        setLoading(true);
        try {
            const { data: vData, error: vErr } = await supabase
                .from('vouchers')
                .select('*')
                .eq('voucher_id', decodeURIComponent(voucherId))
                .single();

            if (vErr) throw vErr;
            setVoucher(vData);

            if (vData.voucher_type === 'Sales') {
                // Fetch sales record first
                let { data: sData, error: sErr } = await supabase
                    .from('sales')
                    .select('*')
                    .eq('voucher_id', vData.voucher_id)
                    .single();

                // Synthetic fallback if sales record is missing
                if (!sData) {
                    console.log('⚠️ Sales record missing, creating synthetic record');
                    sData = {
                        id: 'synthetic',
                        net_amount: vData.total_amount,
                        gross_amount: vData.total_amount,
                        party_name: vData.party_name,
                        voucher_number: vData.voucher_number,
                        voucher_date: vData.voucher_date
                    };
                }

                // Fetch items (only if NOT synthetic)
                let itemsData = [];
                if (sData.id !== 'synthetic') {
                    const { data: iData } = await supabase
                        .from('sales_items')
                        .select('*')
                        .eq('sale_id', sData.id);
                    itemsData = iData || [];
                }

                // Fallback to inventory_entries from vouchers table
                let currentItems = itemsData.length > 0 ? itemsData : (vData.inventory_entries || []);

                // Get stock items to enrich HSN and unit data
                const { data: stockItems } = await supabase
                    .from('stock_items')
                    .select('name, hsn_code, base_unit')
                    .eq('company_id', vData.company_id);

                const stockLookup = {};
                stockItems?.forEach(item => stockLookup[item.name] = item);

                // Enrich items
                sData.sales_items = currentItems.map(item => {
                    let disc = item.discount_percent;
                    if ((!disc || disc === 0) && item.rate > 0 && item.quantity > 0) {
                        const idealAmount = item.rate * item.quantity;
                        if (idealAmount > item.amount + 1) { // Tolerance
                            disc = (Math.round(((idealAmount - item.amount) / idealAmount) * 100 * 100) / 100);
                        }
                    }

                    return {
                        ...item,
                        discount_percent: disc,
                        hsn_code: item.hsn_code && item.hsn_code !== 'Stock Item' && item.hsn_code !== 'Stock Group'
                            ? item.hsn_code
                            : stockLookup[item.stock_item_name || item.name]?.hsn_code || '-',
                        unit: item.unit || stockLookup[item.stock_item_name || item.name]?.base_unit || ''
                    };
                });

                // Extract Round Off from ledgers if missing
                if ((!sData.round_off || sData.round_off === 0) && vData.ledger_entries) {
                    const roundLedger = vData.ledger_entries.find(e =>
                        e.ledger_name.toLowerCase().includes('round') &&
                        (e.ledger_name.toLowerCase().includes('off') || e.ledger_name.toLowerCase().includes('ing'))
                    );
                    if (roundLedger) {
                        sData.round_off = roundLedger.is_debit ? -roundLedger.amount : roundLedger.amount;
                    }
                }

                // Extract Taxes if synthetic
                if (sData.id === 'synthetic' && vData.ledger_entries) {
                    sData.cgst_amount = vData.ledger_entries.filter(e => e.ledger_name.toLowerCase().includes('cgst')).reduce((s, e) => s + e.amount, 0);
                    sData.sgst_amount = vData.ledger_entries.filter(e => e.ledger_name.toLowerCase().includes('sgst')).reduce((s, e) => s + e.amount, 0);
                    sData.igst_amount = vData.ledger_entries.filter(e => e.ledger_name.toLowerCase().includes('igst')).reduce((s, e) => s + e.amount, 0);
                    sData.taxable_amount = sData.net_amount - sData.cgst_amount - sData.sgst_amount - sData.igst_amount - (sData.round_off || 0);
                }

                setSaleData(sData);
            }

            if (vData.voucher_type === 'Purchase') {
                // Fetch purchase record first
                const { data: pData } = await supabase
                    .from('purchases')
                    .select('*')
                    .eq('voucher_id', vData.voucher_id)
                    .single();

                if (pData) {
                    // Fetch purchase_items separately
                    const { data: itemsData } = await supabase
                        .from('purchase_items')
                        .select('*')
                        .eq('purchase_id', pData.id);


                    // Fallback to inventory_entries if table items are missing
                    let currentItems = itemsData || [];
                    if (currentItems.length === 0 && vData.inventory_entries) {
                        currentItems = vData.inventory_entries;
                    }

                    pData.purchase_items = currentItems;

                    // Get stock items to enrich HSN and unit data
                    const { data: stockItems } = await supabase
                        .from('stock_items')
                        .select('name, hsn_code, base_unit')
                        .eq('company_id', pData.company_id);

                    // Create lookup map
                    const stockLookup = {};
                    stockItems?.forEach(item => {
                        stockLookup[item.name] = item;
                    });

                    // Enrich terms with HSN and unit from stock master
                    if (pData.purchase_items.length > 0) {
                        pData.purchase_items = pData.purchase_items.map(item => {
                            // Calculate implied discount if missing (Rate * Qty > Amount)
                            let disc = item.discount_percent;
                            if ((!disc || disc === 0) && item.rate > 0 && item.quantity > 0) {
                                const idealAmount = item.rate * item.quantity;
                                if (idealAmount > item.amount) {
                                    const diff = idealAmount - item.amount;
                                    if (diff > 1) { // Tolerance
                                        disc = (diff / idealAmount) * 100;
                                        disc = Math.round(disc * 100) / 100;
                                    }
                                }
                            }

                            return {
                                ...item,
                                discount_percent: disc,
                                hsn_code: item.hsn_code && item.hsn_code !== 'Stock Item' && item.hsn_code !== 'Stock Group'
                                    ? item.hsn_code
                                    : stockLookup[item.stock_item_name || item.name]?.hsn_code || '-',
                                unit: item.unit || stockLookup[item.stock_item_name || item.name]?.base_unit || ''
                            };
                        });
                    }
                    // Extract Round Off from ledgers if missing
                    if ((!pData.round_off || pData.round_off === 0) && vData.ledger_entries) {
                        const rL = vData.ledger_entries.find(e => e.ledger_name.toLowerCase().includes('round') && (e.ledger_name.toLowerCase().includes('off') || e.ledger_name.toLowerCase().includes('ing')));
                        if (rL) pData.round_off = rL.is_debit ? rL.amount : -rL.amount;
                    }
                }
                setPurchaseData(pData);
            }

        } catch (error) {
            console.error('Error loading voucher:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Math.abs(amount) || 0);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const handlePrint = () => {
        window.print();
    };

    const handleWhatsApp = () => {
        const text = encodeURIComponent(
            `*${voucher.voucher_type}: ${voucher.voucher_number}*\n` +
            `Party: ${voucher.party_name}\n` +
            `Amount: ₹${formatCurrency(voucher.total_amount)}\n` +
            `Date: ${formatDate(voucher.voucher_date)}\n\n` +
            `Thank you for your business!`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    if (loading) {
        return (
            <div className="page-m3">
                <div className="page-m3__loading">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700 mb-2"></div>
                    <p>Loading voucher...</p>
                </div>
            </div>
        );
    }

    if (!voucher) {
        return (
            <div className="page-m3" style={{ textAlign: 'center', paddingTop: '48px' }}>
                <span style={{ fontSize: '48px' }}>❌</span>
                <p style={{ marginTop: '16px', color: '#6b7280' }}>Voucher not found</p>
                <button onClick={() => navigate(-1)} className="page-m3__button page-m3__button--secondary" style={{ marginTop: '16px' }}>
                    ← Go Back
                </button>
            </div>
        );
    }

    const detailData = saleData || purchaseData;

    // Get items from sales_items/purchase_items tables, 
    // OR fallback to voucher's inventory_entries JSON (if items table is empty or has no qty)
    let items = saleData?.sales_items || purchaseData?.purchase_items || [];

    // If items exist but first item has no quantity, try voucher's inventory_entries
    if (items.length === 0 || (items.length > 0 && !items[0].quantity && !items[0].rate)) {
        const invEntries = voucher?.inventory_entries || [];
        if (invEntries.length > 0) {
            items = invEntries;
        }
    }

    const isSalesOrPurchase = voucher.voucher_type === 'Sales' || voucher.voucher_type === 'Purchase';
    const voucherTitle = voucher.voucher_type === 'Sales' ? 'TAX INVOICE' :
        voucher.voucher_type === 'Purchase' ? 'PURCHASE VOUCHER' :
            voucher.voucher_type.toUpperCase();

    return (
        <div className="page-m3">
            {/* Header Controls */}
            <div className="page-m3__action-bar print:hidden">
                <button
                    onClick={() => {
                        if (window.history.state && window.history.state.idx > 0) {
                            navigate(-1);
                        } else {
                            navigate('/vouchers');
                        }
                    }}
                    className="page-m3__back-link"
                >
                    <span style={{ marginRight: '8px' }}>←</span>
                    Back
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={handlePrint}
                        className="page-m3__button page-m3__button--secondary"
                    >
                        🖨️ <span className="hidden sm:inline">Print</span>
                    </button>
                    <button
                        onClick={handleWhatsApp}
                        className="page-m3__button page-m3__button--primary"
                    >
                        💬 <span className="hidden sm:inline">WhatsApp</span>
                    </button>
                </div>
            </div>

            {/* Voucher Card */}
            <div ref={printRef} className="page-m3__detail-container">

                {/* Header Section */}
                <div className="page-m3__detail-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <h1 className="page-m3__detail-title">{voucherTitle}</h1>
                            <p style={{ color: '#6b7280', marginTop: '4px' }}>{selectedCompany?.name}</p>
                            {selectedCompany?.address && (
                                <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '2px', maxWidth: '400px' }}>{selectedCompany.address}</p>
                            )}
                            {selectedCompany?.gstin && (
                                <p style={{ fontSize: '14px', color: '#6b7280', fontFamily: 'monospace', marginTop: '4px' }}>GSTIN: {selectedCompany.gstin}</p>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', fontWeight: '500', letterSpacing: '0.5px' }}>Voucher No.</p>
                            <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#1b5e20' }}>{voucher.voucher_number}</p>
                            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', fontSize: '14px', color: '#4b5563' }}>
                                <span>Date:</span>
                                <span style={{ fontWeight: '500' }}>{formatDate(voucher.voucher_date)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Party / Details Section */}
                <div style={{ padding: '24px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', borderBottom: '1px solid #e0e2ec' }}>
                    {/* Party Details */}
                    <div>
                        <h3 className="page-m3__detail-label" style={{ marginBottom: '12px' }}>
                            {voucher.voucher_type === 'Sales' ? 'Buyer' :
                                voucher.voucher_type === 'Purchase' ? 'Seller' : 'Party Details'}
                        </h3>
                        <div style={{ background: '#f8f9fa', padding: '16px', borderRadius: '12px', border: '1px solid #e0e2ec' }}>
                            <p className="page-m3__detail-value" style={{ fontSize: '18px' }}>{voucher.party_name || 'Cash'}</p>
                            {detailData?.party_gstin && (
                                <p style={{ fontSize: '14px', color: '#4b5563', marginTop: '4px', fontFamily: 'monospace' }}>GSTIN: {detailData.party_gstin}</p>
                            )}
                            {detailData?.place_of_supply && (
                                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Place of Supply: {detailData.place_of_supply}</p>
                            )}
                        </div>
                    </div>

                    {/* Amount Summary */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                        <div style={{ background: '#e8f5e9', padding: '16px', borderRadius: '12px', border: '1px solid #c8e6c9', textAlign: 'right' }}>
                            <p className="page-m3__detail-label" style={{ color: '#2e7d32', marginBottom: '4px' }}>Total Amount</p>
                            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#1b5e20' }}>
                                {formatCurrency(detailData?.net_amount || voucher.total_amount)}
                            </p>
                            <p style={{ fontSize: '12px', color: '#2e7d32', marginTop: '4px', fontStyle: 'italic' }}>
                                {numberToWords(Math.round(detailData?.net_amount || voucher.total_amount))}
                            </p>
                        </div>
                    </div>
                </div>

                {/* === ITEMS TABLE (for Sales/Purchase) === */}
                {isSalesOrPurchase && (
                    <div className="page-m3__table-container">
                        {items.length > 0 ? (
                            <table className="page-m3__table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}>#</th>
                                        <th>Item Format</th>
                                        <th style={{ textAlign: 'center', width: '100px' }}>HSN</th>
                                        <th style={{ textAlign: 'center', width: '100px' }}>Qty</th>
                                        <th style={{ textAlign: 'right', width: '120px' }}>Rate</th>
                                        <th style={{ textAlign: 'right', width: '80px' }}>Disc</th>
                                        <th style={{ textAlign: 'right', width: '120px' }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={item.id || idx}>
                                            <td style={{ color: '#9ca3af' }}>{idx + 1}</td>
                                            <td>
                                                <p style={{ fontWeight: '500', color: '#1f2937' }}>{item.stock_item_name || item.name || 'Unknown Item'}</p>
                                            </td>
                                            <td style={{ textAlign: 'center', fontFamily: 'monospace', color: '#6b7280' }}>{item.hsn_code || '-'}</td>
                                            <td style={{ textAlign: 'center', color: '#374151' }}>
                                                <span style={{ fontWeight: '600' }}>{item.quantity}</span>
                                                <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '4px' }}>{item.unit}</span>
                                            </td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#374151' }}>{formatCurrency(item.rate)}</td>
                                            <td style={{ textAlign: 'right', color: '#6b7280' }}>{item.discount_percent ? `${item.discount_percent}%` : '-'}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#111827' }}>{formatCurrency(item.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280', fontStyle: 'italic', background: '#f9fafb' }}>
                                No inventory details found.
                            </div>
                        )}
                    </div>
                )}

                {/* === LEDGER ENTRIES (for Receipt/Payment/Journal) === */}
                {!isSalesOrPurchase && voucher.ledger_entries && voucher.ledger_entries.length > 0 && (
                    <div className="page-m3__table-container">
                        <table className="page-m3__table">
                            <thead>
                                <tr>
                                    <th>Particulars</th>
                                    <th style={{ textAlign: 'right', width: '150px' }}>Debit</th>
                                    <th style={{ textAlign: 'right', width: '150px' }}>Credit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {voucher.ledger_entries.map((entry, idx) => (
                                    <tr key={idx}>
                                        <td style={{ fontWeight: '500', color: '#1f2937' }}>{entry.ledger_name}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#374151' }}>
                                            {entry.is_debit ? formatCurrency(entry.amount) : '-'}
                                        </td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#374151' }}>
                                            {!entry.is_debit ? formatCurrency(entry.amount) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                                <tr>
                                    <td style={{ fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase' }}>Total</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#111827' }}>
                                        {formatCurrency(voucher.ledger_entries.filter(e => e.is_debit).reduce((s, e) => s + e.amount, 0))}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#111827' }}>
                                        {formatCurrency(voucher.ledger_entries.filter(e => !e.is_debit).reduce((s, e) => s + e.amount, 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {/* === SUMMARY & FOOTER === */}
                <div className="page-m3__detail-footer">
                    {/* Tax Breakdown for Sales/Purchase */}
                    {isSalesOrPurchase && detailData && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: '32px' }}>
                            <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div className="page-m3__summary-row">
                                    <span>Gross Amount</span>
                                    <span style={{ fontWeight: '500', color: '#374151' }}>{formatCurrency(detailData.gross_amount)}</span>
                                </div>
                                {detailData.discount_amount > 0 && (
                                    <div className="page-m3__summary-row" style={{ color: '#ef4444' }}>
                                        <span>Discount</span>
                                        <span>- {formatCurrency(detailData.discount_amount)}</span>
                                    </div>
                                )}

                                <div style={{ paddingTop: '8px', borderTop: '1px solid #e0e2ec', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div className="page-m3__summary-row">
                                        <span>Taxable Value</span>
                                        <span style={{ fontWeight: '500', color: '#374151' }}>{formatCurrency(detailData.taxable_amount)}</span>
                                    </div>
                                    {detailData.cgst_amount > 0 && (
                                        <div className="page-m3__summary-row">
                                            <span>CGST</span>
                                            <span>{formatCurrency(detailData.cgst_amount)}</span>
                                        </div>
                                    )}
                                    {detailData.sgst_amount > 0 && (
                                        <div className="page-m3__summary-row">
                                            <span>SGST</span>
                                            <span>{formatCurrency(detailData.sgst_amount)}</span>
                                        </div>
                                    )}
                                    {detailData.igst_amount > 0 && (
                                        <div className="page-m3__summary-row">
                                            <span>IGST</span>
                                            <span>{formatCurrency(detailData.igst_amount)}</span>
                                        </div>
                                    )}
                                </div>

                                {detailData.round_off !== 0 && (
                                    <div className="page-m3__summary-row" style={{ paddingTop: '8px', borderTop: '1px solid #e0e2ec' }}>
                                        <span>Round Off</span>
                                        <span>{detailData.round_off > 0 ? '+' : ''}{formatCurrency(detailData.round_off)}</span>
                                    </div>
                                )}

                                <div className="page-m3__summary-row total">
                                    <span>Net Amount</span>
                                    <span style={{ color: '#1b5e20' }}>{formatCurrency(detailData.net_amount)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Narration */}
                    {voucher.narration && (
                        <div style={{ background: '#f3f4f6', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', color: '#4b5563' }}>
                            <span style={{ fontWeight: 'bold', textTransform: 'uppercase', marginRight: '8px', color: '#374151' }}>Narration:</span>
                            {voucher.narration}
                        </div>
                    )}
                </div>

                {/* Footer Section */}
                <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#9ca3af', borderTop: '1px solid #e0e2ec', background: '#fff' }}>
                    <p>This is a computer generated document. No signature required.</p>
                </div>
            </div>

            <style>{`
                 @media print {
                     @page { margin: 10mm; }
                     body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                     .page-m3 { padding: 0 !important; background: white !important; }
                     .page-m3__detail-container { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
                 }
             `}</style>
        </div>
    );
}
