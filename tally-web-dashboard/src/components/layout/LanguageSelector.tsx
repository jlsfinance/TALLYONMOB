import { useState, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { Globe, Check } from 'lucide-react';

const LanguageSelector = memo(() => {
    const { language, setLanguage, languages, currentLanguage } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '10px',
                    background: 'var(--card-bg, #f3f4f6)',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                    color: 'var(--text-secondary, #666)',
                }}
            >
                <Globe size={14} />
                <span>{currentLanguage.flag} {currentLanguage.nativeName}</span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        style={{
                            position: 'absolute', right: 0, top: '100%', marginTop: '6px',
                            background: 'var(--card-bg, #fff)', borderRadius: '14px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                            border: '1px solid var(--border-color, #e5e7eb)',
                            minWidth: '200px', overflow: 'hidden', zIndex: 100,
                        }}
                    >
                        <div style={{ padding: '8px' }}>
                            {languages.map(lang => (
                                <button
                                    key={lang.code}
                                    onClick={() => { setLanguage(lang.code); setIsOpen(false); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        width: '100%', padding: '10px 12px', borderRadius: '10px',
                                        background: language === lang.code ? '#667eea10' : 'transparent',
                                        border: 'none', cursor: 'pointer', textAlign: 'left',
                                    }}
                                >
                                    <span style={{ fontSize: '18px' }}>{lang.flag}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #1a1a2e)' }}>
                                            {lang.nativeName}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#999' }}>{lang.name}</div>
                                    </div>
                                    {language === lang.code && <Check size={16} style={{ color: '#667eea' }} />}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

LanguageSelector.displayName = 'LanguageSelector';
export default LanguageSelector;
