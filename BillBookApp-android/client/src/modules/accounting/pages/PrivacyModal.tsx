import React from 'react';
import { X } from 'lucide-react';

interface PrivacyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
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
                        Privacy Policy
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
                            At JLS BillBook, we prioritize the trust regarding your business data. This comprehensive Privacy Policy outlines exactly how we handle the 40+ data points and interactions within our application.
                        </p>
                    </div>

                    {/* Section 1 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-indigo-600 pl-4">
                            1. Information We Collect (1-8)
                        </h2>
                        <Point number="1.1" title="Account Credentials" text="We collect your Email Address and Password (encrypted) to create and secure your unique account." />
                        <Point number="1.2" title="Profile Details" text="Your Display Name and Phone Number are collected to personalize your profile and invoices." />
                        <Point number="1.3" title="Business Profile" text="Company Name, Address, GSTIN, and Logo are collected to generate professional invoices on your behalf." />
                        <Point number="1.4" title="Customer Directory" text="Names, Phone Numbers, and Addresses of your customers that YOU manually enter for your records." />
                        <Point number="1.5" title="Financial Transactions" text="Details of sales, receipts, expenses, and payments (Dates, Amounts, Items) entered by you." />
                        <Point number="1.6" title="Device Metadata" text="We collect Device Model, OS Version, and App Version to debug crashes and optimize performance." />
                        <Point number="1.7" title="IP Address" text="Collected automatically by our cloud providers (Firebase) for security and fraud prevention." />
                        <Point number="1.8" title="User Content" text="Images of receipts, products, or signatures uploaded by you to attach to records." />
                        <Point number="1.9" title="Usage Analytics" text="We collect internal data on how you interact with banners and features to improve app relevance." />
                    </div>

                    {/* Section 2 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-indigo-600 pl-4">
                            2. Device Permissions (9-15)
                        </h2>
                        <Point number="2.1" title="INTERNET" text="Mandatory. Required to sync your data with our secure cloud database so you can access it anywhere." />
                        <Point number="2.2" title="CAMERA" text="Optional. Used to take photos of physical bills or products directly within the app." />
                        <Point number="2.3" title="WRITE_EXTERNAL_STORAGE" text="Optional. Used to save generated PDF invoices and reports to your device's downloads folder." />
                        <Point number="2.4" title="VIBRATE" text="Used to provide haptic feedback when you successfully save a record or delete an item." />
                        <Point number="2.5" title="AI Processing" text="When using AI Scan, bill images are temporarily sent to Google Gemini (third-party AI) for text extraction. Images are NOT stored or used for training." />
                    </div>

                    {/* Section 3 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-indigo-600 pl-4">
                            3. How We Use Data (16-22)
                        </h2>
                        <Point number="3.1" title="Service Provision" text="To provide the core billing, invoice generation, and ledger management features." />
                        <Point number="3.2" title="Authentication" text="To verify your identity and prevent unauthorized access to your business books." />
                        <Point number="3.3" title="Customer Support" text="To assist you when you contact us (we only access data with your explicit permission)." />
                        <Point number="3.4" title="Analytics" text="To understand which features are used most, using aggregated anonymous data." />
                        <Point number="3.5" title="Security" text="To detect suspicious login attempts or bulk data scraping activities." />
                        <Point number="3.6" title="Ad Optimization" text="To analyze the performance of internal promotional content using anonymous view counters." />
                    </div>

                    {/* Section 4 */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 dark:text-white border-l-4 border-indigo-600 pl-4">
                            4. Your Rights & Control (23-30)
                        </h2>
                        <Point number="4.1" title="Right to Access" text="You can view all your stored invoices, customers, and profile data directly within the app." />
                        <Point number="4.2" title="Right to Rectify" text="You can edit any customer or profile detail instantly via the Edit options." />
                        <Point number="4.3" title="Right to Export" text="You can download invoices as PDF or export full data as JSON from Settings." />
                        <Point number="4.4" title="Right to Delete Account" text="You may permanently delete your account and all associated data via Settings." />
                    </div>

                    {/* Contact */}
                    <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-3xl mt-8">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-4 uppercase tracking-wider text-sm">Contact Us</h3>
                        <div className="space-y-2 text-sm">
                            <p><strong>Email:</strong> lovneetrathi@gmail.com</p>
                            <p><strong>Phone:</strong> +91 9413821007</p>
                            <p className="text-xs text-slate-500 mt-4">We aim to respond to all privacy-related inquiries within 48 hours.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrivacyModal;
