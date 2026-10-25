import { supabase } from '@/lib/insforge';
import { getUserGeminiApiKey } from '@/lib/userGeminiKey';

const EMBEDDING_MODEL = 'text-embedding-004';
const GEMINI_EMBEDDING_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface VectorSearchResult {
    id: string;
    source_table: string;
    source_id: string;
    chunk_text: string;
    similarity: number;
    metadata: Record<string, unknown>;
}

export interface VectorSearchOptions {
    companyId: string;
    query: string;
    sourceTable?: string; // 'vouchers' | 'ledgers' | undefined (all)
    maxResults?: number;
    threshold?: number;
    userId?: string | null;
}

/**
 * Generate embedding for search query using Gemini API
 */
async function embedQuery(text: string, apiKey: string): Promise<number[]> {
    const url = `${GEMINI_EMBEDDING_URL}/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            taskType: 'RETRIEVAL_QUERY',
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error?.message || `Query embedding failed: ${response.status}`);
    }

    const data = await response.json();
    return data?.embedding?.values || [];
}

/**
 * Perform vector similarity search on company data
 */
export async function vectorSearch(options: VectorSearchOptions): Promise<{
    results: VectorSearchResult[];
    error: string | null;
    queryTimeMs: number;
}> {
    const {
        companyId,
        query,
        sourceTable,
        maxResults = 10,
        threshold = 0.4,
        userId,
    } = options;

    const apiKey = getUserGeminiApiKey(userId) || '';
    if (!apiKey) {
        return { results: [], error: 'Gemini API key not set.', queryTimeMs: 0 };
    }

    if (!query.trim()) {
        return { results: [], error: 'Empty query.', queryTimeMs: 0 };
    }

    const startTime = performance.now();

    try {
        // 1. Embed the user's search query
        const queryEmbedding = await embedQuery(query.trim(), apiKey);
        if (!queryEmbedding.length) {
            return { results: [], error: 'Failed to generate query embedding.', queryTimeMs: 0 };
        }

        // 2. Call the appropriate RPC function
        const rpcName = sourceTable ? 'match_documents_by_type' : 'match_documents';
        const rpcParams: Record<string, unknown> = {
            query_embedding: `[${queryEmbedding.join(',')}]`,
            match_company_id: companyId,
            match_count: maxResults,
            match_threshold: threshold,
        };

        if (sourceTable) {
            rpcParams.match_source_table = sourceTable;
        }

        const { data, error } = await supabase.rpc(rpcName, rpcParams);

        const queryTimeMs = Math.round(performance.now() - startTime);

        if (error) {
            console.error('Vector search RPC error:', error);
            return { results: [], error: error.message, queryTimeMs };
        }

        const results: VectorSearchResult[] = (data || []).map((row: any) => ({
            id: row.id,
            source_table: row.source_table,
            source_id: row.source_id,
            chunk_text: row.chunk_text,
            similarity: Number(row.similarity || 0),
            metadata: row.metadata || {},
        }));

        return { results, error: null, queryTimeMs };
    } catch (error: any) {
        const queryTimeMs = Math.round(performance.now() - startTime);
        return {
            results: [],
            error: error?.message || 'Vector search failed.',
            queryTimeMs,
        };
    }
}

/**
 * Search and return full source records (joins with original tables)
 */
export async function vectorSearchWithDetails(options: VectorSearchOptions): Promise<{
    results: Array<VectorSearchResult & { sourceRecord?: any }>;
    error: string | null;
    queryTimeMs: number;
}> {
    const { results, error, queryTimeMs } = await vectorSearch(options);

    if (error || results.length === 0) {
        return { results: [], error, queryTimeMs };
    }

    // Group results by source_table to batch fetch
    const byTable = new Map<string, VectorSearchResult[]>();
    for (const result of results) {
        const bucket = byTable.get(result.source_table) || [];
        bucket.push(result);
        byTable.set(result.source_table, bucket);
    }

    // Fetch source records
    const sourceRecords = new Map<string, any>();
    for (const [table, tableResults] of byTable) {
        const ids = tableResults.map((r) => r.source_id);
        const { data } = await supabase
            .from(table)
            .select('*')
            .in('id', ids);

        if (data) {
            for (const row of data) {
                sourceRecords.set(`${table}:${row.id}`, row);
            }
        }
    }

    // Merge source records into results
    const enriched = results.map((result) => ({
        ...result,
        sourceRecord: sourceRecords.get(`${result.source_table}:${result.source_id}`) || undefined,
    }));

    return { results: enriched, error: null, queryTimeMs };
}

/**
 * Quick check: does this company have any embeddings?
 */
export async function hasEmbeddings(companyId: string): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('data_chunks')
            .select('id')
            .eq('company_id', companyId)
            .not('embedding', 'is', null)
            .limit(1);

        return !error && (data?.length || 0) > 0;
    } catch {
        return false;
    }
}
