
import React, { useState } from 'react';
import { Bot } from 'lucide-react';
import AIChatOverlay from './AIChatOverlay';

export default function AIFloatingButton() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-50 w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-full shadow-lg shadow-purple-500/30 flex items-center justify-center text-white hover:scale-110 transition-transform active:scale-95 group"
            >
                <Bot size={28} className="group-hover:rotate-12 transition-transform" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500 border-2 border-[var(--background)]"></span>
                </span>
            </button>

            <AIChatOverlay isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    );
}
