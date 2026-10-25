import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, ArrowRight, Zap, Shield, Smartphone, Sun, Moon, User, BarChart3, CheckCircle2, Building2 } from 'lucide-react';
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
        { icon: <Zap size={18} />, text: 'Real-time sync with Tally ERP' },
        { icon: <BarChart3 size={18} />, text: 'Smart business analytics & GST reports' },
        { icon: <Shield size={18} />, text: 'Bank-grade AES-256 encryption' },
        { icon: <Smartphone size={18} />, text: 'Works on mobile, tablet & desktop' },
    ];

    // Surfaces: dark = glass on navy (as landing); light = white card on navy
    const cardC = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-xl shadow-black/30';
    const inputC = isDark
        ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-violet-500/60 focus:ring-violet-500/25'
        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:ring-violet-500/20';
    const labelC = isDark ? 'text-slate-200' : 'text-slate-700';
    const subC = isDark ? 'text-slate-400' : 'text-slate-500';
    const headC = isDark ? 'text-white' : 'text-slate-900';

    return (
        <div className="min-h-screen bg-[#070D1A] flex transition-colors duration-300">
            <SEO
                title={isLogin ? 'Sign In | SYNCORA — Free Tally Community & Cloud' : 'Create Account | SYNCORA — Free Tally Community & Cloud'}
                description="Sign in to SYNCORA TallyOnMobile. Access your Tally data on mobile and web — real-time sync, GST reports and business insights, free forever."
                canonical="https://tallyonmob.vercel.app/login"
            />

            {/* ambient glows */}
            <div className="pointer-events-none fixed inset-0" aria-hidden="true">
                <div className="absolute -top-40 left-1/4 h-[420px] w-[700px] rounded-full bg-violet-600/15 blur-[130px]" />
                <div className="absolute bottom-0 right-0 h-[360px] w-[540px] rounded-full bg-sky-600/10 blur-[120px]" />
            </div>

            {/* Theme Toggle */}
            <button
                onClick={toggleTheme}
                className="fixed top-5 right-5 z-50 w-10 h-10 rounded-xl bg-white/5 border border-white/10 backdrop-blur flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-white transition-all"
                aria-label="Toggle theme"
            >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Left — Auth Form */}
            <div className="flex-1 flex flex-col justify-center px-5 sm:px-12 lg:px-16 xl:px-20 py-12 z-10">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                    className={`max-w-md w-full mx-auto rounded-2xl border p-6 sm:p-8 ${cardC}`}
                >
                    {/* Brand */}
                    <div className="flex items-center gap-3 mb-8">
                        <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                            <circle cx="16" cy="6" r="3.4" fill="#8B5CF6" />
                            <circle cx="6" cy="24" r="3.4" fill="#38BDF8" />
                            <circle cx="26" cy="24" r="3.4" fill="#8B5CF6" />
                            <path d="M16 9.5V15M16 15l-7.6 6.4M16 15l7.6 6.4" stroke="#94A3B8" strokeWidth="1.6" strokeLinecap="round" />
                            <circle cx="16" cy="16.4" r="2" fill="#E2E8F0" />
                        </svg>
                        <div>
                            <h1 className={`text-lg font-black tracking-[0.22em] leading-none ${headC}`}>SYNCORA</h1>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400 mt-1">Your Tally. Connected. Everywhere.</p>
                        </div>
                    </div>

                    {/* Heading */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isLogin ? 'login' : 'signup'}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                            className="mb-7"
                        >
                            <h2 className={`text-2xl md:text-[27px] font-bold tracking-tight ${headC}`}>
                                {isLogin ? 'Welcome back' : 'Create your account'}
                            </h2>
                            <p className={`${subC} text-sm mt-2 leading-relaxed`}>
                                {isLogin
                                    ? 'Sign in to the community and your business dashboard'
                                    : 'Join SYNCORA in under a minute — free forever'}
                            </p>
                        </motion.div>
                    </AnimatePresence>

                    {/* Google Login */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className={`w-full border font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 ${
                            isDark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50'
                        }`}
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
                        <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                        <span className={`text-xs font-medium ${subC}`}>or use email</span>
                        <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
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
                                    <label className={`block text-sm font-medium mb-1.5 ${labelC}`}>Full Name</label>
                                    <div className="relative">
                                        <User size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${subC}`} />
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            className={`w-full border rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 transition-all text-sm ${inputC}`}
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
                                    <label className={`block text-sm font-medium mb-1.5 ${labelC}`}>Email</label>
                                    <div className="relative">
                                        <Mail size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${subC}`} />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className={`w-full border rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 transition-all text-sm ${inputC}`}
                                            placeholder="you@company.com"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={`block text-sm font-medium mb-1.5 ${labelC}`}>Password</label>
                                    <div className="relative">
                                        <Lock size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${subC}`} />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className={`w-full border rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 transition-all text-sm ${inputC}`}
                                            placeholder="••••••••"
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
                                <label className={`block text-sm font-medium mb-1.5 ${labelC}`}>Verification Code</label>
                                <div className={`text-sm mb-3 ${subC}`}>
                                    We sent a code to <span className={`font-medium ${headC}`}>{email}</span>.
                                </div>
                                <div className="relative">
                                    <Lock size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${subC}`} />
                                    <input
                                        type="text"
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value)}
                                        className={`w-full border rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 transition-all text-sm ${inputC}`}
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
                                <label className={`block text-sm font-bold mb-1.5 ${labelC}`}>2FA Security Code</label>
                                <div className={`text-sm mb-3 ${subC}`}>
                                    Enter the 6-digit code from your Google Authenticator or other 2FA app.
                                </div>
                                <div className="relative">
                                    <Shield size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${subC}`} />
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={twoFactorCode}
                                        onChange={(e) => setTwoFactorCode(e.target.value)}
                                        className={`w-full border rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 transition-all text-sm font-mono tracking-widest text-center ${inputC}`}
                                        placeholder="000000"
                                        required
                                    />
                                </div>
                            </motion.div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="group w-full bg-gradient-to-r from-violet-600 to-sky-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-violet-950/40 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100 mt-2"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    {isLogin ? (twoFactorRequired ? 'Verify 2FA' : 'Sign In') : (otpSent ? 'Verify Account' : 'Create Account')}
                                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Switch Auth Mode */}
                    <div className="mt-7 text-center">
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className={`text-sm transition-colors ${subC} hover:${headC}`}
                        >
                            {isLogin ? (
                                <>Don't have an account? <span className="font-bold text-violet-400 hover:text-violet-300">Sign up</span></>
                            ) : (
                                <>Already have an account? <span className="font-bold text-violet-400 hover:text-violet-300">Sign in</span></>
                            )}
                        </button>
                    </div>

                    {/* Back to home */}
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => navigate('/')}
                            className={`text-xs transition-colors ${subC} hover:${headC}`}
                        >
                            ← Back to home
                        </button>
                    </div>
                </motion.div>
            </div>

            {/* Right — Brand Panel (Desktop Only) */}
            <div className="hidden lg:flex flex-1 relative items-center justify-center overflow-hidden" style={{ maxWidth: '50%' }}>
                <div className="absolute inset-0 bg-gradient-to-br from-[#0B1424] via-[#101B33] to-[#0B1424]" />
                <div className="absolute inset-0 opacity-60" aria-hidden="true">
                    <div className="absolute -top-24 left-1/3 h-[360px] w-[520px] rounded-full bg-violet-600/20 blur-[120px]" />
                    <div className="absolute bottom-0 left-0 h-[300px] w-[420px] rounded-full bg-sky-600/15 blur-[110px]" />
                </div>

                <div className="relative z-10 px-12 xl:px-20 max-w-lg">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        {/* connected nodes artwork */}
                        <svg className="mb-9 opacity-90" width="150" height="120" viewBox="0 0 150 120" fill="none" aria-hidden="true">
                            <path d="M75 22 C 90 55, 110 60, 122 88 M75 22 C 55 58, 40 65, 28 88 M62 30 C 45 20, 30 18, 16 24 M95 45 C 115 38, 130 40, 140 52" stroke="#8B5CF6" strokeOpacity=".45" strokeWidth="1.4" strokeDasharray="3 6" strokeLinecap="round" />
                            <circle cx="75" cy="22" r="9" fill="#8B5CF6" />
                            <circle cx="28" cy="88" r="7" fill="#38BDF8" />
                            <circle cx="122" cy="88" r="7" fill="#8B5CF6" />
                            <circle cx="16" cy="24" r="4.5" fill="#38BDF8" />
                            <circle cx="140" cy="52" r="4.5" fill="#8B5CF6" />
                            <circle cx="75" cy="60" r="6" fill="#E2E8F0" />
                        </svg>

                        {/* tagline */}
                        <h2 className="text-3xl xl:text-4xl font-black text-white leading-tight tracking-tight mb-5">
                            Your Tally Community.<br />
                            All <span className="bg-gradient-to-r from-violet-400 to-sky-400 bg-clip-text text-transparent">Connected.</span>
                        </h2>

                        <p className="text-slate-400 text-base leading-relaxed mb-8">
                            Sync your Tally to the cloud. Access real-time reports, GST analytics and business insights from any device — with the community behind you.
                        </p>

                        {/* Feature List */}
                        <div className="space-y-4 mb-10">
                            {highlights.map((item, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: 12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.4 + i * 0.1 }}
                                    className="flex items-center gap-4"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-violet-300 flex-shrink-0">
                                        {item.icon}
                                    </div>
                                    <span className="text-slate-300 text-sm font-medium">{item.text}</span>
                                </motion.div>
                            ))}
                        </div>

                        <p className="flex items-center gap-2 text-[12px] text-slate-500">
                            <Building2 size={14} /> Built for business owners, accountants and Tally professionals.
                        </p>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
