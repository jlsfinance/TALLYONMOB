import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, ArrowRight, Zap, Shield, Smartphone, Sun, Moon, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthContextType } from '@/contexts/types';
import { M3Button } from '@/components/ui/GlassUI';

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);

    const { signIn, signUp } = useAuth() as AuthContextType;
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

    const features = [
        { icon: <Zap size={22} />, title: "Real-time Sync", desc: "Instant data synchronization with Tally" },
        { icon: <Shield size={22} />, title: "Enterprise Security", desc: "Bank-grade 256-bit encryption" },
        { icon: <Smartphone size={22} />, title: "Mobile First", desc: "Access your data anywhere, anytime" },
    ];

    const inputClasses = `
        w-full bg-[var(--md-sys-color-surface-container-high)]
        border-2 border-transparent
        rounded-2xl px-5 py-4
        text-[var(--md-sys-color-on-surface)]
        placeholder:text-[var(--md-sys-color-on-surface-variant)]
        focus:outline-none focus:border-[var(--md-sys-color-primary)]
        transition-all duration-200
    `;

    return (
        <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex transition-colors duration-300">
            {/* Theme Toggle - Fixed */}
            <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleTheme}
                className="fixed top-6 right-6 z-50 w-12 h-12 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] shadow-lg transition-colors"
            >
                <motion.div
                    animate={{ rotate: isDark ? 0 : 180 }}
                    transition={{ duration: 0.3 }}
                >
                    {isDark ? <Sun size={20} /> : <Moon size={20} />}
                </motion.div>
            </motion.button>

            {/* Left Side - Login Form */}
            <div className="flex-1 flex flex-col justify-center px-8 md:px-16 lg:px-24">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
                    className="max-w-md w-full mx-auto"
                >
                    {/* Logo */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex items-center gap-4 mb-12"
                    >
                        <div className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-[var(--md-sys-color-primary)] to-[var(--md-sys-color-tertiary)] flex items-center justify-center shadow-xl">
                            <span className="text-white font-bold text-2xl">L</span>
                        </div>
                        <div>
                            <h1 className="font-bold text-2xl text-[var(--md-sys-color-on-surface)]">LiveKeeping</h1>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-[0.2em] font-medium">Enterprise</p>
                        </div>
                    </motion.div>

                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="mb-10"
                    >
                        <AnimatePresence mode="wait">
                            <motion.h2
                                key={isLogin ? 'login' : 'signup'}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="text-4xl font-bold text-[var(--md-sys-color-on-surface)] mb-3"
                            >
                                {isLogin ? 'Welcome back' : 'Get started'}
                            </motion.h2>
                        </AnimatePresence>
                        <p className="text-[var(--md-sys-color-on-surface-variant)] text-lg">
                            {isLogin
                                ? 'Enter your credentials to access your dashboard'
                                : 'Create your account to start syncing'}
                        </p>
                    </motion.div>

                    {/* Form */}
                    <motion.form
                        onSubmit={handleSubmit}
                        className="space-y-5"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <AnimatePresence>
                            {!isLogin && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface-variant)] mb-2">Full Name</label>
                                    <div className="relative">
                                        <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]" />
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
                            <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface-variant)] mb-2">Email Address</label>
                            <div className="relative">
                                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]" />
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
                            <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface-variant)] mb-2">Password</label>
                            <div className="relative">
                                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]" />
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
                            className="w-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-bold py-4 rounded-full hover:shadow-lg transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    {isLogin ? 'Sign In' : 'Create Account'}
                                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </motion.button>
                    </motion.form>

                    {/* Toggle */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-center text-[var(--md-sys-color-on-surface-variant)] mt-8"
                    >
                        {isLogin ? "Don't have an account?" : "Already have an account?"}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            onClick={() => setIsLogin(!isLogin)}
                            className="ml-2 text-[var(--md-sys-color-primary)] font-semibold"
                        >
                            {isLogin ? 'Sign Up' : 'Sign In'}
                        </motion.button>
                    </motion.p>
                </motion.div>
            </div>

            {/* Right Side - Marketing (Hidden on Mobile) */}
            <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="hidden lg:flex flex-1 bg-[var(--md-sys-color-surface-container-low)] p-16 flex-col justify-center relative overflow-hidden"
            >
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--md-sys-color-primary-container)] rounded-full blur-[150px] opacity-30" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[var(--md-sys-color-tertiary-container)] rounded-full blur-[120px] opacity-30" />

                <div className="relative z-10 max-w-lg">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-sm font-medium text-[var(--md-sys-color-primary)] mb-8"
                    >
                        <span className="w-2 h-2 rounded-full bg-[var(--md-sys-color-success)] animate-pulse" />
                        All systems operational
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="text-5xl font-bold text-[var(--md-sys-color-on-surface)] leading-tight mb-6"
                    >
                        Your Tally data,<br />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-[var(--md-sys-color-primary)] to-[var(--md-sys-color-tertiary)]">
                            anywhere.
                        </span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="text-[var(--md-sys-color-on-surface-variant)] text-lg leading-relaxed mb-12"
                    >
                        Seamlessly sync your Tally ERP data to mobile and web. Access real-time reports, track outstanding invoices, and manage your business on the go.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7 }}
                        className="space-y-4"
                    >
                        {features.map((f, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.7 + i * 0.1 }}
                                whileHover={{ x: 5 }}
                                className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/20"
                            >
                                <div className="w-12 h-12 rounded-xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center">
                                    {f.icon}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-[var(--md-sys-color-on-surface)]">{f.title}</h3>
                                    <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{f.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}
