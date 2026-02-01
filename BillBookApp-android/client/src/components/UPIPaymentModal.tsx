/**
 * UPI Payment Link Modal
 * Generate and share UPI payment links with QR codes
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Copy, Share2, MessageCircle, Check,
    IndianRupee, Link2
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { upiPaymentService } from '../services/upiPaymentService';
import { useCompany } from '../contexts/CompanyContext';

interface UPIPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    amount?: number;
    customerName?: string;
    customerPhone?: string;
    invoiceNumber?: string;
}

const UPIPaymentModal: React.FC<UPIPaymentModalProps> = ({
    isOpen,
    onClose,
    amount: initialAmount,
    customerName = '',
    customerPhone = '',
    invoiceNumber,
}) => {
    const { company } = useCompany();
    const [amount, setAmount] = useState(initialAmount || 0);
    const [note, setNote] = useState(invoiceNumber ? `Invoice #${invoiceNumber}` : '');
    const [upiLink, setUpiLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [showQR] = useState(true);

    useEffect(() => {
        if (isOpen && company?.upiId) {
            generateLink();
        }
    }, [isOpen, amount, note, company?.upiId]);

    useEffect(() => {
        setAmount(initialAmount || 0);
        setNote(invoiceNumber ? `Invoice #${invoiceNumber}` : '');
    }, [initialAmount, invoiceNumber]);

    const generateLink = () => {
        if (!company?.upiId) return;

        const link = upiPaymentService.generateLink({
            upiId: company.upiId,
            payeeName: company.name || 'Business',
            amount: amount > 0 ? amount : undefined,
            transactionNote: note || undefined,
        });
        setUpiLink(link);
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(upiLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    const handleShare = async () => {
        const linkObj = await upiPaymentService.generateWithQR({
            upiId: company?.upiId || '',
            payeeName: company?.name || 'Business',
            amount: amount > 0 ? amount : undefined,
            transactionNote: note || undefined,
        });

        await upiPaymentService.shareLink(
            linkObj,
            `Pay ₹${amount.toLocaleString('en-IN')} to ${company?.name}\n${note}`
        );
    };

    const handleWhatsAppShare = async () => {
        if (!customerPhone || !company?.upiId) return;

        await upiPaymentService.shareViaWhatsApp(customerPhone, {
            customerName: customerName || 'Customer',
            companyName: company.name || 'Business',
            amount,
            invoiceNumber,
            upiLink,
        });
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                                    <Link2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black">UPI Payment Link</h2>
                                    <p className="text-xs opacity-80">Generate & share payment link</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Amount Display */}
                        <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
                            <p className="text-xs opacity-80 mb-1">Amount</p>
                            <div className="flex items-center gap-2">
                                <IndianRupee className="w-6 h-6 opacity-80" />
                                <input
                                    type="number"
                                    value={amount || ''}
                                    onChange={(e) => setAmount(Number(e.target.value))}
                                    placeholder="0"
                                    className="bg-transparent text-3xl font-black w-full outline-none placeholder:text-white/50"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4">
                        {/* Note Input */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-2 block">
                                Payment Note (Optional)
                            </label>
                            <input
                                type="text"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="e.g., Invoice #1234"
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl font-medium border border-slate-200 dark:border-slate-700 focus:border-blue-500 outline-none"
                            />
                        </div>

                        {/* UPI ID Display */}
                        {company?.upiId ? (
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mb-0.5">
                                    Receiving UPI ID
                                </p>
                                <p className="font-bold text-emerald-800 dark:text-emerald-300">
                                    {company.upiId}
                                </p>
                            </div>
                        ) : (
                            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 border border-orange-200 dark:border-orange-800">
                                <p className="text-xs text-orange-600 dark:text-orange-400 font-bold">
                                    ⚠️ UPI ID not set. Go to Settings to add your UPI ID.
                                </p>
                            </div>
                        )}

                        {/* QR Code */}
                        {showQR && upiLink && company?.upiId && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col items-center bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700"
                            >
                                <div className="bg-white p-3 rounded-xl">
                                    <QRCode
                                        value={upiLink}
                                        size={160}
                                        style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500 mt-3 text-center">
                                    Scan to pay via any UPI app
                                </p>
                                <div className="flex gap-2 mt-2">
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/120px-UPI-Logo-vector.svg.png" alt="UPI" className="h-4 opacity-60" />
                                </div>
                            </motion.div>
                        )}

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={handleCopy}
                                disabled={!upiLink}
                                className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4 text-emerald-500" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        Copy Link
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleShare}
                                disabled={!upiLink}
                                className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                            >
                                <Share2 className="w-4 h-4" />
                                Share
                            </button>
                        </div>

                        {/* WhatsApp Button */}
                        {customerPhone && (
                            <button
                                onClick={handleWhatsAppShare}
                                disabled={!upiLink}
                                className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/30 transition-colors disabled:opacity-50"
                            >
                                <MessageCircle className="w-5 h-5" />
                                Send via WhatsApp to {customerName || 'Customer'}
                            </button>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default UPIPaymentModal;
