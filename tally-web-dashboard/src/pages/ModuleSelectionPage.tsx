import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { useAuth } from '../contexts/AuthContext';
import { Smartphone, Receipt, ArrowRight, LogOut, Building2 } from 'lucide-react';
import './EntryScreens.css';

export default function ModuleSelectionPage() {
    const { setAppMode, signOut } = useAuth() as any;
    const { navigate } = useSafeNavigate();
    const handleSelect = (mode: 'tally' | 'billing') => { setAppMode(mode); navigate('/select-company'); };
    return (
        <main className="entry-screen mode-screen">
            <div className="entry-topbar"><div className="entry-brand"><span className="entry-brand-mark"><Building2 size={20}/></span><span><strong>SYNCORA</strong><small>TALLY ON MOBILE</small></span></div><button type="button" className="mode-signout" onClick={() => { signOut(); navigate('/login'); }}><LogOut size={16}/><span>Sign Out</span></button></div>
            <div className="mode-content">
                <div className="mode-heading"><span className="entry-eyebrow">YOUR WORKSPACE</span><h1>Choose how you work</h1><p>Choose a module that fits your workflow. You can switch anytime.</p></div>
                <div className="mode-options">
                    <button type="button" className="mode-option" onClick={() => handleSelect('tally')}>
                        <span className="mode-icon mode-icon--tally"><Smartphone size={24}/></span>
                        <span className="mode-option-copy"><span className="mode-option-title">Tally on Mobile <span className="mode-tag">Most Popular</span></span><span className="mode-description">Access your real-time Tally data, ledgers, and reports anywhere. Perfect for accounting-heavy users.</span><span className="mode-start">Get Started <ArrowRight size={15}/></span></span>
                    </button>
                    <button type="button" className="mode-option" onClick={() => handleSelect('billing')}>
                        <span className="mode-icon mode-icon--billing"><Receipt size={24}/></span>
                        <span className="mode-option-copy"><span className="mode-option-title">Billing &amp; Invoicing <span className="mode-tag mode-tag--billing">Quick Start</span></span><span className="mode-description">Create invoices, manage inventory, and handle GST billing quickly. Fast and cashier-friendly.</span><span className="mode-start">Get Started <ArrowRight size={15}/></span></span>
                    </button>
                </div>
            </div>
        </main>
    );
}
