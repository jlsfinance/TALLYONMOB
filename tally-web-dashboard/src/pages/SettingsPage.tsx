import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
    CreditCard, Users, Database, Save
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
    const { selectedCompany } = useAuth() as any;
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [upiId, setUpiId] = useState('');

    useEffect(() => {
        if (selectedCompany?.id) {
            const savedUpi = localStorage.getItem(`upi_${selectedCompany.id}`);
            if (savedUpi) setUpiId(savedUpi);
        }
    }, [selectedCompany]);

    const saveUpiId = () => {
        if (selectedCompany?.id) {
            localStorage.setItem(`upi_${selectedCompany.id}`, upiId);
            toast.success(t('settings.upi_saved'));
        }
    };

    const sections = [
        {
            title: t('settings.team_management'),
            icon: <Users className="text-blue-500" />,
            path: '/team-management',
            desc: 'Manage users and permissions'
        },
        {
            title: t('settings.backup_data'),
            icon: <Database className="text-purple-500" />,
            path: '/backup-restore',
            desc: 'Backup and restore your data'
        },
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
            <h1 className="text-2xl font-bold text-[var(--on-surface)] mb-6">{t('nav.settings')}</h1>

            {/* Payment Configuration */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                        <CreditCard size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[var(--on-surface)]">{t('settings.payment_config')}</h2>
                        <p className="text-sm text-[var(--text-muted)]">{t('settings.payment_qr_desc')}</p>
                    </div>
                </div>

                <div className="max-w-md">
                    <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
                        {t('settings.payment_qr')}
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            placeholder={t('settings.upi_placeholder')}
                            className="flex-1 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--on-surface)] text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none"
                        />
                        <button
                            onClick={saveUpiId}
                            className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                        >
                            <Save size={16} />
                            {t('action.save')}
                        </button>
                    </div>
                    {upiId && (
                        <div className="mt-4 p-4 border border-[var(--border)] rounded-lg bg-white inline-block">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(selectedCompany?.name || '')}&cu=INR`)}`}
                                alt="UPI QR"
                                className="w-32 h-32 mix-blend-multiply"
                            />
                            <p className="text-center text-xs font-bold text-gray-500 mt-2">Preview</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Other Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sections.map((section, idx) => (
                    <button
                        key={idx}
                        onClick={() => navigate(section.path)}
                        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-4 hover:bg-[var(--surface-hover)] transition-colors text-left group"
                    >
                        <div className="p-3 bg-[var(--surface-container)] rounded-lg group-hover:bg-[var(--surface)] transition-colors">
                            {section.icon}
                        </div>
                        <div>
                            <h3 className="font-bold text-[var(--on-surface)]">{section.title}</h3>
                            <p className="text-xs text-[var(--text-muted)]">{section.desc}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
