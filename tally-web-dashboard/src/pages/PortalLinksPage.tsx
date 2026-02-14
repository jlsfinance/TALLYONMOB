import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import {
    ExternalLink, Copy, Send, Search, Link2, QrCode, Globe, Users
} from 'lucide-react';

interface Party {
    id: string;
    name: string;
    current_balance: number;
    email?: string;
    phone?: string;
}

export default function PortalLinksPage() {
    const [companyId] = useState(() => localStorage.getItem('selectedCompanyId') || '');
    const [parties, setParties] = useState<Party[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const loadParties = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const { data } = await supabase
            .from('ledgers')
            .select('id, name, current_balance, email, phone')
            .eq('company_id', companyId)
            .or('parent.ilike.%Debtors%,parent.ilike.%Creditors%,parent.ilike.%Customer%,parent.ilike.%Supplier%')
            .order('name');
        setParties(data || []);
        setLoading(false);
    }, [companyId]);

    useEffect(() => { loadParties(); }, [loadParties]);

    const generatePortalLink = (partyName: string) => {
        const baseUrl = window.location.origin;
        const encodedName = encodeURIComponent(partyName);
        return `${baseUrl}/portal/view?c=${companyId}&p=${encodedName}`;
    };

    const copyLink = (partyName: string, partyId: string) => {
        const link = generatePortalLink(partyName);
        navigator.clipboard.writeText(link);
        setCopiedId(partyId);
        toast.success('Link copied!');
        setTimeout(() => setCopiedId(null), 2000);
    };

    const shareViaWhatsApp = (party: Party) => {
        const link = generatePortalLink(party.name);
        const message = encodeURIComponent(
            `🔗 View your account statement and make payments online:\n\n${link}\n\n— Sent via TallyLink`
        );
        const phone = party.phone?.replace(/[^0-9]/g, '') || '';
        const waUrl = phone
            ? `https://api.whatsapp.com/send?phone=91${phone}&text=${message}`
            : `https://api.whatsapp.com/send?text=${message}`;
        window.open(waUrl, '_blank');
    };

    const filteredParties = parties.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    const formatCurrency = (n: number) =>
        `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    return (
        <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #1a1a2e)', margin: 0 }}>
                    🌐 Customer Self-Service Portal
                </h1>
                <p style={{ color: 'var(--text-secondary, #666)', margin: '4px 0 0' }}>
                    Generate unique links so parties can view their statements & pay online
                </p>
            </div>

            {/* Info Banner */}
            <div style={{
                padding: '16px 20px', borderRadius: '14px', marginBottom: '20px',
                background: 'linear-gradient(135deg, #667eea10, #764ba210)',
                border: '1px solid #667eea20',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <Globe size={20} style={{ color: '#667eea', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '13px', color: '#555' }}>
                        <strong>How it works:</strong> Each party gets a unique link. They can view their account statement
                        with date selector, download CSV, and pay online via Razorpay. No login required.
                    </div>
                </div>
            </div>

            {/* Search */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', borderRadius: '12px',
                background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color, #e5e7eb)',
                marginBottom: '16px',
            }}>
                <Search size={18} color="#999" />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search parties..."
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: '14px', background: 'transparent', color: 'var(--text-primary)' }}
                />
                <span style={{ fontSize: '12px', color: '#999' }}>{filteredParties.length} parties</span>
            </div>

            {/* Party List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading parties...</div>
                ) : filteredParties.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>No parties found</div>
                ) : (
                    filteredParties.map((party, i) => (
                        <motion.div
                            key={party.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.02, 0.5) }}
                            style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '14px 18px', borderRadius: '14px',
                                background: 'var(--card-bg, #fff)',
                                border: '1px solid var(--border-color, #e5e7eb)',
                                flexWrap: 'wrap', gap: '10px',
                            }}
                        >
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{party.name}</div>
                                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                                    Balance: <span style={{ color: party.current_balance > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                                        {formatCurrency(party.current_balance)} {party.current_balance > 0 ? 'Dr' : 'Cr'}
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    onClick={() => copyLink(party.name, party.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                                        background: copiedId === party.id ? '#10b98115' : '#667eea10',
                                        color: copiedId === party.id ? '#10b981' : '#667eea',
                                        border: 'none', cursor: 'pointer', fontWeight: 600,
                                    }}
                                >
                                    {copiedId === party.id ? '✓ Copied' : <><Copy size={12} /> Copy Link</>}
                                </button>
                                <button
                                    onClick={() => shareViaWhatsApp(party)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                                        background: '#25d36615', color: '#25d366',
                                        border: 'none', cursor: 'pointer', fontWeight: 600,
                                    }}
                                >
                                    <Send size={12} /> WhatsApp
                                </button>
                                <button
                                    onClick={() => window.open(generatePortalLink(party.name), '_blank')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                                        background: '#f3f4f6', color: '#666',
                                        border: 'none', cursor: 'pointer', fontWeight: 600,
                                    }}
                                >
                                    <ExternalLink size={12} /> Preview
                                </button>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}
