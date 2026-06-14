import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
    CreditCard, Users, Database, Save, KeyRound, Trash2, BrainCircuit,
    ShieldCheck, LifeBuoy, FileText
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getUserGeminiApiKey, maskGeminiApiKey, saveUserGeminiApiKey } from '@/lib/userGeminiKey';
import { clearUserAiTraining, getUserAiTraining, saveUserAiTraining } from '@/lib/userAiTraining';
import { APP_INFO } from '@/config/appInfo';

export default function SettingsPage() {
    const { selectedCompany, user } = useAuth() as any;
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [upiId, setUpiId] = useState('');
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [aiTraining, setAiTraining] = useState('');

    const { get2FAStatus, setup2FA, enable2FA, disable2FA } = useAuth() as any;
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);
    const [twoFALoading, setTwoFALoading] = useState(true);
    const [setupSecret, setSetupSecret] = useState('');
    const [setupQrUrl, setSetupQrUrl] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [isDisabling, setIsDisabling] = useState(false);

    useEffect(() => {
        const fetch2FAStatus = async () => {
            if (!user?.id) return;
            try {
                const res = await get2FAStatus();
                if (!res.error) {
                    setTwoFAEnabled(!!res.data?.enabled);
                }
            } catch (err) {
                console.error('Failed to get 2FA status:', err);
            } finally {
                setTwoFALoading(false);
            }
        };
        fetch2FAStatus();
    }, [get2FAStatus, user]);

    const handleSetup2FA = async () => {
        try {
            const res = await setup2FA();
            if (res.error) throw res.error;
            setSetupSecret(res.data.secret);
            setSetupQrUrl(res.data.qrCodeUrl);
            setIsSettingUp(true);
        } catch (err: any) {
            toast.error(err.message || 'Failed to setup 2FA');
        }
    };

    const handleEnable2FA = async () => {
        if (!verificationCode || verificationCode.length !== 6) {
            toast.error('Please enter a valid 6-digit verification code.');
            return;
        }
        try {
            const res = await enable2FA(setupSecret, verificationCode);
            if (res.error) throw res.error;
            setTwoFAEnabled(true);
            setIsSettingUp(false);
            setSetupSecret('');
            setSetupQrUrl('');
            setVerificationCode('');
            toast.success('Two-factor authentication enabled successfully.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to enable 2FA');
        }
    };

    const handleDisable2FA = async () => {
        if (!verificationCode || verificationCode.length !== 6) {
            toast.error('Please enter a valid 6-digit verification code.');
            return;
        }
        try {
            const res = await disable2FA(verificationCode);
            if (res.error) throw res.error;
            setTwoFAEnabled(false);
            setIsDisabling(false);
            setVerificationCode('');
            toast.success('Two-factor authentication disabled successfully.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to disable 2FA');
        }
    };

    useEffect(() => {
        if (selectedCompany?.id) {
            const savedUpi = localStorage.getItem(`upi_${selectedCompany.id}`);
            if (savedUpi) setUpiId(savedUpi);
        }
    }, [selectedCompany]);

    useEffect(() => {
        if (!user?.id) {
            setGeminiApiKey('');
            setAiTraining('');
            return;
        }

        setGeminiApiKey(getUserGeminiApiKey(user.id));
        setAiTraining(getUserAiTraining(user.id));
    }, [user?.id]);

    const saveUpiId = () => {
        if (selectedCompany?.id) {
            localStorage.setItem(`upi_${selectedCompany.id}`, upiId);
            toast.success(t('settings.upi_saved'));
        }
    };

    const saveGeminiKey = () => {
        if (!user?.id) {
            toast.error('Login required to save Gemini API key');
            return;
        }

        saveUserGeminiApiKey(user.id, geminiApiKey);
        toast.success(geminiApiKey ? 'Gemini API key saved for this browser session' : 'Gemini API key removed');
    };

    const clearGeminiKey = () => {
        if (!user?.id) {
            toast.error('Login required');
            return;
        }

        saveUserGeminiApiKey(user.id, '');
        setGeminiApiKey('');
        toast.success('Gemini API key removed');
    };

    const savePersonalTraining = () => {
        if (!user?.id) {
            toast.error('Login required to save AI training');
            return;
        }

        saveUserAiTraining(user.id, aiTraining);
        toast.success(aiTraining.trim() ? 'Personal AI training saved for this browser session' : 'Personal AI training removed');
    };

    const clearPersonalTraining = () => {
        if (!user?.id) {
            toast.error('Login required');
            return;
        }

        clearUserAiTraining(user.id);
        setAiTraining('');
        toast.success('Personal AI training cleared');
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
        {
            title: 'Mapping Master',
            icon: <BrainCircuit className="text-emerald-500" />,
            path: '/mapping-master',
            desc: 'Manage smart party, item, and bank mappings'
        },
    ];

    const complianceSections = [
        {
            title: 'Trust Center',
            icon: <ShieldCheck className="text-emerald-500" />,
            path: APP_INFO.trustCenterPath,
            desc: 'Privacy, security, support, refund, and deletion pages'
        },
        {
            title: 'Support Center',
            icon: <LifeBuoy className="text-sky-500" />,
            path: APP_INFO.supportPath,
            desc: `Contact ${APP_INFO.supportEmail}`
        },
        {
            title: 'Security Center',
            icon: <FileText className="text-amber-500" />,
            path: APP_INFO.securityPath,
            desc: 'App hardening, safe-use guidance, and reporting'
        },
        {
            title: 'Account Deletion',
            icon: <Trash2 className="text-rose-500" />,
            path: APP_INFO.accountDeletionPath,
            desc: 'Verified deletion flow and retention details'
        },
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
            <h1 className="text-2xl font-bold text-[var(--on-surface)] mb-6">{t('nav.settings')}</h1>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm space-y-6">
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            <KeyRound size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-[var(--on-surface)]">Gemini API Key</h2>
                            <p className="text-sm text-[var(--text-muted)]">Har user apni key sirf current browser session ke liye save kar sakta hai. Browser session khatam hote hi key dobara dalni pad sakti hai.</p>
                        </div>
                    </div>

                    <div className="max-w-2xl">
                        <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
                            API Key
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            <input
                                type="password"
                                value={geminiApiKey}
                                onChange={(e) => setGeminiApiKey(e.target.value)}
                                placeholder="AIza..."
                                className="flex-1 min-w-[260px] p-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--on-surface)] text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none"
                                autoComplete="off"
                            />
                            <button
                                onClick={saveGeminiKey}
                                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                            >
                                <Save size={16} />
                                {t('action.save')}
                            </button>
                            <button
                                onClick={clearGeminiKey}
                                className="px-4 py-2 border border-[var(--border)] text-[var(--on-surface)] rounded-lg font-medium hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-2"
                            >
                                <Trash2 size={16} />
                                Clear
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                            Session key: {maskGeminiApiKey(getUserGeminiApiKey(user?.id)) || 'Not set'}
                        </p>
                    </div>
                </div>

                <div className="border-t border-[var(--border)] pt-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                            <BrainCircuit size={22} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-[var(--on-surface)]">Personal AI Training</h3>
                            <p className="text-sm text-[var(--text-muted)]">Assistant ko apne business ke hisaab se train karo. Ye instructions bhi current browser session me hi rakhe jayenge.</p>
                        </div>
                    </div>

                    <div className="max-w-2xl">
                        <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
                            Training Instructions
                        </label>
                        <textarea
                            value={aiTraining}
                            onChange={(e) => setAiTraining(e.target.value)}
                            rows={6}
                            placeholder={[
                                'Example:',
                                '- Hamesha Hindi me jawab do.',
                                '- Amount ko short table format me dikhao.',
                                '- Agar exact data na ho to clear bolo "data available nahi hai".',
                                '- Meri company me COD sales ko alag mention karo.'
                            ].join('\n')}
                            className="w-full p-3 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--on-surface)] text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none"
                        />
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                            Tip: jitne clear rules doge (language, format, priority metrics), utna consistent answer milega.
                        </p>
                        <div className="mt-3 flex gap-2 flex-wrap">
                            <button
                                onClick={savePersonalTraining}
                                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                            >
                                <Save size={16} />
                                Save Training
                            </button>
                            <button
                                onClick={clearPersonalTraining}
                                className="px-4 py-2 border border-[var(--border)] text-[var(--on-surface)] rounded-lg font-medium hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-2"
                            >
                                <Trash2 size={16} />
                                Clear Training
                            </button>
                        </div>
                    </div>
                </div>
            </div>

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

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[var(--on-surface)]">Two-Factor Authentication (2FA)</h2>
                        <p className="text-sm text-[var(--text-muted)]">Secure your account by requiring a 6-digit code from your authenticator app during login.</p>
                    </div>
                </div>

                {twoFALoading ? (
                    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                        <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                        Loading settings...
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-[var(--on-surface)]">Status:</span>
                            {twoFAEnabled ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                    Enabled
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                                    Disabled
                                </span>
                            )}
                        </div>

                        {!twoFAEnabled && !isSettingUp && (
                            <button
                                onClick={handleSetup2FA}
                                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity text-sm"
                            >
                                Setup 2FA
                            </button>
                        )}

                        {isSettingUp && (
                            <div className="p-4 border border-[var(--border)] rounded-lg bg-[var(--background)] space-y-4 max-w-lg">
                                <h3 className="font-bold text-sm text-[var(--on-surface)]">Configure Authenticator App</h3>
                                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                    1. Scan this QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, Duo, etc.).
                                </p>
                                {setupQrUrl && (
                                    <div className="p-3 bg-white inline-block rounded-lg border border-[var(--border)]">
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(setupQrUrl)}`}
                                            alt="2FA QR Code"
                                            className="w-40 h-40 mix-blend-multiply"
                                        />
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <p className="text-xs text-[var(--text-muted)]">
                                        2. If you cannot scan the QR code, enter this secret key manually:
                                    </p>
                                    <code className="block p-2 bg-[var(--surface-container)] text-[var(--on-surface)] text-xs font-mono select-all rounded border border-[var(--border)]">
                                        {setupSecret}
                                    </code>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-medium text-[var(--text-muted)]">
                                        3. Enter the 6-digit code shown in the app to verify:
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            maxLength={6}
                                            value={verificationCode}
                                            onChange={(e) => setVerificationCode(e.target.value)}
                                            placeholder="000000"
                                            className="w-28 p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)] text-center text-sm font-mono tracking-widest outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                        />
                                        <button
                                            onClick={handleEnable2FA}
                                            className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity text-sm"
                                        >
                                            Verify and Enable
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsSettingUp(false);
                                                setSetupSecret('');
                                                setSetupQrUrl('');
                                                setVerificationCode('');
                                            }}
                                            className="px-4 py-2 border border-[var(--border)] text-[var(--on-surface)] rounded-lg font-medium hover:bg-[var(--surface-hover)] transition-colors text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {twoFAEnabled && !isDisabling && (
                            <button
                                onClick={() => setIsDisabling(true)}
                                className="px-4 py-2 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 transition-colors text-sm"
                            >
                                Disable 2FA
                            </button>
                        )}

                        {isDisabling && (
                            <div className="p-4 border border-rose-200 rounded-lg bg-rose-50/10 space-y-3 max-w-md">
                                <h3 className="font-bold text-sm text-rose-800">Disable Two-Factor Authentication</h3>
                                <p className="text-xs text-[var(--text-muted)]">
                                    Enter the 6-digit code from your authenticator app to verify and disable 2FA:
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value)}
                                        placeholder="000000"
                                        className="w-28 p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)] text-center text-sm font-mono tracking-widest outline-none focus:ring-2 focus:ring-rose-500"
                                    />
                                    <button
                                        onClick={handleDisable2FA}
                                        className="px-4 py-2 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 transition-colors text-sm"
                                    >
                                        Disable
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsDisabling(false);
                                            setVerificationCode('');
                                        }}
                                        className="px-4 py-2 border border-[var(--border)] text-[var(--on-surface)] rounded-lg font-medium hover:bg-[var(--surface-hover)] transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

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

            <div className="space-y-4">
                <div>
                    <h2 className="text-lg font-bold text-[var(--on-surface)]">Compliance & Support</h2>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Play Store-facing legal, support, privacy, and deletion pages in one place.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {complianceSections.map((section, idx) => (
                        <button
                            key={`compliance-${idx}`}
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
        </div>
    );
}
