import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    effectiveTheme: 'light' | 'dark';
    toggleTheme: () => void;
    setThemeMode: (mode: Theme) => void;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('theme') as Theme;
                if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
            } catch {
                // Continue with the system preference when storage is unavailable.
            }
        }
        return 'system';
    });

    const [systemDark, setSystemDark] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    });

    const effectiveTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }
        mq.addListener(handler);
        return () => mq.removeListener(handler);
    }, []);

    useEffect(() => {
        try { localStorage.setItem('theme', theme); } catch { /* Preference still applies for this session. */ }
        const root = document.documentElement;
        root.classList.toggle('dark', effectiveTheme === 'dark');
        root.dataset.theme = effectiveTheme;
        root.style.colorScheme = effectiveTheme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute(
            'content',
            effectiveTheme === 'dark' ? '#0D1117' : '#F5F7FA'
        );
    }, [theme, effectiveTheme]);

    const toggleTheme = () => {
        // Use the effective theme, not just the stored preference. In system mode the
        // previous toggle could appear to do nothing when the OS was already dark.
        setTheme(effectiveTheme === 'dark' ? 'light' : 'dark');
    };

    const setThemeMode = (mode: Theme) => {
        setTheme(mode);
    };

    return (
        <ThemeContext.Provider value={{ theme, effectiveTheme, toggleTheme, setThemeMode, isDark: effectiveTheme === 'dark' }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
