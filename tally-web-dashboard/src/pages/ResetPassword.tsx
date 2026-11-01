import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { Lock, ArrowRight, Mail, CheckCircle2 } from 'lucide-react';
import SEO from '../components/common/SEO';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [resetComplete, setResetComplete] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const type = searchParams.get('type');
        if (type !== 'recovery') {
            // Not a password reset flow, redirect to login
            navigate('/login');
        }
    }, [searchParams, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 6) {
            toast.error('Password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (error) throw error;

            setResetComplete(true);
            toast.success('Password reset successful! You can now sign in with your new password.');
        } catch (error: any) {
            console.error('Reset password error:', error);
            toast.error(error.message || 'Failed to reset password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (resetComplete) {
        return (
            <main className="entry-screen login-screen">
                <SEO title="Password Reset Complete | SYNCORA" />
                <div className="entry-topbar"><div className="entry-brand"><span className="entry-brand-mark"><Building2 size={20}/></span><span><strong>SYNCORA</strong><small>TALLY ON MOBILE</small></span></div></div>
                <div className="login-layout">
                    <section className="login-intro"><span className="entry-eyebrow">SYNCORA ACCOUNT</span><h1>Password Reset Complete</h1><p>Your password has been successfully reset. You can now sign in with your new password.</p></section>
                    <section className="login-card">
                        <div className="login-card-header"><span className="entry-eyebrow">SYNCORA ACCOUNT</span><h2>Reset Complete</h2><p>Your password has been successfully changed.</p></div>
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-[var(--primary)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 size={32} className="text-[var(--primary)]" />
                            </div>
                            <h3 className="text-[var(--on-surface)] font-medium mb-2">Password Reset Successful</h3>
                            <p className="text-[var(--text-muted)] text-sm mb-6">Use your new password to sign in to your account.</p>
                            <button type="button" onClick={() => navigate('/login')} className="login-submit">
                                Sign In <ArrowRight size={17} />
                            </button>
                        </div>
                        <button type="button" className="login-back" onClick={() => navigate('/')}>← Back to home</button>
                    </section>
                </div>
            </main>
        );
    }

    return (
        <main className="entry-screen login-screen">
            <SEO title="Reset Password | SYNCORA — Free Tally Community & Cloud" />
            <div className="entry-topbar"><div className="entry-brand"><span className="entry-brand-mark"><Building2 size={20}/></span><span><strong>SYNCORA</strong><small>TALLY ON MOBILE</small></span></div></div>
            <div className="login-layout">
                <section className="login-intro"><span className="entry-eyebrow">SYNCORA ACCOUNT</span><h1>Reset Password</h1><h2>Set a new password</h2><p>Enter your new password below to regain access to your account.</p></section>
                <section className="login-card">
                    <div className="login-card-header"><span className="entry-eyebrow">SYNCORA ACCOUNT</span><h2>Reset Password</h2><p>Enter your new password below.</p></div>
                    <form onSubmit={handleSubmit} className="login-form">
                        <label>New Password<span className="login-field"><Lock size={17}/><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" autoComplete="new-password" required /></span></label>
                        <label>Confirm Password<span className="login-field"><Lock size={17}/><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" required /></span></label>
                        <button type="submit" disabled={loading} className="login-submit">{loading ? 'Resetting…' : 'Reset Password'}{!loading && <ArrowRight size={17}/>}</button>
                    </form>
                    <div className="login-switch"><button type="button" className="login-back" onClick={() => navigate('/login')}>← Back to sign in</button></div>
                </section>
            </div>
        </main>
    );
}