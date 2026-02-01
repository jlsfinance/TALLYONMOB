
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Check } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface PrivacyDisclosureModalProps {
    isOpen: boolean;
    onAccept: () => void;
}

export const PrivacyDisclosureModal: React.FC<PrivacyDisclosureModalProps> = ({ isOpen, onAccept }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                    />
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative bg-surface w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden border border-border"
                    >
                        <div className="bg-surface-container-high p-8 text-center border-b border-border">
                            <div className="w-16 h-16 bg-google-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Shield className="w-8 h-8 text-google-blue" />
                            </div>
                            <h2 className="text-2xl font-black font-heading text-foreground">Data Privacy & Security</h2>
                            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-2">Please read carefully</p>
                        </div>

                        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
                            <div className="space-y-4">
                                <section>
                                    <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-2">1. Data Collection</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        We collect customer names and phone numbers solely for the purpose of generating invoices and maintaining your digital ledger (Khata). This data is stored locally on your device and is not shared with any third parties effectively.
                                    </p>
                                </section>



                                <section>
                                    <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-2">2. Not a Financial Institution</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        This application is a <strong>Digital Ledger / Accounting Tool</strong> for record-keeping purposes only. We are not a bank, NBFC, or money lender. We do not provide loans or financial services.
                                    </p>
                                </section>

                                <section>
                                    <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-2">3. Data Control</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        You have full control over your data. You can delete your account and all associated data at any time from the Settings menu.
                                    </p>
                                </section>
                            </div>
                        </div>

                        <div className="p-6 bg-surface-container-high/30 border-t border-border">
                            <button
                                onClick={() => {
                                    StorageService.setPrivacyAccepted(true);
                                    onAccept();
                                }}
                                className="w-full py-4 bg-google-blue text-white rounded-[20px] font-black uppercase tracking-widest text-sm hover:bg-google-blue/90 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-google-blue/20"
                            >
                                <Check className="w-5 h-5" />
                                I Understand & Agree
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
