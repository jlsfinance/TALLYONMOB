import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, ArrowRight, Zap, Shield, Smartphone, Sun, Moon, User, RefreshCw, Sparkles, BarChart3, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthContextType } from '../contexts/types';

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);

    const { signIn, signUp, signInWithGoogle } = useAuth() as AuthContextType;
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (isLogin) {
                const { error } = await signIn(email, password);
                if (error) throw error;
                toast.success('Welcome back!');
                navigate('/');
            } else {
                const { error } = await signUp(email, password, fullName);
                if (error) throw error;
                toast.success('Account created! Please check your email.');
            }
        } catch (error: any) {
            toast.error(error.message || 'Authentication failed');
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

    const features = [
        { icon: <Zap size={18} />, title: "Real-time Sync", desc: "Your Tally data synced instantly to the cloud" },
        { icon: <Shield size={18} />, title: "Bank-grade Security", desc: "256-bit encryption protects your data" },
        { icon: <BarChart3 size={18} />, title: "Smart Analytics", desc: "AI-powered insights and GST reports" },
        { icon: <Globe size={18} />, title: "Access Anywhere", desc: "Mobile, tablet, or desktop - your choice" },
    ];

    const inputClasses = `
        w-full bg-[var(--surface-variant)]
        border border-[var(--border)]
        rounded-xl px-5 py-4
        text-[var(--on-surface)]
        placeholder:text-[var(--text-muted)]
        focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10
        transition-all duration-300
        font-medium
    `;

    return (
        <div className="min-h-screen bg-[var(--background)] flex transition-colors duration-500 overflow-hidden">
            {/* Animated Background Orbs */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        x: [0, 30, 0],
                        y: [0, -20, 0],
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/10 rounded-full blur-[120px]"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        y: [0, 30, 0],
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-500/10 rounded-full blur-[100px]"
                />
            </div>

            {/* Theme Toggle */}
            <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleTheme}
                className="fixed top-6 right-6 z-50 w-11 h-11 rounded-xl bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] flex items-center justify-center text-[var(--on-surface-variant)] shadow-lg transition-all"
            >
                <motion.div
                    animate={{ rotate: isDark ? 0 : 180 }}
                    transition={{ duration: 0.5, type: 'spring' }}
                >
                    {isDark ? <Sun size={18} /> : <Moon size={18} />}
                </motion.div>
            </motion.button>

            {/* Left Side - Auth Form */}
            <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-20 py-12 z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="max-w-md w-full mx-auto"
                >
                    {/* Logo */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 mb-12"
                    >
                        <div className="relative">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                                <RefreshCw size={22} className="text-white" />
                            </div>
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[var(--background)] animate-pulse" />
                        </div>
                        <div>
                            <h1 className="font-black text-xl text-[var(--on-surface)] tracking-tight">TallySync</h1>
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-cyan-500">Cloud Platform</p>
                        </div>
                    </motion.div>

                    {/* Header */}
                    <div className="mb-8">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={isLogin ? 'login' : 'signup'}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <h2 className="text-3xl md:text-4xl font-black text-[var(--on-surface)] mb-3 tracking-tight">
                                    {isLogin ? 'Welcome back' : 'Get started'}
                                </h2>
                                <p className="text-[var(--text-muted)] text-base">
                                    {isLogin
                                        ? 'Sign in to access your business dashboard'
                                        : 'Create your account to start syncing Tally data'
                                    }
                                </p>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Auth Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <AnimatePresence>
                            {!isLogin && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 ml-1">Full Name</label>
                                    <div className="relative group">
                                        <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-cyan-500 transition-colors" />
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            className={`${inputClasses} pl-12`}
                                            placeholder="John Doe"
                                            required={!isLogin}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 ml-1">Email Address</label>
                            <div className="relative group">
                                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-cyan-500 transition-colors" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={`${inputClasses} pl-12`}
                                    placeholder="you@company.com"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 ml-1">Password</label>
                            <div className="relative group">
                                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-cyan-500 transition-colors" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={`${inputClasses} pl-12`}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <motion.button
                            type="submit"
                            disabled={loading}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/30 transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-6"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    {isLogin ? 'Sign In' : 'Create Account'}
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </motion.button>
                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-4 my-6">
                        <div className="flex-1 h-px bg-[var(--border)]" />
                        <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">or continue with</span>
                        <div className="flex-1 h-px bg-[var(--border)]" />
                    </div>

                    {/* Google Login */}
                    <motion.button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--on-surface)] font-semibold py-4 rounded-xl hover:border-cyan-500/30 hover:bg-[var(--surface-hover)] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Google
                    </motion.button>

                    {/* Toggle Auth Mode */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="mt-8 text-center"
                    >
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-[var(--text-muted)] hover:text-cyan-500 transition-colors text-sm font-medium"
                        >
                            {isLogin ? (
                                <>Don't have an account? <span className="font-bold text-cyan-500">Sign up</span></>
                            ) : (
                                <>Already have an account? <span className="font-bold text-cyan-500">Sign in</span></>
                            )}
                        </button>
                    </motion.div>

                    {/* Back to home */}
                    <div className="mt-6 text-center">
                        <button
                            onClick={() => navigate('/')}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--on-surface)] transition-colors"
                        >
                            ← Back to home
                        </button>
                    </div>
                </motion.div>
            </div>

            {/* Right Side - Feature Showcase (Desktop) */}
            <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-cyan-950/50 via-blue-950/30 to-violet-950/50 overflow-hidden">
                {/* Pattern overlay */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
                        backgroundSize: '32px 32px'
                    }}
                />

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        className="space-y-10"
                    >
                        {/* Badge */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20"
                        >
                            <Sparkles size={14} className="text-cyan-400" />
                            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Trusted by 10,000+ Businesses</span>
                        </motion.div>

                        {/* Headline */}
                        <motion.h2
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="text-5xl xl:text-6xl font-black text-white leading-[1.1] tracking-tight"
                        >
                            Your Tally data,
                            <br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">
                                everywhere.
                            </span>
                        </motion.h2>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="text-gray-400 text-lg max-w-md leading-relaxed"
                        >
                            Sync your Tally ERP to the cloud. Access real-time reports, GST analytics, and business insights from any device.
                        </motion.p>

                        {/* Feature List */}
                        <div className="grid gap-4 max-w-md">
                            {features.map((f, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.6 + i * 0.1 }}
                                    className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        {f.icon}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-sm">{f.title}</h3>
                                        <p className="text-xs text-gray-500">{f.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Decorative elements */}
                <div className="absolute top-1/4 right-[-100px] w-[300px] h-[300px] border border-cyan-500/10 rounded-full animate-[spin_30s_linear_infinite]" />
                <div className="absolute bottom-1/4 right-[-150px] w-[400px] h-[400px] border border-violet-500/10 rounded-full animate-[spin_40s_linear_infinite_reverse]" />
            </div>
        </div>
    );
}
