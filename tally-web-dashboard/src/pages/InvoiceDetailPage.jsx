import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase, salesApi } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Material3.css';

export default function InvoiceDetailPage() {
    const { id } = useParams();
    const { selectedCompany } = useAuth();
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const printRef = useRef();

    useEffect(() => {
        if (id) {
            loadInvoice();
        }
    }, [id]);

    const loadInvoice = async () => {
        try {
            // The ID from URL is in format: COMPANYNAME*SALES*VOUCHERNUMBER_DATE
            // We need to find the sale by matching this pattern

            // First try: Search by voucher_id (the URL id IS the voucher_id)
            const { data: salesData, error } = await supabase
                .from('sales')
                .select('*')
                .eq('voucher_id', id)
                .single();

            if (salesData) {
                // Fetch sales_items separately  
                const { data: itemsData } = await supabase
                    .from('sales_items')
                    .select('*')
                    .eq('sale_id', salesData.id);

                let enrichedItems = [];

                // Get stock items to enrich HSN and unit data
                const { data: stockItems } = await supabase
                    .from('stock_items')
                    .select('name, hsn_code, base_unit')
                    .eq('company_id', salesData.company_id);

                // Create lookup map
                const stockLookup = {};
                stockItems?.forEach(item => {
                    stockLookup[item.name] = item;
                });

                if (itemsData && itemsData.length > 0) {
                    // Enrich items with HSN and unit from stock master
                    enrichedItems = itemsData.map(item => ({
                        ...item,
                        hsn_code: item.hsn_code || stockLookup[item.stock_item_name]?.hsn_code || '-',
                        unit: item.unit || stockLookup[item.stock_item_name]?.base_unit || ''
                    }));
                } else {
                    // FALLBACK: If itemsData is empty, try fetching from vouchers table
                    const { data: voucherData } = await supabase
                        .from('vouchers')
                        .select('inventory_entries')
                        .eq('voucher_id', salesData.voucher_id)
                        .single();

                    if (voucherData?.inventory_entries && voucherData.inventory_entries.length > 0) {
                        enrichedItems = voucherData.inventory_entries.map(item => ({
                            ...item,
                            stock_item_name: item.stock_item_name || item.name || 'Unknown Item',
                            hsn_code: item.hsn_code || stockLookup[item.stock_item_name || item.name]?.hsn_code || '-',
                            unit: item.unit || stockLookup[item.stock_item_name || item.name]?.base_unit || ''
                        }));
                    }
                }

                salesData.sales_items = enrichedItems;
                setInvoice(salesData);
            } else {
                // Fallback: try the old way (by id)
                const { data } = await salesApi.getById(id);
                setInvoice(data);
            }
        } catch (err) {
            console.error('Error loading invoice:', err);
        }
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        }).format(amount || 0);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    };

    const handlePrint = () => {
        window.print();
    };

    const handleShare = async () => {
        const text = `Invoice: ${invoice.invoice_number}\nParty: ${invoice.party_ledger_name}\nAmount: ${formatCurrency(invoice.net_amount)}\nDate: ${formatDate(invoice.invoice_date)}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Invoice ${invoice.invoice_number}`,
                    text: text
                });
            } catch (err) {
                console.log('Share cancelled');
            }
        } else {
            navigator.clipboard.writeText(text);
            alert('Invoice details copied to clipboard!');
        }
    };

    const handleWhatsApp = () => {
        const text = encodeURIComponent(
            `*Invoice: ${invoice.invoice_number}*\n` +
            `Party: ${invoice.party_ledger_name}\n` +
            `Amount: ${formatCurrency(invoice.net_amount)}\n` +
            `Date: ${formatDate(invoice.invoice_date)}\n\n` +
            `Thank you for your business!`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    if (loading) {
        return (
            <div className="page-m3">
                <div className="page-m3__loading">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700 mb-2"></div>
                    <p>Loading invoice...</p>
                </div>
            </div>
        );
    }

    if (!invoice) {
        return <div className="page-m3 flex justify-center items-center"><p>Invoice not found</p></div>;
    }

    return (
        <div className="page-m3">
            {/* Action Bar */}
            <div className="page-m3__action-bar print:hidden">
                <Link to="/sales" className="page-m3__back-link">
                    <span>←</span> Back to Sales
                </Link>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <Link
                        to={`/invoice/${invoice.voucher_id || id}`}
                        className="page-m3__button page-m3__button--secondary"
                    >
                        📄 PDF
                    </Link>
                    <button onClick={handlePrint} className="page-m3__button page-m3__button--secondary">
                        🖨️ Print
                    </button>
                    <button onClick={handleShare} className="page-m3__button page-m3__button--secondary">
                        📤 Share
                    </button>
                    <button onClick={handleWhatsApp} className="page-m3__button page-m3__button--primary">
                        💬 WhatsApp
                    </button>
                </div>
            </div>

            {/* Invoice Container */}
            <div ref={printRef} className="page-m3__detail-container">

                {/* Invoice Header */}
                <div className="page-m3__detail-header">
                    <div className="page-m3__detail-row">
                        <div>
                            <h1 className="page-m3__detail-title">TAX INVOICE</h1>
                            <p className="page-m3__subtitle">{selectedCompany?.name || 'Company Name'}</p>
                            {selectedCompany?.address && (
                                <p className="text-sm text-gray-400 mt-1 max-w-md">{selectedCompany.address}</p>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p className="page-m3__detail-label">Invoice No.</p>
                            <p className="page-m3__detail-value" style={{ fontSize: '20px', color: 'var(--md-sys-color-primary)' }}>
                                {invoice.invoice_number || '-'}
                            </p>
                            <div style={{ marginTop: '8px' }}>
                                <span className="text-sm text-gray-500">Date: </span>
                                <span className="font-medium">{formatDate(invoice.invoice_date)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Party Section */}
                <div className="page-m3__detail-row page-m3__detail-section">
                    {/* Bill To */}
                    <div>
                        <span className="page-m3__detail-label">Bill To</span>
                        <div style={{ background: '#f8f9fa', padding: '16px', borderRadius: '8px' }}>
                            <p className="page-m3__detail-value">{invoice.party_ledger_name}</p>
                            {invoice.party_gstin && (
                                <p className="text-sm text-gray-600 mt-1">GSTIN: {invoice.party_gstin}</p>
                            )}
                            {invoice.place_of_supply && (
                                <p className="text-sm text-gray-500 mt-1">Place of Supply: {invoice.place_of_supply}</p>
                            )}
                        </div>
                    </div>

                    {/* Amount Highlight */}
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{ background: '#e8f5e9', padding: '16px', borderRadius: '8px', textAlign: 'right', minWidth: '200px' }}>
                            <span className="page-m3__detail-label" style={{ color: '#1b5e20' }}>Invoice Amount</span>
                            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#1b5e20', margin: 0 }}>
                                {formatCurrency(invoice.net_amount)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="page-m3__table-container">
                    <table className="page-m3__table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>#</th>
                                <th>Item Details</th>
                                <th className="text-center" style={{ width: '80px' }}>HSN</th>
                                <th className="text-center" style={{ width: '80px' }}>Qty</th>
                                <th className="text-right" style={{ width: '120px' }}>Rate</th>
                                <th className="text-right" style={{ width: '120px' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(invoice.sales_items && invoice.sales_items.length > 0) ? (
                                invoice.sales_items.map((item, idx) => (
                                    <tr key={item.id || idx}>
                                        <td style={{ color: '#9ca3af' }}>{idx + 1}</td>
                                        <td>
                                            <p style={{ fontWeight: 500 }}>{item.stock_item_name || item.name || 'Unknown Item'}</p>
                                        </td>
                                        <td className="text-center text-sm">{item.hsn_code || '-'}</td>
                                        <td className="text-center">
                                            <span style={{ fontWeight: 600 }}>{item.quantity}</span>
                                            <span className="text-xs text-gray-400 ml-1">{item.unit}</span>
                                        </td>
                                        <td className="text-right font-mono">{formatCurrency(item.rate)}</td>
                                        <td className="text-right font-semibold">{formatCurrency(item.amount)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>
                                        No items found in this invoice.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer / Summary */}
                <div className="page-m3__detail-footer">
                    <div style={{ marginLeft: 'auto', maxWidth: '350px' }}>
                        <div className="page-m3__summary-row">
                            <span>Gross Amount</span>
                            <span style={{ color: '#374151' }}>{formatCurrency(invoice.gross_amount)}</span>
                        </div>

                        {invoice.discount_amount > 0 && (
                            <div className="page-m3__summary-row" style={{ color: '#ef4444' }}>
                                <span>Discount</span>
                                <span>- {formatCurrency(invoice.discount_amount)}</span>
                            </div>
                        )}

                        <div style={{ borderTop: '1px solid #e5e7eb', margin: '8px 0', paddingTop: '8px' }}>
                            <div className="page-m3__summary-row">
                                <span>Taxable Value</span>
                                <span style={{ color: '#374151' }}>{formatCurrency(invoice.taxable_amount)}</span>
                            </div>
                            {invoice.cgst_amount > 0 && (
                                <div className="page-m3__summary-row">
                                    <span>CGST</span>
                                    <span>{formatCurrency(invoice.cgst_amount)}</span>
                                </div>
                            )}
                            {invoice.sgst_amount > 0 && (
                                <div className="page-m3__summary-row">
                                    <span>SGST</span>
                                    <span>{formatCurrency(invoice.sgst_amount)}</span>
                                </div>
                            )}
                            {invoice.igst_amount > 0 && (
                                <div className="page-m3__summary-row">
                                    <span>IGST</span>
                                    <span>{formatCurrency(invoice.igst_amount)}</span>
                                </div>
                            )}
                        </div>

                        {invoice.round_off !== 0 && (
                            <div className="page-m3__summary-row" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
                                <span>Round Off</span>
                                <span>{invoice.round_off > 0 ? '+' : ''}{formatCurrency(invoice.round_off)}</span>
                            </div>
                        )}

                        <div className="page-m3__summary-row total">
                            <span>Net Amount</span>
                            <span>{formatCurrency(invoice.net_amount)}</span>
                        </div>
                    </div>
                </div>

                {/* Narration Footer */}
                {invoice.narration && (
                    <div style={{ background: '#f9fafb', padding: '16px', borderTop: '1px solid #e5e7eb', fontSize: '12px', color: '#6b7280' }}>
                        <span style={{ fontWeight: 'bold', textTransform: 'uppercase', marginRight: '8px' }}>Remarks:</span>
                        {invoice.narration}
                    </div>
                )}
            </div>

            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '12px', paddingBottom: '32px', marginTop: '16px' }} className="print:hidden">
                LiveKeeping &bull; {selectedCompany?.name}
            </div>
        </div>
    );
}
