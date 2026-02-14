import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface VoiceInputProps {
    onResult: (text: string) => void;
    language?: string;
    className?: string;
    size?: number;
}

export default function VoiceInput({ onResult, language = 'hi-IN', className = '', size = 20 }: VoiceInputProps) {
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    const toggleVoice = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    const startListening = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            alert('Speech recognition not supported in this browser.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        recognition.lang = language;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;

        recognition.onstart = () => setIsListening(true);

        recognition.onresult = (event: any) => {
            setIsProcessing(true);
            const transcript = event.results[0][0].transcript;
            onResult(transcript);
            setTimeout(() => setIsProcessing(false), 500);
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
            setIsProcessing(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        try {
            recognition.start();
        } catch (e) {
            console.error('Failed to start recognition:', e);
        }
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        setIsListening(false);
    };

    return (
        <button
            type="button"
            onClick={toggleVoice}
            className={`relative p-2 rounded-xl transition-all ${isListening
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse'
                    : 'bg-[var(--background)] text-[var(--text-muted)] hover:text-[var(--on-surface)] hover:bg-[var(--border)]'
                } ${className}`}
            title={isListening ? 'Stop listening' : 'Voice input (Hindi/English)'}
        >
            {isProcessing ? (
                <Loader2 size={size} className="animate-spin" />
            ) : isListening ? (
                <>
                    <MicOff size={size} />
                    {/* Pulse ring animation */}
                    <span className="absolute -inset-1 rounded-xl bg-red-500 opacity-20 animate-ping" />
                </>
            ) : (
                <Mic size={size} />
            )}
        </button>
    );
}
