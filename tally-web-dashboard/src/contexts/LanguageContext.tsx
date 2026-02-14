import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Language, LANGUAGES, LanguageMeta, translations } from '../i18n/translations';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    languages: LanguageMeta[];
    currentLanguage: LanguageMeta;
    formatCurrency: (amount: number) => string;
    formatDate: (date: string | Date) => string;
    formatNumber: (num: number) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'tallylink_language';

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(() => {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        return (saved as Language) || 'en';
    });

    const setLanguage = useCallback((lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }, []);

    const t = useCallback((key: string): string => {
        const langTranslations = translations[language];
        return (langTranslations as any)?.[key] || (translations.en as any)?.[key] || key;
    }, [language]);

    const currentLanguage = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

    // Indian number system: Lakhs, Crores
    const formatCurrency = useCallback((amount: number): string => {
        const locale = language === 'en' ? 'en-IN' : `${language}-IN`;
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: 'INR',
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
            }).format(amount);
        } catch {
            return `₹${amount.toLocaleString('en-IN')}`;
        }
    }, [language]);

    const formatDate = useCallback((date: string | Date): string => {
        const d = typeof date === 'string' ? new Date(date) : date;
        const locale = language === 'en' ? 'en-IN' : `${language}-IN`;
        try {
            return new Intl.DateTimeFormat(locale, {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            }).format(d);
        } catch {
            return d.toLocaleDateString('en-IN');
        }
    }, [language]);

    const formatNumber = useCallback((num: number): string => {
        const locale = language === 'en' ? 'en-IN' : `${language}-IN`;
        try {
            return new Intl.NumberFormat(locale).format(num);
        } catch {
            return num.toLocaleString('en-IN');
        }
    }, [language]);

    return (
        <LanguageContext.Provider value={{
            language,
            setLanguage,
            t,
            languages: LANGUAGES,
            currentLanguage,
            formatCurrency,
            formatDate,
            formatNumber,
        }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within LanguageProvider');
    }
    return context;
}

export default LanguageContext;
