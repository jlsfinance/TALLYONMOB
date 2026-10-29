import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, FileText, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import './NativeIntroPage.css';

const slides = [
    { eyebrow: 'YOUR BUSINESS, IN VIEW', title: 'Your Tally.\nRight with you.', description: 'Connect your Tally company and keep your business close, wherever you work.', icon: BarChart3, tag: 'Business overview', lines: ['Sales & purchases', 'Receivables & payables', 'Your financial year'] },
    { eyebrow: 'EVERY DETAIL MATTERS', title: 'Find the details.\nWithout the desk.', description: 'Explore vouchers, parties and reports from your phone, all in one place.', icon: FileText, tag: 'Your books, organised', lines: ['Vouchers & invoices', 'Party ledgers', 'Reports & insights'] },
    { eyebrow: 'READY WHEN YOU ARE', title: 'Stay connected.\nStay in control.', description: 'Use the PC connector to sync your Tally data, then access your company on the go.', icon: RefreshCw, tag: 'Connected to your business', lines: ['Connect your Tally PC', 'Sync your company', 'Sign in on your phone'] },
];

export default function NativeIntroPage() {
    const [index, setIndex] = useState(0);
    const touchStart = useRef<{ x: number; y: number } | null>(null);
    const navigate = useNavigate();
    const slide = slides[index];
    const Icon = slide.icon;
    const finish = () => { localStorage.setItem('syncora.native.intro.v1', 'done'); navigate('/login', { replace: true }); };
    return <main className="native-intro" onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; }} onTouchEnd={(event) => { const start = touchStart.current; touchStart.current = null; if (!start) return; const dx = event.changedTouches[0].clientX - start.x; const dy = event.changedTouches[0].clientY - start.y; if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.3) return; setIndex(current => Math.max(0, Math.min(slides.length - 1, current + (dx < 0 ? 1 : -1)))); }}>
        <header className="native-intro__header">
            <div className="native-intro__brand"><img src="/syncora-mark.svg" alt="" /><span>SYNCORA<small>TALLY ON MOBILE</small></span></div>
            <button className="native-intro__skip" onClick={finish}>Skip</button>
        </header>
        <div className="native-intro__visual" aria-hidden="true">
            <div className="native-intro__orbit native-intro__orbit--one" /><div className="native-intro__orbit native-intro__orbit--two" />
            {index === 0 ? <div className="native-intro__mock native-intro__dashboard">
                <div className="native-intro__mock-top"><span className="native-intro__mock-icon"><Icon size={23} /></span><span>{slide.tag}<small>SYNCORA</small></span><span className="native-intro__mock-dot" /></div>
                <div className="native-intro__mock-divider" />
                <div className="native-intro__mini-grid"><div><small>SALES</small><b>₹ 4.2 L</b><i>↗ Overview</i></div><div><small>TO COLLECT</small><b>₹ 85 K</b><i>Receivables</i></div></div><div className="native-intro__mini-bars"><span/><span/><span/><span/><span/><span/></div><div className="native-intro__mock-footer"><BarChart3 size={15} /> A clear view of your business</div>
            </div> : index === 1 ? <div className="native-intro__mock native-intro__documents"><div className="native-intro__mock-top"><span className="native-intro__mock-icon"><FileText size={23}/></span><span>Your books<small>ALL IN ONE PLACE</small></span></div><div className="native-intro__mock-divider"/>{slide.lines.map((line,i) => <div className="native-intro__doc-row" key={line}><span className="native-intro__doc-icon">{i === 0 ? <FileText size={16}/> : i === 1 ? <Users size={16}/> : <BarChart3 size={16}/>}</span><span>{line}<small>{i === 0 ? 'View details' : i === 1 ? 'Know your parties' : 'Find insights'}</small></span><span>›</span></div>)}</div> : <div className="native-intro__connection"><div className="native-intro__device native-intro__device--pc"><span>▤</span><small>TALLY PC</small></div><div className="native-intro__link"><span/><RefreshCw size={24}/><span/></div><div className="native-intro__device native-intro__device--phone"><img src="/syncora-mark.svg" alt=""/><small>YOUR PHONE</small></div><div className="native-intro__connection-note"><ShieldCheck size={15}/> Connect through your PC sync app</div></div>}
            <div className="native-intro__float native-intro__float--one"><Users size={19} /></div><div className="native-intro__float native-intro__float--two"><BarChart3 size={19} /></div>
        </div>
        <section className="native-intro__content" aria-live="polite">
            <div className="native-intro__eyebrow">{slide.eyebrow}</div>
            <h1>{slide.title}</h1><p>{slide.description}</p>
        </section>
        <footer className="native-intro__footer">
            <div className="native-intro__dots" aria-label={`Page ${index + 1} of ${slides.length}`}>
                {slides.map((s, i) => <button key={s.eyebrow} aria-label={`Go to page ${i + 1}`} aria-current={i === index ? 'step' : undefined} className={i === index ? 'active' : ''} onClick={() => setIndex(i)} />)}
            </div>
            <button className="native-intro__next" onClick={() => index === slides.length - 1 ? finish() : setIndex(index + 1)}>{index === slides.length - 1 ? 'Get started' : 'Continue'} <ArrowRight size={20} /></button>
            <div className="native-intro__signin">Already have an account? <button onClick={finish}>Sign in</button></div>
        </footer>
    </main>;
}
