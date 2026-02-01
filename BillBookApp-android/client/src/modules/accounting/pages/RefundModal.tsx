import React from 'react';
import { X } from 'lucide-react';

interface RefundModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const RefundModal: React.FC<RefundModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const Point = ({ number, title, text }: { number: string; title: string; text: string }) => (
        <div className="flex gap-4 mb-4">
            <span className="shrink-0 font-mono text-xs font-bold text-amber-600 dark:text-amber-400 pt-1">{number}</span>
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
                        Refund & Cancellation
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
                            JLS BillBook is completely FREE to download and use. Since our services are digital and free, outlined below is our transparent policy.
                        </p>
                    </div>

                    {/* Section 1 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-amber-500 pl-4">
                            1. Free Service (1-5)
                        </h2>
                        <Point number="1.1" title="No Cost" text="JLS BillBook is 100% free to download and use. There are no subscription fees." />
                        <Point number="1.2" title="No In-App Purchases" text="All features are available at no cost. No hidden charges or premium tiers." />
                        <Point number="1.3" title="No Refunds" text="Since the app is free, refund requests do not apply." />
                        <Point number="1.4" title="Future Pricing" text="If we introduce paid features in the future, we will notify users with updated pricing and refund policies." />
                    </div>

                    {/* Section 2 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-amber-500 pl-4">
                            2. Data & Service (6-10)
                        </h2>
                        <Point number="2.1" title="Data Ownership" text="All data you create and store in the app belongs to you." />
                        <Point number="2.2" title="Service Availability" text="We strive for 99% uptime but cannot guarantee uninterrupted service." />
                        <Point number="2.3" title="Account Deletion" text="You may delete your account at any time from Settings." />
                        <Point number="2.4" title="No Refund for Data Loss" text="While we implement best practices, we are not liable for any accidental data loss." />
                    </div>

                    {/* Section 3 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-amber-500 pl-4">
                            3. Support (11-15)
                        </h2>
                        <Point number="3.1" title="Email Support" text="For any issues or queries, contact us at lovneetrathi@gmail.com" />
                        <Point number="3.2" title="Phone Support" text="Call +91 9413821007 for urgent technical assistance." />
                        <Point number="3.3" title="Response Time" text="We aim to respond to all support requests within 24-48 hours." />
                        <Point number="3.4" title="Bug Reports" text="Please report any bugs or issues so we can fix them in future updates." />
                    </div>

                    {/* Contact */}
                    <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-3xl">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-4 uppercase tracking-wider text-sm">Need Help?</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Contact our support team:</p>
                        <div className="space-y-1">
                            <p className="text-sm"><strong>Email:</strong> lovneetrathi@gmail.com</p>
                            <p className="text-sm"><strong>Phone:</strong> +91 9413821007</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RefundModal;
