import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import '../styles/Material3.css';

export default function LedgerDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const [ledger, setLedger] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('transactions');

    useEffect(() => {
        if (id && selectedCompany) loadLedgerDetails();
    }, [id, selectedCompany]);

    const loadLedgerDetails = async () => {
        setLoading(true);
        try {
            // Get ledger details
            const { data: ledgerData } = await supabase
                .from('ledgers')
                .select('*')
                .eq('id', id)
                .single();

            setLedger(ledgerData);

            // Get transactions (vouchers where this ledger is the party)
            if (ledgerData) {
                const { data: voucherData } = await supabase
                    .from('vouchers')
                    .select('*')
                    .eq('company_id', selectedCompany.id)
                    .eq('party_name', ledgerData.name)
                    .order('voucher_date', { ascending: false })
                    .limit(50);

                setTransactions(voucherData || []);
            }
        } catch (error) {
            console.error('Error loading ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)}Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(absAmount);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="page-m3">
                <div className="page-m3__loading">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                    <p>Loading ledger details...</p>
                </div>
            </div>
        );
    }

    if (!ledger) {
        return (
            <div className="page-m3">
                <div className="page-m3__empty-state">
                    <span style={{ fontSize: '48px' }}>❌</span>
                    <p>Ledger not found</p>
                    <button onClick={() => navigate('/ledgers')} className="page-m3__button page-m3__button--secondary" style={{ marginTop: '16px' }}>
                        ← Back to Ledgers
                    </button>
                </div>
            </div>
        );
    }

    const isDebit = ledger.closing_balance > 0;

    return (
        <div className="page-m3">
            <header className="page-m3__header">
                <button
                    onClick={() => navigate('/ledgers')}
                    className="page-m3__back-btn"
                >
                    <span className="material-icons">arrow_back</span> Back
                </button>
                <div className="page-m3__header-content" style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '16px',
                            background: isDebit ? '#ecfdf5' : '#fff1f2',
                            color: isDebit ? '#059669' : '#e11d48',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px',
                            fontWeight: 'bold',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}>
                            {ledger.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                            <h1 className="page-m3__title">{ledger.name}</h1>
                            <p className="page-m3__subtitle">{ledger.parent_group || 'General'}</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Balance Cards */}
            <div className="page-m3__stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <div className="page-m3__stat-card">
                    <div className="page-m3__stat-icon" style={{ background: isDebit ? '#ecfdf5' : '#fff1f2', color: isDebit ? '#059669' : '#e11d48' }}>💰</div>
                    <div>
                        <p className="page-m3__stat-value" style={{ color: isDebit ? '#059669' : '#e11d48' }}>
                            {formatCurrency(ledger.closing_balance)} {isDebit ? 'Dr' : 'Cr'}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <p className="page-m3__stat-label">Closing Balance</p>
                            <span style={{
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: isDebit ? '#d1fae5' : '#ffe4e6',
                                color: isDebit ? '#065f46' : '#9f1239',
                                fontWeight: 'bold'
                            }}>
                                {isDebit ? 'Receivable' : 'Payable'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="page-m3__stat-card">
                    <div className="page-m3__stat-icon" style={{ background: '#f3f4f6', color: '#4b5563' }}>🏛️</div>
                    <div>
                        <p className="page-m3__stat-value" style={{ color: '#374151' }}>
                            {formatCurrency(ledger.opening_balance)}
                        </p>
                        <p className="page-m3__stat-label">Opening Balance</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '24px' }}>
                {ledger.phone && (
                    <a href={`tel:${ledger.phone}`} className="page-m3__chip" style={{ background: '#e0f2f1', color: '#00695c', border: 'none' }}>
                        📞 Call
                    </a>
                )}
                {ledger.phone && (
                    <a href={`https://wa.me/${ledger.phone?.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="page-m3__chip" style={{ background: '#dcfce7', color: '#166534', border: 'none' }}>
                        💬 WhatsApp
                    </a>
                )}
                {ledger.email && (
                    <a href={`mailto:${ledger.email}`} className="page-m3__chip" style={{ background: '#eff6ff', color: '#1e40af', border: 'none' }}>
                        ✉️ Email
                    </a>
                )}
                <Link to={`/ledger-statement/${id}`} className="page-m3__chip" style={{ background: '#f3e8ff', color: '#6b21a8', border: 'none' }}>
                    📋 Statement
                </Link>
            </div>

            {/* Contact Details */}
            {(ledger.phone || ledger.email || ledger.gstin || ledger.address) && (
                <div className="page-m3__card" style={{ padding: '20px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#374151', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Details</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                        {ledger.phone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#4b5563' }}>
                                <span style={{ fontSize: '18px' }}>📞</span> {ledger.phone}
                            </div>
                        )}
                        {ledger.email && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#4b5563' }}>
                                <span style={{ fontSize: '18px' }}>✉️</span> {ledger.email}
                            </div>
                        )}
                        {ledger.gstin && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#4b5563' }}>
                                <span style={{ fontSize: '18px' }}>🏢</span> <span style={{ fontFamily: 'monospace' }}>{ledger.gstin}</span>
                            </div>
                        )}
                        {ledger.address && (
                            <div style={{ display: 'flex', alignItems: 'start', gap: '12px', fontSize: '14px', color: '#4b5563', gridColumn: '1 / -1' }}>
                                <span style={{ fontSize: '18px' }}>📍</span> {ledger.address}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="page-m3__tabs">
                <button
                    onClick={() => setActiveTab('transactions')}
                    className={`page-m3__tab ${activeTab === 'transactions' ? 'page-m3__tab--active' : ''}`}
                >
                    Transactions
                </button>
                <button
                    onClick={() => setActiveTab('statement')}
                    className={`page-m3__tab ${activeTab === 'statement' ? 'page-m3__tab--active' : ''}`}
                >
                    Statement View
                </button>
            </div>

            {/* Transactions List */}
            <div style={{ marginTop: '24px' }}>
                {transactions.length === 0 ? (
                    <div className="page-m3__empty-state">
                        <span style={{ fontSize: '48px' }}>📭</span>
                        <p>No transactions found</p>
                    </div>
                ) : (
                    <div className="page-m3__list">
                        {transactions.map(txn => (
                            <Link
                                key={txn.voucher_id}
                                to={`/vouchers/${encodeURIComponent(txn.voucher_id)}`}
                                className="page-m3__list-item"
                                style={{ display: 'block', textDecoration: 'none' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ fontWeight: '600', color: '#1f2937' }}>{txn.voucher_type}</p>
                                        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                            #{txn.voucher_number} • {formatDate(txn.voucher_date)}
                                        </p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{
                                            fontWeight: 'bold',
                                            color: txn.voucher_type === 'Receipt' ? '#059669' :
                                                txn.voucher_type === 'Payment' ? '#e11d48' : '#1f2937'
                                        }}>
                                            {formatCurrency(txn.total_amount)}
                                        </p>
                                        {(() => {
                                            const partyEntry = txn.ledger_entries?.find(l =>
                                                l.ledger_name?.toLowerCase() === ledger.name?.toLowerCase()
                                            );
                                            const isDr = partyEntry ? partyEntry.is_debit : (txn.voucher_type === 'Payment' || txn.voucher_type === 'Sales');

                                            return (
                                                <span style={{
                                                    fontSize: '10px',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: isDr ? '#e0e7ff' : '#d1fae5',
                                                    color: isDr ? '#3730a3' : '#065f46',
                                                    marginTop: '4px',
                                                    display: 'inline-block'
                                                }}>
                                                    {isDr ? 'Dr' : 'Cr'}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>
                                {txn.narration && (
                                    <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {txn.narration}
                                    </p>
                                )}
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Actions */}
            <div className="page-m3__fab-container" style={{ right: 'auto', left: '50%', transform: 'translateX(-50%)', bottom: '24px', width: '90%', maxWidth: '400px', display: 'flex', gap: '12px' }}>
                <button
                    onClick={() => {
                        const msg = `Payment Reminder for ${ledger?.name}\n\nOutstanding: ${formatCurrency(ledger?.closing_balance)}\n\nPlease arrange payment.`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                    }}
                    className="page-m3__button page-m3__button--primary"
                    style={{ flex: 1, justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}
                >
                    📤 Send Reminder
                </button>
            </div>
        </div>
    );
}
