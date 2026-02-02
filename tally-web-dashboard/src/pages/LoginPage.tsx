import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, ArrowRight, Zap, Shield, Smartphone, Sun, Moon, User, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthContextType } from '@/contexts/types';

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
        { icon: <Zap size={20} />, title: "3D Visual Sync", desc: "Experience your Tally data in a new dimension." },
        { icon: <Shield size={20} />, title: "Secure-Vault", desc: "Military-grade encryption for your financial data." },
        { icon: <Smartphone size={20} />, title: "Cloud-Node", desc: "Access your business OS from any device globally." },
    ];

    const inputClasses = `
        w-full bg-[var(--surface-variant)]
        border border-[var(--border)]
        rounded-2xl px-5 py-4
        text-[var(--on-surface)]
        placeholder:text-[var(--text-muted)]
        focus:outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-glow)]
        transition-all duration-300
        font-medium
    `;

    return (
        <div className="min-h-screen bg-[var(--surface)] flex flex-col md:flex-row transition-colors duration-500 overflow-hidden">
            {/* Design Elements */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[var(--primary)] opacity-10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[var(--secondary)] opacity-10 blur-[100px] rounded-full" />
            </div>

            {/* Mobile Header / Theme Toggle */}
            <div className="absolute top-6 left-6 z-50 flex items-center gap-4">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex items-center gap-3"
                >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center shadow-lg shadow-[var(--primary-glow)]">
                        <span className="text-white font-black text-xl">L</span>
                    </div>
                    <div>
                        <h1 className="font-black text-xl text-[var(--on-surface)] tracking-tight">BillBook</h1>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--primary)] opacity-80 -mt-1">Fin-OS</p>
                    </div>
                </motion.div>
            </div>

            <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleTheme}
                className="fixed top-6 right-6 z-50 w-12 h-12 rounded-2xl bg-[var(--surface-variant)] backdrop-blur-xl border border-[var(--border)] flex items-center justify-center text-[var(--on-surface-variant)] shadow-lg transition-all"
            >
                <motion.div
                    animate={{ rotate: isDark ? 0 : 180 }}
                    transition={{ duration: 0.5, type: 'spring' }}
                >
                    {isDark ? <Sun size={20} /> : <Moon size={20} />}
                </motion.div>
            </motion.button>

            {/* Left Side - Auth Form */}
            <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 md:px-16 lg:px-24 pt-32 md:pt-0 z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="max-w-md w-full mx-auto"
                >
                    <div className="mb-10 text-center md:text-left">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={isLogin ? 'login-head' : 'signup-head'}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <h2 className="text-4xl md:text-5xl font-black text-[var(--on-surface)] mb-4 tracking-tighter">
                                    {isLogin ? 'Ready to Sync?' : 'Digital Horizon.'}
                                </h2>
                                <p className="text-[var(--text-muted)] text-lg font-medium leading-relaxed">
                                    {isLogin ? 'Access your private financial universe.' : 'Start your journey with the worlds most powerful billing engine.'}
                                </p>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <AnimatePresence>
                            {!isLogin && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                                    animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                                    className="overflow-hidden"
                                >
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 ml-1">Full Identity</label>
                                    <div className="relative group">
                                        <User size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors" />
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            className={`${inputClasses} pl-14`}
                                            placeholder="Your Name"
                                            required={!isLogin}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 ml-1">Terminal ID (Email)</label>
                            <div className="relative group">
                                <Mail size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={`${inputClasses} pl-14`}
                                    placeholder="identity@vault.com"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 ml-1">Access Key</label>
                            <div className="relative group">
                                <Lock size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={`${inputClasses} pl-14`}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <motion.button
                            type="submit"
                            disabled={loading}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white font-black py-5 rounded-2xl shadow-xl shadow-[var(--primary-glow)] hover:shadow-2xl transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs mt-6 disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    {isLogin ? 'Initiate Link' : 'Generate Core'}
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </motion.button>
                    </form>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="mt-8 text-center"
                    >
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors text-sm font-bold flex items-center justify-center gap-2 mx-auto cursor-pointer"
                        >
                            {isLogin ? (
                                <>New Operator? <span className="text-[var(--primary)] underline underline-offset-4">Create Identity</span></>
                            ) : (
                                <>Existing Identity? <span className="text-[var(--primary)] underline underline-offset-4">Sign In</span></>
                            )}
                        </button>
                    </motion.div>
                </motion.div>
            </div>

            {/* Right Side - Experience (Hidden on Mobile) */}
            <div className="hidden lg:flex flex-1 relative bg-[var(--surface-variant)] overflow-hidden border-l border-[var(--border)]">
                <div className="absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-[var(--primary)] opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, var(--primary) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
                </div>

                <div className="relative z-10 flex flex-col justify-center px-20">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        className="space-y-12"
                    >
                        <div className="space-y-6">
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--primary-glow)] border border-[var(--primary)]/20 text-[10px] font-black uppercase tracking-widest text-[var(--primary)] text-white"
                            >
                                <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse shadow-[0_0_8px_var(--success)]" />
                                Quantum Link Stable
                            </motion.div>

                            <motion.h2
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="text-6xl font-black text-[var(--on-surface)] leading-[1.1] tracking-tighter"
                            >
                                Your business,<br />
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)]">
                                    re-imagined.
                                </span>
                            </motion.h2>

                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                                className="text-[var(--text-muted)] text-xl font-medium leading-relaxed max-w-md"
                            >
                                The world's first hybrid Financial OS syncing your legacy Tally ERP to the edge. Real-time, 3D analytics, and global access.
                            </motion.p>
                        </div>

                        <div className="grid gap-6">
                            {features.map((f, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.6 + i * 0.1 }}
                                    whileHover={{ x: 10, scale: 1.02 }}
                                    className="flex items-center gap-6 p-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xl transition-all cursor-default"
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] text-white flex items-center justify-center shadow-lg">
                                        {f.icon}
                                    </div>
                                    <div>
                                        <h3 className="font-black text-[var(--on-surface)] uppercase tracking-wide text-xs">{f.title}</h3>
                                        <p className="text-sm text-[var(--text-muted)] font-medium mt-1">{f.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Decorative mesh */}
                <div className="absolute top-[20%] right-[-10%] w-[300px] h-[300px] border border-[var(--primary)]/10 rounded-full animate-[spin_20s_linear_infinite]" />
                <div className="absolute bottom-[20%] right-[-10%] w-[500px] h-[500px] border border-[var(--secondary)]/10 rounded-full animate-[spin_30s_linear_infinite]" />
            </div>
        </div>
    );
}
