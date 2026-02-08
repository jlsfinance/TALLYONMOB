import { motion } from 'framer-motion';
import { RefreshCcw, XCircle, Info, Mail, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function RefundPolicyPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#020202] text-white selection:bg-purple-500/30 font-sans">
            {/* Header */}
            <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/landing')}>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                            <RefreshCcw size={22} className="text-white" />
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
                        <h1 className="text-5xl font-black tracking-tighter mb-4 uppercase">REFUND & CANCELLATION</h1>
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Last Updated: February 08, 2026</p>
                    </header>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-purple-400">
                            <XCircle size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">1. CANCELLATION POLICY</h2>
                        </div>
                        <p className="text-gray-400 leading-relaxed text-lg font-medium">
                            You may cancel your TallyLink subscription at any time directly through the dashboard or by contacting our support team. Cancellation will stop any future billing, but your service will continue until the end of the current billing cycle.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-pink-400">
                            <RefreshCcw size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">2. REFUND ELIGIBILITY</h2>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
                            <div className="flex gap-4">
                                <div className="w-12 h-12 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-500 shrink-0"><Info size={24} /></div>
                                <div>
                                    <h3 className="text-white font-bold text-lg mb-2">7-Day Money Back Guarantee</h3>
                                    <p className="text-gray-400 leading-relaxed">
                                        We offer a full refund if you are dissatisfied with our service within the first 7 days of your initial subscription. This applies to the first-time purchase only.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0"><CheckCircle2 size={24} /></div>
                                <div>
                                    <h3 className="text-white font-bold text-lg mb-2">Prorated Refunds</h3>
                                    <p className="text-gray-400 leading-relaxed">
                                        Refunds are generally not provided for the remaining period of a subscription after the initial 7-day window. However, exceptions may be made for service outages exceeding 48 hours.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-blue-400">
                            <Mail size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">3. HOW TO REQUEST A REFUND</h2>
                        </div>
                        <p className="text-gray-400 leading-relaxed text-lg font-medium">
                            To request a refund, please send an email to <span className="text-blue-400 font-black">lovneetrathi@gmail.com</span> with your registered business name, email address, and reason for cancellation. We process all valid requests within 5-7 business days.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-amber-400">
                            <Info size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">4. NON-REFUNDABLE CASES</h2>
                        </div>
                        <ul className="space-y-3">
                            {[
                                "Subscriptions cancelled after the 7-day initial window.",
                                "Misuse of API or platform violating our Terms & Conditions.",
                                "Data discrepancies caused by incorrect manual entry in Tally ERP.",
                                "Promotional or discounted annual plans (unless specified otherwise)."
                            ].map((item, i) => (
                                <li key={i} className="flex items-center gap-3 text-sm text-gray-500 font-bold">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {item}
                                </li>
                            ))}
                        </ul>
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
