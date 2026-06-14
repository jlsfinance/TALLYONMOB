import React, { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { useTheme } from '@/contexts/ThemeContext';
import { useHotkeys, useSequenceHotkeys } from '@/hooks/useHotkeys';
import { useAuth } from '@/contexts/AuthContext';
import {
    Search, LayoutDashboard, FileText, Users, TrendingUp, Package,
    BarChart3, Scale, Box, Bot, Settings, Sun, Moon, RefreshCw, Plus
} from 'lucide-react';

export const CommandPalette: React.FC = () => {
    const [open, setOpen] = useState(false);
    const { navigate } = useSafeNavigate();
    const { isDark, toggleTheme } = useTheme();
    const { appMode } = useAuth() as any;

    // Toggle palette
    useHotkeys('ctrl+k', () => setOpen(prev => !prev), { enableOnInputs: true });
    useHotkeys('meta+k', () => setOpen(prev => !prev), { enableOnInputs: true });

    // Global navigation shortcuts
    const homePath = appMode === 'billing' ? '/billing' : '/dashboard';
    useSequenceHotkeys(['g', 'd'], () => { navigate(homePath); setOpen(false); });
    useSequenceHotkeys(['g', 'v'], () => { navigate('/vouchers'); setOpen(false); });
    useSequenceHotkeys(['g', 'l'], () => { navigate('/ledgers'); setOpen(false); });
    useSequenceHotkeys(['g', 's'], () => { navigate('/stock'); setOpen(false); });
    useSequenceHotkeys(['g', 'p'], () => { navigate('/profit-loss'); setOpen(false); });
    useSequenceHotkeys(['g', 'b'], () => { navigate('/balance-sheet'); setOpen(false); });
    useSequenceHotkeys(['g', 'h'], () => { navigate('/sync-history'); setOpen(false); });
    useSequenceHotkeys(['g', 'a'], () => { navigate('/ai-assistant'); setOpen(false); });
    useSequenceHotkeys(['g', 'i'], () => { navigate('/business-insights'); setOpen(false); });
    useSequenceHotkeys(['g', 'c'], () => { navigate('/create-invoice'); setOpen(false); });
    useSequenceHotkeys(['g', 'm'], () => { navigate('/settings'); setOpen(false); });

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!open) return null;

    const runCommand = (action: () => void) => {
        action();
        setOpen(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
                onClick={() => setOpen(false)}
            />

            {/* Swiss Typographic Brutalism Command Dialog */}
            <div className="relative w-full max-w-[640px] bg-[var(--surface)] border-2 border-[var(--on-background)] shadow-[8px_8px_0px_0px_var(--on-background)] text-[var(--on-background)] overflow-hidden rounded-[2px] transition-all">
                <Command label="Global Command Menu" className="flex flex-col">
                    <div className="flex items-center border-b-2 border-[var(--on-background)] px-4 py-3 bg-[var(--surface-container)]">
                        <Search className="mr-3 h-5 w-5 shrink-0 opacity-70 text-[var(--on-background)]" />
                        <Command.Input 
                            autoFocus
                            placeholder="Type a command or search page..." 
                            className="flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)] font-mono text-[var(--on-background)]"
                        />
                        <div className="flex items-center gap-1 ml-2 border border-[var(--on-background)] px-2 py-0.5 bg-[var(--surface)] text-[10px] font-mono font-bold uppercase tracking-wider shadow-[2px_2px_0px_var(--on-background)]">
                            ESC
                        </div>
                    </div>

                    <Command.List className="max-h-[360px] overflow-y-auto p-2 font-mono scrollbar-thin">
                        <Command.Empty className="py-6 text-center text-sm text-[var(--text-muted)]">
                            No matching commands found.
                        </Command.Empty>

                        <Command.Group heading="QUICK ACTIONS" className="px-2 py-1.5 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border)] mb-2">
                            <Command.Item 
                                onSelect={() => runCommand(() => navigate('/create-invoice'))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <Plus className="h-4.5 w-4.5 group-hover:scale-110 transition-transform" />
                                <span>Create New Invoice</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g c</span>
                            </Command.Item>
                            
                            <Command.Item 
                                onSelect={() => runCommand(() => toggleTheme())}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                {isDark ? <Sun className="h-4.5 w-4.5 group-hover:scale-110 transition-transform text-amber-500" /> : <Moon className="h-4.5 w-4.5 group-hover:scale-110 transition-transform" />}
                                <span>Toggle Theme ({isDark ? 'Light' : 'Dark'} Mode)</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">ctrl t</span>
                            </Command.Item>

                            <Command.Item 
                                onSelect={() => runCommand(() => {
                                    window.dispatchEvent(new CustomEvent('app-refresh-trigger'));
                                })}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <RefreshCw className="h-4.5 w-4.5 group-hover:spin-slow" />
                                <span>Force Data Re-Sync</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g h</span>
                            </Command.Item>
                        </Command.Group>

                        <Command.Group heading="PAGES & NAVIGATION" className="px-2 py-1.5 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border)] mb-2 mt-3">
                            <Command.Item 
                                onSelect={() => runCommand(() => navigate(homePath))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <LayoutDashboard className="h-4.5 w-4.5" />
                                <span>Dashboard Overview</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g d</span>
                            </Command.Item>

                            <Command.Item 
                                onSelect={() => runCommand(() => navigate('/vouchers'))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <FileText className="h-4.5 w-4.5" />
                                <span>Vouchers Registry</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g v</span>
                            </Command.Item>

                            <Command.Item 
                                onSelect={() => runCommand(() => navigate('/ledgers'))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <Users className="h-4.5 w-4.5" />
                                <span>Ledgers & Parties</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g l</span>
                            </Command.Item>

                            <Command.Item 
                                onSelect={() => runCommand(() => navigate('/stock'))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <Box className="h-4.5 w-4.5" />
                                <span>Stock & Inventory</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g s</span>
                            </Command.Item>

                            <Command.Item 
                                onSelect={() => runCommand(() => navigate('/sales'))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <TrendingUp className="h-4.5 w-4.5" />
                                <span>Sales Analytics & Invoices</span>
                            </Command.Item>

                            <Command.Item 
                                onSelect={() => runCommand(() => navigate('/profit-loss'))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <BarChart3 className="h-4.5 w-4.5" />
                                <span>Profit & Loss Accounts</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g p</span>
                            </Command.Item>

                            <Command.Item 
                                onSelect={() => runCommand(() => navigate('/balance-sheet'))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <Scale className="h-4.5 w-4.5" />
                                <span>Balance Sheet Ledger</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g b</span>
                            </Command.Item>

                            <Command.Item 
                                onSelect={() => runCommand(() => navigate('/ai-assistant'))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <Bot className="h-4.5 w-4.5" />
                                <span>AI Assistant Chat</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g a</span>
                            </Command.Item>

                            <Command.Item 
                                onSelect={() => runCommand(() => navigate('/business-insights'))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <TrendingUp className="h-4.5 w-4.5" />
                                <span>AI Business Insights</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g i</span>
                            </Command.Item>

                            <Command.Item 
                                onSelect={() => runCommand(() => navigate('/settings'))}
                                className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--on-background)] hover:text-[var(--surface)] rounded-[2px] transition-colors group"
                            >
                                <Settings className="h-4.5 w-4.5" />
                                <span>System Configuration</span>
                                <span className="ml-auto text-xs opacity-60 font-sans border border-current px-1.5 py-0.5 rounded-[2px]">g m</span>
                            </Command.Item>
                        </Command.Group>
                    </Command.List>

                    <div className="flex items-center gap-4 border-t-2 border-[var(--on-background)] px-4 py-2.5 bg-[var(--surface-container)] text-xs font-bold font-mono tracking-wide text-[var(--on-background)]">
                        <span>↑↓ to navigate</span>
                        <span>[Enter] to select</span>
                        <span>[Esc] to exit</span>
                        <span className="ml-auto text-[10px] opacity-75 border border-[var(--on-background)] px-1.5 py-0.5 bg-[var(--surface)] shadow-[1px_1px_0px_var(--on-background)] font-mono">Ctrl + K</span>
                    </div>
                </Command>
            </div>
        </div>
    );
};
