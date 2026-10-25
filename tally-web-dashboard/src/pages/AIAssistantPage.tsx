import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AuthContextType } from '../contexts/types';
import { supabase } from '../lib/insforge';
import {
    Bot, Send, Mic, MicOff, Loader2, Sparkles, BarChart3,
    TrendingUp, Users, IndianRupee, Package, FileText,
    ArrowUp, Trash2, Copy, Check, RefreshCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { getUserGeminiApiKey } from '@/lib/userGeminiKey';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    data?: any;
}

interface CompanyData {
    sales: any[];
    purchases: any[];
    ledgers: any[];
    stock: any[];
    companyName: string;
}

const QUICK_PROMPTS = [
    { icon: 'ðŸ“Š', text: 'Aaj ki sale kitni hui?', label: 'Today Sales' },
    { icon: 'ðŸ’°', text: 'Sabse zyada outstanding kiska hai?', label: 'Top Outstanding' },
    { icon: 'ðŸ“¦', text: 'Low stock items batao', label: 'Low Stock' },
    { icon: 'ðŸ“ˆ', text: 'Last 7 days ka sales trend', label: 'Sales Trend' },
    { icon: 'ðŸ†', text: 'Top 5 customers by revenue', label: 'Top Customers' },
    { icon: 'âš ï¸', text: 'Cash flow prediction next 30 days', label: 'Cash Flow' },
    { icon: 'ðŸ“‹', text: 'Is month ki P&L summary bata', label: 'P&L Summary' },
    { icon: 'ðŸ”', text: 'Unusual transactions check kar', label: 'Anomaly Check' }
];

export default function AIAssistantPage() {
    const { selectedCompany, user } = useAuth() as AuthContextType;
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Welcome message
        setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: `Namaste! ðŸ™ Main aapka AI Business Assistant hoon.\n\nMain aapki ${selectedCompany?.name || 'company'} ke data se answers de sakta hoon. Hindi ya English mein pucho!\n\n**Kuch try karein:**\n- "Aaj kitni sale hui?"\n- "Sabse zyada outstanding kiska hai?"\n- "Top 5 items by sale"\n- "Cash flow predict karo"`,
            timestamp: new Date()
        }]);
    }, [selectedCompany]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const fetchCompanyData = async () => {
        if (!selectedCompany?.id) return null;

        const [salesRes, purchaseRes, ledgersRes, stockRes] = await Promise.all([
            supabase.from('vouchers')
                .select('voucher_date, total_amount, grand_total, party_name, voucher_number')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .or('is_deleted.is.null,is_deleted.eq.false')
                .order('voucher_date', { ascending: false })
                .limit(500),
            supabase.from('vouchers')
                .select('voucher_date, total_amount, grand_total, party_name')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Purchase')
                .or('is_deleted.is.null,is_deleted.eq.false')
                .order('voucher_date', { ascending: false })
                .limit(500),
            supabase.from('ledgers')
                .select('name, parent, current_balance')
                .eq('company_id', selectedCompany.id)
                .limit(5000),
            supabase.from('stock_items')
                .select('name, current_stock, unit, rate, stock_group')
                .eq('company_id', selectedCompany.id)
                .limit(2000)
        ]);

        return {
            sales: (salesRes as any)?.data || [],
            purchases: (purchaseRes as any)?.data || [],
            ledgers: (ledgersRes as any)?.data || [],
            stock: (stockRes as any)?.data || [],
            companyName: selectedCompany.name
        };
    };

    const processWithAI = async (query: string, data: CompanyData): Promise<string> => {
        // First try to answer locally using data analysis
        const localAnswer = analyzeLocally(query, data);
        if (localAnswer) return localAnswer;

        // Fallback to Gemini AI with company data context
        try {
            const { analyzeData } = await import('@/lib/GeminiService');
            const dataContext = {
                companyName: data.companyName,
                salesCount: data.sales.length,
                topSales: data.sales.slice(0, 30),
                purchasesCount: data.purchases.length,
                topPurchases: data.purchases.slice(0, 20),
                ledgersWithBalance: data.ledgers.filter((l: any) => Math.abs(l.current_balance) > 0).slice(0, 60),
                lowStock: data.stock.filter((s: any) => (s.current_stock || 0) < 10).slice(0, 20),
                totalLedgers: data.ledgers.length,
                totalStock: data.stock.length
            };

            const answer = await analyzeData(query, dataContext, {
                apiKey: getUserGeminiApiKey(user?.id),
                userId: user?.id
            });
            return answer || "Main is query ka answer abhi de nahi pa raha. Please apna query rephrase karein. ðŸ¤”";
        } catch (err: any) {
            console.error('Gemini AI call failed:', err);
            if (err?.message?.includes('API key')) {
                return "âš ï¸ **Gemini API Key set nahi hai!**\n\nSettings me jaake Google AI Studio ki API key add karo, phir AI smart jawab dega.\n\nðŸ‘‰ Sidebar > Settings > Gemini API Key";
            }
            return "âŒ AI request fail ho gaya. Please retry karein ya Settings me API key check karein.";
        }
    };

    const analyzeLocally = (query: string, data: CompanyData): string | null => {
        const q = query.toLowerCase();
        const today = new Date().toISOString().split('T')[0];
        const todayDate = new Date();
        const searchWords = q.replace('ledger', '').replace('khata', '').replace('party', '').replace('ka', '').replace('dikhao', '').replace('batao', '').replace('bata', '').replace('search', '').trim().split(/\s+/).filter(w => w.length > 2);

        // Explicit Ledger Search
        if (q.includes('ledger') || q.includes('khata') || q.includes('party') || searchWords.length > 0) {
            const ledgerMatch = data.ledgers.find((l: any) =>
                searchWords.some(word => l.name.toLowerCase().includes(word))
            );

            if (ledgerMatch && (q.includes('ledger') || q.includes('khata') || q.includes('party') || q.includes('balance'))) {
                const bal = ledgerMatch.current_balance;
                const type = bal >= 0 ? 'Debit (Receivable)' : 'Credit (Payable)';
                return `ðŸ“– **Ledger Details: ${ledgerMatch.name}**\n\n` +
                    `ðŸ’° Balance: **â‚¹${Math.abs(bal).toLocaleString('en-IN')}** (${type})\n` +
                    `ðŸ“ Group: **${ledgerMatch.parent}**\n\n` +
                    `Aap is party ki transactions dekhne ke liye "Transactions of ${ledgerMatch.name}" puch sakte hain.`;
            }
        }

        // Today's sales
        if (q.includes('aaj') && (q.includes('sale') || q.includes('sell') || q.includes('bik'))) {
            const todaySales = data.sales.filter((s: any) => s.voucher_date === today);
            const total = todaySales.reduce((sum: number, s: any) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0);
            return `ðŸ“Š **Aaj Ki Sales (${todayDate.toLocaleDateString('en-IN')})**\n\n` +
                `ðŸ’° Total Sales: **â‚¹${total.toLocaleString('en-IN')}**\n` +
                `ðŸ“‹ Number of Invoices: **${todaySales.length}**\n\n` +
                (todaySales.length > 0
                    ? `Top Sales:\n${todaySales.slice(0, 5).map((s: any, i: number) =>
                        `${i + 1}. ${s.party_name} â€” â‚¹${Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0).toLocaleString('en-IN')}`
                    ).join('\n')}`
                    : 'Aaj abhi tak koi sale nahi hui hai.');
        }

        // Outstanding
        if (q.includes('outstanding') || q.includes('bakaya') || q.includes('baki') || q.includes('pending payment')) {
            const debtors = data.ledgers
                .filter((l: any) => ['Sundry Debtors', 'sundry debtors'].includes(l.parent) && l.current_balance > 0)
                .sort((a: any, b: any) => b.current_balance - a.current_balance);

            const total = debtors.reduce((sum: number, d: any) => sum + d.current_balance, 0);

            return `ðŸ’° **Outstanding Report**\n\n` +
                `Total Outstanding: **â‚¹${total.toLocaleString('en-IN')}**\n` +
                `Parties with dues: **${debtors.length}**\n\n` +
                `**Top 10 Outstanding:**\n${debtors.slice(0, 10).map((d: any, i: number) =>
                    `${i + 1}. ${d.name} â€” â‚¹${d.current_balance.toLocaleString('en-IN')}`
                ).join('\n')}`;
        }

        // Top customers
        if ((q.includes('top') || q.includes('best')) && (q.includes('customer') || q.includes('buyer') || q.includes('party'))) {
            const partyTotals: Record<string, number> = {};
            data.sales.forEach((s: any) => {
                const amount = Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0);
                partyTotals[s.party_name] = (partyTotals[s.party_name] || 0) + amount;
            });

            const sorted = Object.entries(partyTotals)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10);

            return `ðŸ† **Top Customers by Revenue**\n\n${sorted.map(([name, amount], i) =>
                `${i + 1}. **${name}** â€” â‚¹${amount.toLocaleString('en-IN')}`
            ).join('\n')}`;
        }

        // Low stock
        if (q.includes('low stock') || q.includes('kam stock') || q.includes('stock kam') || q.includes('reorder') || q.includes('stock alert')) {
            const lowStock = data.stock
                .filter((s: any) => (s.current_stock || 0) >= 0 && (s.current_stock || 0) < 10)
                .sort((a: any, b: any) => (a.current_stock || 0) - (b.current_stock || 0));

            if (lowStock.length === 0) return 'âœ… Sab items ka stock theek hai! Koi item low stock mein nahi hai.';

            return `âš ï¸ **Low Stock Alert** (${lowStock.length} items)\n\n${lowStock.slice(0, 15).map((s: any, i: number) =>
                `${i + 1}. **${s.name}** â€” ${s.current_stock || 0} ${s.unit || 'units'} remaining`
            ).join('\n')}\n\nðŸ’¡ Consider placing reorders for these items.`;
        }

        // Sales trend
        if (q.includes('trend') || q.includes('chart') || (q.includes('last') && q.includes('day'))) {
            const days = 7;
            const dailySales: Record<string, number> = {};

            for (let i = 0; i < days; i++) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                dailySales[d.toISOString().split('T')[0]] = 0;
            }

            data.sales.forEach((s: any) => {
                if (dailySales[s.voucher_date] !== undefined) {
                    dailySales[s.voucher_date] += Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0);
                }
            });

            const total = Object.values(dailySales).reduce((a, b) => a + b, 0);
            const avg = total / days;

            return `ðŸ“ˆ **Last 7 Days Sales Trend**\n\n` +
                Object.entries(dailySales)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, amount]) => {
                        const bar = 'â–ˆ'.repeat(Math.max(1, Math.round((amount / (Math.max(...Object.values(dailySales)) || 1)) * 15)));
                        return `${new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit' })} | ${bar} â‚¹${amount.toLocaleString('en-IN')}`;
                    })
                    .join('\n') +
                `\n\nðŸ“Š Total: **â‚¹${total.toLocaleString('en-IN')}** | Avg: **â‚¹${Math.round(avg).toLocaleString('en-IN')}/day**`;
        }

        // P&L
        if (q.includes('p&l') || q.includes('profit') || q.includes('loss') || q.includes('munafa') || q.includes('nuksan')) {
            const totalSales = data.sales.reduce((sum: number, s: any) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0);
            const totalPurchases = data.purchases.reduce((sum: number, p: any) => sum + Math.abs(Number(p.grand_total) || Number(p.total_amount) || 0), 0);
            const grossProfit = totalSales - totalPurchases;
            const margin = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : '0';

            return `ðŸ“‹ **Profit & Loss Summary**\n\n` +
                `ðŸ’š Total Sales: **â‚¹${totalSales.toLocaleString('en-IN')}**\n` +
                `ðŸ”´ Total Purchases: **â‚¹${totalPurchases.toLocaleString('en-IN')}**\n` +
                `${grossProfit >= 0 ? 'âœ…' : 'âŒ'} Gross Profit: **â‚¹${grossProfit.toLocaleString('en-IN')}**\n` +
                `ðŸ“Š Margin: **${margin}%**\n\n` +
                `_Note: This is based on synced voucher data._`;
        }

        // Cash flow prediction
        if (q.includes('cash flow') || q.includes('prediction') || q.includes('forecast')) {
            const receivables = data.ledgers
                .filter((l: any) => ['Sundry Debtors', 'sundry debtors'].includes(l.parent) && l.current_balance > 0)
                .reduce((sum: number, l: any) => sum + l.current_balance, 0);

            const payables = data.ledgers
                .filter((l: any) => ['Sundry Creditors', 'sundry creditors'].includes(l.parent) && l.current_balance > 0)
                .reduce((sum: number, l: any) => sum + l.current_balance, 0);

            const avgDailySales = data.sales.length > 0
                ? data.sales.reduce((sum: number, s: any) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0) / 30
                : 0;

            const projectedInflow = receivables * 0.6 + avgDailySales * 30;
            const projectedOutflow = payables * 0.8;
            const netPosition = projectedInflow - projectedOutflow;

            return `ðŸ”® **30-Day Cash Flow Prediction**\n\n` +
                `ðŸ“¥ Projected Inflows:\n` +
                `   Expected Collections (60%): â‚¹${Math.round(receivables * 0.6).toLocaleString('en-IN')}\n` +
                `   Projected Sales (30 days): â‚¹${Math.round(avgDailySales * 30).toLocaleString('en-IN')}\n` +
                `   **Total Inflow: â‚¹${Math.round(projectedInflow).toLocaleString('en-IN')}**\n\n` +
                `ðŸ“¤ Projected Outflows:\n` +
                `   Payables Due (80%): â‚¹${Math.round(payables * 0.8).toLocaleString('en-IN')}\n` +
                `   **Total Outflow: â‚¹${Math.round(projectedOutflow).toLocaleString('en-IN')}**\n\n` +
                `${netPosition >= 0 ? 'âœ…' : 'âš ï¸'} **Net Position: â‚¹${Math.round(netPosition).toLocaleString('en-IN')}**\n\n` +
                `${netPosition < 0 ? 'âš ï¸ Alert: Aapko short fall ho sakta hai! Collections speed up karein.' : 'âœ… Cash position healthy lag raha hai!'}`;
        }

        // Anomaly check
        if (q.includes('anomal') || q.includes('unusual') || q.includes('fraud') || q.includes('suspicious')) {
            const partyAmounts: Record<string, number[]> = {};
            data.sales.forEach((s: any) => {
                const amount = Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0);
                if (!partyAmounts[s.party_name]) partyAmounts[s.party_name] = [];
                partyAmounts[s.party_name].push(amount);
            });

            const anomalies: string[] = [];
            Object.entries(partyAmounts).forEach(([party, amounts]) => {
                if (amounts.length >= 3) {
                    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
                    const latestAmount = amounts[0];
                    if (latestAmount > avg * 3) {
                        anomalies.push(`**${party}**: Latest â‚¹${latestAmount.toLocaleString('en-IN')} vs Avg â‚¹${Math.round(avg).toLocaleString('en-IN')} (${Math.round(latestAmount / avg)}x higher)`);
                    }
                }
            });

            return anomalies.length > 0
                ? `ðŸ” **Anomaly Detection Report**\n\n${anomalies.length} unusual transactions found:\n\n${anomalies.slice(0, 10).join('\n')}\n\nðŸ’¡ Review these transactions for potential errors or fraud.`
                : 'âœ… **No anomalies detected!** All recent transactions appear within normal patterns.';
        }

        return null;
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const data = await fetchCompanyData();
            if (!data) throw new Error('Could not fetch company data');

            const answer = await processWithAI(userMessage.content, data);

            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: answer,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, aiMessage]);
        } catch (err: any) {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'âŒ Sorry, kuch gadbad ho gayi. Please phir se try karein.',
                timestamp: new Date()
            }]);
        } finally {
            setLoading(false);
        }
    };

    const toggleVoice = () => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            toast.error('Voice input not supported in this browser');
            return;
        }

        if (isListening) {
            setIsListening(false);
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'hi-IN';
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setInput(transcript);
            setIsListening(false);
        };

        recognition.onerror = () => {
            setIsListening(false);
            toast.error('Voice recognition failed');
        };

        recognition.onend = () => setIsListening(false);

        recognition.start();
        setIsListening(true);
    };

    const copyMessage = async (content: string, id: string) => {
        await navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const clearChat = () => {
        setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: `Chat cleared! Pucho jo puchna hai... ðŸ¤–`,
            timestamp: new Date()
        }]);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-52px)] md:h-[calc(100vh-80px)] bg-[var(--background)]">
            <HeaderPortal type="title">
                <div className="flex items-center gap-2 md:gap-3">
                    <div className="hidden md:flex w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 items-center justify-center">
                        <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xs md:text-base font-bold text-[var(--on-surface)]">AI Assistant</h1>
                        <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">
                            Sense your business
                        </p>
                    </div>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <button
                    onClick={clearChat}
                    className="p-1.5 md:p-2 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                    title="Clear Chat"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </HeaderPortal>

            {/* Quick Prompts */}
            {messages.length <= 1 && (
                <div className="px-2 md:px-4 py-2 md:py-3 border-b border-[var(--border)]">
                    <div className="grid grid-cols-2 md:flex md:flex-row gap-1.5 md:gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {QUICK_PROMPTS.map((prompt, i) => (
                            <button
                                key={i}
                                onClick={() => { setInput(prompt.text); }}
                                className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 bg-[var(--surface)] border border-[var(--border)] rounded-full text-[10px] md:text-xs text-[var(--on-surface)] whitespace-nowrap hover:border-blue-500/50 transition-all shrink-0"
                            >
                                <span>{prompt.icon}</span> {prompt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-2 md:px-4 py-2 md:py-4 space-y-2 md:space-y-4 pb-20 md:pb-4">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] md:max-w-[85%] rounded-xl md:rounded-2xl px-2.5 md:px-4 py-2 md:py-3 ${msg.role === 'user'
                            ? 'bg-blue-500 text-white rounded-tr-sm'
                            : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--on-surface)] rounded-tl-sm'
                            }`}>
                            <div className="text-[11px] md:text-sm whitespace-pre-wrap leading-relaxed">
                                {msg.content.split('\n').map((line, i) => {
                                    // Bold text
                                    const boldParts = line.split(/\*\*(.*?)\*\*/g);
                                    return (
                                        <span key={i}>
                                            {boldParts.map((part, j) =>
                                                j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                                            )}
                                            {i < msg.content.split('\n').length - 1 && <br />}
                                        </span>
                                    );
                                })}
                            </div>
                            {msg.role === 'assistant' && msg.id !== 'welcome' && (
                                <div className="hidden md:flex items-center justify-end gap-2 mt-2 pt-2 border-t border-[var(--border)]">
                                    <button
                                        onClick={() => copyMessage(msg.content, msg.id)}
                                        className="text-xs text-[var(--text-muted)] hover:text-[var(--on-surface)] transition-colors"
                                    >
                                        {copiedId === msg.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl md:rounded-2xl rounded-tl-sm px-2.5 md:px-4 py-2 md:py-3">
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin text-blue-400" />
                                <span className="text-[11px] md:text-sm text-[var(--text-muted)]">Analyzing...</span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="fixed bottom-0 left-0 right-0 md:static px-2 md:px-4 py-2 md:py-3 border-t border-[var(--border)] bg-[var(--surface)] z-50">
                <div className="flex items-center gap-1.5 md:gap-2">
                    <button
                        onClick={toggleVoice}
                        className={`p-2 md:p-2.5 rounded-xl transition-all ${isListening
                            ? 'bg-red-500 text-white animate-pulse'
                            : 'bg-[var(--background)] text-[var(--text-muted)] hover:text-[var(--on-surface)]'
                            }`}
                    >
                        {isListening ? <MicOff className="w-4 h-4 md:w-5 md:h-5" /> : <Mic className="w-4 h-4 md:w-5 md:h-5" />}
                    </button>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={isListening ? 'Listening...' : 'Pucho kuch bhi... Hindi ya English'}
                        className="flex-1 px-3 md:px-4 py-2 md:py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-xl text-xs md:text-sm text-[var(--on-surface)] placeholder-[var(--text-muted)] focus:border-blue-500/50 focus:outline-none"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className="p-2 md:p-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}


