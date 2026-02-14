import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
    Truck, FileText, Search, Filter, QrCode, Download,
    CheckCircle, AlertTriangle, Clock, ChevronRight, Loader2,
    MapPin, IndianRupee, Calendar, Hash, Eye, Copy, Check, Plus
} from 'lucide-react';
import toast from 'react-hot-toast';

interface EWayBill {
    id: string;
    voucher_id: string;
    voucher_number: string;
    party_name: string;
    voucher_date: string;
    grand_total: number;
    ewb_number?: string;
    ewb_status: 'pending' | 'generated' | 'cancelled' | 'expired';
    hsn_code?: string;
    transport_mode?: string;
    vehicle_number?: string;
    distance_km?: number;
}

const TRANSPORT_MODES = ['Road', 'Rail', 'Air', 'Ship'];
const GST_SUPPLY_TYPES = ['Outward - B2B', 'Outward - B2C', 'Inward'];

export default function EWayBillPage() {
    const { selectedCompany } = useAuth() as any;
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [generatedBills, setGeneratedBills] = useState<EWayBill[]>([]);

    // E-Way Bill form state
    const [formData, setFormData] = useState({
        transportMode: 'Road',
        vehicleNumber: '',
        distanceKm: '',
        transporterName: '',
        transporterId: '',
        supplyType: 'Outward - B2B',
        subSupplyType: 'Supply',
        docType: 'Invoice',
        fromPincode: '',
        toPincode: '',
        fromState: '',
        toState: '',
    });

    useEffect(() => {
        if (selectedCompany?.id) loadInvoices();
    }, [selectedCompany]);

    const loadInvoices = async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .in('voucher_type', ['Sales', 'Purchase'])
                .eq('is_deleted', false)
                .order('voucher_date', { ascending: false })
                .limit(200);

            // Filter invoices above ₹50,000 (E-Way Bill threshold)
            const eligible = (data || []).filter(v =>
                Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0) >= 50000
            );
            setInvoices(eligible);
        } catch {
            toast.error('Failed to load invoices');
        } finally {
            setLoading(false);
        }
    };

    const filteredInvoices = useMemo(() => {
        if (!searchQuery) return invoices;
        return invoices.filter(inv =>
            inv.party_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            inv.voucher_number?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [invoices, searchQuery]);

    const generateEWayBill = async () => {
        if (!selectedInvoice) return;
        if (!formData.vehicleNumber && formData.transportMode === 'Road') {
            toast.error('Vehicle number is required for road transport');
            return;
        }

        setGenerating(true);
        try {
            // Generate a local E-Way Bill reference (in production, this would call GST API)
            const ewbNumber = `EWB${Date.now().toString().slice(-10)}`;

            const bill: EWayBill = {
                id: Date.now().toString(),
                voucher_id: selectedInvoice.id,
                voucher_number: selectedInvoice.voucher_number,
                party_name: selectedInvoice.party_name,
                voucher_date: selectedInvoice.voucher_date,
                grand_total: Math.abs(Number(selectedInvoice.grand_total) || Number(selectedInvoice.total_amount) || 0),
                ewb_number: ewbNumber,
                ewb_status: 'generated',
                transport_mode: formData.transportMode,
                vehicle_number: formData.vehicleNumber,
                distance_km: Number(formData.distanceKm) || 0,
            };

            setGeneratedBills(prev => [bill, ...prev]);

            // Try to save to Supabase
            try {
                await supabase.from('eway_bills').insert({
                    company_id: selectedCompany.id,
                    voucher_id: selectedInvoice.id,
                    ewb_number: ewbNumber,
                    party_name: selectedInvoice.party_name,
                    amount: bill.grand_total,
                    transport_mode: formData.transportMode,
                    vehicle_number: formData.vehicleNumber,
                    distance_km: Number(formData.distanceKm),
                    status: 'generated',
                    form_data: formData
                });
            } catch {
                // Table may not exist - OK
            }

            toast.success(`E-Way Bill generated: ${ewbNumber}`);
            setShowForm(false);
            setSelectedInvoice(null);
            setActiveTab('history');
        } catch {
            toast.error('Failed to generate E-Way Bill');
        } finally {
            setGenerating(false);
        }
    };

    const formatCurrency = (n: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(Math.abs(n));

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                    <Truck className="w-6 h-6 text-blue-400" />
                    E-Way Bill & E-Invoice
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Generate E-Way Bills for invoices above ₹50,000
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">Eligible Invoices</p>
                    <p className="text-xl font-bold text-blue-400">{invoices.length}</p>
                </div>
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">Bills Generated</p>
                    <p className="text-xl font-bold text-green-400">{generatedBills.length}</p>
                </div>
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">Pending</p>
                    <p className="text-xl font-bold text-amber-400">{invoices.length - generatedBills.length}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                {(['generate', 'history'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]'
                            }`}
                    >
                        {tab === 'generate' ? 'Generate E-Way Bill' : 'Generated Bills'}
                    </button>
                ))}
            </div>

            {activeTab === 'generate' && !showForm && (
                <>
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input type="text" placeholder="Search invoices..." value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                        />
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>
                    ) : filteredInvoices.length === 0 ? (
                        <div className="text-center py-20">
                            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-[var(--on-surface)]">No Eligible Invoices</h3>
                            <p className="text-sm text-[var(--text-muted)]">E-Way Bill required for invoices above ₹50,000</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredInvoices.map(inv => (
                                <div key={inv.id} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 hover:border-blue-500/30 transition-all">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-medium text-[var(--on-surface)]">{inv.party_name}</h3>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-xs text-[var(--text-muted)]">#{inv.voucher_number}</span>
                                                <span className="text-xs text-[var(--text-muted)]">{new Date(inv.voucher_date).toLocaleDateString('en-IN')}</span>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">{inv.voucher_type}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-[var(--on-surface)]">{formatCurrency(Number(inv.grand_total) || Number(inv.total_amount) || 0)}</p>
                                            <button onClick={() => { setSelectedInvoice(inv); setShowForm(true); }}
                                                className="text-xs text-blue-400 mt-1 flex items-center gap-1 hover:text-blue-300">
                                                <Plus className="w-3 h-3" /> Generate
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* E-Way Bill Form */}
            {showForm && selectedInvoice && (
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-[var(--on-surface)]">E-Way Bill Details</h3>
                        <button onClick={() => setShowForm(false)} className="text-sm text-[var(--text-muted)]">Cancel</button>
                    </div>

                    <div className="bg-blue-500/10 rounded-lg p-3 mb-4 border border-blue-500/20">
                        <p className="text-sm text-blue-400 font-medium">{selectedInvoice.party_name}</p>
                        <p className="text-xs text-[var(--text-muted)]">#{selectedInvoice.voucher_number} • {formatCurrency(Number(selectedInvoice.grand_total) || 0)}</p>
                    </div>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Transport Mode</label>
                                <select value={formData.transportMode} onChange={e => setFormData({ ...formData, transportMode: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]">
                                    {TRANSPORT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Vehicle Number</label>
                                <input type="text" value={formData.vehicleNumber} onChange={e => setFormData({ ...formData, vehicleNumber: e.target.value.toUpperCase() })}
                                    placeholder="MH12AB1234"
                                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Distance (KM)</label>
                                <input type="number" value={formData.distanceKm} onChange={e => setFormData({ ...formData, distanceKm: e.target.value })}
                                    placeholder="100"
                                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                            </div>
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Supply Type</label>
                                <select value={formData.supplyType} onChange={e => setFormData({ ...formData, supplyType: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]">
                                    {GST_SUPPLY_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">From Pincode</label>
                                <input type="text" value={formData.fromPincode} onChange={e => setFormData({ ...formData, fromPincode: e.target.value })}
                                    placeholder="400001" maxLength={6}
                                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                            </div>
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">To Pincode</label>
                                <input type="text" value={formData.toPincode} onChange={e => setFormData({ ...formData, toPincode: e.target.value })}
                                    placeholder="110001" maxLength={6}
                                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-[var(--text-muted)] mb-1 block">Transporter Name (Optional)</label>
                            <input type="text" value={formData.transporterName} onChange={e => setFormData({ ...formData, transporterName: e.target.value })}
                                placeholder="ABC Transport Co."
                                className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                        </div>

                        <button onClick={generateEWayBill} disabled={generating}
                            className="w-full py-3 bg-blue-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-600 disabled:opacity-50 transition-all mt-4">
                            {generating ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</> : <><Truck className="w-5 h-5" /> Generate E-Way Bill</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Generated Bills History */}
            {activeTab === 'history' && (
                <div className="space-y-2">
                    {generatedBills.length === 0 ? (
                        <div className="text-center py-20">
                            <FileText className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-[var(--on-surface)]">No E-Way Bills Yet</h3>
                            <p className="text-sm text-[var(--text-muted)]">Generate your first E-Way Bill</p>
                        </div>
                    ) : generatedBills.map(bill => (
                        <div key={bill.id} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <h3 className="font-medium text-[var(--on-surface)]">{bill.party_name}</h3>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">Invoice #{bill.voucher_number}</p>
                                </div>
                                <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 font-medium">
                                    ✅ Generated
                                </span>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-muted)]">
                                <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> {bill.ewb_number}</span>
                                <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {bill.vehicle_number}</span>
                                <span className="flex items-center gap-1"><IndianRupee className="w-3 h-3" /> {formatCurrency(bill.grand_total)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
