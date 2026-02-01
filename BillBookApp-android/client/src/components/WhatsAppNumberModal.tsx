import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, ArrowRight, Phone, ChevronRight, UserPlus } from 'lucide-react';
import { ContactsService } from '@/services/contactsService';
import { ContactSuggestion } from '@/types';
import { HapticService } from '@/services/hapticService';

interface WhatsAppNumberModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (phoneNumber: string) => void;
}

export const WhatsAppNumberModal: React.FC<WhatsAppNumberModalProps> = ({
    isOpen,
    onClose,
    onSubmit
}) => {
    const [phone, setPhone] = useState('');
    const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedName, setSelectedName] = useState('');

    // Search contacts when phone number changes
    useEffect(() => {
        const searchContacts = async () => {
            if (phone.length >= 3) {
                const results = await ContactsService.searchByPhone(phone);
                setSuggestions(results);
                setShowSuggestions(results.length > 0);
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
                setSelectedName('');
            }
        };

        const debounce = setTimeout(searchContacts, 300);
        return () => clearTimeout(debounce);
    }, [phone]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setPhone('');
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedName('');
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (phone.length >= 10) {
            onSubmit(phone);
            setPhone('');
            setSelectedName('');
            onClose();
        }
    };

    const handleSelectContact = (contact: ContactSuggestion) => {
        setPhone(contact.phone.replace(/\D/g, '').slice(-10));
        setSelectedName(contact.name);
        setShowSuggestions(false);
        HapticService.light();
    };

    const handlePickContact = async () => {
        HapticService.light();
        const contact = await ContactsService.pickContact();
        if (contact) {
            setPhone(contact.phone);
            setSelectedName(contact.name);
            setShowSuggestions(false);
            HapticService.success();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-700"
                    >
                        {/* Header */}
                        <div className="bg-[#25D366] p-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-white/20 p-2 rounded-xl">
                                    <MessageCircle className="w-6 h-6 text-white" />
                                </div>
                                <h3 className="text-xl font-black text-white">WhatsApp Share</h3>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {/* Selected Contact Display */}
                            <AnimatePresence>
                                {selectedName && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex items-center gap-3 p-4 bg-[#25D366]/10 border border-[#25D366]/20 rounded-2xl"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-[#25D366] text-white flex items-center justify-center font-black">
                                            {selectedName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-black text-slate-800 dark:text-white">{selectedName}</p>
                                            <p className="text-xs font-bold text-[#25D366]">Selected from contacts</p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="space-y-2 relative">
                                <label className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                                    <span>Mobile Number</span>
                                    {phone.length >= 3 && suggestions.length === 0 && (
                                        <span className="text-[10px] text-slate-400 normal-case tracking-normal">
                                            No contacts found
                                        </span>
                                    )}
                                </label>
                                <div className="flex gap-3">
                                    <div className="relative flex-1">
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">
                                            +91
                                        </span>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                setPhone(val);
                                                setSelectedName(''); // Clear selected name when typing
                                            }}
                                            placeholder="Type number to search..."
                                            className="w-full pl-16 pr-5 py-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-xl font-bold text-slate-800 dark:text-white focus:outline-none focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/10 transition-all placeholder:text-slate-300 placeholder:font-normal"
                                            autoFocus
                                        />
                                        {/* Searching indicator */}
                                        {phone.length >= 3 && phone.length < 10 && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                <div className="w-5 h-5 border-2 border-[#25D366]/20 border-t-[#25D366] rounded-full animate-spin"></div>
                                            </div>
                                        )}
                                    </div>
                                    {/* Pick Contact Button - More Prominent */}
                                    <motion.button
                                        type="button"
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={handlePickContact}
                                        className="w-16 h-16 shrink-0 bg-gradient-to-br from-[#25D366] to-[#20bd5a] hover:from-[#20bd5a] hover:to-[#1da851] border-2 border-[#25D366]/20 rounded-2xl flex flex-col items-center justify-center transition-all shadow-lg shadow-[#25D366]/20 hover:shadow-xl hover:shadow-[#25D366]/30"
                                        title="Pick from Contacts"
                                    >
                                        <UserPlus className="w-6 h-6 text-white mb-0.5" />
                                        <span className="text-[8px] font-black text-white/90 uppercase tracking-wider">Pick</span>
                                    </motion.button>
                                </div>

                                {/* Contact Suggestions Dropdown - Enhanced */}
                                <AnimatePresence>
                                    {showSuggestions && suggestions.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute z-[220] left-0 right-0 top-full mt-3 bg-white dark:bg-slate-800 border-2 border-[#25D366]/20 rounded-2xl shadow-2xl max-h-72 overflow-hidden"
                                        >
                                            <div className="bg-gradient-to-r from-[#25D366]/10 to-[#25D366]/5 px-4 py-2 border-b border-[#25D366]/10">
                                                <p className="text-[10px] font-black text-[#25D366] uppercase tracking-widest flex items-center gap-2">
                                                    <Phone className="w-3 h-3" />
                                                    {suggestions.length} Contact{suggestions.length > 1 ? 's' : ''} Found
                                                </p>
                                            </div>
                                            <div className="p-2 max-h-60 overflow-y-auto">
                                                {suggestions.map((contact, index) => (
                                                    <motion.button
                                                        key={index}
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: index * 0.05 }}
                                                        type="button"
                                                        onClick={() => handleSelectContact(contact)}
                                                        className="w-full p-4 flex items-center justify-between hover:bg-[#25D366]/10 rounded-xl transition-all text-left group border-2 border-transparent hover:border-[#25D366]/20 mb-1"
                                                    >
                                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#25D366]/20 to-[#25D366]/10 text-[#25D366] flex items-center justify-center font-black text-lg shrink-0 group-hover:from-[#25D366] group-hover:to-[#20bd5a] group-hover:text-white transition-all shadow-sm">
                                                                {contact.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-base font-black text-slate-800 dark:text-white truncate mb-0.5">{contact.name}</div>
                                                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                                                    <Phone className="w-3.5 h-3.5" />
                                                                    <span className="tracking-wide">{contact.phone}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#25D366] transition-colors shrink-0" />
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <button
                                type="submit"
                                disabled={phone.length < 10}
                                className="w-full py-4 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-2xl font-bold text-lg shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                            >
                                Send Invoice <ArrowRight className="w-5 h-5" />
                            </button>

                            {/* Quick tip */}
                            <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] font-bold text-center text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-relaxed">
                                    💡 Type number to search • Tap "Pick" to browse contacts
                                </p>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
