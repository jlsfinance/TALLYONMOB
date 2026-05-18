# Comprehensive Code Review: BillBookApp-android

**Review Date:** May 15, 2026  
**Project:** BillBookApp-android (TallyOnMob)  
**App Version:** 2.4.2  

---

## Table of Contents

1. [Architecture & Design Issues](#1-architecture--design-issues)
2. [Security Issues](#2-security-issues)
3. [Critical Bugs & Logic Errors](#3-critical-bugs--logic-errors)
4. [TypeScript & Type Safety Issues](#4-typescript--type-safety-issues)
5. [Error Handling Issues](#5-error-handling-issues)
6. [Performance Issues](#6-performance-issues)
7. [Code Quality & Maintainability](#7-code-quality--maintainability)
8. [Configuration Issues](#8-configuration-issues)
9. [SQL/Database Issues](#9-sqldatabase-issues)
10. [Improvement Suggestions](#10-improvement-suggestions)

---

## 1. Architecture & Design Issues

### 1.1 Dual Firebase + Supabase + Drizzle + LocalStorage — Data Layer Proliferation

**Files:** `storageService.ts`, `db.ts`, `firebaseService.ts`, `firebase.ts`, `AuthContext.tsx`, `CompanyContext.tsx`

The project uses **four** independent persistence mechanisms simultaneously:
- **Supabase** (Auth + companies table via `AuthContext` / `CompanyContext`)
- **Firebase Firestore** (two separate apps: `accounting-app` and `records-app` in `client/src/lib/firebase.ts`)
- **Drizzle ORM + Neon PostgreSQL** (`server/db.ts`, `server/storage.ts`)
- **localStorage** (guest mode fallback in `StorageService`)

**Impact:** Data consistency is impossible to guarantee. Customer data could exist in Supabase, Firestore, localStorage, or PostgreSQL with no cross-synchronization protocol. For example, `StorageService` reads/writes Firestore AND localStorage independently; the `CompanyContext` reads Supabase and writes `active_company_id` to localStorage. This creates a high risk of data drift (customer saved to localStorage but not Firestore, or vice versa).

**Severity:** HIGH. Real data loss risk on app restart after partial writes.

### 1.2 No Server-Side API for CRUD — All Business Logic in Client

**Files:** `server/routes.ts`, `server/storage.ts`

The Express server only exposes 3 push notification endpoints (`/api/push/send`, `/api/push/broadcast`, `/api/push/direct`). There are **zero endpoints** for creating invoices, managing customers, products, or payments. All CRUD operations happen client-side directly against Firebase Firestore.

**Impact:** No server-side validation, no audit trail, no rate limiting, no ability to verify data integrity. Every client has full Firestore access, meaning any security rule bypass affects all data.

**Severity:** HIGH. Architectural gap that undermines security, auditability, and scaling.

### 1.3 Two Separate Firebase Applications with Same Auth

**File:** `client/src/lib/firebase.ts`

Two separate Firebase apps (`accounting-app` and `records-app`) are initialized with different project IDs but only `auth` and `db` from the first app are exported. The second app (`recordsApp`) is initialized but most of its exports (`recordsAuth`, `recordsDb`) are never used outside of `firebase.ts`.

**Impact:** Unnecessary initialization overhead and complexity. The two Firebase configs have trivially similar credentials — it's unclear if this is a mistake or intentional.

### 1.4 `server/storage.ts` Has No Consumer

**File:** `server/storage.ts`

The `DatabaseStorage` class and `storage` singleton are fully implemented with Drizzle ORM but are **never imported or used** anywhere in the server routes. The only server file (`routes.ts`) imports from `./storage` but only uses the push notification functions from `./firebase-admin`.

**Impact:** Dead code. The entire database layer (~300 lines) is unreachable.

---

## 2. Security Issues

### 2.1 Firebase API Keys Hardcoded in Source Code — HIGH CRITICAL

**Files:**  
- `client/src/services/storageService.ts` (line 29): `AIzaSy...4MHg`  
- `client/src/lib/firebase.ts` (lines 18, 27): `AIzaSy...4MHg`, `AIzaSy...uOnw`

Firebase `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId` are hardcoded as string literals in TWO separate files with real project identifiers. These get shipped to every client.

**Impact:** While Firebase API keys are technically "public" by design, hardcoding them in the client bundle with no usage restriction is a security anti-pattern. Combined with weak Firestore security rules (not reviewed but commented on as "assuming rules allow read for auth users"), this exposes the data to scraping, abuse, and financial drain from Firebase usage.

**Severity:** CRITICAL. These should be environment variables fetched at build time or served from the backend.

### 2.2 Google OAuth Client Secret in Capacitor Config

**File:** `capacitor.config.ts` (line 10)

```
serverClientId: "231225025529-fsoqcbbggrk0hu3kfpvsmdj54j4gt2e5.apps.googleusercontent.com"
```

A real Google OAuth Client ID is hardcoded in the Capacitor config. While Client IDs are somewhat public, this is a real credential that should be managed via environment variables, especially if the app uses `forceCodeForRefreshToken: true`.

### 2.3 Gemini API Key Stored in Plaintext localStorage

**File:** `client/src/services/aiService.ts` (lines 15-17)

```typescript
getApiKey: (): string | null => {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE);
}
```

The Gemini API key is stored in `localStorage` in plaintext. On Android (Capacitor WebView), `localStorage` is accessible to any JavaScript running in the WebView, including injected code or compromised dependencies.

**Severity:** MEDIUM. Not an immediate exploit vector, but API keys should be stored using the Capacitor secure storage plugin or at minimum encrypted.

### 2.4 Self-XSS via localStorage Parsing

**File:** `client/src/services/storageService.ts`

Multiple calls to `JSON.parse(localStorage.getItem(...))` without schema validation (lines 126-132, 157-176, etc.). If localStorage keys are corrupted or maliciously set (e.g., via browser dev tools, another app on the same device), `JSON.parse` can crash or inject arbitrary objects into the app's state.

**Severity:** MEDIUM. Mitigated somewhat by being Capacitor (not web), but still a risk.

### 2.5 Token Retrieval Without Authentication in `/api/push/direct`

**File:** `server/routes.ts` (lines 59-73)

```typescript
app.post('/api/push/direct', async (req: Request, res: Response) => {
    const { token, title, message, data } = req.body;
    const result = await sendNotification(token, title, message, data);
```

No authentication middleware on any push notification endpoint. Anyone who discovers these endpoints can send arbitrary push notifications to arbitrary FCM tokens.

**Severity:** HIGH. These are unprotected public endpoints.

### 2.6 No Input Validation on Server Push Endpoints

**File:** `server/routes.ts` (lines 15-73)

While `customerId`, `title`, and `message` are checked for existence, there is:
- No sanitization of title/message (could contain injection payloads)
- No length limits
- No rate limiting
- No authorization check (`companyId` is freely supplied by the caller)

### 2.7 Firebase Admin Service Account Key from Environment Variables

**File:** `server/firebase-admin.ts` (lines 9-20)

The Firebase Admin SDK is constructed from individual environment variables (`FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, etc.) rather than a proper JSON service account key file or secret manager. The `private_key` has a `.replace(/\\\\n/g, '\\n')` hack to handle newline encoding issues, which is fragile and could fail silently.

---

## 3. Critical Bugs & Logic Errors

### 3.1 Race Condition in `storageService.init()`

**File:** `client/src/services/storageService.ts` (lines 72-189)

The `init()` method checks `cache.isLoaded` and returns early if true, but there is a **gap**: between the check and setting `cache.isLoaded`, multiple concurrent calls can pass the guard. The Firebase fetch is not atomic, and the auto-migration logic (lines 114-147) can read from localStorage while another invocation is writing to it.

**Severity:** HIGH. Can cause duplicate data migration or inconsistent cache state on fast app start.

### 3.2 Customer Balance Mutation Without Transaction — Lost Updates

**Files:** `storageService.ts` (lines 256-383, 456-497, 499-514, 516-554)

All customer balance mutations (`balance += invoice.total`, `balance -= payment.amount`, `balance += oldPayment.amount`) are executed by:
1. Reading the current balance from cache
2. Mutating it in memory
3. Writing back to cache + Firestore

With no locking or atomic transactions, concurrent operations (e.g., saving two invoices simultaneously) will cause a **lost update** — the second save will overwrite the first's balance change.

**Example (saveInvoice line 326):**
```typescript
customer.balance += invoice.total;
// If another saveInvoice runs simultaneously, balance reads stale value
```

### 3.3 Firestore Batch Limit Ignored in `batchSave`

**File:** `client/src/services/firebaseService.ts` (lines 62-76)

The comment explicitly says "Firestore batch limit is 500" and "In production, chunk array", but the code does NOT chunk. A migration with >500 items will silently fail.

```typescript
const batch = writeBatch(db);
items.forEach(item => {
    const ref = doc(db, collectionName, item.id);
    batch.set(ref, item);
});
await batch.commit(); // Will fail if items.length > 500
```

### 3.4 Missing `deleteInvoice` Cascade for invoice_items

**File:** `server/storage.ts` (lines 268-270)

```typescript
async deleteInvoice(userId: string, id: string): Promise<void> {
    await db.delete(invoices).where(and(eq(invoices.userId, userId), eq(invoices.id, id)));
}
```

This deletes the invoice but does NOT delete the associated `invoiceItems`. The schema schema.ts defines `onDelete: "cascade"` on `invoiceItems.invoiceId`, but this is a Drizzle-level declaration — if the database schema was not pushed with `drizzle-kit push`, the actual DB may not have `ON DELETE CASCADE`, leading to foreign key violations or orphaned records.

**Severity:** MEDIUM-HIGH. If the cascade constraint doesn't exist in prod, this query fails.

### 3.5 `updateProductStock` and `updateCustomerBalance` — Silent No-Op on Missing Entity

**File:** `server/storage.ts` (lines 83-92, 128-137)

```typescript
async updateCustomerBalance(userId: string, customerId: string, delta: number): Promise<void> {
    const customer = await this.getCustomer(userId, customerId);
    if (customer) {
        // ... update
    }
    // No error thrown if customer not found!
}
```

If the entity doesn't exist, the function silently does nothing instead of throwing an error. Callers have no way to know the update was a no-op.

### 3.6 Gemini AI Model Name is Incorrect

**File:** `client/src/services/aiService.ts` (line 8)

```typescript
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
```

**`gemini-3-flash-preview` is not a valid Google model name.** As of May 2026, the valid models are `gemini-2.0-flash`, `gemini-2.5-pro`, etc. There is no "gemini-3-flash-preview" model. This endpoint will return a 404 error.

**Severity:** HIGH. The entire AI extraction and chat features will fail with this URL.

### 3.7 `localStorage` Keys Use Stale Prefix on Init

**File:** `client/src/services/storageService.ts` (lines 6-8)

```typescript
const getActiveCompanyId = () => localStorage.getItem('active_company_id') || '';
const activeIdentifier = getActiveCompanyId();
const keyPrefix = activeIdentifier ? `${activeIdentifier}_` : '';
```

`activeIdentifier` is computed once at module load time, before `init()` runs. If `init()` later changes the active company ID (e.g., from `loadSettings`), the KEYS object is still using the old prefix. This means data might not be loaded from the correct localStorage keys.

### 3.8 `fetchCollection` Suppresses All Errors Silently

**File:** `client/src/services/firebaseService.ts` (lines 33-41)

```typescript
fetchCollection: async <T>(collectionName: string): Promise<T[]> => {
    try {
        const querySnapshot = await getDocs(collection(db, collectionName));
        return querySnapshot.docs.map(doc => doc.data() as T);
    } catch (error) {
        console.error(`Error fetching ${collectionName}:`, error);
        return [];  // Returns empty array on ANY error including permission denied!
    }
}
```

A Firestore permission error returns `[]` indistinguishable from "no data". The auto-migration logic (storageService.ts line 114) checks `fbProducts.length === 0` — if this is actually a permission error, the migration wrongly triggers and writes localStorage data to Firestore that the user may not be authorized to access.

### 3.9 `notificationService.ts` Uses `LocalNotifications` but May Double-Schedule

**File:** `client/src/services/notificationService.ts` (lines 86-151)

The `scheduleDailyNotification` method cancels notification ID 1 and re-schedules it. But `checkAndSendDailyNotification` (line 284) also calls `scheduleDailyNotification` every time the app opens if the date has changed. On a slow or flaky network, notifications can stack up via ID collision.

---

## 4. TypeScript & Type Safety Issues

### 4.1 Widespread Use of `any` Types

**Files:** Multiple

The codebase makes heavy use of `any` types across critical functions:

- `storage.ts` (server): All invoice methods return `Promise<any>` (lines 37-41)
- `storageService.ts` (client): `cache` initializes with `[] as any[]` patterns
- `firebaseService.ts`: `fetchCollection` returns `Promise<T[]>` but `saveDocument` takes `data: any`
- `CreateInvoice.tsx`: Item update handler uses `value: any` (line 450)
- `notificationService.ts`: `reminder` parameter typed as `any` (line 303)

**Impact:** Destroys compile-time type safety. A misspelled field name, wrong type, or missing property will be caught only at runtime, if at all.

### 4.2 `any` in Server Storage Interface

**File:** `server/storage.ts` (lines 37-41)

```typescript
getInvoices(userId: string): Promise<any[]>;
getInvoice(userId: string, id: string): Promise<any | undefined>;
createInvoice(invoice: InsertInvoice): Promise<any>;
```

The interface promises `any` instead of a properly typed return type. This defeats the purpose of using TypeScript with Drizzle.

### 4.3 `tsconfig.json` has `noUnusedLocals` and `noUnusedParameters: true` but Code Violates It

**File:** `client/tsconfig.json` (lines 21-22)

```json
"noUnusedLocals": true,
"noUnusedParameters": true,
```

But the code has:
- `_fileName` parameter prefixed with underscore in `aiService.ts` (line 43) — technically works but indicates unused parameters
- Unused imports: `Calendar`, `X`, `Clock`, `Phone` in Dashboard.tsx may cause compilation warnings/errors

### 4.4 `@shared/schema` Path Resolution

**File:** `tsconfig.json`

```json
"@shared/*": ["./shared/*"]
```

The root `tsconfig.json` defines `@shared/*` → `./shared/*`, and `client/tsconfig.json` only defines `@/*` → `./src/*`. The server's `storage.ts` imports from `@shared/schema`. This only works because Vite's bundler resolves it; `tsc` and IDE tooling may fail depending on which config file is active.

### 4.5 Missing Null/Undefined Checks on Optional Fields

**File:** `client/src/types.ts`

`Customer` has optional fields (`state?`, `gstin?`) but code accesses them without null checks (e.g., `storageService.ts` line 570: `customer.state` in CreateInvoice for tax type determination). If state is undefined, both conditions in `supplier.state === customer.state` evaluate to `undefined === undefined`, always returning `INTRA_STATE`.

---

## 5. Error Handling Issues

### 5.1 Firebase Operations Fire-and-Forget

**Files:** `storageService.ts` (lines 264, 274, 285, 305, 317, 328, 343-371, etc.)

```typescript
if (FirebaseService.isReady()) FirebaseService.saveDocument(...)
```

All Firebase operations are called without `await` or error handling when not in the top-level flow. If Firestore is unavailable or the write fails, the error is silently swallowed inside `FirebaseService.saveDocument` (which catches and logs errors). The calling code assumes the write succeeded.

**Severity:** MEDIUM-HIGH. Users see no error when data fails to persist to cloud.

### 5.2 Silent Failure of Push Notification Status Codes

**File:** `server/firebase-admin.ts` (lines 56-62)

```typescript
const response = await messaging.send(message);
return { success: true, messageId: response };
```

The FCM response may indicate failure (e.g., invalid token, unregistered device) but the code treats any response as success. The `sendEachForMulticast` result's `failureCount` is logged but never checked for retry or cleanup logic.

### 5.3 Broadcast Subscription Memory Leak

**File:** `client/src/services/notificationService.ts` (line 392)

`subscribeToGlobalBroadcasts()` returns an `unsubscribe` function, but it is never called/used in the caller. The Firestore `onSnapshot` listener stays active for the lifetime of the app, causing a memory leak and unnecessary Firestore reads.

### 5.4 `importData` — Unbounded JSON Parsing

**File:** `client/src/services/storageService.ts` (lines 992-1045)

The import function parses arbitrary JSON strings without size validation. An import of a multi-megabyte file will block the main thread and could crash the app.

---

## 6. Performance Issues

### 6.1 N+1 Query Pattern in Server Storage

**File:** `server/storage.ts` (lines 140-169)

```typescript
async getInvoices(userId: string): Promise<any[]> {
    const allInvoices = await db.select().from(invoices)...;
    const result = await Promise.all(
        allInvoices.map(async (invoice) => {
            const items = await db.select().from(invoiceItems)...;
            // ...
        })
    );
    return result;
}
```

This queries invoice items with **one SELECT per invoice**. With 100 invoices, this generates 101 database queries. Should use Drizzle relations or a single JOIN query instead.

**Same issue in** `getInvoice` (lines 171-195).

### 6.2 No Pagination on Any Collection Fetch

**Files:** `server/storage.ts`, `client/src/services/storageService.ts`

Server-side `getInvoices()`, `getCustomers()`, `getProducts()`, and `getPayments()` all return **all records** without pagination or limit. As the dataset grows, this will cause:
- Excessive memory consumption
- Slow page loads
- Firestore document read quota exhaustion

### 6.3 2-Second Polling Interval in AIContext

**File:** `client/src/contexts/AIContext.tsx` (lines 35-41)

```typescript
const interval = setInterval(() => {
    const current = AIService.isConfigured();
    if (current !== isConfigured) {
        setIsConfigured(current);
    }
}, 2000);
```

A `setInterval` that reads `localStorage` every 2 seconds for AI config state. This runs continuously for the entire app session, causing unnecessary CPU wake-ups even when the modal is not open.

### 6.4 Full Data Serialization on Every Change

**File:** `client/src/services/storageService.ts` (line 197-218)

`persistToLocalStorage()` creates JSON arrays of **all** products, customers, invoices, payments, expenses, and company data every time a single entity changes. On a large dataset (e.g., 10,000 invoices), this freeze-es the main thread for seconds.

---

## 7. Code Quality & Maintainability

### 7.1 Dead/Unused Code

- **`server/storage.ts`** — Entire 299 lines, never imported
- **`server/db.ts`** — Drizzle DB pool, only used by unused `storage.ts`
- **`server/index-dev.ts`** — Possibly unused (not verified)
- **Imports in Dashboard.tsx**: Many icon imports unused: `Calendar`, `X`, `Users`, `Clock`, `Phone`, `Edit2`, `Trash2`, `ArrowUpRight`, `Package`, `Wallet`, `ArrowDown`, `ChevronRight`, `Building2`, `Check`, `FileText`, `BookOpen`, `ClipboardList`, `ArrowDownLeft`, `Undo2`, `Truck`, `Calculator`, `ShoppingCart`

### 7.2 Poor Separation of Concerns in `storageService.ts`

**File:** `client/src/services/storageService.ts` (1152 lines)

This single file handles:
- Cache initialization
- Firebase integration
- localStorage persistence
- Full CRUD for 6 entity types (products, customers, invoices, payments, expenses, purchases)
- Invoice numbering logic
- Data export/import
- Multi-company management
- FCM token management
- Customer behavior scoring (lines 833-846)
- Next-item prediction (lines 848-872)

This violates the Single Responsibility Principle and makes the file extremely difficult to test, maintain, or reason about.

### 7.3 Inconsistent Code Style

- Mixed `async/await` and `.then().catch()` patterns
- Mixed string quotes (`'` and `"`)
- Mixed semicolons and no-semicolons
- Some files use 2-space indentation, others 4-space
- Some files use `export default`, others `export const`

### 7.4 Magic Numbers and Hardcoded Strings

- `CHUNK_SIZE = 12000` (aiService.ts line 173) — why 12000?
- Key prefix construction with hardcoded underscore (`${activeIdentifier}_`)
- Timeout values: `300` (throttle), `2000` (poll interval), `1000` (delay between bulk reminders)

### 7.5 Comments in Mixed Languages

Code comments are written in a mix of English and Hindi/Indian English ("sare bill kaha gaye", "vasool karo", "baaki", "udhar"). While understandable for the target audience, this is unprofessional for production code and confusing for international developers.

---

## 8. Configuration Issues

### 8.1 `drizzle.config.ts` Lacks Migrations Directory

**File:** `drizzle.config.ts` (line 8)

```typescript
out: "./migrations",
```

The migrations output directory exists in config but there's no evidence of generated migrations or a migration script in `package.json` scripts. The only related script is `db:push` which uses `drizzle-kit push` (direct schema push, not migrations).

### 8.2 Conflicting Path Resolution Between Client and Root `tsconfig.json`

Root `tsconfig.json` includes both `client/src/**/*` and `server/**/*` with `@/*` → `./client/src/*`. The client's own `tsconfig.json` also defines `@/*` → `./src/*`. This dual definition can confuse editors and build tools.

### 8.3 Vite Config Missing Client Proxy for Server API

**File:** `client/vite.config.ts`

The dev Vite config has no proxy configuration for `/api/*` requests. During development on port 5000, the client would need to reach the server on a different port (the server uses `registerRoutes` which returns an `http.Server`, but the port binding happens in `app.ts` which isn't invoked via normal electron). This means push notification endpoints are unreachable during dev.

### 8.4 `capacitor.config.ts` Hardcodes Server URL

No `server.url` configuration is set, so Capacitor defaults to loading from `localhost` on dev builds. For production Android builds connecting to a remote server, this needs to be configured.

---

## 9. SQL/Database Issues

### 9.1 Unsafe Updates Without Limits

**File:** `server/storage.ts` (lines 70-77)

```typescript
async updateCustomer(userId: string, id: string, customer: Partial<InsertCustomer>): Promise<Customer> {
    const [updated] = await db
        .update(customers)
        .set(customer)
        .where(and(eq(customers.userId, userId), eq(customers.id, id)))
        .returning();
    return updated;
}
```

If the `where` clause doesn't match any rows, `updated` will be `undefined` but the method signature says it returns `Customer` (not `Customer | undefined`). Drizzle's `.returning()` returns an array that could be empty.

### 9.2 Missing Foreign Key Indexes

The schema (`schema.ts`) defines several foreign key relationships (`invoices.customerId → customers.id`, `invoiceItems.invoiceId → invoices.id`, `payments.customerId → customers.id`) but no explicit indexes. PostgreSQL won't automatically index foreign key columns, so JOINs and cascading deletes may perform poorly at scale.

### 9.3 Decimal Fields Used in the Schema but Treated as Numbers

**File:** `shared/schema.ts`

`balance`, `price`, `subtotal`, `tax`, `total`, `rate`, `amount` are all defined as `decimal` in the Drizzle schema. However, `server/storage.ts` and client code consistently parse them with `parseFloat()` (e.g., line 86: `parseFloat(customer.balance)`). This loses the precision that `decimal` type exists to provide, especially for GST calculations where rounding errors matter.

---

## 10. Improvement Suggestions

### 10.1 Critical (Fix Immediately)

| # | Issue | File(s) | Suggested Fix |
|---|-------|---------|---------------|
| 1 | Fix Gemini API model name | `aiService.ts:8` | Change to `gemini-2.5-flash` or the correct model name |
| 2 | Add auth middleware to push endpoints | `server/routes.ts` | Add Firebase Auth token verification or API key check |
| 3 | Guard batch save for 500-item limit | `firebaseService.ts:62-76` | Chunk the items array into batches of 500 |
| 4 | Remove Firebase API keys from source | `storageService.ts`, `firebase.ts` | Use environment variables or server-provisioned config |
| 5 | Add pagination to all collection fetches | `storageService.ts`, `server/storage.ts` | Add `limit` and `offset` parameters |

### 10.2 High Priority

| # | Issue | Suggested Fix |
|---|-------|---------------|
| 6 | N+1 invoice query | Use Drizzle relations or JOIN to fetch items in one query |
| 7 | Balance mutation race conditions | Use Firestore `runTransaction()` for all balance updates |
| 8 | Remove dead server code | Delete `server/storage.ts`/`db.ts` or build out proper API routes |
| 9 | Add server-side API for all CRUD | Build REST endpoints proxying to the database |
| 10 | Fix `fetchCollection` silent failure | Distinguish "empty" from "error" returns |
| 11 | Move API key from localStorage | Use Capacitor secure storage plugin |

### 10.3 Medium Priority

| # | Issue | Suggested Fix |
|---|-------|---------------|
| 12 | Remove 2-second polling in AIContext | Use event-based approach instead |
| 13 | Add type safety — remove `any` | Define proper TypeScript types for all return values |
| 14 | Add request validation on server | Use Zod schemas on all server endpoints |
| 15 | Debounce `persistToLocalStorage` | Only serialize changed entities, not entire state |
| 16 | Fix stale `keyPrefix` at module init | Make KEYS a getter function instead of a constant |
| 17 | Add size validation to `importData` | Reject files > 10MB |
| 18 | Clean up unused imports and dead code | Run unused-imports linter |
| 19 | Fix notification listener memory leak | Store unsubscribe callback and call it on component unmount |

### 10.4 Recommended Architectural Changes

1. **Consolidate data layer**: Choose ONE primary data store (Firestore or Supabase) and remove the others. Currently using Firebase + Supabase + Drizzle/PostgreSQL + localStorage creates confusion and bugs.

2. **Move business logic to server**: CRUD operations for invoices, payments, customers should go through the Express server, not directly from the client to Firestore. This enables validation, audit trails, and secure multi-tenancy.

3. **Use server-side Firebase Admin SDK**: Instead of client-side Firestore calls, have the server act as a proxy with proper authentication. The client would call `/api/invoices` which the server validates and writes to Firestore using Admin SDK privileges.

4. **Add proper testing**: There are no test files in the project. Add unit tests for `storageService`, integration tests for API routes, and E2E tests for critical flows (invoice creation, payment recording).

5. **Implement proper error boundaries**: React error boundaries for the component tree, global unhandled promise rejection handler, and structured error logging to a backend service.

---

*Report generated by automated code review. All findings should be verified manually before acting on them.*
