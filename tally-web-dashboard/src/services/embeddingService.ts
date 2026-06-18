import { supabase } from '@/lib/insforge';
import { getUserGeminiApiKey } from '@/lib/userGeminiKey';

// Gemini text-embedding-004 outputs 768-dimensional vectors
const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSION = 768;
const BATCH_SIZE = 50; // Max texts per embedding API call
const GEMINI_EMBEDDING_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ChunkRecord {
    company_id: string;
    source_table: string;
    source_id: string;
    chunk_index: number;
    chunk_text: string;
    embedding?: number[];
    metadata: Record<string, unknown>;
}

export interface EmbeddingProgress {
    phase: 'preparing' | 'embedding' | 'storing' | 'done' | 'error';
    current: number;
    total: number;
    message: string;
}

type ProgressCallback = (progress: EmbeddingProgress) => void;

/**
 * Generate embedding for a single text using Gemini API
 */
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
    const url = `${GEMINI_EMBEDDING_URL}/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            taskType: 'RETRIEVAL_DOCUMENT',
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error?.message || `Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data?.embedding?.values || [];
}

/**
 * Generate embeddings for multiple texts in batch
 */
async function generateEmbeddingsBatch(texts: string[], apiKey: string): Promise<number[][]> {
    const url = `${GEMINI_EMBEDDING_URL}/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`;
    const requests = texts.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
    }));

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error?.message || `Batch embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return (data?.embeddings || []).map((e: any) => e?.values || []);
}

/**
 * Convert a voucher row to a searchable text chunk
 */
function voucherToChunkText(voucher: any): string {
    const parts = [
        voucher.voucher_type || 'Voucher',
        voucher.voucher_number ? `#${voucher.voucher_number}` : '',
        voucher.party_name || voucher.party_ledger_name || '',
        voucher.amount != null ? `₹${Math.abs(Number(voucher.amount)).toLocaleString('en-IN')}` : '',
        voucher.voucher_date || voucher.vch_date || '',
        voucher.narration || '',
    ].filter(Boolean);
    return parts.join(' | ');
}

/**
 * Convert a ledger row to a searchable text chunk
 */
function ledgerToChunkText(ledger: any): string {
    const balance = Number(ledger.closing_balance || ledger.current_balance || 0);
    const parts = [
        ledger.name || 'Unnamed',
        ledger.parent ? `Group: ${ledger.parent}` : '',
        `Balance: ₹${Math.abs(balance).toLocaleString('en-IN')} ${balance >= 0 ? 'Dr' : 'Cr'}`,
        ledger.phone ? `Phone: ${ledger.phone}` : '',
        ledger.email ? `Email: ${ledger.email}` : '',
        ledger.gstin ? `GSTIN: ${ledger.gstin}` : '',
    ].filter(Boolean);
    return parts.join(' | ');
}

/**
 * Fetch all rows from a table for a given company
 */
async function fetchAllSourceRows(table: string, companyId: string): Promise<any[]> {
    const rows: any[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;

    while (true) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('company_id', companyId)
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return rows;
}

/**
 * Convert source rows into chunk records
 */
function buildChunks(rows: any[], sourceTable: string, companyId: string): ChunkRecord[] {
    const toText = sourceTable === 'vouchers' ? voucherToChunkText : ledgerToChunkText;

    return rows
        .filter((row) => row.id)
        .map((row) => ({
            company_id: companyId,
            source_table: sourceTable,
            source_id: String(row.id),
            chunk_index: 0,
            chunk_text: toText(row),
            metadata: {
                name: row.name || row.party_name || row.party_ledger_name || '',
                amount: Number(row.amount || row.closing_balance || 0),
                date: row.voucher_date || row.vch_date || '',
                type: row.voucher_type || row.parent || '',
            },
        }));
}

/**
 * Store chunks with embeddings in Supabase
 */
async function storeChunks(chunks: ChunkRecord[]): Promise<void> {
    const STORE_CHUNK_SIZE = 100;
    for (let i = 0; i < chunks.length; i += STORE_CHUNK_SIZE) {
        const batch = chunks.slice(i, i + STORE_CHUNK_SIZE).map((chunk) => ({
            company_id: chunk.company_id,
            source_table: chunk.source_table,
            source_id: chunk.source_id,
            chunk_index: chunk.chunk_index,
            chunk_text: chunk.chunk_text,
            embedding: chunk.embedding ? `[${chunk.embedding.join(',')}]` : null,
            metadata: chunk.metadata,
        }));

        const { error } = await supabase.from('data_chunks').upsert(batch, {
            onConflict: 'company_id,source_table,source_id,chunk_index',
        });

        if (error) {
            console.error('Chunk store error:', error);
            throw new Error(`Failed to store chunks: ${error.message}`);
        }
    }
}

/**
 * Main function: Generate embeddings for all data of a company
 */
export async function generateEmbeddingsForCompany(
    companyId: string,
    sourceTables: string[] = ['vouchers', 'ledgers'],
    onProgress?: ProgressCallback,
    userId?: string | null
): Promise<{ success: boolean; message: string; totalChunks: number }> {
    const apiKey = getUserGeminiApiKey(userId) || '';
    if (!apiKey) {
        return { success: false, message: 'Gemini API key not set. Go to Settings.', totalChunks: 0 };
    }

    let totalProcessed = 0;

    try {
        for (const table of sourceTables) {
            onProgress?.({
                phase: 'preparing',
                current: 0,
                total: 0,
                message: `Fetching ${table} data...`,
            });

            // Fetch source data
            const rows = await fetchAllSourceRows(table, companyId);
            if (rows.length === 0) {
                onProgress?.({
                    phase: 'preparing',
                    current: 0,
                    total: 0,
                    message: `No ${table} data found, skipping...`,
                });
                continue;
            }

            // Build text chunks
            const chunks = buildChunks(rows, table, companyId);
            const totalChunks = chunks.length;

            onProgress?.({
                phase: 'embedding',
                current: 0,
                total: totalChunks,
                message: `Generating embeddings for ${totalChunks} ${table}...`,
            });

            // Generate embeddings in batches
            for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                const batch = chunks.slice(i, i + BATCH_SIZE);
                const texts = batch.map((c) => c.chunk_text);

                try {
                    const embeddings = await generateEmbeddingsBatch(texts, apiKey);
                    for (let j = 0; j < batch.length; j++) {
                        if (embeddings[j] && embeddings[j].length === EMBEDDING_DIMENSION) {
                            batch[j].embedding = embeddings[j];
                        }
                    }
                } catch (error: any) {
                    // Fallback to individual embedding if batch fails
                    console.warn('Batch embedding failed, falling back to individual:', error.message);
                    for (const chunk of batch) {
                        try {
                            chunk.embedding = await generateEmbedding(chunk.chunk_text, apiKey);
                        } catch {
                            // Skip this chunk's embedding
                        }
                        // Rate limit: small delay
                        await new Promise((r) => setTimeout(r, 100));
                    }
                }

                onProgress?.({
                    phase: 'embedding',
                    current: Math.min(i + BATCH_SIZE, totalChunks),
                    total: totalChunks,
                    message: `Embeddings: ${Math.min(i + BATCH_SIZE, totalChunks)}/${totalChunks} ${table}`,
                });

                // Small delay to respect rate limits (60 RPM for free tier)
                if (i + BATCH_SIZE < chunks.length) {
                    await new Promise((r) => setTimeout(r, 500));
                }
            }

            // Store chunks to Supabase
            onProgress?.({
                phase: 'storing',
                current: 0,
                total: totalChunks,
                message: `Storing ${totalChunks} ${table} chunks...`,
            });

            await storeChunks(chunks);
            totalProcessed += chunks.length;

            onProgress?.({
                phase: 'storing',
                current: totalChunks,
                total: totalChunks,
                message: `${table} done: ${totalChunks} chunks stored`,
            });
        }

        onProgress?.({
            phase: 'done',
            current: totalProcessed,
            total: totalProcessed,
            message: `All done! ${totalProcessed} chunks with embeddings created.`,
        });

        return {
            success: true,
            message: `Successfully generated embeddings for ${totalProcessed} records`,
            totalChunks: totalProcessed,
        };
    } catch (error: any) {
        const message = error?.message || 'Unknown error during embedding generation';
        onProgress?.({
            phase: 'error',
            current: totalProcessed,
            total: totalProcessed,
            message,
        });
        return { success: false, message, totalChunks: totalProcessed };
    }
}

/**
 * Get embedding statistics for a company
 */
export async function getEmbeddingStats(companyId: string): Promise<{
    vouchers: { total: number; embedded: number };
    ledgers: { total: number; embedded: number };
}> {
    try {
        const { data, error } = await supabase.rpc('get_embedding_stats', {
            target_company_id: companyId,
        });

        if (error || !data) {
            return {
                vouchers: { total: 0, embedded: 0 },
                ledgers: { total: 0, embedded: 0 },
            };
        }

        const result = {
            vouchers: { total: 0, embedded: 0 },
            ledgers: { total: 0, embedded: 0 },
        };

        for (const row of data) {
            const key = row.source_table as 'vouchers' | 'ledgers';
            if (result[key]) {
                result[key].total = Number(row.total_chunks || 0);
                result[key].embedded = Number(row.with_embedding || 0);
            }
        }

        return result;
    } catch {
        return {
            vouchers: { total: 0, embedded: 0 },
            ledgers: { total: 0, embedded: 0 },
        };
    }
}

/**
 * Delete all chunks for a company (for re-embedding)
 */
export async function deleteCompanyChunks(companyId: string, sourceTable?: string): Promise<void> {
    const { error } = await supabase.rpc('delete_company_chunks', {
        target_company_id: companyId,
        target_source_table: sourceTable || null,
    });

    if (error) {
        throw new Error(`Failed to delete chunks: ${error.message}`);
    }
}
