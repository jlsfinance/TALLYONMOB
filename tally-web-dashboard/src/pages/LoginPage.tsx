import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, ArrowRight, Zap, Shield, Smartphone, Sun, Moon, User, BarChart3, CheckCircle2 } from 'lucide-react';
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
        { icon: <Zap size={20} />, text: "Real-time sync with Tally ERP" },
        { icon: <BarChart3 size={20} />, text: "Smart business analytics & GST reports" },
        { icon: <Shield size={20} />, text: "Bank-grade AES-256 encryption" },
        { icon: <Smartphone size={20} />, text: "Works on mobile, tablet & desktop" },
    ];

    return (
        <div className="min-h-screen bg-[var(--background)] flex transition-colors duration-300">
            <SEO
                title={isLogin ? "Client Login | TallyLink" : "Create Account | TallyLink"}
                description="Securely access your TallyLink business dashboard. Real-time Tally data, GST reports, and AI analytics at your fingertips."
                canonical="https://tallyonmob.vercel.app/login"
            />

            {/* Theme Toggle ? Top Right */}
            <button
                onClick={toggleTheme}
                className="fixed top-5 right-5 z-50 w-10 h-10 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--on-surface-variant)] shadow-[var(--shadow-sm)] hover:bg-[var(--surface-hover)] transition-all"
                aria-label="Toggle theme"
            >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Left ? Auth Form */}
            <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-20 py-12 z-10">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                    className="max-w-md w-full mx-auto"
                >
                    {/* Brand Logo */}
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--primary)] flex items-center justify-center shadow-[var(--shadow-md)]">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-[var(--on-surface)] tracking-tight leading-none">TallyLink</h1>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--primary)] mt-0.5">Cloud Platform</p>
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
                            className="mb-8"
                        >
                            <h2 className="text-2xl md:text-3xl font-bold text-[var(--on-surface)] tracking-tight">
                                {isLogin ? 'Welcome back' : 'Create your account'}
                            </h2>
                            <p className="text-[var(--text-muted)] text-sm mt-2 leading-relaxed">
                                {isLogin
                                    ? 'Sign in to access your business dashboard'
                                    : 'Get started with TallyLink in under a minute'
                                }
                            </p>
                        </motion.div>
                    </AnimatePresence>

                    {/* Google Login ? Show first for quick access */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--on-surface)] font-medium py-3 px-4 rounded-[var(--radius-md)] hover:bg-[var(--surface-hover)] hover:border-[var(--outline-variant)] transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-[var(--shadow-xs)]"
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
                                            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] pl-10 pr-4 py-3 text-[var(--on-surface)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-glow)] transition-all text-sm"
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
                                            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] pl-10 pr-4 py-3 text-[var(--on-surface)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-glow)] transition-all text-sm"
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
                                            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] pl-10 pr-4 py-3 text-[var(--on-surface)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-glow)] transition-all text-sm"
                                            placeholder="????????"
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
                                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] pl-10 pr-4 py-3 text-[var(--on-surface)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-glow)] transition-all text-sm"
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
                                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] pl-10 pr-4 py-3 text-[var(--on-surface)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-glow)] transition-all text-sm font-mono tracking-widest text-center"
                                        placeholder="000000"
                                        required
                                    />
                                </div>
                            </motion.div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[var(--primary)] text-[var(--on-primary)] font-semibold py-3 rounded-[var(--radius-md)] hover:bg-[var(--primary-hover)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
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
                            className="text-sm text-[var(--text-muted)] hover:text-[var(--on-surface)] transition-colors"
                        >
                            {isLogin ? (
                                <>Don't have an account? <span className="font-semibold text-[var(--primary)]">Sign up</span></>
                            ) : (
                                <>Already have an account? <span className="font-semibold text-[var(--primary)]">Sign in</span></>
                            )}
                        </button>
                    </div>

                    {/* Back to home */}
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => navigate('/')}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--on-surface)] transition-colors"
                        >
                            ← Back to home
                        </button>
                    </div>
                </motion.div>
            </div>

            {/* Right — Trust Panel (Desktop Only) */}
            <div className="hidden lg:flex flex-1 relative items-center justify-center bg-[var(--primary)]" style={{ maxWidth: '50%' }}>
                {/* Subtle geometric pattern */}
                <div
                    className="absolute inset-0 opacity-[0.06]"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }}
                />

                <div className="relative z-10 px-12 xl:px-20 max-w-lg">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        {/* Trust badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/90 text-xs font-medium mb-8 backdrop-blur-sm">
                            <CheckCircle2 size={14} />
                            Trusted by 5,000+ Indian businesses
                        </div>

                        {/* Headline */}
                        <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight tracking-tight mb-5">
                            Your Tally data,<br />
                            accessible <span className="text-white/80">everywhere.</span>
                        </h2>

                        <p className="text-white/70 text-base leading-relaxed mb-10">
                            Sync your Tally ERP to the cloud. Access real-time reports, GST analytics, and business insights from any device.
                        </p>

                        {/* Feature List */}
                        <div className="space-y-4">
                            {highlights.map((item, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: 12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.4 + i * 0.1 }}
                                    className="flex items-center gap-4"
                                >
                                    <div className="w-10 h-10 rounded-[var(--radius-md)] bg-white/10 flex items-center justify-center text-white flex-shrink-0">
                                        {item.icon}
                                    </div>
                                    <span className="text-white/90 text-sm font-medium">{item.text}</span>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
