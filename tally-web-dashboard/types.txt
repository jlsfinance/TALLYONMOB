import { UserSchema, CreateUserRequest, CreateUserResponse, CreateSessionRequest, CreateSessionResponse, OAuthProvidersSchema, GetProfileResponse, SendVerificationEmailRequest, VerifyEmailRequest, VerifyEmailResponse, SendResetPasswordEmailRequest, ExchangeResetPasswordTokenRequest, GetPublicAuthConfigResponse, StorageFileSchema, ListObjectsResponseSchema, ChatCompletionRequest, ImageGenerationRequest, EmbeddingsRequest, SubscribeResponse, SocketMessage, SendRawEmailRequest, SendEmailResponse } from '@insforge/shared-schemas';
export { AuthErrorResponse, CreateSessionRequest, CreateUserRequest, RealtimeErrorPayload, SendRawEmailRequest as SendEmailOptions, SendEmailResponse, SocketMessage, SubscribeResponse, UserSchema } from '@insforge/shared-schemas';
import * as _supabase_postgrest_js from '@supabase/postgrest-js';

/**
 * InsForge SDK Types - only SDK-specific types here
 * Use @insforge/shared-schemas directly for API types
 */

interface InsForgeConfig {
    /**
     * The base URL of the InsForge backend API
     * @default "http://localhost:7130"
     */
    baseUrl?: string;
    /**
     * Anonymous API key (optional)
     * Used for public/unauthenticated requests when no user token is set
     */
    anonKey?: string;
    /**
     * Edge Function Token (optional)
     * Use this when running in edge functions/serverless with a user's JWT token
     * This token will be used for all authenticated requests
     */
    edgeFunctionToken?: string;
    /**
     * Direct URL to Deno Subhosting functions (optional)
     * When provided, SDK will try this URL first for function invocations.
     * Falls back to proxy URL if subhosting returns 404.
     * @example "https://{appKey}.functions.insforge.app"
     */
    functionsUrl?: string;
    /**
     * Custom fetch implementation (useful for Node.js environments)
     */
    fetch?: typeof fetch;
    /**
     * Storage adapter for persisting tokens
     */
    storage?: TokenStorage;
    /**
     * Whether to automatically refresh tokens before they expire
     * @default true
     */
    autoRefreshToken?: boolean;
    /**
     * Whether to persist session in storage
     * @default true
     */
    persistSession?: boolean;
    /**
     * Custom headers to include with every request
     */
    headers?: Record<string, string>;
}
interface TokenStorage {
    getItem(key: string): string | null | Promise<string | null>;
    setItem(key: string, value: string): void | Promise<void>;
    removeItem(key: string): void | Promise<void>;
}
interface AuthSession {
    user: UserSchema;
    accessToken: string;
    expiresAt?: Date;
}
interface ApiError {
    error: string;
    message: string;
    statusCode: number;
    nextActions?: string;
}
declare class InsForgeError extends Error {
    statusCode: number;
    error: string;
    nextActions?: string;
    constructor(message: string, statusCode: number, error: string, nextActions?: string);
    static fromApiError(apiError: ApiError): InsForgeError;
}

interface RequestOptions extends RequestInit {
    params?: Record<string, string>;
}
declare class HttpClient {
    readonly baseUrl: string;
    readonly fetch: typeof fetch;
    private defaultHeaders;
    private anonKey;
    private userToken;
    constructor(config: InsForgeConfig);
    private buildUrl;
    request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
    get<T>(path: string, options?: RequestOptions): Promise<T>;
    post<T>(path: string, body?: any, options?: RequestOptions): Promise<T>;
    put<T>(path: string, body?: any, options?: RequestOptions): Promise<T>;
    patch<T>(path: string, body?: any, options?: RequestOptions): Promise<T>;
    delete<T>(path: string, options?: RequestOptions): Promise<T>;
    setAuthToken(token: string | null): void;
    getHeaders(): Record<string, string>;
}

/**
 * Token Manager for InsForge SDK
 *
 * Simple token storage that supports two modes:
 * - Memory mode (new backend): tokens stored in memory only, more secure
 * - Storage mode (legacy backend): tokens persisted in localStorage
 */

declare class TokenManager {
    private accessToken;
    private user;
    private storage;
    private _mode;
    onTokenChange: (() => void) | null;
    constructor(storage?: TokenStorage);
    /**
     * Get current mode
     */
    get mode(): 'memory' | 'storage';
    /**
     * Set mode to memory (new backend with cookies + memory)
     */
    setMemoryMode(): void;
    /**
     * Set mode to storage (legacy backend with localStorage)
     * Also loads existing session from localStorage
     */
    setStorageMode(): void;
    /**
     * Load session from localStorage
     */
    private loadFromStorage;
    /**
     * Save session (memory always, localStorage only in storage mode)
     */
    saveSession(session: AuthSession): void;
    /**
     * Get current session
     */
    getSession(): AuthSession | null;
    /**
     * Get access token
     */
    getAccessToken(): string | null;
    /**
     * Set access token
     */
    setAccessToken(token: string): void;
    /**
     * Get user
     */
    getUser(): UserSchema | null;
    /**
     * Set user
     */
    setUser(user: UserSchema): void;
    /**
     * Clear session (both memory and localStorage)
     */
    clearSession(): void;
    /**
     * Check if there's a session in localStorage (for legacy detection)
     */
    hasStoredSession(): boolean;
}

/**
 * Auth module for InsForge SDK
 * Handles authentication, sessions, profiles, and email verification
 */

declare class Auth {
    private http;
    private tokenManager;
    private authCallbackHandled;
    constructor(http: HttpClient, tokenManager: TokenManager);
    /**
     * Save session from API response
     * Handles token storage, CSRF token, and HTTP client auth header
     */
    private saveSessionFromResponse;
    /**
     * Detect and handle OAuth callback parameters in URL
     * Supports PKCE flow (insforge_code) and legacy flow (access_token in URL)
     */
    private detectAuthCallback;
    signUp(request: CreateUserRequest): Promise<{
        data: CreateUserResponse | null;
        error: InsForgeError | null;
    }>;
    signInWithPassword(request: CreateSessionRequest): Promise<{
        data: CreateSessionResponse | null;
        error: InsForgeError | null;
    }>;
    signOut(): Promise<{
        error: InsForgeError | null;
    }>;
    /**
     * Sign in with OAuth provider using PKCE flow
     */
    signInWithOAuth(options: {
        provider: OAuthProvidersSchema;
        redirectTo?: string;
        skipBrowserRedirect?: boolean;
    }): Promise<{
        data: {
            url?: string;
            provider?: string;
            codeVerifier?: string;
        };
        error: InsForgeError | null;
    }>;
    /**
     * Exchange OAuth authorization code for tokens (PKCE flow)
     * Called automatically on initialization when insforge_code is in URL
     */
    exchangeOAuthCode(code: string, codeVerifier?: string): Promise<{
        data: {
            accessToken: string;
            user: UserSchema;
            redirectTo?: string;
        } | null;
        error: InsForgeError | null;
    }>;
    /**
     * Sign in with an ID token from a native SDK (Google One Tap, etc.)
     * Use this for native mobile apps or Google One Tap on web.
     *
     * @param credentials.provider - The identity provider (currently only 'google' is supported)
     * @param credentials.token - The ID token from the native SDK
     */
    signInWithIdToken(credentials: {
        provider: 'google';
        token: string;
    }): Promise<{
        data: {
            accessToken: string;
            refreshToken?: string;
            user: UserSchema;
        } | null;
        error: InsForgeError | null;
    }>;
    /**
     * Get current session, automatically waits for pending OAuth callback
     * @deprecated Use `getCurrentUser` instead
     */
    getCurrentSession(): Promise<{
        data: {
            session: AuthSession | null;
        };
        error: InsForgeError | null;
    }>;
    /**
   * Get current user, automatically waits for pending OAuth callback
   */
    getCurrentUser(): Promise<{
        data: {
            user: UserSchema | null;
        };
        error: InsForgeError | null;
    }>;
    getProfile(userId: string): Promise<{
        data: GetProfileResponse | null;
        error: InsForgeError | null;
    }>;
    setProfile(profile: Record<string, unknown>): Promise<{
        data: GetProfileResponse | null;
        error: InsForgeError | null;
    }>;
    resendVerificationEmail(request: SendVerificationEmailRequest): Promise<{
        data: {
            success: boolean;
            message: string;
        } | null;
        error: InsForgeError | null;
    }>;
    /** @deprecated Use `resendVerificationEmail` instead */
    sendVerificationEmail(request: SendVerificationEmailRequest): Promise<{
        data: {
            success: boolean;
            message: string;
        } | null;
        error: InsForgeError | null;
    }>;
    verifyEmail(request: VerifyEmailRequest): Promise<{
        data: VerifyEmailResponse | null;
        error: InsForgeError | null;
    }>;
    sendResetPasswordEmail(request: SendResetPasswordEmailRequest): Promise<{
        data: {
            success: boolean;
            message: string;
        } | null;
        error: InsForgeError | null;
    }>;
    exchangeResetPasswordToken(request: ExchangeResetPasswordTokenRequest): Promise<{
        data: {
            token: string;
            expiresAt: string;
        } | null;
        error: InsForgeError | null;
    }>;
    resetPassword(request: {
        newPassword: string;
        otp: string;
    }): Promise<{
        data: {
            message: string;
            redirectTo?: string;
        } | null;
        error: InsForgeError | null;
    }>;
    getPublicAuthConfig(): Promise<{
        data: GetPublicAuthConfigResponse | null;
        error: InsForgeError | null;
    }>;
}

/**
 * Database client using postgrest-js
 * Drop-in replacement with FULL PostgREST capabilities
 */
declare class Database {
    private postgrest;
    constructor(httpClient: HttpClient, tokenManager: TokenManager);
    /**
     * Create a query builder for a table
     *
     * @example
     * // Basic query
     * const { data, error } = await client.database
     *   .from('posts')
     *   .select('*')
     *   .eq('user_id', userId);
     *
     * // With count (Supabase style!)
     * const { data, error, count } = await client.database
     *   .from('posts')
     *   .select('*', { count: 'exact' })
     *   .range(0, 9);
     *
     * // Just get count, no data
     * const { count } = await client.database
     *   .from('posts')
     *   .select('*', { count: 'exact', head: true });
     *
     * // Complex queries with OR
     * const { data } = await client.database
     *   .from('posts')
     *   .select('*, users!inner(*)')
     *   .or('status.eq.active,status.eq.pending');
     *
     * // All features work:
     * - Nested selects
     * - Foreign key expansion
     * - OR/AND/NOT conditions
     * - Count with head
     * - Range pagination
     * - Upserts
     */
    from(table: string): _supabase_postgrest_js.PostgrestQueryBuilder<any, any, any, string, unknown>;
    /**
     * Call a PostgreSQL function (RPC)
     *
     * @example
     * // Call a function with parameters
     * const { data, error } = await client.database
     *   .rpc('get_user_stats', { user_id: 123 });
     *
     * // Call a function with no parameters
     * const { data, error } = await client.database
     *   .rpc('get_all_active_users');
     *
     * // With options (head, count, get)
     * const { data, count } = await client.database
     *   .rpc('search_posts', { query: 'hello' }, { count: 'exact' });
     */
    rpc(fn: string, args?: Record<string, unknown>, options?: {
        head?: boolean;
        get?: boolean;
        count?: 'exact' | 'planned' | 'estimated';
    }): _supabase_postgrest_js.PostgrestFilterBuilder<any, any, any, any, string, null, "RPC">;
}

/**
 * Storage module for InsForge SDK
 * Handles file uploads, downloads, and bucket management
 */

interface StorageResponse<T> {
    data: T | null;
    error: InsForgeError | null;
}
/**
 * Storage bucket operations
 */
declare class StorageBucket {
    private bucketName;
    private http;
    constructor(bucketName: string, http: HttpClient);
    /**
     * Upload a file with a specific key
     * Uses the upload strategy from backend (direct or presigned)
     * @param path - The object key/path
     * @param file - File or Blob to upload
     */
    upload(path: string, file: File | Blob): Promise<StorageResponse<StorageFileSchema>>;
    /**
     * Upload a file with auto-generated key
     * Uses the upload strategy from backend (direct or presigned)
     * @param file - File or Blob to upload
     */
    uploadAuto(file: File | Blob): Promise<StorageResponse<StorageFileSchema>>;
    /**
     * Internal method to handle presigned URL uploads
     */
    private uploadWithPresignedUrl;
    /**
     * Download a file
     * Uses the download strategy from backend (direct or presigned)
     * @param path - The object key/path
     * Returns the file as a Blob
     */
    download(path: string): Promise<{
        data: Blob | null;
        error: InsForgeError | null;
    }>;
    /**
     * Get public URL for a file
     * @param path - The object key/path
     */
    getPublicUrl(path: string): string;
    /**
     * List objects in the bucket
     * @param prefix - Filter by key prefix
     * @param search - Search in file names
     * @param limit - Maximum number of results (default: 100, max: 1000)
     * @param offset - Number of results to skip
     */
    list(options?: {
        prefix?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }): Promise<StorageResponse<ListObjectsResponseSchema>>;
    /**
     * Delete a file
     * @param path - The object key/path
     */
    remove(path: string): Promise<StorageResponse<{
        message: string;
    }>>;
}
/**
 * Storage module for file operations
 */
declare class Storage {
    private http;
    constructor(http: HttpClient);
    /**
     * Get a bucket instance for operations
     * @param bucketName - Name of the bucket
     */
    from(bucketName: string): StorageBucket;
}

/**
 * AI Module for Insforge SDK
 * Response format roughly matches OpenAI SDK for compatibility
 *
 * The backend handles all the complexity of different AI providers
 * and returns a unified format. This SDK transforms responses to match OpenAI-like format.
 */

declare class AI {
    private http;
    readonly chat: Chat;
    readonly images: Images;
    readonly embeddings: Embeddings;
    constructor(http: HttpClient);
}
declare class Chat {
    readonly completions: ChatCompletions;
    constructor(http: HttpClient);
}
declare class ChatCompletions {
    private http;
    constructor(http: HttpClient);
    /**
     * Create a chat completion - OpenAI-like response format
     *
     * @example
     * ```typescript
     * // Non-streaming
     * const completion = await client.ai.chat.completions.create({
     *   model: 'gpt-4',
     *   messages: [{ role: 'user', content: 'Hello!' }]
     * });
     * console.log(completion.choices[0].message.content);
     *
     * // With images (OpenAI-compatible format)
     * const response = await client.ai.chat.completions.create({
     *   model: 'gpt-4-vision',
     *   messages: [{
     *     role: 'user',
     *     content: [
     *       { type: 'text', text: 'What is in this image?' },
     *       { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } }
     *     ]
     *   }]
     * });
     *
     * // With PDF files
     * const pdfResponse = await client.ai.chat.completions.create({
     *   model: 'anthropic/claude-3.5-sonnet',
     *   messages: [{
     *     role: 'user',
     *     content: [
     *       { type: 'text', text: 'Summarize this document' },
     *       { type: 'file', file: { filename: 'doc.pdf', file_data: 'https://example.com/doc.pdf' } }
     *     ]
     *   }],
     *   fileParser: { enabled: true, pdf: { engine: 'mistral-ocr' } }
     * });
     *
     * // With web search
     * const searchResponse = await client.ai.chat.completions.create({
     *   model: 'openai/gpt-4',
     *   messages: [{ role: 'user', content: 'What are the latest news about AI?' }],
     *   webSearch: { enabled: true, maxResults: 5 }
     * });
     * // Access citations from response.choices[0].message.annotations
     *
     * // With thinking/reasoning mode (Anthropic models)
     * const thinkingResponse = await client.ai.chat.completions.create({
     *   model: 'anthropic/claude-3.5-sonnet',
     *   messages: [{ role: 'user', content: 'Solve this complex math problem...' }],
     *   thinking: true
     * });
     *
     * // Streaming - returns async iterable
     * const stream = await client.ai.chat.completions.create({
     *   model: 'gpt-4',
     *   messages: [{ role: 'user', content: 'Tell me a story' }],
     *   stream: true
     * });
     *
     * for await (const chunk of stream) {
     *   if (chunk.choices[0]?.delta?.content) {
     *     process.stdout.write(chunk.choices[0].delta.content);
     *   }
     * }
     * ```
     */
    create(params: ChatCompletionRequest): Promise<any>;
    /**
     * Parse SSE stream into async iterable of OpenAI-like chunks
     */
    private parseSSEStream;
}
declare class Embeddings {
    private http;
    constructor(http: HttpClient);
    /**
     * Create embeddings for text input - OpenAI-like response format
     *
     * @example
     * ```typescript
     * // Single text input
     * const response = await client.ai.embeddings.create({
     *   model: 'openai/text-embedding-3-small',
     *   input: 'Hello world'
     * });
     * console.log(response.data[0].embedding); // number[]
     *
     * // Multiple text inputs
     * const response = await client.ai.embeddings.create({
     *   model: 'openai/text-embedding-3-small',
     *   input: ['Hello world', 'Goodbye world']
     * });
     * response.data.forEach((item, i) => {
     *   console.log(`Embedding ${i}:`, item.embedding.slice(0, 5)); // First 5 dimensions
     * });
     *
     * // With custom dimensions (if supported by model)
     * const response = await client.ai.embeddings.create({
     *   model: 'openai/text-embedding-3-small',
     *   input: 'Hello world',
     *   dimensions: 256
     * });
     *
     * // With base64 encoding format
     * const response = await client.ai.embeddings.create({
     *   model: 'openai/text-embedding-3-small',
     *   input: 'Hello world',
     *   encoding_format: 'base64'
     * });
     * ```
     */
    create(params: EmbeddingsRequest): Promise<any>;
}
declare class Images {
    private http;
    constructor(http: HttpClient);
    /**
     * Generate images - OpenAI-like response format
     *
     * @example
     * ```typescript
     * // Text-to-image
     * const response = await client.ai.images.generate({
     *   model: 'dall-e-3',
     *   prompt: 'A sunset over mountains',
     * });
     * console.log(response.images[0].url);
     *
     * // Image-to-image (with input images)
     * const response = await client.ai.images.generate({
     *   model: 'stable-diffusion-xl',
     *   prompt: 'Transform this into a watercolor painting',
     *   images: [
     *     { url: 'https://example.com/input.jpg' },
     *     // or base64-encoded Data URI:
     *     { url: 'data:image/jpeg;base64,/9j/4AAQ...' }
     *   ]
     * });
     * ```
     */
    generate(params: ImageGenerationRequest): Promise<any>;
}

interface FunctionInvokeOptions {
    /**
     * The body of the request
     */
    body?: any;
    /**
     * Custom headers to send with the request
     */
    headers?: Record<string, string>;
    /**
     * HTTP method (default: POST)
     */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
}
/**
 * Edge Functions client for invoking serverless functions
 *
 * @example
 * ```typescript
 * // Invoke a function with JSON body
 * const { data, error } = await client.functions.invoke('hello-world', {
 *   body: { name: 'World' }
 * });
 *
 * // GET request
 * const { data, error } = await client.functions.invoke('get-data', {
 *   method: 'GET'
 * });
 * ```
 */
declare class Functions {
    private http;
    private functionsUrl;
    constructor(http: HttpClient, functionsUrl?: string);
    /**
     * Derive the subhosting URL from the base URL.
     * Base URL pattern: https://{appKey}.{region}.insforge.app
     * Functions URL:    https://{appKey}.functions.insforge.app
     * Only applies to .insforge.app domains.
     */
    private static deriveSubhostingUrl;
    /**
     * Invokes an Edge Function
     *
     * If functionsUrl is configured, tries direct subhosting first.
     * Falls back to proxy URL if subhosting returns 404.
     *
     * @param slug The function slug to invoke
     * @param options Request options
     */
    invoke<T = any>(slug: string, options?: FunctionInvokeOptions): Promise<{
        data: T | null;
        error: Error | null;
    }>;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected';
type EventCallback<T = unknown> = (payload: T) => void;
/**
 * Realtime module for subscribing to channels and handling real-time events
 *
 * @example
 * ```typescript
 * const { realtime } = client;
 *
 * // Connect to the realtime server
 * await realtime.connect();
 *
 * // Subscribe to a channel
 * const response = await realtime.subscribe('orders:123');
 * if (!response.ok) {
 *   console.error('Failed to subscribe:', response.error);
 * }
 *
 * // Listen for specific events
 * realtime.on('order_updated', (payload) => {
 *   console.log('Order updated:', payload);
 * });
 *
 * // Listen for connection events
 * realtime.on('connect', () => console.log('Connected!'));
 * realtime.on('connect_error', (err) => console.error('Connection failed:', err));
 * realtime.on('disconnect', (reason) => console.log('Disconnected:', reason));
 * realtime.on('error', (error) => console.error('Realtime error:', error));
 *
 * // Publish a message to a channel
 * await realtime.publish('orders:123', 'status_changed', { status: 'shipped' });
 *
 * // Unsubscribe and disconnect when done
 * realtime.unsubscribe('orders:123');
 * realtime.disconnect();
 * ```
 */
declare class Realtime {
    private baseUrl;
    private tokenManager;
    private socket;
    private connectPromise;
    private subscribedChannels;
    private eventListeners;
    private anonKey?;
    constructor(baseUrl: string, tokenManager: TokenManager, anonKey?: string);
    private notifyListeners;
    /**
     * Connect to the realtime server
     * @returns Promise that resolves when connected
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the realtime server
     */
    disconnect(): void;
    /**
     * Handle token changes (e.g., after auth refresh)
     * Updates socket auth so reconnects use the new token
     * If connected, triggers reconnect to apply new token immediately
     */
    private onTokenChange;
    /**
     * Check if connected to the realtime server
     */
    get isConnected(): boolean;
    /**
     * Get the current connection state
     */
    get connectionState(): ConnectionState;
    /**
     * Get the socket ID (if connected)
     */
    get socketId(): string | undefined;
    /**
     * Subscribe to a channel
     *
     * Automatically connects if not already connected.
     *
     * @param channel - Channel name (e.g., 'orders:123', 'broadcast')
     * @returns Promise with the subscription response
     */
    subscribe(channel: string): Promise<SubscribeResponse>;
    /**
     * Unsubscribe from a channel (fire-and-forget)
     *
     * @param channel - Channel name to unsubscribe from
     */
    unsubscribe(channel: string): void;
    /**
     * Publish a message to a channel
     *
     * @param channel - Channel name
     * @param event - Event name
     * @param payload - Message payload
     */
    publish<T = unknown>(channel: string, event: string, payload: T): Promise<void>;
    /**
     * Listen for events
     *
     * Reserved event names:
     * - 'connect' - Fired when connected to the server
     * - 'connect_error' - Fired when connection fails (payload: Error)
     * - 'disconnect' - Fired when disconnected (payload: reason string)
     * - 'error' - Fired when a realtime error occurs (payload: RealtimeErrorPayload)
     *
     * All other events receive a `SocketMessage` payload with metadata.
     *
     * @param event - Event name to listen for
     * @param callback - Callback function when event is received
     */
    on<T = SocketMessage>(event: string, callback: EventCallback<T>): void;
    /**
     * Remove a listener for a specific event
     *
     * @param event - Event name
     * @param callback - The callback function to remove
     */
    off<T = SocketMessage>(event: string, callback: EventCallback<T>): void;
    /**
     * Listen for an event only once, then automatically remove the listener
     *
     * @param event - Event name to listen for
     * @param callback - Callback function when event is received
     */
    once<T = SocketMessage>(event: string, callback: EventCallback<T>): void;
    /**
     * Get all currently subscribed channels
     *
     * @returns Array of channel names
     */
    getSubscribedChannels(): string[];
}

/**
 * Emails client for sending custom emails
 *
 * @example
 * ```typescript
 * // Send a simple email
 * const { data, error } = await client.emails.send({
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   html: '<h1>Welcome to our platform</h1>'
 * });
 *
 * if (error) {
 *   console.error('Failed to send:', error.message);
 *   return;
 * }
 * // Email sent successfully - data is {} (empty object)
 *
 * // Send to multiple recipients with CC
 * const { data, error } = await client.emails.send({
 *   to: ['user1@example.com', 'user2@example.com'],
 *   cc: 'manager@example.com',
 *   subject: 'Team Update',
 *   html: '<p>Here is the latest update...</p>',
 *   replyTo: 'support@example.com'
 * });
 * ```
 */
declare class Emails {
    private http;
    constructor(http: HttpClient);
    /**
     * Send a custom HTML email
     * @param options Email options including recipients, subject, and HTML content
     */
    send(options: SendRawEmailRequest): Promise<{
        data: SendEmailResponse | null;
        error: Error | null;
    }>;
}

/**
 * Main InsForge SDK Client
 *
 * @example
 * ```typescript
 * import { InsForgeClient } from '@insforge/sdk';
 *
 * const client = new InsForgeClient({
 *   baseUrl: 'http://localhost:7130'
 * });
 *
 * // Authentication
 * const { data, error } = await client.auth.signUp({
 *   email: 'user@example.com',
 *   password: 'password123',
 *   name: 'John Doe'
 * });
 *
 * // Database operations
 * const { data, error } = await client.database
 *   .from('posts')
 *   .select('*')
 *   .eq('user_id', session.user.id)
 *   .order('created_at', { ascending: false })
 *   .limit(10);
 *
 * // Insert data
 * const { data: newPost } = await client.database
 *   .from('posts')
 *   .insert({ title: 'Hello', content: 'World' })
 *   .single();
 *
 * // Invoke edge functions
 * const { data, error } = await client.functions.invoke('my-function', {
 *   body: { message: 'Hello from SDK' }
 * });
 * ```
 */
declare class InsForgeClient {
    private http;
    private tokenManager;
    readonly auth: Auth;
    readonly database: Database;
    readonly storage: Storage;
    readonly ai: AI;
    readonly functions: Functions;
    readonly realtime: Realtime;
    readonly emails: Emails;
    constructor(config?: InsForgeConfig);
    /**
     * Get the underlying HTTP client for custom requests
     *
     * @example
     * ```typescript
     * const httpClient = client.getHttpClient();
     * const customData = await httpClient.get('/api/custom-endpoint');
     * ```
     */
    getHttpClient(): HttpClient;
}

/**
 * @insforge/sdk - TypeScript SDK for InsForge Backend-as-a-Service
 *
 * @packageDocumentation
 */

declare function createClient(config: InsForgeConfig): InsForgeClient;

export { AI, type ApiError, Auth, type AuthSession, type InsForgeConfig as ClientOptions, type ConnectionState, Database, Emails, type EventCallback, type FunctionInvokeOptions, Functions, HttpClient, InsForgeClient, type InsForgeConfig, InsForgeError, Realtime, Storage, StorageBucket, type StorageResponse, TokenManager, type TokenStorage, createClient, InsForgeClient as default };
