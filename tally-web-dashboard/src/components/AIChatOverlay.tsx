
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Settings, Key, MessageSquare, Loader2, RefreshCw } from 'lucide-react';
import { GeminiService } from '@/lib/GeminiService';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export default function AIChatOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { selectedCompany } = useAuth() as any;
    const [apiKey, setApiKey] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isConfiguring, setIsConfiguring] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadSettings();
    }, [isOpen]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const loadSettings = async () => {
        setInitializing(true);
        const storedKey = await GeminiService.getApiKey();
        if (storedKey) {
            setApiKey(storedKey);
            setIsConfiguring(false);
        } else {
            setIsConfiguring(true);
        }
        setInitializing(false);
    };

    const saveApiKey = async () => {
        if (!apiKey.trim()) return toast.error('Please enter a valid API Key');

        setLoading(true);
        const isValid = await GeminiService.validateKey(apiKey);
        setLoading(false);

        if (isValid) {
            await GeminiService.setApiKey(apiKey);
            setIsConfiguring(false);
            toast.success('API Key saved successfully!');
            setMessages([{
                id: 'welcome',
                role: 'assistant',
                content: `Hello! I am your Accounting AI. I can analyze your Tally data. Ask me about Sales, Outstanding, or Stock!`,
                timestamp: new Date()
            }]);
        } else {
            toast.error('Invalid API Key. Please check and try again.');
        }
    };

    const fetchContextData = async () => {
        if (!selectedCompany?.id) return {};

        try {
            // Fetch significantly more data to cover full financial year context
            const [sales, ledgers, stock] = await Promise.all([
                supabase.from('vouchers')
                    .select('voucher_date, total_amount, grand_total, party_name')
                    .eq('company_id', selectedCompany.id)
                    .eq('voucher_type', 'Sales')
                    .order('voucher_date', { ascending: false })
                    .limit(2000), // Increased from 1000 to 2000 to cover more history
                supabase.from('ledgers')
                    .select('name, closing_balance, parent')
                    .eq('company_id', selectedCompany.id)
                    .neq('closing_balance', 0)
                    .limit(2000),
                supabase.from('stock_items')
                    .select('name, current_stock, unit')
                    .eq('company_id', selectedCompany.id)
                    .limit(1000)
            ]);

            return {
                company: selectedCompany.name,
                full_year_sales_data: sales.data, // Renamed key to give AI context that this is extensive data
                all_outstanding_ledgers: ledgers.data,
                stock_inventory: stock.data
            };
        } catch (err) {
            console.error("Error fetching context", err);
            return { error: "Failed to fetch live data" };
        }
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const dataContext = await fetchContextData();
            const response = await GeminiService.analyzeData(userMsg.content, dataContext, apiKey);

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response,
                timestamp: new Date()
            }]);
        } catch (error) {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: "Sorry, I encountered an error connecting to Gemini. Please check your network or API key.",
                timestamp: new Date()
            }]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            >
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    className="bg-[var(--surface)] w-full sm:max-w-md h-[80vh] sm:h-[600px] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col border border-[var(--border)]"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--surface-container)] rounded-t-2xl">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white">
                                <Bot size={20} />
                            </div>
                            <h3 className="font-bold text-[var(--on-surface)]">Gemini Accountant</h3>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setIsConfiguring(!isConfiguring)} className="p-2 hover:bg-[var(--surface-hover)] rounded-full text-[var(--text-muted)]">
                                <Settings size={18} />
                            </button>
                            <button onClick={onClose} className="p-2 hover:bg-[var(--surface-hover)] rounded-full text-[var(--on-surface)]">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--background)]">
                        {initializing ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="animate-spin text-[var(--primary)]" />
                            </div>
                        ) : isConfiguring ? (
                            <div className="flex flex-col items-center justify-center h-full space-y-4 text-center p-4">
                                <div className="w-16 h-16 bg-[var(--surface-container)] rounded-full flex items-center justify-center mb-2">
                                    <Key className="w-8 h-8 text-[var(--primary)]" />
                                </div>
                                <h4 className="font-bold text-lg text-[var(--on-surface)]">Setup Gemini API</h4>
                                <p className="text-sm text-[var(--text-muted)] max-w-xs">
                                    This app uses your own API key securely stored on-device.
                                    Get it from Google AI Studio.
                                </p>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="Paste API Key here..."
                                    className="w-full p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)] focus:ring-2 focus:ring-[var(--primary)] outline-none"
                                />
                                <button
                                    onClick={saveApiKey}
                                    disabled={loading}
                                    className="w-full py-3 bg-[var(--primary)] text-white font-bold rounded-lg hover:bg-[var(--primary-dark)] flex items-center justify-center gap-2"
                                >
                                    {loading && <Loader2 className="animate-spin" size={18} />}
                                    Save & Connect
                                </button>
                            </div>
                        ) : (
                            <>
                                {messages.length === 0 && (
                                    <div className="text-center text-[var(--text-muted)] mt-10">
                                        <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>Ask me anything about your Tally data!</p>
                                    </div>
                                )}
                                {messages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`
                                max-w-[85%] p-3 rounded-2xl text-sm
                                ${msg.role === 'user' ? 'bg-[var(--primary)] text-white rounded-tr-sm' : 'bg-[var(--surface-container)] text-[var(--on-surface)] rounded-tl-sm border border-[var(--border)]'}
                            `}>
                                            <MarkdownRenderer content={msg.content} />
                                        </div>
                                    </div>
                                ))}
                                {loading && (
                                    <div className="flex justify-start">
                                        <div className="bg-[var(--surface-container)] p-3 rounded-2xl rounded-tl-sm border border-[var(--border)]">
                                            <div className="flex gap-1">
                                                <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </>
                        )}
                    </div>

                    {/* Input Area */}
                    {!isConfiguring && (
                        <div className="p-3 border-t border-[var(--border)] bg-[var(--surface)]">
                            <div className="flex gap-2">
                                <input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder="Ask about sales, stock, or outstanding..."
                                    className="flex-1 p-3 rounded-xl bg-[var(--surface-container)] text-[var(--on-surface)] focus:outline-none placeholder:text-[var(--text-muted)] text-sm"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={loading || !input.trim()}
                                    className="p-3 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send size={20} />
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// Simple Markdown Renderer for Professional Output
const MarkdownRenderer = ({ content }: { content: string }) => {
    // Split by newlines
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];

    let inTable = false;
    let tableHeader: string[] = [];
    let tableRows: string[][] = [];

    const flushTable = (key: string | number) => {
        if (inTable && tableHeader.length > 0) {
            elements.push(
                <div key={`table-${key}`} className="my-3 overflow-x-auto border border-[var(--border)] rounded-lg">
                    <table className="w-full text-xs text-left text-[var(--on-surface)]">
                        <thead className="bg-[var(--surface-variant)] text-[var(--text-muted)] uppercase tracking-wider font-bold">
                            <tr>
                                {tableHeader.map((h, i) => <th key={i} className="px-3 py-2 border-r border-[var(--border)] last:border-0">{h.trim()}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {tableRows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-[var(--surface-hover)]">
                                    {row.map((cell, cIdx) => (
                                        <td key={cIdx} className="px-3 py-2 border-r border-[var(--border)] last:border-0 whitespace-nowrap">
                                            {formatText(cell.trim())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            inTable = false;
            tableHeader = [];
            tableRows = [];
        }
    };

    const formatText = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className="font-extrabold text-[var(--primary)]">{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    lines.forEach((line, idx) => {
        const trimmed = line.trim();

        // Check for table
        if (trimmed.startsWith('|')) {
            const cols = trimmed.split('|').filter(c => c.trim() !== '' || (c !== '' && trimmed.endsWith('|'))).map(c => c.trim()).filter(c => c);
            // Simple check to ignore divider lines like |---|---|
            const isDivider = cols.every(c => c.match(/^[-:]+$/));

            if (!inTable && !isDivider) {
                inTable = true;
                tableHeader = cols;
            } else if (inTable && !isDivider) {
                tableRows.push(cols);
            }
            // If it is divider, just ignore
            return;
        } else {
            flushTable(idx);
        }

        // Headers
        if (trimmed.startsWith('###')) {
            elements.push(<h3 key={idx} className="text-sm font-black mt-3 mb-1 uppercase tracking-wide text-[var(--on-surface)]">{formatText(trimmed.replace(/^###\s+/, ''))}</h3>);
        } else if (trimmed.startsWith('##')) {
            elements.push(<h2 key={idx} className="text-base font-black mt-4 mb-2 uppercase tracking-wide text-[var(--primary)]">{formatText(trimmed.replace(/^##\s+/, ''))}</h2>);
        }
        // Lists
        else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            elements.push(
                <div key={idx} className="flex gap-2 ml-1 my-1 text-sm text-[var(--on-surface)]">
                    <span className="text-[var(--primary)] font-bold">•</span>
                    <span>{formatText(trimmed.substring(2))}</span>
                </div>
            );
        }
        // Empty lines
        else if (trimmed === '') {
            elements.push(<div key={idx} className="h-2"></div>);
        }
        // Normal text
        else {
            elements.push(<p key={idx} className="text-sm text-[var(--on-surface)] leading-relaxed">{formatText(line)}</p>);
        }
    });

    flushTable('end');

    return <div className="space-y-0.5">{elements}</div>;
};
