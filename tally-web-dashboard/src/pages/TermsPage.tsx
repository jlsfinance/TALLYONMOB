import { motion } from 'framer-motion';
import { FileText, CheckCircle2, AlertTriangle, Scale, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TermsPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#020202] text-white selection:bg-blue-500/30 font-sans">
            {/* Header */}
            <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/landing')}>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                            <FileText size={22} className="text-white" />
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
                        <h1 className="text-5xl font-black tracking-tighter mb-4">TERMS & CONDITIONS</h1>
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Last Updated: February 08, 2026</p>
                    </header>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-blue-400">
                            <CheckCircle2 size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">1. ACCEPTANCE OF TERMS</h2>
                        </div>
                        <p className="text-gray-400 leading-relaxed text-lg font-medium">
                            By downloading the TallyLink Sync application or accessing our cloud dashboard, you agree to be bound by these Terms and Conditions. If you do not agree, please stop using the software immediately.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-emerald-400">
                            <Scale size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">2. LICENSE & USAGE</h2>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-4">
                            <p className="text-gray-400 leading-relaxed">
                                We grant you a revocable, non-exclusive, non-transferable, limited license to download, install and use the Software solely for your personal and commercial business purposes strictly in accordance with the terms of this Agreement.
                            </p>
                            <h3 className="text-white font-bold text-lg mt-6">Restrictions</h3>
                            <ul className="space-y-3">
                                {[
                                    "No reverse engineering or decompiling the sync engine.",
                                    "No unauthorized distribution of the TallyLink setup file.",
                                    "No using the platform for money laundering or illegal activities.",
                                    "No attempting to bypass API rate limits."
                                ].map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-sm text-gray-500 font-bold">
                                        <AlertTriangle size={14} className="text-amber-500" /> {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-purple-400">
                            <FileText size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">3. DATA OWNERSHIP</h2>
                        </div>
                        <p className="text-gray-400 leading-relaxed text-lg font-medium">
                            You retain 100% ownership of your Tally ERP data. TallyLink acts only as a synchronization medium and processing layer. We do not claim any intellectual property rights over the financial data you sync.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-red-400">
                            <AlertTriangle size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">4. DISCLAIMER OF LIABILITY</h2>
                        </div>
                        <p className="text-gray-400 leading-relaxed text-lg font-medium">
                            The Software is provided "AS IS". TallyLink (LiveKeeping) shall not be liable for any direct, indirect, incidental, special or consequential damages resulting from the use or the inability to use the service. We do not guarantee 100% accurate bank reconciliation as it depends on user input in Tally ERP.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 text-indigo-400">
                            <Scale size={24} />
                            <h2 className="text-2xl font-black tracking-tight uppercase">5. GOVERNING LAW</h2>
                        </div>
                        <p className="text-gray-400 leading-relaxed text-lg font-medium">
                            These terms shall be governed by and construed in accordance with the laws of India. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the courts located in Rajasthan, India.
                        </p>
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
