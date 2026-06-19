import { useState, useEffect, useRef } from 'react';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/common/SEO';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowRight,
    Smartphone,
    Monitor,
    Cloud,
    Zap,
    Shield,
    CheckCircle,
    Database,
    Lock,
    Users,
    Activity,
    Mail,
    Sparkles,
    BarChart3,
    FileText,
    ChevronDown,
    Share2,
    Scale,
    ShieldCheck
} from 'lucide-react';

// --- WebGL Background Shader ---
function WebGLBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleResize = () => {
            const w = canvas.clientWidth || 1280;
            const h = canvas.clientHeight || 720;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
        };

        const observer = new ResizeObserver(handleResize);
        observer.observe(canvas);
        handleResize();

        const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (!gl) return;

        const vs = `
            attribute vec2 a_position;
            varying vec2 v_texCoord;
            void main() {
                v_texCoord = a_position * 0.5 + 0.5;
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        const fs = `
            precision highp float;
            uniform float u_time;
            uniform vec2 u_resolution;
            varying vec2 v_texCoord;
            void main() {
                vec2 uv = v_texCoord;
                float slow_time = u_time * 0.15;
                vec3 color1 = vec3(0.039, 0.055, 0.082); // Deep Navy
                vec3 color2 = vec3(0.086, 0.647, 0.729); // Vibrant Cyan
                vec3 color3 = vec3(0.047, 0.451, 0.588); // Deep Blue
                
                float n1 = sin(uv.x * 2.0 + slow_time) * cos(uv.y * 3.0 - slow_time);
                float n2 = sin(uv.y * 2.0 - slow_time * 1.2) * cos(uv.x * 3.0 + slow_time);
                float mask = smoothstep(0.4, 0.6, (n1 + n2 + 1.0) * 0.5);
                
                vec3 mixed_color = mix(color1, mix(color2, color3, uv.y), mask * 0.12);
                float dist = distance(uv, vec2(0.5));
                mixed_color *= smoothstep(0.8, 0.2, dist);
                
                gl_FragColor = vec4(mixed_color, 1.0);
            }
        `;

        const compileShader = (type: number, src: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            return shader;
        };

        const prog = gl.createProgram();
        if (!prog) return;

        const vertexShader = compileShader(gl.VERTEX_SHADER, vs);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fs);
        if (!vertexShader || !fragmentShader) return;

        gl.attachShader(prog, vertexShader);
        gl.attachShader(prog, fragmentShader);
        gl.linkProgram(prog);
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

        const pos = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

        const uTime = gl.getUniformLocation(prog, 'u_time');
        const uRes = gl.getUniformLocation(prog, 'u_resolution');

        let animationFrameId: number;
        const render = (time: number) => {
            gl.viewport(0, 0, canvas.width, canvas.height);
            if (uTime) gl.uniform1f(uTime, time * 0.001);
            if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            animationFrameId = requestAnimationFrame(render);
        };

        animationFrameId = requestAnimationFrame(render);

        return () => {
            observer.disconnect();
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <div className="fixed inset-0 w-full h-full -z-10 pointer-events-none opacity-40" style={{ display: 'block' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>
    );
}

export default function MobileLandingPage() {
    const { navigate } = useSafeNavigate();
    const { user, loading: authLoading } = useAuth() as any;
    const [monthlySales, setMonthlySales] = useState(1000000); // 10 Lakhs default
    const [activeFaq, setActiveFaq] = useState<number | null>(null);

    useEffect(() => {
        if (!authLoading && user) {
            navigate('/dashboard', { replace: true });
        }
    }, [user, authLoading, navigate]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(val);
    };

    const eligibleLimit = monthlySales * 5;
    const estimatedEmi = (eligibleLimit * 0.012) + (eligibleLimit / 12);

    const toggleFaq = (index: number) => {
        setActiveFaq(activeFaq === index ? null : index);
    };

    return (
        <div className="bg-[#0A0C10] text-[#e2e2e8] selection:bg-cyan-500/30 selection:text-white font-sans overflow-x-hidden min-h-screen relative">
            <SEO title="SYNCORA TallyOnMobile | Mobile Fast Lending & Sync" description="Access Tally ERP 9 and TallyPrime on the go with 0.2s sync and unlock instant business credit lines based on sales." />
            
            <WebGLBackground />

            {/* --- Header / Navbar --- */}
            <header className="fixed top-0 w-full bg-[#111318]/60 backdrop-blur-xl border-b border-white/10 z-50 transition-colors">
                <div className="flex justify-between items-center h-20 px-6 max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <span className="text-xl font-black italic tracking-tighter text-white">TL</span>
                        </div>
                        <span className="text-lg font-black uppercase tracking-widest">SYNCORA TallyOnMobile</span>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/login')}
                            className="group px-4 py-2 bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#00363e] text-xs font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-cyan-400/20"
                        >
                            Get Limit
                            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </header>

            {/* --- Main content --- */}
            <main className="pt-24 px-6">
                
                {/* --- Hero Section --- */}
                <section className="py-12 space-y-8 max-w-lg mx-auto">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                            <Sparkles size={11} className="text-cyan-300" />
                            <span>RBI Regulated NBFC Partners</span>
                        </div>

                        <div className="space-y-3">
                            <h1 className="text-4xl font-black tracking-tight leading-[1.1]">
                                Your Tally, Everywhere. <br />
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-cyan-400 to-emerald-300">
                                    Instant Credit.
                                </span>
                            </h1>
                            <p className="text-sm text-slate-300 font-medium leading-relaxed">
                                0.2s real-time Tally sync. Access outstanding bills, ledger statements, and unlock unsecured loans up to Rs. 50 Lakhs.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => navigate('/login')}
                                className="group w-full py-4 bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#00363e] rounded-xl text-xs font-black uppercase tracking-wider hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl shadow-cyan-400/25"
                            >
                                Start Free Sync
                                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                            </button>
                            <a
                                href="#calculator"
                                className="w-full py-4 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-3 text-center"
                            >
                                Calculate Credit Line
                            </a>
                        </div>
                    </div>

                    {/* Hero Image Mockup inside Glassmorphic Frame */}
                    <div className="w-full p-1.5 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/15 backdrop-blur-xl shadow-2xl">
                        <div className="relative rounded-xl overflow-hidden bg-slate-950/80 border border-white/5 aspect-[4/3] flex items-center justify-center">
                            <img 
                                        alt="SYNCORA TallyOnMobile Premium Dashboard Mockup" 
                                className="w-full h-full object-cover rounded-lg"
                                src="https://lh3.googleusercontent.com/aida/AP1WRLt8DNHkOrHV7vrp57UliyO_USk44IEOu9fc8X5Ua9GTve71LtoSiEcjbvYmqrf_1NBDA2SJaZFdQy15clPrkr0yuaEZHNJacyQVZWc9tOTCcTyqbKbMuKWpLKQi1HPApCaxN_YlO1NsZt8oqgv9_Irm6h0o-TKeVMFtKRDvglsreesTWdT2JLZMIVGYYcTZQVpvoUTzitI2P5RD7-sL4zrKtMVtDaKlnGZgm9B_bc3PrE8KgzPjwHmnZto"
                            />
                            <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-[8px] font-black uppercase text-cyan-200 tracking-wider backdrop-blur-md">
                                0.2s Sync
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- Live MSME Metrics --- */}
                <section className="py-12 border-t border-white/5 space-y-4 max-w-lg mx-auto">
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { label: "Active MSMEs", value: "15,000+", icon: <Users className="text-cyan-400" size={20} /> },
                            { label: "Loans Disbursed", value: "₹150 Cr+", icon: <BarChart3 className="text-emerald-400" size={20} /> },
                            { label: "Avg Sync Speed", value: "0.2 Sec", icon: <Activity className="text-cyan-400" size={20} /> },
                            { label: "Security", value: "AES-256", icon: <Shield className="text-sky-400" size={20} /> }
                        ].map((stat, i) => (
                            <div key={i} className="p-4 rounded-xl border border-white/5 bg-slate-900/40 backdrop-blur-md">
                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center mb-2">
                                    {stat.icon}
                                </div>
                                <h3 className="text-xl font-black text-white">{stat.value}</h3>
                                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mt-0.5">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* --- Core Features Grid --- */}
                <section className="py-12 border-t border-white/5 space-y-8 max-w-lg mx-auto">
                    <div className="space-y-2">
                        <div className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest">
                            Precision Engineering
                        </div>
                        <h2 className="text-2xl font-black tracking-tight">
                            Designed for Speed.
                        </h2>
                    </div>

                    <div className="grid gap-4">
                        {[
                            {
                                title: "Real-time Tally Sync",
                                desc: "Sync Tally ERP 9 or TallyPrime entries instantly to mobile. Access reports anywhere.",
                                icon: <Zap size={20} className="text-cyan-400" />
                            },
                            {
                                title: "Unsecured Credit Line",
                                desc: "Get collateral-free business loans up to Rs 50 Lakhs based directly on Tally ledger records.",
                                icon: <Shield size={20} className="text-emerald-400" />
                            },
                            {
                                title: "AI Ledger Entry",
                                desc: "Photograph invoices or import bank statements to generate automated voucher entries instantly.",
                                icon: <FileText size={20} className="text-sky-400" />
                            }
                        ].map((feat, i) => (
                            <div key={i} className="p-5 rounded-xl border border-white/5 bg-slate-900/30 backdrop-blur-md">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                        {feat.icon}
                                    </div>
                                    <h3 className="text-base font-bold text-white">{feat.title}</h3>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed font-medium pl-14">{feat.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* --- Interactive Loan Calculator --- */}
                <section id="calculator" className="py-12 border-t border-white/5 max-w-lg mx-auto">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black tracking-tight">Loan Eligibility</h2>
                            <p className="text-xs text-slate-400 font-medium">Select your monthly sales to estimate your unsecured limit.</p>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900/50 border border-white/10 backdrop-blur-xl space-y-6">
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Monthly Sales</span>
                                    <span className="text-lg font-black text-cyan-400">{formatCurrency(monthlySales)}</span>
                                </div>
                                <input 
                                    type="range" 
                                    min={100000} 
                                    max={5000000} 
                                    step={50000}
                                    value={monthlySales} 
                                    onChange={(e) => setMonthlySales(Number(e.target.value))}
                                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                                />
                            </div>

                            <div className="grid gap-4 pt-4 border-t border-white/10">
                                <div className="p-4 rounded-xl bg-[#111318]/50 border border-white/5">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Estimated Limit</p>
                                    <p className="text-2xl font-black text-emerald-400">{formatCurrency(eligibleLimit)}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-[#111318]/50 border border-white/5">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Monthly EMI (Est.)</p>
                                    <p className="text-2xl font-black text-cyan-400">{formatCurrency(estimatedEmi)}</p>
                                </div>
                            </div>

                            <button 
                                onClick={() => navigate('/login')}
                                className="w-full py-4 bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#00363e] rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-cyan-400/20"
                            >
                                Get Verified Limit
                            </button>
                        </div>
                    </div>
                </section>

                {/* --- How It Works --- */}
                <section className="py-12 border-t border-white/5 space-y-8 max-w-lg mx-auto">
                    <h2 className="text-2xl font-black tracking-tight text-center">3 Steps to Funding</h2>
                    <div className="grid gap-6">
                        {[
                            { step: 1, title: "Sync Tally", desc: "Download our secure desktop connector and link your books in under 2 minutes." },
                            { step: 2, title: "Connect Bank", desc: "Securely link your business bank account via RBI-approved aggregators." },
                            { step: 3, title: "Receive Disbursal", desc: "Get approved credit limit transferred to your account within 24 business hours." }
                        ].map((item, i) => (
                            <div key={i} className="flex gap-4 items-start p-4 rounded-xl border border-white/5 bg-slate-900/20">
                                <div className="w-10 h-10 rounded-full bg-slate-900 border border-cyan-400/30 flex items-center justify-center text-cyan-400 font-black text-lg shrink-0">
                                    {item.step}
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-white">{item.title}</h4>
                                    <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* --- Trust & Security --- */}
                <section className="py-12 border-t border-white/5 space-y-6 max-w-lg mx-auto">
                    <h2 className="text-2xl font-black tracking-tight">Data Protected</h2>
                    <p className="text-xs text-slate-300 font-medium leading-relaxed">
                        SYNCORA TallyOnMobile adheres to military-grade standards. We partner strictly with RBI-regulated NBFCs to ensure safe, ethical, and fully compliant business lending.
                    </p>
                    <div className="grid gap-3 pt-2">
                        <div className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 flex items-center gap-3">
                            <ShieldCheck className="text-cyan-400" size={16} />
                            <span className="text-xs font-bold text-slate-300">AES-256 Encryption</span>
                        </div>
                        <div className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 flex items-center gap-3">
                            <Lock className="text-cyan-400" size={16} />
                            <span className="text-xs font-bold text-slate-300">ISO 27001 Standard</span>
                        </div>
                    </div>
                </section>

                {/* --- FAQ Section --- */}
                <section className="py-12 border-t border-white/5 space-y-6 max-w-lg mx-auto">
                    <h2 className="text-2xl font-black tracking-tight text-center">FAQ</h2>
                    
                    <div className="space-y-3">
                        {[
                            {
                                q: "Is my Tally data safe?",
                                a: "Yes. We use banking-grade AES-256 encryption. Your financial data is securely transmitted and only accessed to assess credit limits."
                            },
                            {
                                q: "Is collateral required?",
                                a: "No. All credit lines are fully unsecured. We use your real-time Tally sales ledger as the primary underwriting factor."
                            }
                        ].map((faq, i) => (
                            <div key={i} className="rounded-xl border border-white/5 bg-slate-900/30 backdrop-blur-md overflow-hidden">
                                <button 
                                    onClick={() => toggleFaq(i)}
                                    className="w-full px-5 py-4 flex justify-between items-center text-left font-bold text-sm text-white"
                                >
                                    {faq.q}
                                    <ChevronDown 
                                        size={18} 
                                        className={`text-slate-400 transition-transform duration-300 ${activeFaq === i ? 'rotate-180' : ''}`}
                                    />
                                </button>
                                <AnimatePresence>
                                    {activeFaq === i && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="px-5 pb-4 text-xs text-slate-400 leading-relaxed font-medium"
                                        >
                                            {faq.a}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            {/* --- Footer --- */}
            <footer className="bg-slate-950/80 border-t border-white/10 w-full py-12 mt-12">
                <div className="px-6 space-y-8 max-w-lg mx-auto">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center text-sm font-black italic text-[#00363e]">TL</div>
                            <span className="text-lg font-black uppercase tracking-widest text-white">SYNCORA TallyOnMobile</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold">© 2026 SYNCORA Technologies. All rights reserved.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-8 text-xs font-bold">
                        <div className="space-y-3">
                            <h5 className="uppercase text-cyan-400 font-bold">Legal</h5>
                            <ul className="space-y-2">
                                <li><button onClick={() => navigate('/privacy')} className="text-slate-400">Privacy Policy</button></li>
                                <li><button onClick={() => navigate('/terms')} className="text-slate-400">Terms of Service</button></li>
                            </ul>
                        </div>
                        <div className="space-y-3">
                            <h5 className="uppercase text-cyan-400 font-bold">Platform</h5>
                            <ul className="space-y-2 text-slate-400">
                                <li>Tally Sync</li>
                                <li>Mobile App</li>
                            </ul>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-white/5 flex justify-between items-center text-[8px] font-black text-slate-600 uppercase tracking-wider">
                        <p>Secured by AES-256 Bit</p>
                        <p>RBI Regulated Partners</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
