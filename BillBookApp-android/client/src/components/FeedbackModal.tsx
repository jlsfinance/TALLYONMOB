import React, { useState } from 'react';
import { X, Star, Send, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FirebaseService } from '../services/firebaseService';
import { useAuth } from '../contexts/AuthContext';
import { HapticService } from '../services/hapticService';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const [rating, setRating] = useState(0);
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async () => {
        if (rating === 0) return;

        setIsSubmitting(true);
        HapticService.selection();

        try {
            const feedbackData = {
                userId: user?.uid || 'anonymous',
                userEmail: user?.email || 'anonymous',
                rating,
                message,
                timestamp: new Date().toISOString(),
                version: '1.9.7', // Will be updated
                device: navigator.userAgent
            };

            // Save to Firestore
            await FirebaseService.saveDocument('feedback', `${Date.now()}_${user?.uid || 'anon'}`, feedbackData);

            // Simulate delay for better UX
            await new Promise(resolve => setTimeout(resolve, 800));

            setSubmitted(true);
            HapticService.success();

            setTimeout(() => {
                onClose();
                setSubmitted(false);
                setRating(0);
                setMessage('');
                setIsSubmitting(false);
            }, 2000);

        } catch (error) {
            console.error("Feedback submit error:", error);
            setIsSubmitting(false);
            alert("Failed to send feedback. Please check your internet connection.");
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center pointer-events-none">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                />

                {/* Modal */}
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] p-6 sm:p-8 shadow-2xl pointer-events-auto m-0 sm:m-4 relative overflow-hidden"
                >
                    {submitted ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 mb-6 relative">
                                <Send className="w-10 h-10" />
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1.5, opacity: 0 }}
                                    className="absolute inset-0 border-2 border-green-500 rounded-full"
                                />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Thank You!</h3>
                            <p className="text-slate-500 font-medium">Your feedback helps us improve.</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                                        <MessageSquare className="w-5 h-5 text-indigo-600" />
                                        Rate Your Experience
                                    </h2>
                                    <p className="text-xs text-slate-500 font-medium mt-1">How are you liking the app?</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                >
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            {/* Stars */}
                            <div className="flex justify-center gap-3 mb-8">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        onClick={() => {
                                            setRating(star);
                                            HapticService.selection();
                                        }}
                                        className="relative p-1"
                                    >
                                        <Star
                                            className={`w-10 h-10 transition-all duration-300 ${rating >= star
                                                    ? 'fill-yellow-400 text-yellow-400 scale-110 drop-shadow-lg'
                                                    : 'text-slate-200 dark:text-slate-700'
                                                }`}
                                            strokeWidth={rating >= star ? 0 : 2}
                                        />
                                        {rating >= star && (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1, opacity: 0 }}
                                                className="absolute inset-0 bg-yellow-400/20 rounded-full blur-xl"
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Message Area */}
                            <div className="mb-6">
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Any suggestions or issues? (Optional)"
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 min-h-[120px] text-sm resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            {/* Submit Button */}
                            <button
                                onClick={handleSubmit}
                                disabled={rating === 0 || isSubmitting}
                                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${rating > 0
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-95'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                    }`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        Submit Feedback <Send className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
