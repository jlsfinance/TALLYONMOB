import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { portalApi } from '../lib/insforge';
import {
    Download, Calendar, Filter, ArrowUpRight, ArrowDownLeft,
    Wallet, Building2, Phone, Mail, MapPin, IndianRupee,
    CreditCard, ExternalLink, Share2, ChevronDown, ChevronUp, FileText, FileDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Transaction {
    id: string;
    voucher_type: string;
    voucher_number: string;
    voucher_date: string;
    party_name: string;
    total_amount: number;
    grand_total: number;
    narration?: string;
    running_balance?: number;
}

interface PartyInfo {
    id: string;
    name: string;
    current_balance: number;
    email?: string;
    phone?: string;
    address?: string;
    gstin?: string;
}

interface CompanyInfo {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    gstin?: string;
}

export default function CustomerPortalPage() {
    const { token } = useParams<{ token: string }>();
    const [searchParams] = useSearchParams();
    const companyId = searchParams.get('c') || '';
    const partyName = searchParams.get('p') || '';

    const [party, setParty] = useState<PartyInfo | null>(null);
    const [company, setCompany] = useState<CompanyInfo | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Date filter
    const [dateRange, setDateRange] = useState({
        from: (() => {
            const d = new Date();
            d.setFullYear(d.getFullYear() - 1);
            return d.toISOString().split('T')[0];
        })(),
        to: new Date().toISOString().split('T')[0]
    });
    const [expandedVoucher, setExpandedVoucher] = useState<string | null>(null);

    const formatCurrency = (n: number) =>
        `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

    const loadData = useCallback(async () => {
        if (!companyId || !partyName) {
            setError('Invalid portal link. Please contact the business.');
            setLoading(false);
            return;
        }
        setLoading(true);

        try {
            // 1. Fetch Company Info
            const { data: companyData, error: companyError } = await portalApi.getCompanyInfo(companyId);
            if (companyData) setCompany(companyData);
            else toast.error('Failed to load company info');

            // 2. Fetch Party Info
            const { data: partyData, error: partyError } = await portalApi.getPartyInfo(companyId, partyName);
            if (partyData) setParty(partyData);
            else {
                setError('Party not found. Please contact the business.');
                setLoading(false);
                return;
            }

            // 3. Fetch Statement (Transactions)
            const { data: stmtData, error: stmtError } = await portalApi.getStatement(companyId, partyName, dateRange.from, dateRange.to);
            if (stmtData) {
                setTransactions(stmtData);
            } else {
                toast.error('Failed to load transactions');
            }
        } catch (err) {
            console.error('Portal load error:', err);
            toast.error('Failed to load portal data');
            setError('Failed to load data. Please try again later.');
        } finally {
            setLoading(false);
        }
    }, [companyId, partyName, dateRange]);
    useEffect(() => {
        loadData();
    }, [loadData]);

    // Backend already provides running balance
    const transactionsWithBalance = transactions;

    const totalDebit = transactions
        .filter(t => ['Sales', 'Debit Note', 'Journal'].includes(t.voucher_type))
        .reduce((s, t) => s + Math.abs(Number(t.grand_total || t.total_amount) || 0), 0);

    const totalCredit = transactions
        .filter(t => ['Receipt', 'Credit Note', 'Payment'].includes(t.voucher_type))
        .reduce((s, t) => s + Math.abs(Number(t.grand_total || t.total_amount) || 0), 0);

    const handlePayNow = () => {
        // Razorpay payment link integration
        const razorpayKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
        if (razorpayKeyId && party) {
            const amount = Math.max(0, party.current_balance) * 100; // paise
            window.open(
                `https://pages.razorpay.com/pl_pay?amount=${amount}&description=Payment to ${company?.name || 'Business'}`,
                '_blank'
            );
        } else {
            alert('Online payment is not configured. Please contact the business.');
        }
    };

    const downloadPDF = () => {
        if (!transactions.length) return;
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for T-Shape
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFontSize(18);
        doc.text(company?.name || 'Business Statement', pageWidth / 2, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(company?.address || '', pageWidth / 2, 20, { align: 'center' });
        if (company?.gstin) doc.text(`GSTIN: ${company.gstin}`, pageWidth / 2, 24, { align: 'center' });

        doc.setFontSize(14);
        doc.text(`Ledger Account: ${party?.name}`, 15, 35);
        doc.setFontSize(10);
        doc.text(`Period: ${dateRange.from} to ${dateRange.to}`, 15, 40);

        const drTxns = transactionsWithBalance.filter(t => ['Sales', 'Debit Note', 'Journal'].includes(t.voucher_type));
        const crTxns = transactionsWithBalance.filter(t => ['Receipt', 'Credit Note', 'Payment'].includes(t.voucher_type));

        const maxRows = Math.max(drTxns.length, crTxns.length);
        const tableData = [];

        for (let i = 0; i < maxRows; i++) {
            const dr = drTxns[i];
            const cr = crTxns[i];
            tableData.push([
                dr ? new Date(dr.voucher_date).toLocaleDateString('en-IN') : '',
                dr ? dr.voucher_type : '',
                dr ? Math.abs(Number(dr.grand_total || dr.total_amount) || 0).toLocaleString('en-IN') : '',
                cr ? new Date(cr.voucher_date).toLocaleDateString('en-IN') : '',
                cr ? cr.voucher_type : '',
                cr ? Math.abs(Number(cr.grand_total || cr.total_amount) || 0).toLocaleString('en-IN') : ''
            ]);
        }

        autoTable(doc, {
            startY: 45,
            head: [['Date', 'Particulars (Dr)', 'Amount', 'Date', 'Particulars (Cr)', 'Amount']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255] },
            styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0] },
            columnStyles: {
                2: { halign: 'right', fontStyle: 'bold' },
                5: { halign: 'right', fontStyle: 'bold' }
            }
        });

        // Summary at bottom
        const finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.text(`Total Debit: ${formatCurrency(totalDebit)}`, 15, finalY);
        doc.text(`Total Credit: ${formatCurrency(totalCredit)}`, pageWidth / 2, finalY);
        doc.setFontSize(12);
        doc.text(`Closing Balance: ${formatCurrency(party?.current_balance || 0)} ${(party?.current_balance || 0) > 0 ? 'Dr' : 'Cr'}`, 15, finalY + 10);

        doc.save(`statement_${party?.name}_tshape.pdf`);
    };

    const downloadCsv = () => {
        if (!transactions.length) return;
        const headers = ['Date', 'Voucher Type', 'Voucher No', 'Ref No', 'Debit', 'Credit', 'Running Balance'];
        const rows = transactionsWithBalance.map(t => {
            const amount = Math.abs(Number(t.grand_total || t.total_amount) || 0);
            const isDebit = ['Sales', 'Debit Note', 'Journal'].includes(t.voucher_type);
            return [
                t.voucher_date,
                t.voucher_type,
                t.voucher_number || '',
                '', // Ref no
                isDebit ? amount.toFixed(2) : '',
                !isDebit ? amount.toFixed(2) : '',
                (t.running_balance || 0).toFixed(2),
            ];
        });

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `statement_${party?.name || 'party'}_${dateRange.from}_to_${dateRange.to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 48, height: 48, border: '3px solid #e5e7eb', borderTop: '3px solid #667eea', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#666', fontSize: '14px' }}>Loading your account...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                    <h2 style={{ margin: '0 0 8px', color: '#1a1a2e' }}>Portal Error</h2>
                    <p style={{ color: '#666' }}>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f0f4ff 0%, #f8fafc 50%, #fef9f3 100%)' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                color: '#fff', padding: '24px 20px',
            }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <Building2 size={28} style={{ opacity: 0.8 }} />
                        <div>
                            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{company?.name || 'Business'}</h1>
                            {company?.gstin && <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.7 }}>GSTIN: {company.gstin}</p>}
                        </div>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', opacity: 0.7 }}>
                        {company?.address && <span>{company.address}</span>}
                        {company?.phone && <span> ? {company.phone}</span>}
                    </p>
                </div>
            </div>

            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
                {/* Party Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        background: '#fff', borderRadius: '20px', padding: '24px',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.06)', marginTop: '-30px',
                        marginBottom: '20px', position: 'relative', zIndex: 10,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: '#1a1a2e' }}>
                                {party?.name}
                            </h2>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: '#666' }}>
                                {party?.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={12} />{party.phone}</span>}
                                {party?.email && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={12} />{party.email}</span>}
                                {party?.gstin && <span>GSTIN: {party.gstin}</span>}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>Outstanding Balance</p>
                            <p style={{
                                margin: '4px 0 0', fontSize: '28px', fontWeight: 800,
                                color: (party?.current_balance || 0) > 0 ? '#ef4444' : '#10b981',
                            }}>
                                {formatCurrency(party?.current_balance || 0)}
                            </p>
                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#999' }}>
                                {(party?.current_balance || 0) > 0 ? 'Amount to pay' : 'Credit balance'}
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
                        {(party?.current_balance || 0) > 0 && (
                            <button
                                onClick={handlePayNow}
                                style={{
                                    flex: 1, minWidth: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    padding: '12px 20px', borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
                                }}
                            >
                                <CreditCard size={18} /> Pay Now
                            </button>
                        )}
                        <button
                            onClick={downloadPDF}
                            style={{
                                flex: 1, minWidth: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                padding: '12px 20px', borderRadius: '12px',
                                background: '#667eea', color: '#fff',
                                border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                            }}
                        >
                            <FileDown size={18} /> Download T-Shape PDF
                        </button>
                    </div>
                </motion.div>

                {/* Date Filter */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    style={{
                        background: '#fff', borderRadius: '16px', padding: '16px 20px',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: '16px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <Calendar size={18} style={{ color: '#667eea' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#666' }}>Period:</span>
                        <input
                            type="date"
                            value={dateRange.from}
                            onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                        />
                        <span style={{ color: '#999' }}>to</span>
                        <input
                            type="date"
                            value={dateRange.to}
                            onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                        />
                        {/* Quick date presets */}
                        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                            {[
                                { label: '3M', months: 3 },
                                { label: '6M', months: 6 },
                                { label: '1Y', months: 12 },
                                { label: 'All', months: 60 },
                            ].map(preset => (
                                <button
                                    key={preset.label}
                                    onClick={() => {
                                        const d = new Date();
                                        d.setMonth(d.getMonth() - preset.months);
                                        setDateRange({ from: d.toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] });
                                    }}
                                    style={{
                                        padding: '4px 10px', borderRadius: '6px', border: 'none',
                                        background: '#f3f4f6', color: '#666', fontSize: '11px',
                                        fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* Summary Bar */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px',
                        marginBottom: '16px',
                    }}
                >
                    {[
                        { label: 'Total Debit', value: formatCurrency(totalDebit), color: '#ef4444' },
                        { label: 'Total Credit', value: formatCurrency(totalCredit), color: '#10b981' },
                        { label: 'Transactions', value: transactions.length, color: '#667eea' },
                    ].map((s, i) => (
                        <div key={i} style={{
                            background: '#fff', borderRadius: '14px', padding: '16px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)', textAlign: 'center',
                        }}>
                            <p style={{ margin: 0, fontSize: '11px', color: '#999' }}>{s.label}</p>
                            <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 700, color: s.color }}>{s.value}</p>
                        </div>
                    ))}
                </motion.div>

                {/* Transaction Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    style={{
                        background: '#fff', borderRadius: '16px',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.04)', overflow: 'hidden',
                    }}
                >
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1a1a2e' }}>
                            <FileText size={16} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
                            Account Statement
                        </h3>
                    </div>

                    {transactions.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                            <FileText size={32} style={{ marginBottom: '8px', opacity: 0.4 }} />
                            <p>No transactions found for the selected period</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'bold', color: '#000' }}>Date</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'bold', color: '#000' }}>Type</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'bold', color: '#000' }}>Voucher #</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'bold', color: '#000' }}>Debit ₹</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'bold', color: '#000' }}>Credit ₹</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'bold', color: '#000' }}>Balance ₹</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactionsWithBalance.map((txn, i) => {
                                        const amount = Math.abs(Number(txn.grand_total || txn.total_amount) || 0);
                                        const isDebit = ['Sales', 'Debit Note', 'Journal'].includes(txn.voucher_type);
                                        return (
                                            <tr
                                                key={txn.id}
                                                onClick={() => setExpandedVoucher(expandedVoucher === txn.id ? null : txn.id)}
                                                style={{
                                                    borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                                                    background: expandedVoucher === txn.id ? '#f8fafc' : 'transparent',
                                                }}
                                            >
                                                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                                    {new Date(txn.voucher_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                                                        background: isDebit ? '#ef444410' : '#10b98110',
                                                        color: isDebit ? '#ef4444' : '#10b981',
                                                    }}>
                                                        {txn.voucher_type}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', color: '#666' }}>
                                                    <Link
                                                        to={`/portal/invoice/${txn.id}`}
                                                        target="_blank"
                                                        style={{ color: '#667eea', textDecoration: 'none', fontWeight: 600 }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {txn.voucher_number || 'View'}
                                                        <ExternalLink size={12} style={{ display: 'inline', marginLeft: '4px' }} />
                                                    </Link>
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#ef4444', fontWeight: isDebit ? 600 : 400 }}>
                                                    {isDebit ? formatCurrency(amount) : ''}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#10b981', fontWeight: !isDebit ? 600 : 400 }}>
                                                    {!isDebit ? formatCurrency(amount) : ''}
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: (txn.running_balance || 0) > 0 ? '#ef4444' : '#10b981' }}>
                                                    {formatCurrency(txn.running_balance || 0)} {(txn.running_balance || 0) > 0 ? 'Dr' : 'Cr'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>

                {/* Footer */}
                <div style={{ textAlign: 'center', padding: '24px', fontSize: '12px', color: '#999' }}>
                    Powered by <strong>TallyLink</strong> ? This is a computer-generated statement
                </div>
            </div>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

