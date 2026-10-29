import './EntryScreens.css';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Mail, Lock, ArrowRight, Shield, Sun, Moon, User, CheckCircle2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthContextType } from '../contexts/types';
import SEO from '../components/common/SEO';

// Visual redesign to match the SYNCORA landing (deep navy + violet/sky).
// All auth logic (email/pass, signup, OTP, 2FA, Google) is unchanged.

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [twoFactorRequired, setTwoFactorRequired] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [tempToken, setTempToken] = useState('');
    const [tempUserId, setTempUserId] = useState('');
    const [tempEmail, setTempEmail] = useState('');
    const { signIn, signUp, verifyOtp, sendVerificationEmail, signInWithGoogle, verify2FALogin } = useAuth() as AuthContextType & { verifyOtp: any; sendVerificationEmail: any };
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (twoFactorRequired) {
                const { error } = await verify2FALogin(tempToken, tempUserId, tempEmail, twoFactorCode);
                if (error) throw error;
                toast.success('Welcome back!');
                navigate('/dashboard');
                return;
            }

            if (otpSent) {
                const { error } = await verifyOtp(email, otpCode, 'signup');
                if (error) throw error;
                toast.success('Account verified!');
                navigate('/dashboard');
            } else if (isLogin) {
                const result = await signIn(email, password);
                if (result.data?.two_factor_required) {
                    setTwoFactorRequired(true);
                    setTempToken(result.data.temp_token);
                    setTempUserId(result.data.user_id);
                    setTempEmail(result.data.email);
                    toast.success('Two-factor authentication code required.');
                    setLoading(false);
                    return;
                }
                const { error } = result;
                if (error) {
                    if (error.message?.toLowerCase().includes('not verified') || error.message?.toLowerCase().includes('verify') || error.message?.toLowerCase().includes('email not confirmed')) {
                        const { error: sendError } = await sendVerificationEmail(email);
                        if (sendError) throw sendError;
                        setOtpSent(true);
                        setIsLogin(false);
                        toast('Email not verified. Check your email for a confirmation link or code.');
                        return;
                    }
                    throw error;
                }
                toast.success('Welcome back!');
                navigate('/dashboard');
            } else {
                const { data, error } = await signUp(email, password, fullName);
                if (error) {
                    if (error.message?.toLowerCase().includes('already exists') || error.message?.toLowerCase().includes('already registered')) {
                        toast.error('User already exists! Please sign in instead.');
                        setIsLogin(true);
                        return;
                    }
                    throw error;
                }

                // Supabase may return an obfuscated user for an existing confirmed account.
                if (!data?.session && Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
                    setOtpSent(false);
                    setOtpCode('');
                    setIsLogin(true);
                    toast('Account already exists. Login to continue.');
                    return;
                }

                // If autoconfirm is enabled on Supabase, the session is returned directly
                if (data?.session) {
                    toast.success('Account created and signed in successfully!');
                    navigate('/dashboard');
                } else {
                    setOtpSent(true);
                    toast('If you already have an account, sign in. Otherwise check your email for a verification code.');
                }
            }
        } catch (error: any) {
            console.error('Login Error:', error);
            const errorMsg = error.message || 'Unknown error';
            toast.error(`Request Failed: ${errorMsg}`);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            const { error } = await signInWithGoogle();
            if (error) throw error;
        } catch (error: any) {
            toast.error(error.message || 'Google login failed');
            setLoading(false);
        }
    };

    const handleResendConfirmation = async () => {
        const targetEmail = email.trim();
        if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
            toast.error('Enter your email address first.');
            return;
        }
        setLoading(true);
        try {
            const { error } = await sendVerificationEmail(targetEmail);
            if (error) throw error;
            setEmail(targetEmail);
            setOtpSent(true);
            setIsLogin(false);
            toast.success('If the account needs verification, check your inbox and spam folder.');
        } catch (error: any) {
            toast.error(error.message || 'Could not resend confirmation email.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="entry-screen login-screen">
            <SEO title={isLogin ? 'Sign In | SYNCORA — Free Tally Community & Cloud' : 'Create Account | SYNCORA — Free Tally Community & Cloud'} description="Sign in to SYNCORA TallyOnMobile. Access your Tally data on mobile and web." canonical="https://tallyonmob.vercel.app/login" />
            <div className="entry-topbar"><div className="entry-brand"><span className="entry-brand-mark"><Building2 size={20}/></span><span><strong>SYNCORA</strong><small>TALLY ON MOBILE</small></span></div><button type="button" className="entry-theme" onClick={toggleTheme} aria-label="Toggle theme">{isDark ? <Sun size={18}/> : <Moon size={18}/>}</button></div>
            <div className="login-layout">
                <section className="login-intro"><span className="entry-eyebrow">YOUR BUSINESS, CONNECTED</span><h1>Your Tally, wherever you work.</h1><p>Access your Tally data, reports and business insights from one place.</p><div className="login-features"><span><CheckCircle2 size={16}/> Real-time Tally sync</span><span><CheckCircle2 size={16}/> Reports and GST insights</span><span><CheckCircle2 size={16}/> Mobile and desktop access</span></div></section>
                <section className="login-card">
                    <div className="login-card-header"><span className="entry-eyebrow">SYNCORA ACCOUNT</span><h2>{isLogin ? 'Welcome back' : 'Create your account'}</h2><p>{isLogin ? 'Sign in to the community and your business dashboard' : 'Join SYNCORA and get started with your account'}</p></div>
                    <button type="button" onClick={handleGoogleLogin} disabled={loading} className="login-google"><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 4.53 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Continue with Google</button>
                    <div className="login-divider"><span>or use email</span></div>
                    <form onSubmit={handleSubmit} className="login-form">
                        {!isLogin && !otpSent && <label>Full Name<span className="login-field"><User size={17}/><input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" autoComplete="name" required /></span></label>}
                        {!otpSent && !twoFactorRequired && <><label>Email<span className="login-field"><Mail size={17}/><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required /></span></label><label>Password<span className="login-field"><Lock size={17}/><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete={isLogin ? 'current-password' : 'new-password'} required /></span></label></>}
                        {otpSent && <label>Verification code<span className="login-hint">Check {email} for a confirmation link or code. If this email is already registered, sign in instead.</span><span className="login-field"><Lock size={17}/><input type="text" value={otpCode} onChange={e => setOtpCode(e.target.value)} placeholder="Enter the code if provided" autoComplete="one-time-code" required /></span></label>}
                        {twoFactorRequired && <label>2FA Security Code<span className="login-hint">Enter the 6-digit code from your authenticator app.</span><span className="login-field"><Shield size={17}/><input type="text" maxLength={6} value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value)} placeholder="000000" autoComplete="one-time-code" required /></span></label>}
                        <button type="submit" disabled={loading} className="login-submit">{loading ? 'Please wait…' : isLogin ? (twoFactorRequired ? 'Verify 2FA' : 'Sign In') : (otpSent ? 'Verify Account' : 'Create Account')}{!loading && <ArrowRight size={17}/>}</button>
                    </form>
                    {!twoFactorRequired && <div className="login-switch"><button type="button" disabled={loading} onClick={handleResendConfirmation}>Resend confirmation email</button></div>}
                    <div className="login-switch"><button type="button" onClick={() => { setOtpSent(false); setOtpCode(''); setTwoFactorRequired(false); setIsLogin(!isLogin); }}>{isLogin ? <>Don't have an account? <strong>Sign up</strong></> : <>Already have an account? <strong>Sign in</strong></>}</button></div>
                    <button type="button" className="login-back" onClick={() => navigate('/')}>← Back to home</button>
                </section>
            </div>
        </main>
    );
}
