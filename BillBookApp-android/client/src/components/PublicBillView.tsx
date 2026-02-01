import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Invoice } from '@/types';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, Home, ShieldCheck } from 'lucide-react';
import InvoiceView from '@/components/InvoiceView';

export const PublicBillView: React.FC<{ billId?: string }> = ({ billId: propBillId }) => {
    const { id } = useParams<{ id: string }>();
    const finalId = propBillId || id;

    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPublicBill = async () => {
        if (!finalId) {
            setError("Invalid Bill Link");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');

            if (!token) {
                setError("Security Token Missing. Access Denied.");
                setLoading(false);
                return;
            }

            // Execute secure query matching both ID and Public Token
            const q = query(
                collection(db, "publicBills"),
                where(documentId(), "==", finalId),
                where("publicToken", "==", token)
            );

            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const data = querySnapshot.docs[0].data() as Invoice;

                // Expiry Check (Handles both string and timestamp)
                const expiryDate = data.expiresAt ? new Date(data.expiresAt as any) : null;
                if (expiryDate && new Date() > expiryDate) {
                    setError("This secure link has expired.");
                } else {
                    setInvoice(data);
                }
            } else {
                setError("Bill not found. The link might be incorrect or the bill was removed.");
            }
        } catch (err) {
            console.error("Error fetching public bill:", err);
            setError("Unable to load bill due to a sync error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPublicBill();
    }, [finalId]);

    if (loading) {
        return (
            <div className="flex flex-col h-screen w-full items-center justify-center bg-surface gap-6">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-12 h-12 border-4 border-google-blue border-t-transparent rounded-full"
                />
                <div className="text-center space-y-2">
                    <h2 className="text-xl font-black text-foreground font-heading">Verifying Security...</h2>
                    <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">JLS Secure Sync</p>
                </div>
            </div>
        );
    }

    if (error || !invoice) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-surface p-6">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-surface-container-high p-12 rounded-[48px] shadow-2xl text-center max-w-sm border-2 border-border"
                >
                    <div className="w-24 h-24 bg-google-red/10 text-google-red rounded-full flex items-center justify-center mx-auto mb-8">
                        <AlertCircle className="w-12 h-12" />
                    </div>
                    <h2 className="text-3xl font-black text-foreground mb-4 font-heading tracking-tight uppercase">Bill Not Found</h2>
                    <p className="text-muted-foreground font-bold mb-10 leading-relaxed text-sm">{error}</p>

                    <div className="flex flex-col gap-3">
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={fetchPublicBill}
                            className="w-full py-5 bg-google-blue text-white rounded-full font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                        >
                            <RefreshCw className="w-4 h-4" /> Retry Loading
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => window.location.href = '/'}
                            className="w-full py-5 bg-surface-container-highest text-foreground rounded-full font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                        >
                            <Home className="w-4 h-4" /> Go to Homepage
                        </motion.button>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-surface-container-low overflow-auto">
            <InvoiceView
                invoice={invoice}
                onBack={() => window.location.href = '/'}
                onEdit={() => { }}
                isPublicView={true}
            />

            {/* Verification Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-surface/80 backdrop-blur-xl border-t border-border p-4 text-center z-[200]">
                <div className="flex items-center justify-center gap-2 text-google-green">
                    <ShieldCheck className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Verified Secure Bill • JLS Suite Digital</span>
                </div>
            </div>
        </div>
    );
};
