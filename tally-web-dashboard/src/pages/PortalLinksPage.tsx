import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase, portalApi } from '../lib/insforge';
import toast from 'react-hot-toast';
import { ExternalLink, Copy, Send, Search, Globe } from 'lucide-react';

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

    const portalEnabled = typeof portalApi.isEnabled === 'function' ? portalApi.isEnabled() : false;
    const portalDisabledReason = typeof portalApi.getDisabledReason === 'function'
        ? portalApi.getDisabledReason()
        : 'Customer portal is disabled until a secure backend is configured.';

    const loadParties = useCallback(async () => {
        if (!companyId) {
            setLoading(false);
            return;
        }

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

    useEffect(() => {
        void loadParties();
    }, [loadParties]);

    const generatePortalLink = (partyName: string) => {
        if (!portalEnabled || !companyId) return '';
        const baseUrl = window.location.origin;
        const encodedName = encodeURIComponent(partyName);
        return `${baseUrl}/portal/view?c=${companyId}&p=${encodedName}`;
    };

    const guardPortalAction = (): boolean => {
        if (portalEnabled) return true;
        toast.error(portalDisabledReason);
        return false;
    };

    const copyLink = (partyName: string, partyId: string) => {
        if (!guardPortalAction()) return;
        const link = generatePortalLink(partyName);
        navigator.clipboard.writeText(link);
        setCopiedId(partyId);
        toast.success('Portal link copied');
        window.setTimeout(() => setCopiedId(null), 2000);
    };

    const shareViaWhatsApp = (party: Party) => {
        if (!guardPortalAction()) return;
        const link = generatePortalLink(party.name);
        const message = encodeURIComponent(
            `View your account statement here:\n\n${link}`
        );
        const phone = party.phone?.replace(/[^0-9]/g, '') || '';
        const waUrl = phone
            ? `https://api.whatsapp.com/send?phone=91${phone}&text=${message}`
            : `https://api.whatsapp.com/send?text=${message}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
    };

    const openPreview = (partyName: string) => {
        if (!guardPortalAction()) return;
        window.open(generatePortalLink(partyName), '_blank', 'noopener,noreferrer');
    };

    const filteredParties = parties.filter((party) =>
        party.name.toLowerCase().includes(search.toLowerCase())
    );

    const formatCurrency = (value: number) =>
        `Rs ${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    return (
        <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #1a1a2e)', margin: 0 }}>
                    Customer Portal Links
                </h1>
                <p style={{ color: 'var(--text-secondary, #666)', margin: '4px 0 0' }}>
                    Review debtor and creditor records before secure portal access is enabled.
                </p>
            </div>

            <div style={{
                padding: '16px 20px',
                borderRadius: '14px',
                marginBottom: '20px',
                background: portalEnabled ? 'linear-gradient(135deg, #667eea10, #764ba210)' : 'linear-gradient(135deg, #f59e0b10, #ef444410)',
                border: portalEnabled ? '1px solid #667eea20' : '1px solid #f59e0b30',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <Globe size={20} style={{ color: portalEnabled ? '#667eea' : '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '13px', color: '#555' }}>
                        <strong>{portalEnabled ? 'Portal ready:' : 'Portal disabled:'}</strong>{' '}
                        {portalEnabled
                            ? 'Signed portal links can be shared from this screen.'
                            : portalDisabledReason}
                    </div>
                </div>
            </div>

            <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', borderRadius: '12px',
                background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color, #e5e7eb)',
                marginBottom: '16px',
            }}>
                <Search size={18} color="#999" />
                <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search parties..."
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: '14px', background: 'transparent', color: 'var(--text-primary)' }}
                />
                <span style={{ fontSize: '12px', color: '#999' }}>{filteredParties.length} parties</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading parties...</div>
                ) : filteredParties.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>No parties found</div>
                ) : (
                    filteredParties.map((party, index) => {
                        const disabledStyles = portalEnabled
                            ? {}
                            : { opacity: 0.55, cursor: 'not-allowed' as const };

                        return (
                            <motion.div
                                key={party.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(index * 0.02, 0.5) }}
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
                                        Balance:{' '}
                                        <span style={{ color: party.current_balance > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                                            {formatCurrency(party.current_balance)} {party.current_balance > 0 ? 'Dr' : 'Cr'}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => copyLink(party.name, party.id)}
                                        disabled={!portalEnabled}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                                            background: copiedId === party.id ? '#10b98115' : '#667eea10',
                                            color: copiedId === party.id ? '#10b981' : '#667eea',
                                            border: 'none', fontWeight: 600,
                                            ...disabledStyles,
                                        }}
                                    >
                                        {copiedId === party.id ? 'Copied' : <><Copy size={12} /> Copy Link</>}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => shareViaWhatsApp(party)}
                                        disabled={!portalEnabled}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                                            background: '#25d36615', color: '#25d366',
                                            border: 'none', fontWeight: 600,
                                            ...disabledStyles,
                                        }}
                                    >
                                        <Send size={12} /> WhatsApp
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openPreview(party.name)}
                                        disabled={!portalEnabled}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                                            background: '#f3f4f6', color: '#666',
                                            border: 'none', fontWeight: 600,
                                            ...disabledStyles,
                                        }}
                                    >
                                        <ExternalLink size={12} /> Preview
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </div>
    );
}