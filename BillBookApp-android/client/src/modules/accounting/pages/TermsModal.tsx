import React from 'react';
import { X } from 'lucide-react';

interface TermsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const Point = ({ number, title, text }: { number: string; title: string; text: string }) => (
        <div className="flex gap-4 mb-4">
            <span className="shrink-0 font-mono text-xs font-bold text-indigo-500 pt-1">{number}</span>
            <div>
                <strong className="block text-slate-800 dark:text-slate-200 text-sm mb-1">{title}</strong>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">{text}</p>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                    <h1 className="text-xl font-black uppercase tracking-widest text-slate-800 dark:text-white">
                        Terms of Use
                    </h1>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-8">
                    {/* Intro */}
                    <div className="space-y-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Last Updated: January 01, 2026</p>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                            By installing, accessing, or using JLS BillBook, you agree to be bound by these Terms. These terms constitute a legally binding agreement between you and the developer.
                        </p>
                    </div>

                    {/* Section 1 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-slate-600 pl-4">
                            1. License & Access (1-6)
                        </h2>
                        <Point number="1.1" title="Grant of License" text="We grant you a revocable, non-exclusive, non-transferable, limited license for business record-keeping." />
                        <Point number="1.2" title="Business Use" text="The app is intended for legitimate business and professional use only." />
                        <Point number="1.3" title="Age Restriction" text="You must be at least 18 years old to use this service." />
                        <Point number="1.4" title="Updates" text="We may push updates and new features. You agree to receive these updates." />
                        <Point number="1.5" title="Analytics" text="We use internal performance tracking to optimize app functionality and user experience." />
                    </div>

                    {/* Section 2 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-slate-600 pl-4">
                            2. Your Responsibilities (7-14)
                        </h2>
                        <Point number="2.1" title="Account Security" text="You are responsible for maintaining the confidentiality of your login credentials." />
                        <Point number="2.2" title="Accurate Information" text="You agree to provide accurate business details (GSTIN, Address) for invoice generation." />
                        <Point number="2.3" title="Data Backup" text="While we provide cloud sync, you are responsible for maintaining independent backups." />
                        <Point number="2.4" title="Legal Compliance" text="You must comply with all applicable local laws regarding invoicing and taxation." />
                    </div>

                    {/* Section 3 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-slate-600 pl-4">
                            3. Prohibited Conduct (15-22)
                        </h2>
                        <Point number="3.1" title="Illegal Goods" text="You must not use the app to generate invoices for illegal goods or services." />
                        <Point number="3.2" title="Fraudulent Invoices" text="You must not create fake or forged invoices to deceive tax authorities." />
                        <Point number="3.3" title="System Integrity" text="You must not attempt to interfere with the app's servers or spread viruses." />
                    </div>

                    {/* Section 4 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-slate-600 pl-4">
                            4. Disclaimers (23-30)
                        </h2>
                        <Point number="4.1" title="'As Is' Basis" text="The service is provided 'as is' without warranties of any kind." />
                        <Point number="4.2" title="No Financial Advice" text="We provide tools for billing, not financial, legal, or tax advice." />
                        <Point number="4.3" title="Limitation of Liability" text="Our total liability shall not exceed the amount you paid us in the last 12 months." />
                        <Point number="4.4" title="Indemnification" text="You agree to indemnify us against claims arising from your use of the app." />
                    </div>

                    {/* Disclaimer */}
                    <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-3xl p-6">
                        <h3 className="font-black text-red-700 dark:text-red-300 text-sm uppercase tracking-widest mb-3">⚠️ Important Disclaimer</h3>
                        <ul className="text-red-700 dark:text-red-300 font-bold text-xs space-y-2">
                            <li>• JLS BillBook is a BILLING and INVOICING application only.</li>
                            <li>• We are NOT a bank, NBFC, lender, or payment processor.</li>
                            <li>• We do NOT provide loans, credit, or financial services.</li>
                            <li>• All data is user-entered for invoicing purposes only.</li>
                        </ul>
                    </div>

                    {/* Contact */}
                    <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-3xl">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-4 uppercase tracking-wider text-sm">Contact Us</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">If you have questions about these Terms:</p>
                        <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">lovneetrathi@gmail.com</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TermsModal;
