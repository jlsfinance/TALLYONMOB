
import React, { useState } from 'react';
import { Payment, Customer, CompanyProfile } from '../types';
import { StorageService } from '../services/storageService';
import { ArrowLeft, Download, Share2, MessageCircle, X } from 'lucide-react';
import { InvoicePdfService } from '../services/invoicePdfService';
import { formatDate } from '../utils/dateUtils';
import { useCompany } from '@/contexts/CompanyContext';

interface PaymentReceiptViewProps {
    payment: Payment;
    onBack: () => void;
    onClose: () => void;
}

const PaymentReceiptView: React.FC<PaymentReceiptViewProps> = ({ payment, onBack, onClose }) => {
    const { company } = useCompany();
    const [customer] = useState<Customer | undefined>(
        StorageService.getCustomers().find(c => c.id === payment.customerId)
    );

    const safeCompany: CompanyProfile = {
        name: company?.name || 'Company Name',
        address: company?.address || '',
        phone: company?.phone || '',
        email: company?.email || '',
        state: company?.state || '',
        gstin: company?.gstin || '',
        gst_enabled: company?.gst_enabled ?? true
    };

    const handleWhatsAppShare = () => {
        if (!customer || !customer.phone) {
            alert("Customer phone number not available");
            return;
        }

        const message = `🧾 *PAYMENT RECEIPT*\n\n` +
            `Receipt No: ${payment.id.substring(0, 8).toUpperCase()}\n` +
            `Date: ${formatDate(payment.date)}\n` +
            `Amount: ₹${payment.amount.toLocaleString()}\n` +
            `Mode: ${payment.mode}\n` +
            (payment.reference ? `Ref: ${payment.reference}\n` : '') +
            `\nReceived with thanks from *${customer.company || customer.name}*\n` +
            `\nRegards,\n*${safeCompany.name}*`;

        const url = `https://wa.me/91${customer.phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    const handleDownloadPDF = async () => {
        try {
            await InvoicePdfService.generateReceiptPDF(payment, safeCompany, customer || null, false);
        } catch (e) {
            console.error(e);
            alert("Failed to generate PDF");
        }
    };

    const handleSharePDF = async () => {
        try {
            await InvoicePdfService.generateReceiptPDF(payment, safeCompany, customer || null, true);
        } catch (e) {
            console.error(e);
            alert("Failed to share PDF");
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-slate-900 flex flex-col">
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                        <ArrowLeft className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                    </button>
                    <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Receipt Details</h1>
                </div>
                <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center">

                {/* Receipt Card */}
                <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 mb-8">
                    <div className="bg-blue-600 p-6 text-center text-white relative overflow-hidden">
                        <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-white/10 rounded-full blur-3xl" />
                        <h2 className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">Payment Receipt</h2>
                        <div className="text-4xl font-black tracking-tight">₹{payment.amount.toLocaleString()}</div>
                        <div className="mt-2 text-sm font-medium opacity-90">{formatDate(payment.date)}</div>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                            <span className="text-slate-500 text-sm font-medium">Receipt No</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">{payment.id.substring(0, 8)}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                            <span className="text-slate-500 text-sm font-medium">Received From</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 text-right">{customer?.company || customer?.name}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                            <span className="text-slate-500 text-sm font-medium">Payment Mode</span>
                            <span className="font-bold text-blue-600 uppercase bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded text-xs">{payment.mode}</span>
                        </div>
                        {payment.reference && (
                            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                                <span className="text-slate-500 text-sm font-medium">Reference</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">{payment.reference}</span>
                            </div>
                        )}
                        {payment.note && (
                            <div className="pt-2">
                                <span className="text-slate-400 text-xs font-bold uppercase tracking-widest block mb-1">Note</span>
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg">{payment.note}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="w-full max-w-md grid grid-cols-3 gap-3">
                    <button
                        onClick={handleWhatsAppShare}
                        className="flex flex-col items-center justify-center gap-2 p-4 bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400 rounded-2xl active:scale-95 transition-transform"
                    >
                        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-500/30">
                            <MessageCircle className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold">WhatsApp</span>
                    </button>

                    <button
                        onClick={handleDownloadPDF}
                        className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-100 dark:bg-slate-700/30 text-slate-600 dark:text-slate-300 rounded-2xl active:scale-95 transition-transform"
                    >
                        <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm">
                            <Download className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold">PDF</span>
                    </button>

                    <button
                        onClick={handleSharePDF}
                        className="flex flex-col items-center justify-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 rounded-2xl active:scale-95 transition-transform"
                    >
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                            <Share2 className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold">Share</span>
                    </button>
                </div>

            </div>
        </div>
    );
};

export default PaymentReceiptView;
