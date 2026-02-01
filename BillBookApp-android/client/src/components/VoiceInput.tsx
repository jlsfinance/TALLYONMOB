import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { VoiceParserService, ParsedItem } from '../services/voiceParser';
import { HapticService } from '../services/hapticService';
import { Capacitor } from '@capacitor/core';

interface VoiceInputProps {
    onItemsParsed?: (items: ParsedItem[]) => void;
    isDisabled?: boolean;
    onTranscript?: (text: string) => void;
    compact?: boolean;
}

// Speech Recognition types for TypeScript
interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    isFinal: boolean;
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

const VoiceInput: React.FC<VoiceInputProps> = ({ onItemsParsed, isDisabled, onTranscript, compact = false }) => {
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);

    const recognitionRef = useRef<any>(null);

    // Check if speech recognition is available
    const isSpeechSupported = typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

    useEffect(() => {
        if (!isSpeechSupported) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'hi-IN'; // Hindi with English support

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            setTranscript(finalTranscript || interimTranscript);
        };

        recognitionRef.current.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            setError(event.error === 'no-speech' ? 'No speech detected. Please try again.' :
                event.error === 'not-allowed' ? 'Microphone access denied. Please allow microphone access.' :
                    'Speech recognition error. Please try again.');
            setIsListening(false);
        };

        recognitionRef.current.onend = () => {
            setIsListening(false);
            // Auto-process when speech ends
            if (transcript) {
                processVoiceCommand(transcript);
            }
        };

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, [isSpeechSupported, transcript]);

    const checkMicrophonePermission = async (): Promise<boolean> => {
        // Only check permissions on native platforms (Android/iOS)
        if (!Capacitor.isNativePlatform()) {
            return true; // Web browser will handle permissions automatically
        }

        try {
            // On Android, we need to request permission for microphone
            const permissionResult = await (navigator as any).permissions?.query({ name: 'microphone' as any });

            if (permissionResult?.state === 'granted') {
                return true;
            }

            // Request permission through Web API
            // The browser/webview will show the native permission dialog
            return true;
        } catch (error) {
            console.log('Permission check not available, will rely on SpeechRecognition API');
            return true;
        }
    };

    const startListening = async () => {
        if (!isSpeechSupported) {
            setError('Speech recognition is not supported in this browser');
            setShowModal(true);
            return;
        }

        // Check microphone permission first
        const hasPermission = await checkMicrophonePermission();
        if (!hasPermission) {
            setError('Microphone permission is required for voice input. Please allow microphone access in your device settings.');
            setShowModal(true);
            return;
        }

        setError(null);
        setTranscript('');
        setParsedItems([]);
        setShowModal(true);

        try {
            recognitionRef.current?.start();
            setIsListening(true);
            HapticService.medium();
        } catch (e: any) {
            console.error('Failed to start recognition:', e);

            // Provide more helpful error messages
            if (e.message?.includes('not-allowed') || e.message?.includes('permission')) {
                setError('Microphone access denied. Please allow microphone access in your device settings and try again.');
            } else {
                setError('Failed to start voice recognition. Please try again.');
            }
        }
    };

    const stopListening = () => {
        recognitionRef.current?.stop();
        setIsListening(false);
        HapticService.light();
    };

    const processVoiceCommand = async (text: string) => {
        if (!text.trim()) {
            setError('No voice input detected');
            return;
        }

        // If strict transcript mode is requested (for Chat/AI), return text only
        if (onTranscript) {
            onTranscript(text);
            setTranscript(text);
            setIsProcessing(false);

            // Close modal after a short delay if in compact mode
            if (compact) {
                setTimeout(() => {
                    setShowModal(false);
                    setTranscript('');
                }, 500);
            }
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            const result = await VoiceParserService.parseVoiceCommand(text);

            if (result.success && result.items.length > 0) {
                setParsedItems(result.items);
                HapticService.success();
            } else {
                // Try simple parse as fallback
                const simpleItems = VoiceParserService.simpleParse(text);
                if (simpleItems.length > 0) {
                    setParsedItems(simpleItems);
                    HapticService.success();
                } else {
                    setError(result.error || 'Could not understand the command. Please try again.');
                    HapticService.error();
                }
            }
        } catch (e: any) {
            setError(e.message || 'Failed to process voice command');
            HapticService.error();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirm = () => {
        if (parsedItems.length > 0 && onItemsParsed) {
            onItemsParsed(parsedItems);
            HapticService.success();
        }
        closeModal();
    };

    const closeModal = () => {
        setShowModal(false);
        setTranscript('');
        setParsedItems([]);
        setError(null);
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        }
    };

    const handleRetry = () => {
        setTranscript('');
        setParsedItems([]);
        setError(null);
        startListening();
    };

    return (
        <>
            {/* Mic Button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startListening}
                disabled={isDisabled}
                className={compact
                    ? "p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
                    : `p-3 rounded-full transition-all ${isDisabled
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl'
                    }`
                }
                title="Voice Input (Hindi/English)"
            >
                <Mic className={compact ? "w-5 h-5" : "w-5 h-5"} />
            </motion.button>

            {/* Voice Input Modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={closeModal}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
                        >
                            {/* Header */}
                            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isListening
                                        ? 'bg-red-100 text-red-600 animate-pulse'
                                        : 'bg-blue-100 text-blue-600'
                                        }`}>
                                        {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white">Voice Input</h3>
                                        <p className="text-[10px] text-slate-400">Hindi + English supported</p>
                                    </div>
                                </div>
                                <button
                                    onClick={closeModal}
                                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                    <X className="w-5 h-5 text-slate-400" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-4">
                                {/* Listening Animation */}
                                {isListening && (
                                    <div className="flex flex-col items-center py-8">
                                        <div className="relative">
                                            <div className="w-24 h-24 rounded-full bg-red-100 flex items-center justify-center">
                                                <Mic className="w-10 h-10 text-red-600" />
                                            </div>
                                            <div className="absolute inset-0 rounded-full border-4 border-red-400 animate-ping opacity-30" />
                                            <div className="absolute inset-0 rounded-full border-2 border-red-300 animate-pulse" />
                                        </div>
                                        <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-300">
                                            Listening... Speak now
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            "5 cement bags at 350 each"
                                        </p>
                                        <button
                                            onClick={stopListening}
                                            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-full text-xs font-bold"
                                        >
                                            Stop
                                        </button>
                                    </div>
                                )}

                                {/* Transcript */}
                                {transcript && !isListening && (
                                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">You said:</p>
                                        <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">"{transcript}"</p>
                                    </div>
                                )}

                                {/* Processing */}
                                {isProcessing && (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                                        <span className="ml-2 text-sm text-slate-500">Processing with AI...</span>
                                    </div>
                                )}

                                {/* Parsed Items */}
                                {parsedItems.length > 0 && !isProcessing && (
                                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Check className="w-4 h-4 text-emerald-600" />
                                            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Items Detected</p>
                                        </div>
                                        <div className="space-y-2">
                                            {parsedItems.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-800 rounded-lg p-3">
                                                    <div>
                                                        <p className="font-bold text-sm text-slate-800 dark:text-white">{item.productName}</p>
                                                        <p className="text-[10px] text-slate-400">Qty: {item.quantity} {item.unit || 'pcs'}</p>
                                                    </div>
                                                    <p className="font-bold text-emerald-600">₹{item.rate}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Error */}
                                {error && !isListening && !isProcessing && (
                                    <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4 text-red-600" />
                                            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer Actions */}
                            {!isListening && !isProcessing && (
                                <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                                    <button
                                        onClick={handleRetry}
                                        className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold"
                                    >
                                        Try Again
                                    </button>
                                    {parsedItems.length > 0 && (
                                        <button
                                            onClick={handleConfirm}
                                            className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold"
                                        >
                                            Add Items
                                        </button>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default VoiceInput;
