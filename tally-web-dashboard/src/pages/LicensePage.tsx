import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import { Lock, Shield, Clock, Crown, Mail, Phone } from 'lucide-react';
import SEO from '../components/common/SEO';

export default function LicensePage() {
    const { user } = useAuth() as any;
    const [license, setLicense] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLicense();
    }, [user]);

    async function fetchLicense() {
        if (!user?.id) return;
        try {
            const { data, error } = await supabase
                .from('user_licenses')
                .select('*, plan:subscription_plans(*)')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            setLicense(data);
        } catch (e) {
            console.error('License fetch error:', e);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center">
                <div className="flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                    <p className="ml-2 text-[var(--on-surface)]">Loading license...</p>
                </div>
            </div>
        );
    }

    if (!license) {
        return (
            <main className="min-h-screen bg-[var(--surface)] flex items-center justify-center">
                <div className="max-w-md px-6 py-8 text-center">
                    <div className="w-16 h-16 bg-[var(--primary)]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Shield size={32} className="text-[var(--primary)]" />
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--on-surface)] mb-2">No License Found</h2>
                    <p className="text-[var(--on-surface)]/60 mb-8">No license is associated with your account.</p>
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={() => window.location.href = '/subscription'}
                            className="px-6 py-3 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-hover)]"
                        >
                            Buy License
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    const daysLeft = license.expiry_date
        ? Math.max(0, Math.ceil((new Date(license.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;
    const isExpired = license.expiry_date ? new Date(license.expiry_date) < new Date() : false;

    return (
        <main className="min-h-screen bg-[var(--surface)]">
            <SEO title="License | SYNCORA" />
            <div className="max-w-6xl mx-auto px-6 py-8">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--on-surface)]">License</h1>
                        <p className="text-[var(--on-surface)]/60 mt-1">Your current license status</p>
                    </div>
                    {license.status === 'active' && !isExpired && (
                        <button
                            className="px-6 py-3 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-hover)] transition-colors"
                        >
                            Renew License
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Status Card */}
                    <div className="bg-[var(--surface-secondary)] rounded-xl p-6 border border-[var(--border)]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isExpired ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                <Shield size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[var(--on-surface)]">{isExpired ? 'Expired' : 'Active'}</h3>
                                <p className="text-sm text-[var(--on-surface)]/60">{daysLeft} days remaining</p>
                            </div>
                        </div>
                        <div className="w-full h-2 bg-[var(--border)] rounded-full mt-4">
                            <div className={`h-2 rounded-full ${isExpired ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: Math.max(0, Math.min(100, daysLeft / 30 * 100)) + '%' }} />
                        </div>
                    </div>

                    {/* Plan Card */}
                    <div className="bg-[var(--surface-secondary)] rounded-xl p-6 border border-[var(--border)]">
                        <h3 className="text-sm font-medium text-[var(--on-surface)]/50 mb-3 uppercase tracking-wider">Plan</h3>
                        <p className="text-xl font-bold text-[var(--on-surface)]">{license.plan?.name || 'Unknown'}</p>
                        <p className="text-sm text-[var(--on-surface)]/50 mt-2">{sp?.duration_days} days plan</p>
                    </div>

                    {/* Expiry Card */}
                    <div className="bg-[var(--surface-secondary)] rounded-xl p-6 border border-[var(--border)]">
                        <h3 className="text-sm font-medium text-[var(--on-surface)]/50 mb-3 uppercase tracking-wider">Expires On</h3>
                        <p className="text-xl font-bold text-[var(--on-surface)]">{new Date(license.expiry_date).toLocaleDateString()}</p>
                        <p className="text-sm text-[var(--on-surface)]/50 mt-2">{daysLeft} days remaining</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[var(--surface-secondary)] rounded-xl p-6 border border-[var(--border)]">
                        <h3 className="text-sm font-medium text-[var(--on-surface)]/50 mb-6">License Details</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--on-surface)]/60">License Key</span>
                                <span className="text-[var(--on-surface)] font-mono text-sm">{license.license_key}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--on-surface)]/60">Activation Date</span>
                                <span className="text-[var(--on-surface)]">{new Date(license.activation_date).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--on-surface)]/60">Expiry Date</span>
                                <span className="text-[var(--on-surface)]">{new Date(license.expiry_date).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[var(--surface-secondary)] rounded-xl p-6 border border-[var(--border)]">
                        <h3 className="text-sm font-medium text-[var(--on-surface)]/50 mb-6">Support</h3>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Mail size={20} className="text-[var(--primary)]" />
                                <div>
                                    <p className="text-sm font-medium text-[var(--on-surface)]">Email Support</p>
                                    <p className="text-xs text-[var(--on-surface)]/50">support@tallyonmobile.com</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Phone size={20} className="text-[var(--primary)]" />
                                <div>
                                    <p className="text-sm font-medium text-[var(--on-surface)]">Phone Support</p>
                                    <p className="text-xs text-[var(--on-surface)]/50">+91 94138 21007</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}