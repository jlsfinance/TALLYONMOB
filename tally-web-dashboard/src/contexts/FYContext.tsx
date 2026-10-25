import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/insforge';
import { useAuth } from './AuthContext';

const FY_STORAGE_KEY = 'global_fy';
// Set hone ka matlab: user ne khud FY chuna hai, usko data se override mat karo.
const FY_USER_CHOICE_KEY = 'global_fy_user';

function stripFYPrefix(fy: string): string {
    return fy.replace(/^FY\s*/, '');
}

export function getCurrentFY(): string {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `FY ${year}-${String(year + 1).slice(2)}`;
}

export function getFYDates(fy: string): { from: string; to: string } {
    const clean = stripFYPrefix(fy);
    const startYear = parseInt(clean.split('-')[0]);
    return {
        from: `${startYear}-04-01`,
        to: `${startYear + 1}-03-31`,
    };
}

export function getFYStartYear(fy: string): number {
    return parseInt(stripFYPrefix(fy).split('-')[0]);
}

export function formatFYRange(fy: string): string {
    const startYear = getFYStartYear(fy);
    return `01 Apr ${startYear} - 31 Mar ${startYear + 1}`;
}

interface FYContextType {
    selectedFY: string;
    setSelectedFY: (fy: string) => void;
    fyDates: { from: string; to: string };
    stepFY: (direction: 1 | -1) => void;
}

const FYContext = createContext<FYContextType | undefined>(undefined);

export function FYProvider({ children }: { children: ReactNode }) {
    const [selectedFY, setSelectedFYState] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(FY_STORAGE_KEY);
            if (saved) {
                console.log('[FY] Loaded from localStorage:', saved);
                return saved;
            }
        }
        const current = getCurrentFY();
        console.log('[FY] Defaulting to current FY:', current);
        return current;
    });

    useEffect(() => {
        localStorage.setItem(FY_STORAGE_KEY, selectedFY);
        console.log('[FY] Persisted to localStorage:', selectedFY);
    }, [selectedFY]);

    // Current FY me kuch nahi hota (data pichhle FY ka hai) -> company ke last voucher wale FY pe jao.
    const { selectedCompany } = useAuth() as any;
    useEffect(() => {
        if (!selectedCompany?.id) return;
        if (localStorage.getItem(FY_USER_CHOICE_KEY) === '1') return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('vouchers')
                .select('voucher_date')
                .eq('company_id', selectedCompany.id)
                .not('voucher_date', 'is', null)
                .order('voucher_date', { ascending: false })
                .limit(1);
            const latest = (data as any[] | null)?.[0]?.voucher_date;
            if (cancelled || !latest) return;
            const d = new Date(latest);
            const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
            setSelectedFYState(`FY ${year}-${String(year + 1).slice(2)}`);
        })();
        return () => { cancelled = true; };
    }, [selectedCompany?.id]);

    const setSelectedFY = useCallback((fy: string) => {
        console.log('[FY] Setting FY:', fy);
        localStorage.setItem(FY_USER_CHOICE_KEY, '1');
        setSelectedFYState(fy);
    }, []);

    const fyDates = getFYDates(selectedFY);

    const stepFY = useCallback((direction: 1 | -1) => {
        const startYear = getFYStartYear(selectedFY);
        const newStart = startYear + direction;
        const newFY = `FY ${newStart}-${String(newStart + 1).slice(2)}`;
        console.log('[FY] Stepping:', direction === 1 ? 'forward' : 'backward', 'to:', newFY);
        localStorage.setItem(FY_USER_CHOICE_KEY, '1');
        setSelectedFYState(newFY);
    }, [selectedFY]);

    return (
        <FYContext.Provider value={{ selectedFY, setSelectedFY, fyDates, stepFY }}>
            {children}
        </FYContext.Provider>
    );
}

export function useFY(): FYContextType {
    const context = useContext(FYContext);
    if (!context) {
        throw new Error('useFY must be used within an FYProvider');
    }
    return context;
}
