import { useEffect, useRef } from 'react';

type HotkeyCallback = (keyboardEvent: KeyboardEvent) => void;

interface HotkeyOptions {
    enableOnContentEditable?: boolean;
    enableOnInputs?: boolean;
}

export function useHotkeys(
    keys: string,
    callback: HotkeyCallback,
    options: HotkeyOptions = {}
) {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || 
                            target.tagName === 'TEXTAREA' || 
                            target.isContentEditable;

            // Normalize key description
            const keyCombo = keys.toLowerCase().trim();

            // Check if input check is bypassed
            if (isInput && !options.enableOnInputs && !keyCombo.includes('ctrl') && !keyCombo.includes('meta')) {
                return;
            }

            // Parse keys
            const parts = keyCombo.split('+');
            const mainKey = parts[parts.length - 1];

            const matchCtrl = parts.includes('ctrl') ? event.ctrlKey : true;
            const matchShift = parts.includes('shift') ? event.shiftKey : true;
            const matchAlt = parts.includes('alt') ? event.altKey : true;
            const matchMeta = parts.includes('meta') ? event.metaKey : true;

            const matchMainKey = event.key.toLowerCase() === mainKey;

            if (matchCtrl && matchShift && matchAlt && matchMeta && matchMainKey) {
                event.preventDefault();
                callbackRef.current(event);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [keys, options.enableOnInputs]);
}

export function useSequenceHotkeys(
    sequence: string[], // e.g. ['g', 'd']
    callback: () => void,
    options: HotkeyOptions = {}
) {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;
    const lastKeyRef = useRef<string | null>(null);
    const lastTimeRef = useRef<number>(0);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || 
                            target.tagName === 'TEXTAREA' || 
                            target.isContentEditable;

            if (isInput && !options.enableOnInputs) {
                return;
            }

            const key = event.key.toLowerCase();
            const now = Date.now();

            if (lastKeyRef.current === sequence[0] && key === sequence[1] && now - lastTimeRef.current < 1000) {
                event.preventDefault();
                lastKeyRef.current = null;
                callbackRef.current();
            } else if (key === sequence[0]) {
                lastKeyRef.current = key;
                lastTimeRef.current = now;
            } else {
                lastKeyRef.current = null;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [sequence, options.enableOnInputs]);
}
