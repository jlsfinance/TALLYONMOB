import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BarChart3, Check, ChevronDown, Clock3, FileText, Layers3, Menu, Monitor, RefreshCw, ShieldCheck, Smartphone, Users, Wallet, X } from 'lucide-react';
import SEO from '../components/common/SEO';
import './SyncoraLandingPage.css';

const features = [
    { icon: BarChart3, title: 'See your business at a glance', text: 'Follow sales, purchases, receipts and balances from a dashboard designed for everyday decisions.' },
    { icon: Users, title: 'Keep track of parties', text: 'Find customer and supplier ledgers, review balances and open their transactions in a few taps.' },
    { icon: FileText, title: 'Find vouchers faster', text: 'Browse synced vouchers, filter by financial year and view invoice details from your phone or browser.' },
    { icon: Wallet, title: 'Stay on top of balances', text: 'Review receivables and payables and set reminders for the follow-ups that matter to you.' },
    { icon: Layers3, title: 'Explore stock and reports', text: 'See inventory, day book entries and business reports alongside the rest of your data.' },
    { icon: RefreshCw, title: 'Connect your Tally data', text: 'Use the Windows connector to sync your Tally company with your SYNCORA account.' },
];
const questions = [
    { question: 'What is SYNCORA Tally on Mobile?', answer: 'SYNCORA is a web dashboard for viewing your connected Tally company data, including vouchers, ledgers, balances and reports on mobile or desktop.' },
    { question: 'How do I connect my Tally company?', answer: 'Sign in, install the TallyLink Windows connector on the computer running Tally, and use it to sync your company. Once it appears, select the company in the dashboard.' },
    { question: 'Can I view my accounts on a phone?', answer: 'Yes. The dashboard is designed for mobile and desktop browsers. Sign in and select a synced company to view its data.' },
    { question: 'Does this replace Tally?', answer: 'No. The connector works alongside your Tally installation and synchronizes company data for access through SYNCORA.' },
];
const schema = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', name: 'SYNCORA Tally on Mobile', url: 'https://tallyonmob.vercel.app/', description: 'Access connected Tally company data on mobile and web.' },
    { '@type': 'SoftwareApplication', name: 'SYNCORA Tally on Mobile', applicationCategory: 'BusinessApplication', operatingSystem: 'Web, Windows', description: 'Business dashboard for connected Tally company data, vouchers, ledgers and reports.' },
] };

export default function SyncoraLandingPage() {
    const [menuOpen, setMenuOpen] = useState(false);
    useEffect(() => {
        const panels = document.querySelectorAll('.landing-product, .landing-ledger-visual');
        const frames = new Set<number>();
        const animateAmounts = (panel: Element) => {
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            panel.querySelectorAll<HTMLElement>('[data-count-to]').forEach((amount) => {
                const target = Number(amount.dataset.countTo);
                const start = performance.now();
                const tick = (now: number) => {
                    const progress = Math.min((now - start) / 1300, 1);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    amount.textContent = '₹ ' + Math.round(target * eased).toLocaleString('en-IN');
                    if (progress < 1) {
                        const id = requestAnimationFrame(tick);
                        frames.add(id);
                    }
                };
                amount.textContent = '₹ 0';
                frames.add(requestAnimationFrame(tick));
            });
        };
        if (!('IntersectionObserver' in window)) return;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('landing-visual-visible');
                    animateAmounts(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2 });
        panels.forEach((panel) => observer.observe(panel));
        return () => { observer.disconnect(); frames.forEach(cancelAnimationFrame); };
    }, []);
    return <div className="landing" id="top">
        <SEO title="Tally on Mobile & Web Dashboard | SYNCORA TallyLink" description="Connect Tally with SYNCORA to view vouchers, party ledgers, sales and reports on mobile and web. Learn how to set up the Windows connector." canonical="https://tallyonmob.vercel.app/" ogTitle="SYNCORA | Tally on Mobile and Web" ogDescription="Your connected Tally data, ready when you need it." ogImage="https://tallyonmob.vercel.app/tallylink_logo.png" schema={schema}/>
        <header className="landing-header"><nav className="landing-nav" aria-label="Main navigation">
            <a href="#top" className="landing-logo"><span className="landing-logo-mark"><Layers3 size={20}/></span><span>SYNCORA<small>TALLY ON MOBILE</small></span></a>
            <div className="landing-nav-links"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#faq">FAQs</a><Link to="/pricing">Pricing</Link><Link to="/support">Support</Link></div>
            <div className="landing-nav-actions"><Link to="/login" className="landing-login">Sign in</Link><Link to="/login" className="landing-button landing-button--small">Get started <ArrowRight size={15}/></Link></div>
            <button type="button" className="landing-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20}/> : <Menu size={20}/>}</button>
        </nav>{menuOpen && <div className="landing-mobile-menu"><a href="#features" onClick={() => setMenuOpen(false)}>Features</a><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#faq" onClick={() => setMenuOpen(false)}>FAQs</a><Link to="/pricing">Pricing</Link><Link to="/support">Support</Link><Link to="/login">Sign in / Get started <ArrowRight size={15}/></Link></div>}</header>
        <main>
            <section className="landing-hero"><div className="landing-container landing-hero-grid"><div className="landing-hero-copy"><span className="landing-kicker"><span/> BUSINESS DATA, WHEREVER WORK TAKES YOU</span><h1>Your Tally data,
<br/><em>closer than ever.</em></h1><p>The numbers you need, right where you need them. Connect Tally and keep vouchers, party balances and business reports close at hand.</p><div className="landing-hero-actions"><Link to="/login" className="landing-button">Get started <ArrowRight size={17}/></Link><a href="#how-it-works" className="landing-button landing-button--secondary">See how it works</a></div><div className="landing-hero-note"><Check size={15}/> For business owners, accountants and their teams</div></div>
                <div className="landing-product" aria-label="Illustration of the SYNCORA dashboard"><div className="landing-product-top"><div><span className="landing-product-symbol"><Layers3 size={16}/></span><strong>Business overview</strong></div><span className="landing-product-live"><span/> CONNECTED</span></div><div className="landing-product-body"><div className="landing-product-caption"><div><small>YOUR BUSINESS</small><strong>Financial summary</strong></div><span>Financial year <ChevronDown size={12}/></span></div><div className="landing-product-metrics"><div><small>Total sales</small><strong><span data-count-to="248500">₹ 2,48,500</span></strong><span>Sales overview</span></div><div><small>Receivables</small><strong><span data-count-to="84200">₹ 84,200</span></strong><span>To collect</span></div><div><small>Purchases</small><strong><span data-count-to="112800">₹ 1,12,800</span></strong><span>Purchase overview</span></div><div><small>Payables</small><strong><span data-count-to="42600">₹ 42,600</span></strong><span>To pay</span></div></div><div className="landing-product-heading"><strong>Recent activity</strong><span>View all <ArrowRight size={12}/></span></div><div className="landing-product-row"><span className="landing-product-icon"><FileText size={15}/></span><div><strong>Vouchers</strong><small>View recent entries</small></div><ChevronDown size={14}/></div><div className="landing-product-row"><span className="landing-product-icon green"><Users size={15}/></span><div><strong>Party ledgers</strong><small>Balances and history</small></div><ChevronDown size={14}/></div></div><span className="landing-product-disclaimer">Example dashboard • illustrative data</span></div>
            </div></section>
            <section className="landing-strip"><div className="landing-container landing-strip-inner"><span><Smartphone size={18}/> Mobile &amp; web access</span><span><RefreshCw size={18}/> Windows connector</span><span><Clock3 size={18}/> Your data in one place</span><span><ShieldCheck size={18}/> Account-based access</span></div></section>
            <section className="landing-section" id="features"><div className="landing-container"><div className="landing-section-heading"><div><span className="landing-label">BUILT FOR YOUR WORKDAY</span><h2>Less searching.<br/>More knowing.</h2></div><p>From a quick balance check to the day’s vouchers, keep your business information close and easy to navigate.</p></div><div className="landing-features">{features.map(({icon: Icon,title,text}, index) => <article className="landing-feature" key={title}><div className="landing-feature-top"><span><Icon size={20}/></span><small>0{index + 1}</small></div><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
            <section className="landing-workflows" aria-labelledby="workflows-title"><div className="landing-container"><div className="landing-workflows-header"><div><span className="landing-label">A CLEARER WAY TO WORK</span><h2 id="workflows-title">Good decisions start<br/>with a clearer picture.</h2></div><p>From the first check in the morning to the last follow-up of the day, your essentials stay together.</p></div><div className="landing-workflow-grid"><article className="landing-workflow landing-workflow--ledgers"><div className="landing-workflow-copy"><span>01 / PARTY LEDGERS</span><h3>The details behind every balance.</h3><p>Look up a party, understand what is due and browse their transactions without going back to your desk.</p><ul><li><Check size={14}/> Customer and supplier ledgers</li><li><Check size={14}/> Balances and transaction history</li><li><Check size={14}/> Reminder scheduling</li></ul></div><div className="landing-ledger-visual" aria-label="Illustration of a party ledger"><span className="landing-visual-label">PARTY OVERVIEW</span><strong>Party ledger</strong><div><span>Opening balance</span><b><span data-count-to="24000">₹ 24,000</span></b></div><div><span>Receipts</span><b><span data-count-to="10000">₹ 10,000</span></b></div><div className="landing-ledger-total"><span>Closing balance</span><b><span data-count-to="14000">₹ 14,000</span></b></div><small>Example figures shown</small></div></article><article className="landing-workflow landing-workflow--vouchers"><div className="landing-workflow-copy"><span>02 / VOUCHERS</span><h3>Every entry, easy to find.</h3><p>Move through the year, filter voucher types and open the detail you need.</p><ul><li><Check size={14}/> Financial year and date filters</li><li><Check size={14}/> Sales, receipts and more</li><li><Check size={14}/> Voucher details and PDF</li></ul></div><div className="landing-voucher-visual" aria-label="Illustration of voucher list"><span className="landing-visual-label">RECENT VOUCHERS</span><div><span className="landing-voucher-icon"><FileText size={15}/></span><span><b>Sales voucher</b><small>Voucher details</small></span><ArrowUpRight size={15}/></div><div><span className="landing-voucher-icon green"><Wallet size={15}/></span><span><b>Receipt voucher</b><small>Payment record</small></span><ArrowUpRight size={15}/></div><div><span className="landing-voucher-icon"><FileText size={15}/></span><span><b>Purchase voucher</b><small>Voucher details</small></span><ArrowUpRight size={15}/></div></div></article></div></div></section>
            <section className="landing-setup" id="how-it-works"><div className="landing-container landing-setup-grid"><div><span className="landing-label">GETTING STARTED</span><h2>From your office PC<br/>to wherever you work.</h2><p>Start with your Tally computer, then access your connected company from the dashboard.</p><Link className="landing-link" to="/login">Start setup <ArrowRight size={16}/></Link><div className="setup-illustration" role="img" aria-label="Illustration of connecting your Tally computer to your mobile dashboard"><div className="setup-orbit setup-orbit--one"/><div className="setup-orbit setup-orbit--two"/><div className="setup-desktop"><div className="setup-screen-top"><span/><span/><span/><b>TALLY COMPUTER</b></div><div className="setup-screen-content"><div className="setup-screen-icon"><Monitor size={19}/></div><div><strong>Your Tally data</strong><small>On your office PC</small></div><div className="setup-screen-lines"><i/><i/><i/></div></div></div><div className="setup-connection"><RefreshCw size={17}/></div><div className="setup-phone"><div className="setup-phone-notch"/><span className="setup-phone-mark"><Layers3 size={14}/></span><small>BUSINESS OVERVIEW</small><strong>Your dashboard</strong><div className="setup-phone-chart"><i/><i/><i/><i/><i/></div><div className="setup-phone-line"/><div className="setup-phone-line short"/></div><div className="setup-illustration-caption"><span/><span>From your desk<br/><strong>to your day</strong></span></div></div></div><ol className="landing-steps"><li><span>01</span><div><h3>Sign in to SYNCORA</h3><p>Create an account or sign in, then choose Tally on Mobile.</p></div></li><li><span>02</span><div><h3>Connect your Tally computer</h3><p>Install the TallyLink Windows connector and follow the setup steps to sync your company.</p></div></li><li><span>03</span><div><h3>Choose a company and get going</h3><p>Open your dashboard to explore vouchers, ledgers and reports on mobile or web.</p></div></li></ol></div></section>
            <section className="landing-section landing-faq" id="faq"><div className="landing-container landing-faq-grid"><div><span className="landing-label">GOOD TO KNOW</span><h2>Questions, answered.</h2><p>Need a hand with your setup? Visit our support page.</p><Link to="/support" className="landing-link">Contact support <ArrowRight size={16}/></Link></div><div className="landing-faq-list">{questions.map(q => <details key={q.question}><summary>{q.question}<ChevronDown size={18}/></summary><p>{q.answer}</p></details>)}</div></div></section>
            <section className="landing-cta"><div className="landing-container landing-cta-inner"><div><span>YOUR BUSINESS, CONNECTED</span><h2>Make your next decision<br/>with your numbers close by.</h2></div><Link to="/login" className="landing-button">Get started <ArrowUpRight size={17}/></Link></div></section>
        </main>
        <footer className="landing-footer"><div className="landing-container"><div className="landing-footer-top"><div><a href="#top" className="landing-logo"><span className="landing-logo-mark"><Layers3 size={20}/></span><span>SYNCORA<small>TALLY ON MOBILE</small></span></a><p>Connected business data for the way you work.</p></div><div className="landing-footer-links"><div><strong>Explore</strong><a href="#features">Features</a><a href="#how-it-works">How it works</a><Link to="/pricing">Pricing</Link></div><div><strong>Support</strong><Link to="/support">Help &amp; support</Link><Link to="/about">About</Link><Link to="/contact">Contact</Link></div><div><strong>Legal</strong><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/refund">Refund policy</Link></div></div></div><div className="landing-footer-bottom"><span>© {new Date().getFullYear()} SYNCORA. All rights reserved.</span><span>Tally and TallyPrime are trademarks of their respective owners.</span></div></div></footer>
    </div>;
}
