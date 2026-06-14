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

        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
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

export default function LandingPage3D() {
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
            <SEO title="TallyLink | Fast Lending & Real-time Sync" description="Access Tally ERP 9 and TallyPrime with 0.2s sync and unlock instant business credit lines based on sales." />
            
            <WebGLBackground />

            {/* --- Header / Navbar --- */}
            <header className="fixed top-0 w-full bg-[#111318]/60 backdrop-blur-xl border-b border-white/10 z-50 transition-colors">
                <div className="flex justify-between items-center h-20 px-6 sm:px-12 max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <span className="text-xl font-black italic tracking-tighter text-white">TL</span>
                        </div>
                        <span className="text-lg font-black uppercase tracking-widest hidden sm:block">TallyLink</span>
                    </div>

                    <div className="hidden md:flex items-center gap-2 p-1 bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/5">
                        {['Features', 'Loans', 'Calculator', 'Security', 'FAQ'].map((item) => (
                            <a 
                                key={item} 
                                href={`#${item.toLowerCase()}`}
                                className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                            >
                                {item}
                            </a>
                        ))}
                    </div>

                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/login')} className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">
                            Sign In
                        </button>
                        <button
                            onClick={() => navigate('/login')}
                            className="group px-5 py-3 bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#00363e] text-xs font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-cyan-400/20"
                        >
                            Check Loan Limit
                            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </header>

            {/* --- Main content --- */}
            <main className="pt-24">
                
                {/* --- Hero Section --- */}
                <section className="relative min-h-[90svh] flex items-center px-6 sm:px-12 py-16 overflow-hidden">
                    <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-[1fr_500px] gap-12 items-center relative z-10">
                        <div className="space-y-8">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 text-xs font-bold uppercase tracking-wider text-cyan-200">
                                <Sparkles size={13} className="text-cyan-300" />
                                <span>RBI Regulated NBFC Partners</span>
                            </div>

                            <div className="space-y-4">
                                <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05]">
                                    Your Tally, Everywhere. <br />
                                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-cyan-400 to-emerald-300">
                                        Instant Credit, Whenever.
                                    </span>
                                </h1>
                                <p className="text-lg text-slate-300 max-w-xl font-medium leading-relaxed">
                                    0.2s real-time Tally sync. Access outstanding bills, ledger statements, and unlock unsecured loans up to Rs. 50 Lakhs based entirely on your Tally data.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <button
                                    onClick={() => navigate('/login')}
                                    className="group px-8 py-5 bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#00363e] rounded-xl text-sm font-black uppercase tracking-wider hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl shadow-cyan-400/25"
                                >
                                    Start Free Sync
                                    <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
                                </button>
                                <a
                                    href="#calculator"
                                    className="px-8 py-5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-3 text-center"
                                >
                                    Calculate Credit Line
                                </a>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 pt-2">
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-slate-300">
                                    <Smartphone size={14} className="text-emerald-300" /> Mobile Dashboard
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-slate-300">
                                    <Monitor size={14} className="text-sky-300" /> Desktop Connector
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-slate-300">
                                    <Cloud size={14} className="text-cyan-300" /> Cloud Analytics
                                </div>
                            </div>
                        </div>

                        {/* Hero Image Mockup inside Glassmorphic Frame */}
                        <div className="relative flex justify-center lg:justify-end">
                            <div className="w-full max-w-[460px] p-2 rounded-3xl bg-gradient-to-br from-white/10 to-white/5 border border-white/15 backdrop-blur-xl shadow-2xl">
                                <div className="relative rounded-2xl overflow-hidden bg-slate-950/80 border border-white/5 aspect-[4/3] flex items-center justify-center">
                                    <img 
                                        alt="TallyLink Premium Dashboard Mockup" 
                                        className="w-full h-full object-cover rounded-xl"
                                        src="https://lh3.googleusercontent.com/aida/AP1WRLt8DNHkOrHV7vrp57UliyO_USk44IEOu9fc8X5Ua9GTve71LtoSiEcjbvYmqrf_1NBDA2SJaZFdQy15clPrkr0yuaEZHNJacyQVZWc9tOTCcTyqbKbMuKWpLKQi1HPApCaxN_YlO1NsZt8oqgv9_Irm6h0o-TKeVMFtKRDvglsreesTWdT2JLZMIVGYYcTZQVpvoUTzitI2P5RD7-sL4zrKtMVtDaKlnGZgm9B_bc3PrE8KgzPjwHmnZto"
                                    />
                                    <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-[10px] font-black uppercase text-cyan-200 tracking-widest backdrop-blur-md">
                                        0.2s Real-Time Sync
                                    </div>
                                    <div className="absolute bottom-4 right-4 p-4 rounded-2xl bg-slate-900/90 border border-white/15 shadow-xl max-w-[200px] backdrop-blur-md">
                                        <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Approved Credit Limit</p>
                                        <p className="text-xl font-black text-cyan-400 mt-1">₹50,00,000</p>
                                        <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                                            <div className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full rounded-full w-[80%]" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- Live MSME Metrics --- */}
                <section className="py-16 px-6 sm:px-12 border-y border-white/5 bg-[#111318]/20 relative z-10">
                    <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
                        {[
                            { label: "Active MSMEs", value: "15,000+", icon: <Users className="text-cyan-400" size={24} /> },
                            { label: "Loans Disbursed", value: "₹150 Cr+", icon: <BarChart3 className="text-emerald-400" size={24} /> },
                            { label: "Avg Sync Speed", value: "0.2 Seconds", icon: <Activity className="text-cyan-400" size={24} /> },
                            { label: "Data Security", value: "AES-256 Bit", icon: <Shield className="text-sky-400" size={24} /> }
                        ].map((stat, i) => (
                            <div key={i} className="p-6 rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-md hover:bg-slate-900/60 transition-all duration-300">
                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4">
                                    {stat.icon}
                                </div>
                                <h3 className="text-3xl font-black tracking-tight text-white">{stat.value}</h3>
                                <p className="text-xs uppercase tracking-widest text-slate-500 font-bold mt-1">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* --- Core Features Grid --- */}
                <section id="features" className="py-24 px-6 sm:px-12 max-w-7xl mx-auto space-y-16 relative z-10">
                    <div className="text-center space-y-4 max-w-2xl mx-auto">
                        <div className="inline-flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-widest">
                            <span className="w-6 h-[1px] bg-cyan-400" />
                            Engineered for Excellence
                        </div>
                        <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
                            Designed for Speed. Built for Trust.
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            {
                                title: "Real-time Tally Sync",
                                desc: "Sync Tally ERP 9 or TallyPrime entries instantly to mobile. Access reports anywhere.",
                                icon: <Zap size={24} className="text-cyan-400" />
                            },
                            {
                                title: "Unsecured Credit Line",
                                desc: "Get collateral-free business loans up to Rs 50 Lakhs based directly on Tally ledger records.",
                                icon: <Shield size={24} className="text-emerald-400" />
                            },
                            {
                                title: "AI Ledger Entry",
                                desc: "Photograph invoices or import bank statements to generate automated voucher entries instantly.",
                                icon: <FileText size={24} className="text-sky-400" />
                            },
                            {
                                title: "Multi-Entity CA View",
                                desc: "Switch between multiple businesses and entities on the fly. Ideal for chartered accountants.",
                                icon: <Database size={24} className="text-cyan-400" />
                            }
                        ].map((feat, i) => (
                            <div key={i} className="p-8 rounded-2xl border border-white/5 bg-slate-900/30 backdrop-blur-md hover:bg-slate-900/50 hover:border-white/10 transition-all duration-300">
                                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6">
                                    {feat.icon}
                                </div>
                                <h3 className="text-xl font-bold tracking-tight text-white mb-2">{feat.title}</h3>
                                <p className="text-sm text-slate-400 leading-relaxed font-medium">{feat.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* --- Interactive Loan Calculator --- */}
                <section id="calculator" className="py-24 px-6 sm:px-12 bg-slate-950/40 border-y border-white/5 relative z-10">
                    <div className="max-w-4xl mx-auto space-y-12">
                        <div className="text-center space-y-4 max-w-2xl mx-auto">
                            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">Calculate Your Loan Eligibility</h2>
                            <p className="text-slate-400 font-medium">Use the slider below to select your average monthly sales in Tally and see your estimated unsecured credit line.</p>
                        </div>

                        <div className="p-6 sm:p-10 rounded-3xl bg-slate-900/50 border border-white/10 backdrop-blur-xl space-y-8 shadow-2xl">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold tracking-wider text-slate-400 uppercase">Monthly Tally Sales</span>
                                    <span className="text-2xl font-black text-cyan-400">{formatCurrency(monthlySales)}</span>
                                </div>
                                <input 
                                    type="range" 
                                    min={100000} 
                                    max={5000000} 
                                    step={50000}
                                    value={monthlySales} 
                                    onChange={(e) => setMonthlySales(Number(e.target.value))}
                                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                                />
                                <div className="flex justify-between text-xs font-bold text-slate-500">
                                    <span>₹1 Lakh</span>
                                    <span>₹50 Lakhs</span>
                                </div>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-6 pt-6 border-t border-white/10">
                                <div className="p-6 rounded-2xl bg-[#111318]/50 border border-white/5 space-y-1">
                                    <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Estimated Credit Limit</p>
                                    <p className="text-3xl sm:text-4xl font-black text-emerald-400">{formatCurrency(eligibleLimit)}</p>
                                </div>
                                <div className="p-6 rounded-2xl bg-[#111318]/50 border border-white/5 space-y-1">
                                    <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Estimated EMI (Monthly)</p>
                                    <p className="text-3xl sm:text-4xl font-black text-cyan-400">{formatCurrency(estimatedEmi)}</p>
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-4 text-center">
                                <p className="text-xs text-slate-500 font-bold max-w-md">
                                    *Estimates are indicative based on standard interest rates. 0.2s Tally data sync is required for final verification and RBI-approved NBFC onboarding.
                                </p>
                                <button 
                                    onClick={() => navigate('/login')}
                                    className="px-8 py-4 bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#00363e] rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-cyan-400/20"
                                >
                                    Get Verified Limit
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- How It Works --- */}
                <section id="loans" className="py-24 px-6 sm:px-12 max-w-7xl mx-auto space-y-16 relative z-10">
                    <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-center">3 Steps to Funding</h2>
                    <div className="relative">
                        {/* Connecting Line (Desktop) */}
                        <div className="hidden lg:block absolute top-[52px] left-[10%] w-[80%] h-0.5 bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent pointer-events-none" />

                        <div className="grid md:grid-cols-3 gap-8 relative z-10">
                            {[
                                { step: 1, title: "Sync Tally", desc: "Download our secure desktop connector and link your books in under 2 minutes." },
                                { step: 2, title: "Connect Bank", desc: "Securely link your business bank account via RBI-approved aggregators." },
                                { step: 3, title: "Receive Disbursal", desc: "Get approved credit limit transferred to your account within 24 business hours." }
                            ].map((item, i) => (
                                <div key={i} className="flex flex-col items-center text-center space-y-4">
                                    <div className="w-16 h-16 rounded-full bg-slate-900 border border-cyan-400/30 flex items-center justify-center text-cyan-400 font-black text-2xl shadow-xl">
                                        {item.step}
                                    </div>
                                    <h4 className="text-xl font-bold text-white">{item.title}</h4>
                                    <p className="text-sm text-slate-400 max-w-xs">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* --- Trust & Security --- */}
                <section id="security" className="py-24 bg-slate-950/60 border-t border-white/5 relative z-10">
                    <div className="px-6 sm:px-12 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12">
                        <div className="flex-1 space-y-6">
                            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">Your Data, Fortress Protected</h2>
                            <p className="text-slate-300 font-medium leading-relaxed">
                                TallyLink adheres to military-grade standards. Your data is encrypted in transit and at rest. We partner strictly with RBI-regulated NBFCs to ensure your lending journey is fully compliant.
                            </p>
                            <div className="flex flex-wrap gap-3 pt-2">
                                <div className="px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 flex items-center gap-2">
                                    <ShieldCheck className="text-cyan-400" size={16} />
                                    <span className="text-xs font-bold text-slate-300">AES-256 Encryption</span>
                                </div>
                                <div className="px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 flex items-center gap-2">
                                    <Lock className="text-cyan-400" size={16} />
                                    <span className="text-xs font-bold text-slate-300">ISO 27001 Standard</span>
                                </div>
                                <div className="px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 flex items-center gap-2">
                                    <Scale className="text-cyan-400" size={16} />
                                    <span className="text-xs font-bold text-slate-300">RBI Compliant</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 grid grid-cols-2 gap-4 w-full">
                            {['Partner NBFC A', 'Partner NBFC B', 'Partner NBFC C', 'Partner NBFC D'].map((partner, i) => (
                                <div key={i} className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center font-bold tracking-tight text-slate-500 hover:text-cyan-400 hover:border-cyan-400/20 hover:bg-white/[0.04] transition-all duration-300 cursor-default select-none">
                                    {partner}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* --- FAQ Section --- */}
                <section id="faq" className="py-24 px-6 sm:px-12 max-w-7xl mx-auto space-y-16 relative z-10">
                    <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-center">Frequently Asked Questions</h2>
                    
                    <div className="max-w-3xl mx-auto space-y-4">
                        {[
                            {
                                q: "Is my Tally data safe with TallyLink?",
                                a: "Absolutely. We enforce banking-grade AES-256 encryption. Your financial data is securely transmitted and only accessed to assess credit limits with your explicit consent."
                            },
                            {
                                q: "Do I need to provide any collateral for the loan?",
                                a: "No. All credit lines extended through TallyLink NBFC partners are fully unsecured. We use your real-time Tally sales ledger as the primary underwriting factor."
                            },
                            {
                                q: "How fast is the disbursal process?",
                                a: "Once your Tally sync and bank aggregator links are verified, our partners finalize approval and transfer the loan to your account in under 24 business hours."
                            }
                        ].map((faq, i) => (
                            <div key={i} className="rounded-2xl border border-white/5 bg-slate-900/30 backdrop-blur-md overflow-hidden">
                                <button 
                                    onClick={() => toggleFaq(i)}
                                    className="w-full px-6 py-5 flex justify-between items-center text-left font-bold text-base sm:text-lg text-white hover:bg-white/5 transition-all"
                                >
                                    {faq.q}
                                    <ChevronDown 
                                        size={20} 
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
                                            className="px-6 pb-6 text-sm sm:text-base text-slate-400 leading-relaxed font-medium"
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
            <footer className="bg-slate-950/80 border-t border-white/10 w-full pt-16 pb-8 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 px-6 sm:px-12 max-w-7xl mx-auto">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center text-sm font-black italic text-[#00363e]">TL</div>
                            <span className="text-lg font-black uppercase tracking-widest text-white">TallyLink</span>
                        </div>
                        <p className="text-xs text-slate-500 font-bold">© 2026 TallyLink Technologies. Precision Wealth Systems.</p>
                    </div>

                    <div>
                        <h5 className="text-xs uppercase tracking-wider text-cyan-400 font-bold mb-4">Legal</h5>
                        <ul className="space-y-2 text-xs font-bold">
                            <li><button onClick={() => navigate('/privacy')} className="text-slate-400 hover:text-cyan-400 transition-colors">Privacy Policy</button></li>
                            <li><button onClick={() => navigate('/terms')} className="text-slate-400 hover:text-cyan-400 transition-colors">Terms of Service</button></li>
                            <li><button onClick={() => navigate('/refund')} className="text-slate-400 hover:text-cyan-400 transition-colors">Data Policy</button></li>
                        </ul>
                    </div>

                    <div>
                        <h5 className="text-xs uppercase tracking-wider text-cyan-400 font-bold mb-4">Platform</h5>
                        <ul className="space-y-2 text-xs font-bold text-slate-400">
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors">Tally ERP 9 Sync</li>
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors">TallyPrime Engine</li>
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors">Mobile Dashboard</li>
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors">CA API Access</li>
                        </ul>
                    </div>

                    <div>
                        <h5 className="text-xs uppercase tracking-wider text-cyan-400 font-bold mb-4">Social</h5>
                        <div className="flex gap-3">
                            <a href="#" className="w-10 h-10 rounded-full bg-white/5 hover:bg-cyan-500/20 transition-all border border-white/5 flex items-center justify-center text-slate-400 hover:text-cyan-400">
                                <Share2 size={16} />
                            </a>
                            <a href="#" className="w-10 h-10 rounded-full bg-white/5 hover:bg-cyan-500/20 transition-all border border-white/5 flex items-center justify-center text-slate-400 hover:text-cyan-400">
                                <Mail size={16} />
                            </a>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 px-6 sm:px-12 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                    <p>Secured by AES-256 Bit Encryption</p>
                    <p className="flex items-center gap-1.5">
                        <CheckCircle size={12} className="text-emerald-500" /> RBI Regulated NBFC Partners
                    </p>
                </div>
            </footer>
        </div>
    );
}
