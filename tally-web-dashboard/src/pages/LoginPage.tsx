import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, ArrowRight, Shield, Sun, Moon, User, BarChart3, CheckCircle2, BookOpen, Package, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthContextType } from '../contexts/types';
import SEO from '../components/common/SEO';

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
                    if (error.message?.toLowerCase().includes('not verified') || error.message?.toLowerCase().includes('verify')) {
                        const { error: sendError } = await sendVerificationEmail(email);
                        if (sendError) throw sendError;
                        setOtpSent(true);
                        setIsLogin(false);
                        toast.error('Email not verified. We sent a new OTP to your email.');
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
                
                // If autoconfirm is enabled on Supabase, the session is returned directly
                if (data?.session) {
                    toast.success('Account created and signed in successfully!');
                    navigate('/dashboard');
                } else {
                    setOtpSent(true);
                    toast.success('Account created! Please check your email for the OTP.');
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

    const highlights = [
        { icon: <BarChart3 size={19} />, text: "Business overview and reports" },
        { icon: <BookOpen size={19} />, text: "Ledgers and voucher workspaces" },
        { icon: <MessageCircle size={19} />, text: "Payment follow-up tools" },
        { icon: <Package size={19} />, text: "Inventory alongside your books" },
    ];

    return (
        <div className="min-h-screen overflow-x-hidden bg-[#f7f9f6] text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100 lg:flex">
            <SEO
                title={isLogin ? "Client Login | SYNCORA TallyOnMobile" : "Create Account | SYNCORA TallyOnMobile"}
                description="Sign in to access your TallyOnMobile workspace, including company ledgers, vouchers, reports and inventory."
                canonical="https://tallyonmob.vercel.app/login"
            />

            {/* Theme Toggle ? Top Right */}
            <button
                onClick={toggleTheme}
                className="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800 sm:right-6 sm:top-6"
                aria-label="Toggle theme"
            >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Left ? Auth Form */}
            <div className="relative z-10 flex min-h-screen flex-1 flex-col justify-center px-4 py-10 sm:px-8 sm:py-12 lg:px-10 xl:px-16">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                    className="mx-auto w-full max-w-md rounded-[2rem] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.28)] backdrop-blur sm:p-8 dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-black/30"
                >
                    {/* Brand Logo */}
                    <button type="button" onClick={() => navigate('/')} className="mb-8 flex items-center gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black tracking-tight text-white shadow-sm">TL</span>
                        <div>
                            <h1 className="text-base font-black leading-none tracking-tight text-slate-950 dark:text-white">TallyOnMobile</h1>
                            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.19em] text-slate-500 dark:text-slate-400">Business, in view</p>
                        </div>
                    </button>

                    {/* Heading */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isLogin ? 'login' : 'signup'}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                            className="mb-8"
                        >
                            <h2 className="text-2xl md:text-3xl font-bold text-[var(--on-surface)] tracking-tight">
                                {isLogin ? 'Welcome back' : 'Create your account'}
                            </h2>
                            <p className="text-[var(--text-muted)] text-sm mt-2 leading-relaxed">
                                {isLogin
                                    ? 'Sign in to access your business dashboard'
                                    : 'Create your TallyOnMobile account to get started'
                                }
                            </p>
                        </motion.div>
                    </AnimatePresence>

                    {/* Google Login ? Show first for quick access */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Continue with Google
                    </button>

                    {/* Divider */}
                    <div className="flex items-center gap-4 my-6">
                        <div className="flex-1 h-px bg-[var(--border)]" />
                        <span className="text-xs font-medium text-[var(--text-muted)]">or use email</span>
                        <div className="flex-1 h-px bg-[var(--border)]" />
                    </div>

                    {/* Auth Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <AnimatePresence>
                            {!isLogin && !otpSent && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <label className="block text-sm font-medium text-[var(--on-surface)] mb-1.5">Full Name</label>
                                    <div className="relative">
                                        <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-900"
                                            placeholder="Your full name"
                                            required={!isLogin && !otpSent}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {!otpSent && !twoFactorRequired && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--on-surface)] mb-1.5">Email</label>
                                    <div className="relative">
                                        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-900"
                                            placeholder="you@company.com"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-[var(--on-surface)] mb-1.5">Password</label>
                                    <div className="relative">
                                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-900"
                                            placeholder="Enter your password"
                                            required
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {otpSent && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="overflow-hidden"
                            >
                                <label className="block text-sm font-medium text-[var(--on-surface)] mb-1.5">Verification Code</label>
                                <div className="text-sm text-[var(--text-muted)] mb-3">
                                    We sent a code to <span className="font-medium text-[var(--on-surface)]">{email}</span>.
                                </div>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                    <input
                                        type="text"
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-900"
                                        placeholder="Enter the 6-digit OTP"
                                        required
                                    />
                                </div>
                            </motion.div>
                        )}

                        {twoFactorRequired && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="overflow-hidden"
                            >
                                <label className="block text-sm font-medium text-[var(--on-surface)] mb-1.5 font-bold">2FA Security Code</label>
                                <div className="text-sm text-[var(--text-muted)] mb-3">
                                    Enter the 6-digit code from your Google Authenticator or other 2FA app.
                                </div>
                                <div className="relative">
                                    <Shield size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={twoFactorCode}
                                        onChange={(e) => setTwoFactorCode(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-center font-mono text-sm tracking-widest text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-900"
                                        placeholder="000000"
                                        required
                                    />
                                </div>
                            </motion.div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 font-bold text-white shadow-sm transition hover:bg-emerald-800 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    {isLogin ? (twoFactorRequired ? 'Verify 2FA' : 'Sign In') : (otpSent ? 'Verify Account' : 'Create Account')}
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Switch Auth Mode */}
                    <div className="mt-8 text-center">
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-sm text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-slate-300 dark:hover:text-white"
                        >
                            {isLogin ? (
                                <>Don't have an account? <span className="font-semibold text-emerald-700 dark:text-emerald-300">Sign up</span></>
                            ) : (
                                <>Already have an account? <span className="font-semibold text-emerald-700 dark:text-emerald-300">Sign in</span></>
                            )}
                        </button>
                    </div>

                    {/* Back to home */}
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => navigate('/')}
                            className="text-xs text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-slate-400 dark:hover:text-white"
                        >
                            ← Back to home
                        </button>
                    </div>
                </motion.div>
            </div>

            {/* Product preview panel (desktop only) */}
            <aside className="relative hidden flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50 via-[#f7f9f6] to-cyan-50 px-8 py-12 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 lg:flex">
                <div aria-hidden="true" className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-200/60 blur-3xl dark:bg-emerald-500/10" />
                <div aria-hidden="true" className="absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-cyan-100/80 blur-3xl dark:bg-cyan-500/10" />

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="relative z-10 w-full max-w-xl rounded-[2rem] border border-white/80 bg-white/75 p-8 shadow-[0_30px_90px_-42px_rgba(15,23,42,0.25)] backdrop-blur-xl xl:p-10 dark:border-slate-700/80 dark:bg-slate-900/75 dark:shadow-black/30"
                >
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                        <CheckCircle2 size={14} /> TallyOnMobile workspace
                    </div>

                    <h2 className="text-3xl font-black leading-tight tracking-tight text-slate-950 xl:text-4xl dark:text-white">
                        Your Tally business,<br />in view.
                    </h2>
                    <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">
                        Sign in to access your company workspace, including ledgers, vouchers, reports, inventory and payment follow-up tools.
                    </p>

                    <div className="mt-8 grid grid-cols-2 gap-3">
                        {highlights.map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.25 + i * 0.08 }}
                                className="flex min-h-[82px] items-center gap-3 rounded-2xl border border-slate-100 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/80"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
                                    {item.icon}
                                </span>
                                <span className="text-xs font-semibold leading-snug text-slate-700 sm:text-sm dark:text-slate-200">{item.text}</span>
                            </motion.div>
                        ))}
                    </div>

                    <div className="mt-6 rounded-2xl border border-slate-100 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">A clear view of your business</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Illustrative workspace preview</p>
                            </div>
                            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">Overview</span>
                        </div>
                        <div aria-hidden="true" className="mt-4 flex h-14 items-end gap-2">
                            {[34, 51, 43, 68, 57, 82, 64, 91, 72, 100, 81, 92].map((height, i) => (
                                <span key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-emerald-700 to-lime-400" style={{ height: `${height}%`, opacity: 0.62 + (i % 3) * 0.12 }} />
                            ))}
                        </div>
                        <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">Example illustration only — sign in to view your own workspace.</p>
                    </div>
                </motion.div>
            </aside>
        </div>
    );
}
