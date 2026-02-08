import { motion } from 'framer-motion';
import { Shield, Lock, Eye, Mail, Server, Smartphone, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicyPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#020202] text-white selection:bg-emerald-500/30 font-sans">
            {/* Header */}
            <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/landing')}>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center">
                            <Shield size={22} className="text-white" />
                        </div>
                        <span className="font-black text-xl tracking-tighter uppercase italic">TallyLink</span>
                    </div>
                </div>
            </nav>

            <main className="pt-40 pb-20 px-6 max-w-4xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-12"
                >
                    <header>
                        <h1 className="text-5xl font-black tracking-tighter mb-4">PRIVACY POLICY</h1>
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Last Updated: February 08, 2026</p>
                    </header>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-emerald-400">
                            <Eye size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">1. INTRODUCTION</h2>
                        </div>
                        <p className="text-gray-400 leading-relaxed text-lg font-medium">
                            At TallyLink (LiveKeeping), we take your data privacy with extreme seriousness. This policy explains how we collect, use, and protect your financial data when you use the TallyLink Sync application and our mobile/web dashboard.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-blue-400">
                            <Smartphone size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">2. DATA COLLECTION</h2>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-4">
                            <h3 className="text-white font-bold text-lg">Tally ERP Data</h3>
                            <p className="text-gray-400 leading-relaxed">
                                Our Desktop Sync app reads financial vouchers, ledgers, and stock items from your local Tally ERP instance. This data is extracted only when you initiate or schedule a sync.
                            </p>
                            <h3 className="text-white font-bold text-lg mt-6">Personal Identification</h3>
                            <p className="text-gray-400 leading-relaxed">
                                We collect your name, email address (lovneetrathi@gmail.com), and phone number (+91 9413821007) for account management and security verification.
                            </p>
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-purple-400">
                            <Lock size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">3. DATA SECURITY & ENCRYPTION</h2>
                        </div>
                        <p className="text-gray-400 leading-relaxed text-lg font-medium">
                            Security is our #1 priority. Your data is protected by multiple layers of defense:
                        </p>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                "AES-256 Bit Encryption at Rest",
                                "SSL/TLS 1.3 Encryption in Transit",
                                "Deterministic UUID Generation",
                                "Multi-Factor Authentication (MFA)",
                                "Encrypted Cloud Backups",
                                "Zero-Knowledge Architecture"
                            ].map((item, i) => (
                                <li key={i} className="flex items-center gap-3 bg-white/[0.03] p-4 rounded-xl border border-white/5 font-bold text-sm text-gray-300">
                                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-indigo-400">
                            <Server size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">4. THIRD-PARTY SERVICES</h2>
                        </div>
                        <p className="text-gray-400 leading-relaxed text-lg font-medium">
                            We use Supabase (BaaS) for secure database storage and authentication. Your data is stored in ISO 27001 certified data centers. We never sell or share your individual financial data with advertisers or third parties.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-emerald-400">
                            <Mail size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">5. CONTACT INFORMATION</h2>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-8">
                            <p className="text-gray-300 font-bold mb-4">For any privacy-related queries, contact our Data Protection Officer:</p>
                            <div className="space-y-2 text-emerald-400 font-black">
                                <p>NAME: LAVNEET RATHI</p>
                                <p>EMAIL: LOVNEETRATHI@GMAIL.COM</p>
                                <p>PHONE: +91 9413821007</p>
                            </div>
                        </div>
                    </section>

                    <footer className="pt-20 border-t border-white/5 text-center">
                        <button
                            onClick={() => navigate('/landing')}
                            className="inline-flex items-center gap-2 text-gray-500 hover:text-white font-bold uppercase tracking-widest text-xs transition-colors"
                        >
                            Back to Home <ExternalLink size={14} />
                        </button>
                    </footer>
                </motion.div>
            </main>
        </div>
    );
}
