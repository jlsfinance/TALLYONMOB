import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        // Check localStorage or system preference
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme') as Theme;
            if (saved === 'dark' || saved === 'light') return saved;
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        }
        return 'dark'; // Default to dark
    });

    useEffect(() => {
        // Save to localStorage
        localStorage.setItem('theme', theme);

        // Apply theme class to document
        const root = document.documentElement;

        if (theme === 'dark') {
            root.classList.add('dark');
            // Slate-900 for visible dark theme
            document.body.style.backgroundColor = '#0f172a';
            document.body.style.color = '#f1f5f9';
        } else {
            root.classList.remove('dark');
            // Light theme
            document.body.style.backgroundColor = '#ffffff';
            document.body.style.color = '#0f172a';
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
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
