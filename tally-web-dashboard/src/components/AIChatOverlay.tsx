import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Loader2, Copy, Check } from 'lucide-react';
import { analyzeData } from '@/lib/GeminiService';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchAllSupabaseRows } from '@/lib/supabasePagination';
import { getUserGeminiApiKey } from '@/lib/userGeminiKey';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export default function AIChatOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { selectedCompany, user } = useAuth() as any;
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        if (messages.length === 0) {
            setMessages([
                {
                    id: 'welcome',
                    role: 'assistant',
                    content:
                        'Hello! I am your accounting AI assistant. Ask about sales, outstanding, stock or trends and I will analyze your current company data.',
                    timestamp: new Date()
                }
            ]);
        }
    }, [isOpen, messages.length]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const fetchContextData = async () => {
        if (!selectedCompany?.id) return {};

        try {
            const [salesRows, ledgerRows, stockRows] = await Promise.all([
                fetchAllSupabaseRows((from, to) => supabase
                    .from('vouchers')
                    .select('id, voucher_date, total_amount, grand_total, party_name')
                    .eq('company_id', selectedCompany.id)
                    .eq('voucher_type', 'Sales')
                    .order('voucher_date', { ascending: false })
                    .order('id')
                    .range(from, to)),
                fetchAllSupabaseRows((from, to) => supabase
                    .from('ledgers')
                    .select('id, name, closing_balance, parent, current_balance')
                    .eq('company_id', selectedCompany.id)
                    .order('id')
                    .range(from, to)),
                fetchAllSupabaseRows((from, to) => supabase
                    .from('stock_items')
                    .select('id, name, current_stock, unit')
                    .eq('company_id', selectedCompany.id)
                    .order('id')
                    .range(from, to))
            ]);

            const amountOf = (row: any) => Math.abs(Number(row.grand_total) || Number(row.total_amount) || 0);
            const topCustomers = new Map<string, number>();
            for (const row of salesRows) {
                if (row.party_name) topCustomers.set(row.party_name, (topCustomers.get(row.party_name) || 0) + amountOf(row));
            }
            const debtors = ledgerRows.filter((row: any) => String(row.parent || '').toLowerCase().includes('debtor'));
            const creditors = ledgerRows.filter((row: any) => String(row.parent || '').toLowerCase().includes('creditor'));
            const lowStock = stockRows.filter((row: any) => Number(row.current_stock) >= 0 && Number(row.current_stock) < 10)
                .sort((a: any, b: any) => Number(a.current_stock) - Number(b.current_stock));

            return {
                company: selectedCompany.name,
                sales: salesRows.slice(0, 50),
                salesSummary: {
                    invoiceCount: salesRows.length,
                    totalSales: salesRows.reduce((sum: number, row: any) => sum + amountOf(row), 0),
                    topCustomers: [...topCustomers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, amount]) => ({ name, amount })),
                },
                ledgers: [...ledgerRows].sort((a: any, b: any) => Math.abs(Number(b.current_balance ?? b.closing_balance) || 0) - Math.abs(Number(a.current_balance ?? a.closing_balance) || 0)).slice(0, 100),
                ledgerSummary: {
                    ledgerCount: ledgerRows.length,
                    totalReceivable: debtors.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.current_balance ?? row.closing_balance) || 0), 0),
                    totalPayable: creditors.reduce((sum: number, row: any) => sum + Math.abs(Number(row.current_balance ?? row.closing_balance) || 0), 0),
                },
                stock: lowStock.slice(0, 50),
                stockSummary: { stockItemCount: stockRows.length, lowStockCount: lowStock.length },
            };
        } catch (error) {
            return { error: 'Failed to fetch context data', details: String(error) };
        }
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const dataContext = await fetchContextData();
            const response = await analyzeData(userMsg.content, dataContext, {
                apiKey: getUserGeminiApiKey(user?.id),
                userId: user?.id
            });

            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: response || 'No response generated.',
                    timestamp: new Date()
                }
            ]);
        } catch (error: any) {
            const errorMsg = error?.message?.includes('API key')
                ? '⚠️ **Gemini API Key set nahi hai!**\n\nSettings me jaake Google AI Studio ki API key add karo.\n\n👉 Settings > Gemini API Key'
                : '❌ AI request fail ho gaya. Settings me API key check karein ya retry karein.';
            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: errorMsg,
                    timestamp: new Date()
                }
            ]);
        } finally {
            setLoading(false);
        }
    };

    const copyMessage = async (content: string, id: string) => {
        await navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
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
                    <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--surface-container)] rounded-t-2xl">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-cyan-500 flex items-center justify-center text-white">
                                <Bot size={18} />
                            </div>
                            <h3 className="font-bold text-[var(--on-surface)]">AI Assistant</h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-[var(--surface-hover)] rounded-full text-[var(--on-surface)]"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--background)]">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user'
                                        ? 'bg-[var(--primary)] text-white rounded-tr-sm'
                                        : 'bg-[var(--surface-container)] text-[var(--on-surface)] rounded-tl-sm border border-[var(--border)]'
                                        }`}
                                >
                                    <MarkdownRenderer content={msg.content} />
                                    {msg.role === 'assistant' && msg.id !== 'welcome' && (
                                        <div className="flex justify-end mt-2 pt-2 border-t border-[var(--border)]">
                                            <button
                                                onClick={() => copyMessage(msg.content, msg.id)}
                                                className="text-xs text-[var(--text-muted)] hover:text-[var(--on-surface)]"
                                            >
                                                {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-[var(--surface-container)] p-3 rounded-2xl rounded-tl-sm border border-[var(--border)]">
                                    <Loader2 className="animate-spin text-[var(--primary)]" size={18} />
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-3 border-t border-[var(--border)] bg-[var(--surface)]">
                        <div className="flex gap-2">
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Ask about sales, stock, outstanding..."
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
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

const MarkdownRenderer = ({ content }: { content: string }) => {
    const lines = content.split('\n');
    return (
        <div className="space-y-1">
            {lines.map((line, index) => {
                const parts = line.split(/(\*\*.*?\*\*)/g);
                return (
                    <p key={index} className="leading-relaxed">
                        {parts.map((part, i) =>
                            part.startsWith('**') && part.endsWith('**') ? (
                                <strong key={i}>{part.slice(2, -2)}</strong>
                            ) : (
                                <span key={i}>{part}</span>
                            )
                        )}
                    </p>
                );
            })}
        </div>
    );
};
