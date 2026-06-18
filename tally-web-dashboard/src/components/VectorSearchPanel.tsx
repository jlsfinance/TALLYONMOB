import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Brain,
    Loader2,
    Search,
    Sparkles,
    Zap,
    FileText,
    Users,
    Clock,
    RotateCcw,
    Database,
} from 'lucide-react';
import { Card, Badge, Button, Spinner } from '@/components/ui/GlassUI';
import {
    vectorSearchWithDetails,
    hasEmbeddings,
    type VectorSearchResult,
} from '@/services/vectorSearchService';
import {
    generateEmbeddingsForCompany,
    getEmbeddingStats,
    type EmbeddingProgress,
} from '@/services/embeddingService';

interface VectorSearchPanelProps {
    companyId: string;
    companyName: string;
    userId?: string | null;
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(Math.abs(value));
}

export default function VectorSearchPanel({ companyId, companyName, userId }: VectorSearchPanelProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<(VectorSearchResult & { sourceRecord?: any })[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [queryTimeMs, setQueryTimeMs] = useState(0);
    const [embeddingProgress, setEmbeddingProgress] = useState<EmbeddingProgress | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [embeddingsReady, setEmbeddingsReady] = useState<boolean | null>(null);
    const [stats, setStats] = useState<{ vouchers: { total: number; embedded: number }; ledgers: { total: number; embedded: number } } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Check if embeddings exist on mount
    useEffect(() => {
        (async () => {
            const ready = await hasEmbeddings(companyId);
            setEmbeddingsReady(ready);
            if (ready) {
                const s = await getEmbeddingStats(companyId);
                setStats(s);
            }
        })();
    }, [companyId]);

    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;
        setSearching(true);
        setSearchError(null);
        setResults([]);

        const { results: searchResults, error, queryTimeMs: time } = await vectorSearchWithDetails({
            companyId,
            query: query.trim(),
            maxResults: 15,
            threshold: 0.3,
            userId,
        });

        setResults(searchResults);
        setSearchError(error);
        setQueryTimeMs(time);
        setSearching(false);
    }, [query, companyId, userId]);

    const handleGenerateEmbeddings = useCallback(async () => {
        setIsGenerating(true);
        setEmbeddingProgress(null);

        const result = await generateEmbeddingsForCompany(
            companyId,
            ['vouchers', 'ledgers'],
            (progress) => setEmbeddingProgress(progress),
            userId
        );

        if (result.success) {
            setEmbeddingsReady(true);
            const s = await getEmbeddingStats(companyId);
            setStats(s);
        } else {
            setSearchError(result.message);
        }

        setIsGenerating(false);
    }, [companyId, userId]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch();
    };

    const suggestedQueries = [
        'Sales above 50000',
        'Ramesh ka pending',
        'Purchase last week',
        'Cash payment to supplier',
        'GST 18% invoice',
        'Sundry Debtors balance',
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <Card padding="sm" className="rounded-xl border-[var(--primary)]/20 bg-gradient-to-r from-[var(--primary)]/5 to-transparent">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <div className="rounded-xl bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
                                <Brain size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-[var(--on-surface)]">AI Vector Search</h2>
                                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                    Powered by Gemini Embeddings
                                </p>
                            </div>
                        </div>
                        <p className="mt-3 text-xs font-semibold leading-5 text-[var(--on-surface-variant)]">
                            Hindi ya English mein search karo — AI automatically relevant vouchers aur ledgers dhundhega.
                        </p>
                    </div>
                    {stats && (
                        <div className="hidden shrink-0 text-right md:block">
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-500">
                                <Database size={12} />
                                Indexed
                            </div>
                            <p className="mt-1 text-xs font-bold text-[var(--on-surface-variant)]">
                                {stats.vouchers.embedded} vouchers · {stats.ledgers.embedded} ledgers
                            </p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Embedding Status / Generator */}
            {embeddingsReady === false && !isGenerating && (
                <Card padding="sm" className="rounded-xl border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-500">
                                <Zap size={18} />
                            </div>
                            <div>
                                <p className="text-sm font-black text-[var(--on-surface)]">Embeddings Not Generated</p>
                                <p className="mt-1 text-xs font-semibold text-[var(--on-surface-variant)]">
                                    Pehle embeddings generate karo. Ye ek baar karna hai — phir instant search milega.
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={handleGenerateEmbeddings}
                            icon={<Sparkles size={14} />}
                            className="shrink-0"
                        >
                            Generate
                        </Button>
                    </div>
                </Card>
            )}

            {/* Embedding Progress */}
            {isGenerating && embeddingProgress && (
                <Card padding="sm" className="rounded-xl">
                    <div className="flex items-center gap-3">
                        <Loader2 size={18} className="animate-spin text-[var(--primary)]" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-[var(--on-surface)]">
                                {embeddingProgress.phase === 'preparing' && '📦 Preparing data...'}
                                {embeddingProgress.phase === 'embedding' && '🧠 Generating embeddings...'}
                                {embeddingProgress.phase === 'storing' && '💾 Storing in database...'}
                                {embeddingProgress.phase === 'done' && '✅ Done!'}
                                {embeddingProgress.phase === 'error' && '❌ Error'}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-[var(--on-surface-variant)]">
                                {embeddingProgress.message}
                            </p>
                            {embeddingProgress.total > 0 && (
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-variant)]">
                                    <div
                                        className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                                        style={{ width: `${Math.min(100, (embeddingProgress.current / embeddingProgress.total) * 100)}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {/* Search Box */}
            <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search... (e.g. 'Ramesh ka pending kitna hai', 'Sales above 50000')"
                    className="w-full rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] py-4 pl-12 pr-28 text-sm font-bold text-[var(--on-surface)] outline-none transition-all focus:border-[var(--primary)] focus:shadow-lg focus:shadow-[var(--primary-glow)]"
                    disabled={isGenerating}
                />
                <button
                    onClick={handleSearch}
                    disabled={searching || !query.trim() || isGenerating}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-[var(--primary-glow)] transition-all disabled:opacity-50"
                >
                    {searching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Search
                </button>
            </div>

            {/* Suggested Queries */}
            {results.length === 0 && !searching && !searchError && (
                <div className="flex flex-wrap gap-2">
                    {suggestedQueries.map((sq) => (
                        <button
                            key={sq}
                            onClick={() => {
                                setQuery(sq);
                                inputRef.current?.focus();
                            }}
                            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[10px] font-bold text-[var(--on-surface-variant)] transition-all hover:border-[var(--primary)] hover:text-[var(--primary)]"
                        >
                            {sq}
                        </button>
                    ))}
                </div>
            )}

            {/* Search Error */}
            {searchError && (
                <Card padding="sm" className="rounded-xl border-rose-500/20 bg-rose-500/5">
                    <p className="text-sm font-bold text-rose-500">{searchError}</p>
                </Card>
            )}

            {/* Search Results */}
            {results.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">
                            {results.length} results · {queryTimeMs}ms
                        </p>
                        <button
                            onClick={() => { setResults([]); setQuery(''); }}
                            className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--on-surface)]"
                        >
                            <RotateCcw size={12} /> Clear
                        </button>
                    </div>

                    {results.map((result, index) => (
                        <Card key={result.id || index} padding="sm" className="rounded-xl transition-all hover:border-[var(--primary)]/30">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={result.source_table === 'vouchers' ? 'info' : 'warning'}>
                                            {result.source_table === 'vouchers' ? (
                                                <span className="flex items-center gap-1"><FileText size={10} /> Voucher</span>
                                            ) : (
                                                <span className="flex items-center gap-1"><Users size={10} /> Ledger</span>
                                            )}
                                        </Badge>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                            {Math.round(result.similarity * 100)}% match
                                        </span>
                                    </div>

                                    <p className="mt-2 text-sm font-black text-[var(--on-surface)]">
                                        {result.chunk_text}
                                    </p>

                                    {result.sourceRecord && (
                                        <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-bold text-[var(--on-surface-variant)]">
                                            {result.sourceRecord.voucher_type && (
                                                <span>Type: {result.sourceRecord.voucher_type}</span>
                                            )}
                                            {result.sourceRecord.voucher_date && (
                                                <span className="flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {String(result.sourceRecord.voucher_date).slice(0, 10)}
                                                </span>
                                            )}
                                            {result.sourceRecord.party_name && (
                                                <span>Party: {result.sourceRecord.party_name}</span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="shrink-0 text-right">
                                    {result.metadata?.amount && Number(result.metadata.amount) > 0 && (
                                        <p className="text-sm font-black text-[var(--on-surface)]">
                                            {formatCurrency(Number(result.metadata.amount))}
                                        </p>
                                    )}
                                    <div
                                        className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-[var(--surface-variant)]"
                                        title={`${Math.round(result.similarity * 100)}% match`}
                                    >
                                        <div
                                            className="h-full rounded-full bg-emerald-500"
                                            style={{ width: `${result.similarity * 100}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Searching State */}
            {searching && (
                <div className="flex flex-col items-center justify-center py-16">
                    <Spinner size="lg" />
                    <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">
                        Searching vectors...
                    </p>
                </div>
            )}

            {/* Re-embed Button */}
            {embeddingsReady && !isGenerating && (
                <div className="flex justify-center pt-4">
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<RotateCcw size={13} />}
                        onClick={handleGenerateEmbeddings}
                    >
                        Re-generate Embeddings
                    </Button>
                </div>
            )}
        </div>
    );
}
