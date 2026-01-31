# 🏗️ LIVEKEEPING TALLY SYNC SYSTEM - ARCHITECTURE BLUEPRINT

## 📐 System Overview

A production-grade accounting sync system that seamlessly connects **Tally ERP** to a cloud database, enabling real-time accounting reports on Android mobile devices.

---

## 🎯 Architecture Diagram (Text Format)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              LIVEKEEPING TALLY SYNC SYSTEM                          │
└─────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────────┐
                                    │  ANDROID APP    │
                                    │   (Flutter)     │
                                    │                 │
                                    │ • Real-time     │
                                    │   Reports       │
                                    │ • Offline Cache │
                                    │ • Multi-company │
                                    └────────┬────────┘
                                             │
                                             │ HTTPS (JWT Auth)
                                             │
                        ┌────────────────────▼────────────────────┐
                        │          CLOUD BACKEND                   │
                        │     (Node.js + Express + Supabase)       │
                        │                                          │
                        │  ┌───────────────────────────────────┐  │
                        │  │    REST API Layer                  │  │
                        │  │  • /api/v1/sync (Windows Sync)     │  │
                        │  │  • /api/v1/data (Mobile Reads)     │  │
                        │  │  • /api/v1/auth                    │  │
                        │  └───────────────────────────────────┘  │
                        │                                          │
                        │  ┌───────────────────────────────────┐  │
                        │  │    Middleware Layer                │  │
                        │  │  • JWT Validation                  │  │
                        │  │  • API Key Authentication          │  │
                        │  │  • Rate Limiting                   │  │
                        │  │  • Request Validation              │  │
                        │  └───────────────────────────────────┘  │
                        │                                          │
                        │  ┌───────────────────────────────────┐  │
                        │  │    Service Layer                   │  │
                        │  │  • SyncService (Upsert Logic)      │  │
                        │  │  • DataService (Read Operations)   │  │
                        │  │  • AuthService (User Management)   │  │
                        │  │  • CompanyService (Isolation)      │  │
                        │  └───────────────────────────────────┘  │
                        └────────────────────┬────────────────────┘
                                             │
                                             │ PostgreSQL Connection
                                             │
                        ┌────────────────────▼────────────────────┐
                        │             SUPABASE                     │
                        │     (PostgreSQL + Auth + RLS)            │
                        │                                          │
                        │  Tables:                                 │
                        │  ├── companies                           │
                        │  ├── users                               │
                        │  ├── company_users (junction)            │
                        │  ├── ledgers                             │
                        │  ├── vouchers                            │
                        │  ├── sales                               │
                        │  ├── purchases                           │
                        │  ├── stock                               │
                        │  └── sync_logs                           │
                        └────────────────────┬────────────────────┘
                                             │
                                             │ HTTPS (API Key Auth)
                                             │
                        ┌────────────────────▼────────────────────┐
                        │        WINDOWS SYNC APPLICATION          │
                        │           (C# .NET 8 WPF)                │
                        │                                          │
                        │  ┌───────────────────────────────────┐  │
                        │  │    TallyConnector                  │  │
                        │  │  • XML API Client                  │  │
                        │  │  • Request Builder                 │  │
                        │  │  • Response Parser                 │  │
                        │  └───────────────────────────────────┘  │
                        │                                          │
                        │  ┌───────────────────────────────────┐  │
                        │  │    SyncManager                     │  │
                        │  │  • Incremental Sync                │  │
                        │  │  • Timestamp Tracking              │  │
                        │  │  • Retry Logic                     │  │
                        │  └───────────────────────────────────┘  │
                        │                                          │
                        │  ┌───────────────────────────────────┐  │
                        │  │    OfflineQueue (SQLite)           │  │
                        │  │  • Failed Upload Storage           │  │
                        │  │  • Automatic Retry                 │  │
                        │  └───────────────────────────────────┘  │
                        │                                          │
                        │  ┌───────────────────────────────────┐  │
                        │  │    Background Service              │  │
                        │  │  • 5-minute Sync Timer             │  │
                        │  │  • Windows Service Mode            │  │
                        │  └───────────────────────────────────┘  │
                        └────────────────────┬────────────────────┘
                                             │
                                             │ XML over HTTP (localhost:9000)
                                             │
                        ┌────────────────────▼────────────────────┐
                        │              TALLY ERP                   │
                        │        (localhost:9000 ODBC)             │
                        │                                          │
                        │  Data Available:                         │
                        │  • Ledgers (Parties, Banks, etc.)       │
                        │  • Vouchers (All Types)                 │
                        │  • Sales Invoices                       │
                        │  • Purchase Invoices                    │
                        │  • Stock Items & Summary                │
                        │  • Day Book                             │
                        │  • Outstanding Reports                  │
                        └─────────────────────────────────────────┘
```

---

## 📊 Data Flow Explanation

### 1️⃣ **Tally → Windows Sync App**
```
Tally ERP (localhost:9000)
    │
    │ ← XML Request (TDL Query)
    │
    ▼
Windows Sync App parses XML
    │
    │ • Extract Ledgers, Vouchers, Sales, Purchases
    │ • Convert XML to JSON
    │ • Track last sync timestamp per data type
    │
    ▼
Data queued for upload
```

### 2️⃣ **Windows Sync App → Cloud**
```
SyncManager
    │
    │ • Check incremental delta (new/modified since last sync)
    │ • Batch data into chunks (max 100 records per request)
    │
    ▼
API Client
    │
    │ ← POST /api/v1/sync
    │ ← Headers: { X-API-KEY: "secret_key" }
    │ ← Body: { companyId, dataType, data: [...] }
    │
    ▼
If upload fails → Store in SQLite queue
    │
    │ • Retry every 30 seconds
    │ • Max 3 retries, then exponential backoff
```

### 3️⃣ **Cloud → Supabase**
```
Backend Server
    │
    │ • Validate API Key
    │ • Validate data structure (Joi/express-validator)
    │
    ▼
SyncService.syncCollection()
    │
    │ • Upsert data (INSERT or UPDATE on conflict)
    │ • Use Tally GUID as primary key (idempotent)
    │ • Attach company_id for isolation
    │
    ▼
Supabase PostgreSQL
    │
    │ • RLS ensures data isolation
    │ • Indexes for fast queries
```

### 4️⃣ **Mobile App → Cloud → Data Display**
```
Flutter App
    │
    │ ← 1. User logs in (Supabase Auth / Firebase Auth)
    │ ← 2. Fetch companies user has access to
    │ ← 3. Select company
    │
    ▼
API Requests
    │
    │ ← GET /api/v1/data/ledgers?companyId=xxx
    │ ← GET /api/v1/data/vouchers?companyId=xxx&date=2024-01-01
    │
    ▼
Display Reports
    │
    │ • Dashboard totals
    │ • Ledger list with balances
    │ • Day book
    │ • Outstanding reports
```

---

## 🛠️ Technology Stack Justification

| Component | Technology | Why? |
|-----------|------------|------|
| **Windows Sync** | C# .NET 8 WPF | Native Windows performance, easy Tally XML handling, SQLite integration, Windows Service capability |
| **Backend** | Node.js + Express | Fast async I/O, JSON-native, easy deployment, large ecosystem |
| **Database** | Supabase (PostgreSQL) | Free tier, RLS for security, real-time subscriptions, built-in auth |
| **Mobile App** | Flutter | Cross-platform (Android/iOS), single codebase, excellent performance |
| **Offline Queue** | SQLite | Embedded, zero-config, reliable for local storage |
| **Auth** | Supabase Auth | Built-in, secure, supports multiple providers |

---

## 🔐 Security Model

### 1. Authentication Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     SECURITY ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WINDOWS SYNC APP                                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ • API Key Authentication (X-API-KEY header)             │    │
│  │ • Company-bound API keys                                │    │
│  │ • Key stored encrypted in Windows Credential Manager    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  MOBILE APP                                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ • JWT Authentication (Bearer token)                     │    │
│  │ • Supabase Auth with email/password or OAuth            │    │
│  │ • Token refresh handled automatically                   │    │
│  │ • User-company relationship validated on each request   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  DATABASE                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ • Row Level Security (RLS) policies                     │    │
│  │ • Users can only access their linked companies          │    │
│  │ • Service role bypass for sync operations               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Data Protection
- **In Transit**: HTTPS/TLS 1.3 for all API calls
- **At Rest**: Supabase encrypted storage
- **Secrets**: Environment variables, never hardcoded
- **API Keys**: SHA-256 hashed in database

### 3. Rate Limiting
- 100 requests per 15 minutes per IP (sync operations)
- Prevents abuse and DDoS

---

## 📈 Scaling Strategy

### Phase 1: Single Server (0-100 users)
```
Single Node.js instance
    │
    └── Supabase Free/Pro tier
```

### Phase 2: Horizontal Scaling (100-1000 users)
```
Load Balancer (Nginx/Cloudflare)
    │
    ├── Node.js Instance 1
    ├── Node.js Instance 2
    └── Node.js Instance 3
          │
          └── Supabase Pro + Connection Pooling
```

### Phase 3: Enterprise (1000+ users)
```
Cloudflare CDN/WAF
    │
    └── Kubernetes Cluster
          │
          ├── API Pods (auto-scaling)
          ├── Background Worker Pods
          └── Redis Cache
                │
                └── Supabase Enterprise / Self-hosted PostgreSQL
```

---

## 📁 Folder Structure

### Backend (Node.js)
```
tally-sync-backend/
├── src/
│   ├── config/
│   │   ├── supabase.js        # Database client
│   │   └── constants.js       # App constants
│   ├── middleware/
│   │   ├── auth.js            # API key & JWT validation
│   │   ├── errorHandler.js    # Centralized error handling
│   │   ├── validator.js       # Request validation
│   │   └── rateLimiter.js     # Rate limiting config
│   ├── routes/
│   │   ├── syncRoutes.js      # Windows sync endpoints
│   │   ├── dataRoutes.js      # Mobile read endpoints
│   │   ├── authRoutes.js      # Auth endpoints
│   │   └── companyRoutes.js   # Company management
│   ├── services/
│   │   ├── syncService.js     # Sync logic
│   │   ├── dataService.js     # Read operations
│   │   ├── authService.js     # User auth
│   │   └── companyService.js  # Company management
│   ├── utils/
│   │   ├── logger.js          # Winston logger
│   │   └── helpers.js         # Utility functions
│   └── index.js               # App entry point
├── logs/                       # Log files
├── .env                        # Environment variables
├── package.json
└── README.md
```

### Windows Sync App (C#)
```
TallySyncApp/
├── TallySyncApp/
│   ├── Models/
│   │   ├── Ledger.cs
│   │   ├── Voucher.cs
│   │   ├── Sale.cs
│   │   ├── Purchase.cs
│   │   └── SyncStatus.cs
│   ├── Services/
│   │   ├── TallyConnector.cs       # Tally XML API
│   │   ├── TallyXmlParser.cs       # XML to Model
│   │   ├── SyncManager.cs          # Orchestration
│   │   ├── ApiClient.cs            # Cloud API calls
│   │   └── OfflineQueueService.cs  # SQLite queue
│   ├── Data/
│   │   └── LocalDatabase.cs        # SQLite config
│   ├── Views/
│   │   ├── MainWindow.xaml
│   │   ├── SettingsWindow.xaml
│   │   └── SyncStatusView.xaml
│   ├── ViewModels/
│   │   └── MainViewModel.cs
│   ├── App.xaml
│   └── App.config
├── TallySyncApp.sln
└── README.md
```

### Mobile App (Flutter)
```
tally_mobile_app/
├── lib/
│   ├── models/
│   │   ├── ledger.dart
│   │   ├── voucher.dart
│   │   ├── company.dart
│   │   └── user.dart
│   ├── services/
│   │   ├── api_service.dart
│   │   ├── auth_service.dart
│   │   └── local_cache.dart
│   ├── screens/
│   │   ├── login_screen.dart
│   │   ├── dashboard_screen.dart
│   │   ├── ledger_list_screen.dart
│   │   ├── voucher_history_screen.dart
│   │   └── company_selection_screen.dart
│   ├── widgets/
│   │   ├── balance_card.dart
│   │   ├── ledger_tile.dart
│   │   └── search_bar.dart
│   ├── providers/
│   │   └── app_state.dart
│   └── main.dart
├── pubspec.yaml
└── README.md
```

---

## 🔄 Sync Strategy

### Incremental Sync Algorithm

```
┌─────────────────────────────────────────────────────────────┐
│                 INCREMENTAL SYNC FLOW                        │
└─────────────────────────────────────────────────────────────┘

1. INITIAL SYNC (First Time)
   ├── Fetch ALL data from Tally
   ├── Upload to cloud
   └── Store current timestamp as lastSyncTime

2. DELTA SYNC (Subsequent)
   ├── Query Tally for records modified after lastSyncTime
   ├── Use Tally's ALTERID / MASTERID fields
   ├── Upload only changed records
   └── Update lastSyncTime

3. CONFLICT RESOLUTION
   ├── Cloud timestamp always wins (server authority)
   ├── Tally GUID is the unique identifier
   └── Upsert ensures idempotency

4. FAILURE RECOVERY
   ├── Failed uploads → SQLite queue
   ├── Retry with exponential backoff
   ├── Max retries: 5
   └── After 5 failures: Alert user, continue other syncs
```

### Sync Timer Configuration
```
BACKGROUND SYNC SCHEDULE:
├── Normal Mode: Every 5 minutes
├── Active Mode: Every 1 minute (when user opens app)
├── Error Mode: Exponential backoff (30s, 1m, 2m, 5m, 10m)
└── Manual Trigger: User can force sync anytime
```

---

## 🚀 Deployment Plan

### 1. Backend Deployment (Railway/Render/Vercel)
```bash
1. Push code to GitHub
2. Connect Railway to repository
3. Set environment variables:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - SYNC_API_KEY
   - NODE_ENV=production
4. Deploy (auto-build)
5. Configure custom domain (optional)
6. Enable SSL (automatic)
```

### 2. Windows App Deployment
```bash
1. Build Release configuration in Visual Studio
2. Create MSIX package or Inno Setup installer
3. Sign with code signing certificate
4. Distribute via:
   - Direct download
   - Microsoft Store (optional)
   - Auto-update via Squirrel.Windows
```

### 3. Mobile App Deployment
```bash
1. flutter build apk --release
2. Sign APK with keystore
3. Upload to Google Play Console
4. Configure app signing by Google Play
5. Release to internal/beta/production track
```

### 4. Database Setup
```sql
1. Create Supabase project
2. Run schema migration (supabase_schema.sql)
3. Enable RLS policies
4. Generate API keys
5. Configure connection pooling (if needed)
```

---

## 📋 Checklist Before Production

- [ ] Backend deployed and tested
- [ ] Database schema migrated
- [ ] RLS policies verified
- [ ] API keys generated and secured
- [ ] Windows app tested with real Tally
- [ ] Mobile app tested with real data
- [ ] Error logging configured
- [ ] Rate limiting tested
- [ ] Backup strategy in place
- [ ] Monitoring set up (optional: Sentry, LogRocket)

---

**Next Steps:**
1. ✅ ITEM 2: Build Windows Sync App (C# .NET 8)
2. ✅ ITEM 3: Enhance Cloud Backend
3. ✅ ITEM 4: Build Flutter Mobile App
4. ✅ ITEM 5: Implement Sync Logic Engine
