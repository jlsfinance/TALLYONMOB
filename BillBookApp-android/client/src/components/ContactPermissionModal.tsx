
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, User, X } from 'lucide-react';

interface ContactPermissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onChoice: (choice: 'ALL' | 'SELECTED') => void;
}

const ContactPermissionModal: React.FC<ContactPermissionModalProps> = ({ isOpen, onClose, onChoice }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative bg-surface w-full max-w-md rounded-[40px] shadow-google-lg overflow-hidden border border-border"
                    >
                        <div className="p-8 border-b border-border bg-surface-container-high/30 flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black font-heading text-foreground">Contacts Permission</h3>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">How would you like to use contacts?</p>
                            </div>
                            <button onClick={onClose} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <div className="p-8 space-y-4">
                            <button
                                onClick={() => onChoice('ALL')}
                                className="w-full p-6 bg-google-blue/5 border-2 border-google-blue/20 hover:border-google-blue/40 rounded-[32px] transition-all flex items-start gap-4 text-left group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-google-blue text-white flex items-center justify-center shrink-0 shadow-lg shadow-google-blue/20 group-hover:scale-110 transition-transform">
                                    <Users className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="text-lg font-black text-foreground mb-1 group-hover:text-google-blue transition-colors">Search All Contacts</h4>
                                    <p className="text-xs font-bold text-muted-foreground leading-relaxed">Faster input. Automatically search and suggest all your phone contacts while you type name or phone number.</p>
                                </div>
                            </button>

                            <button
                                onClick={() => onChoice('SELECTED')}
                                className="w-full p-6 bg-surface-container-high/50 border-2 border-transparent hover:border-border rounded-[32px] transition-all flex items-start gap-4 text-left group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-google-green text-white flex items-center justify-center shrink-0 shadow-lg shadow-google-green/20 group-hover:scale-110 transition-transform">
                                    <User className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="text-lg font-black text-foreground mb-1 group-hover:text-google-green transition-colors">Select Specific Contact</h4>
                                    <p className="text-xs font-bold text-muted-foreground leading-relaxed">Choose one by one. Opens the phone's contact list only when you click the contact icon.</p>
                                </div>
                            </button>
                        </div>

                        <div className="p-8 bg-surface-container-high/20 border-t border-border">
                            <p className="text-[10px] font-bold text-center text-muted-foreground uppercase tracking-widest">You can change this anytime in settings</p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ContactPermissionModal;
