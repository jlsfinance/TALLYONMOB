# 🏗️ LiveKeeping Tally Sync System - Architecture Blueprint

## Production-Grade Accounting Sync System
> Connects Tally ERP to Cloud Database and Android Mobile App

---

## 📐 System Architecture Diagram (Text Format)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              LIVEKEEPING SYNC ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────────────────────┘

                               ┌──────────────────┐
                               │   ANDROID APP    │
                               │    (Flutter)     │
                               │                  │
                               │ • Dashboard      │
                               │ • Reports        │
                               │ • Ledgers        │
                               │ • Vouchers       │
                               └────────┬─────────┘
                                        │
                                        │ HTTPS (JWT Auth)
                                        │
                                        ▼
┌─────────────────┐           ┌──────────────────┐           ┌──────────────────┐
│  TALLY ERP 9    │           │  CLOUD BACKEND   │           │    SUPABASE      │
│                 │           │  (Node.js API)   │           │   (PostgreSQL)   │
│ localhost:9000  │──────────▶│                  │◀─────────▶│                  │
│    XML API      │   HTTPS   │ • Express Server │  Realtime │ • Companies      │
│                 │  (API Key)│ • Auth Middleware│    Sync   │ • Ledgers        │
│ • Ledgers       │           │ • Rate Limiter   │           │ • Vouchers       │
│ • Vouchers      │           │ • Validators     │           │ • Sales          │
│ • Sales         │           │ • Error Handler  │           │ • Purchases      │
│ • Purchases     │           │ • Winston Logs   │           │ • Stock          │
│ • Stock         │           │                  │           │                  │
└────────┬────────┘           └────────┬─────────┘           └──────────────────┘
         │                             │
         │                             │
         ▼                             ▼
┌─────────────────┐           ┌──────────────────┐
│ WINDOWS SYNC    │           │   LOGS/MONITOR   │
│     APP         │           │                  │
│  (C# .NET 8)    │           │ • Winston Files  │
│                 │           │ • Error Tracking │
│ • TallyConnector│           │ • Sync Status    │
│ • SyncManager   │           │ • Performance    │
│ • SQLite Queue  │           │                  │
│ • WPF Dashboard │           │                  │
│ • 5 min Timer   │           │                  │
└─────────────────┘           └──────────────────┘
```

---

## 🔄 Data Flow Explanation

### 1. **Tally → Windows Sync App** (Every 5 Minutes)
```
STEP 1: Windows Sync App Timer triggers
STEP 2: TallyConnector sends XML request to localhost:9000
STEP 3: Tally returns XML response with accounting data
STEP 4: App parses XML → JSON
STEP 5: Data stored in SQLite queue (offline safety)
STEP 6: SyncManager uploads batch to Cloud Backend
STEP 7: Failed uploads remain in queue for retry
```

### 2. **Windows App → Cloud Backend**
```
STEP 1: HTTPS POST request with API Key header
STEP 2: Backend validates API Key
STEP 3: Request body validation (company, dataType, data[])
STEP 4: Upsert to Supabase (idempotent)
STEP 5: Return success/failure response
STEP 6: Log sync event
```

### 3. **Android App → Cloud Backend**
```
STEP 1: User authenticates via Firebase Auth
STEP 2: JWT token attached to all requests
STEP 3: App fetches company-specific data
STEP 4: Real-time updates via Supabase subscriptions
STEP 5: Offline cache in SQLite/Hive
STEP 6: Pull-to-refresh for manual sync
```

---

## 🛠️ Technology Stack Justification

| Layer | Technology | Justification |
|-------|------------|---------------|
| **Windows Desktop** | C# .NET 8 WPF | Native Windows, robust XML parsing, SQLite integration, professional UI |
| **Cloud Backend** | Node.js + Express | Fast async I/O, excellent JSON handling, rich ecosystem |
| **Database** | Supabase (PostgreSQL) | Real-time subscriptions, RLS security, free tier, REST API |
| **Mobile App** | Flutter | Cross-platform, fast development, excellent Firebase integration |
| **Authentication** | Supabase Auth + API Keys | JWT for mobile, API Keys for desktop sync security |
| **Logging** | Winston | Structured logging, file rotation, error tracking |
| **Local Storage** | SQLite | Reliable offline queue, proven technology |

---

## 🔐 Security Model

### Authentication Layers

| Component | Auth Method | Details |
|-----------|-------------|---------|
| **Windows Sync App** | API Key | `X-API-Key` header, validated on backend |
| **Android App** | JWT Token | Supabase Auth, auto-refresh, secure storage |
| **Backend API** | Dual Auth | API Key middleware (sync) + JWT middleware (mobile) |
| **Database** | RLS Policies | Row Level Security per company |

### Security Measures

```
1. HTTPS Only         - All communications encrypted (TLS 1.3)
2. API Key Rotation   - Configurable secret key rotation
3. Rate Limiting      - 100 requests per 15 minutes per IP
4. Input Validation   - express-validator + Joi schemas
5. Helmet Headers     - Security headers (XSS, CSRF, etc.)
6. CORS Policy        - Whitelist allowed origins
7. Company Isolation  - Data scoped by company_id
8. Audit Logging      - All sync events logged with timestamps
```

### Row Level Security (RLS) Example
```sql
-- Users can only see their company's data
CREATE POLICY "Company data isolation"
ON ledgers FOR ALL
USING (company_id = auth.jwt() ->> 'company_id');
```

---

## 📈 Scaling Strategy

### Phase 1: Single Instance (0-1000 users)
```
• Single Node.js server on Railway/Render
• Supabase Free/Pro tier
• Single Windows installer
• Basic monitoring
```

### Phase 2: High Availability (1000-10000 users)
```
• Load balanced Node.js instances
• Supabase Pro with connection pooling (PgBouncer)
• Redis for caching + session storage
• Separate read replicas for reports
• CDN for static assets
```

### Phase 3: Enterprise (10000+ users)
```
• Kubernetes orchestration
• Multi-region deployment
• Dedicated database instances
• Message queues (Bull/RabbitMQ) for sync jobs
• Elasticsearch for advanced search
• Grafana + Prometheus monitoring
```

---

## 📁 Complete Folder Structure

```
/livekeeping-tally-sync/
│
├── 📂 tally-sync-backend/              # Cloud Backend
│   ├── src/
│   │   ├── config/
│   │   │   ├── supabase.js             # Supabase client config
│   │   │   └── constants.js            # App constants
│   │   ├── middleware/
│   │   │   ├── auth.js                 # API Key + JWT validation
│   │   │   ├── errorHandler.js         # Global error handler
│   │   │   └── rateLimiter.js          # Rate limiting config
│   │   ├── routes/
│   │   │   ├── syncRoutes.js           # Sync API endpoints
│   │   │   ├── ledgerRoutes.js         # Ledger CRUD
│   │   │   ├── voucherRoutes.js        # Voucher CRUD
│   │   │   ├── companyRoutes.js        # Company management
│   │   │   └── reportRoutes.js         # Report generation
│   │   ├── services/
│   │   │   ├── syncService.js          # Sync business logic
│   │   │   ├── ledgerService.js        # Ledger operations
│   │   │   └── reportService.js        # Report calculations
│   │   ├── validators/
│   │   │   ├── syncValidator.js        # Sync payload validation
│   │   │   └── commonValidator.js      # Shared validators
│   │   ├── utils/
│   │   │   ├── logger.js               # Winston logger
│   │   │   └── helpers.js              # Utility functions
│   │   └── index.js                    # App entry point
│   ├── logs/
│   │   ├── error.log
│   │   └── combined.log
│   ├── .env
│   ├── package.json
│   └── README.md
│
├── 📂 tally-windows-sync/              # Windows Sync App
│   ├── TallySyncApp/
│   │   ├── App.xaml                    # WPF App config
│   │   ├── App.xaml.cs
│   │   ├── MainWindow.xaml             # Main UI
│   │   ├── MainWindow.xaml.cs
│   │   ├── Core/
│   │   │   ├── TallyConnector.cs       # Tally XML API client
│   │   │   ├── SyncManager.cs          # Sync orchestration
│   │   │   ├── ApiClient.cs            # HTTP API calls
│   │   │   └── XmlParser.cs            # XML to JSON converter
│   │   ├── Data/
│   │   │   ├── SqliteQueue.cs          # Offline queue
│   │   │   ├── SyncDatabase.cs         # SQLite context
│   │   │   └── Models/                 # Data models
│   │   ├── Services/
│   │   │   ├── BackgroundSyncService.cs # Timer service
│   │   │   ├── LogService.cs           # Logging
│   │   │   └── ConfigService.cs        # App config
│   │   └── ViewModels/
│   │       ├── MainViewModel.cs        # MVVM ViewModel
│   │       └── SyncStatusViewModel.cs
│   ├── TallySyncApp.sln
│   └── README.md
│
├── 📂 tally-mobile-app/                # Flutter Android App
│   ├── lib/
│   │   ├── main.dart
│   │   ├── config/
│   │   │   ├── supabase_config.dart
│   │   │   └── theme.dart
│   │   ├── models/
│   │   │   ├── company.dart
│   │   │   ├── ledger.dart
│   │   │   ├── voucher.dart
│   │   │   └── sale.dart
│   │   ├── services/
│   │   │   ├── auth_service.dart
│   │   │   ├── api_service.dart
│   │   │   └── cache_service.dart
│   │   ├── providers/
│   │   │   ├── auth_provider.dart
│   │   │   └── data_provider.dart
│   │   ├── screens/
│   │   │   ├── login_screen.dart
│   │   │   ├── dashboard_screen.dart
│   │   │   ├── ledger_list_screen.dart
│   │   │   ├── voucher_history_screen.dart
│   │   │   └── settings_screen.dart
│   │   └── widgets/
│   │       ├── dashboard_card.dart
│   │       ├── ledger_tile.dart
│   │       └── loading_indicator.dart
│   ├── android/
│   ├── pubspec.yaml
│   └── README.md
│
├── 📂 docs/
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── API_DOCUMENTATION.md
│   ├── DEPLOYMENT_GUIDE.md
│   └── TROUBLESHOOTING.md
│
└── README.md                           # Project overview
```

---

## 🔄 Sync Strategy

### Incremental Sync Algorithm

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCREMENTAL SYNC ENGINE                       │
└─────────────────────────────────────────────────────────────────┘

1. TIMESTAMP TRACKING
   ├── Each table has `synced_at` column
   ├── Windows app stores `lastSyncTimestamp` per dataType
   └── Only fetch records modified after lastSyncTimestamp

2. SYNC FLOW
   ┌─────────────┐
   │ Check Timer │ (Every 5 min)
   └──────┬──────┘
          ▼
   ┌─────────────────┐
   │ Is Tally Online │──No──▶ Skip, Retry Next Cycle
   └──────┬──────────┘
          │ Yes
          ▼
   ┌─────────────────────────────────┐
   │ Fetch Modified Records Since   │
   │     lastSyncTimestamp          │
   └──────┬──────────────────────────┘
          ▼
   ┌─────────────────────────────────┐
   │ Parse XML → JSON               │
   └──────┬──────────────────────────┘
          ▼
   ┌─────────────────────────────────┐
   │ Store in SQLite Queue          │ (Offline Safety)
   └──────┬──────────────────────────┘
          ▼
   ┌─────────────────────────────────┐
   │ Is Internet Available?         │──No──▶ Keep in Queue
   └──────┬──────────────────────────┘
          │ Yes
          ▼
   ┌─────────────────────────────────┐
   │ Batch Upload to Backend        │
   │ (Upsert = Idempotent)          │
   └──────┬──────────────────────────┘
          ▼
   ┌─────────────────────────────────┐
   │ Success? Update lastSyncTime   │
   │ Failed? Leave in Queue (Retry) │
   └─────────────────────────────────┘

3. CONFLICT RESOLUTION
   ├── Last-Write-Wins (based on synced_at)
   ├── Tally is MASTER source of truth
   └── Cloud only stores, never modifies Tally data

4. IDEMPOTENCY
   ├── Every record has unique ID (Tally GUID)
   ├── Upsert operation (INSERT or UPDATE)
   └── Safe to retry same upload multiple times

5. RETRY STRATEGY
   ├── Immediate retry: 3 attempts with 1s delay
   ├── Exponential backoff: 5s, 15s, 30s, 60s
   ├── Failed records stay in SQLite queue
   └── Max queue age: 7 days (then archive)
```

---

## 🚀 Deployment Plan

### Phase 1: Development Environment Setup

```bash
# 1. Backend Setup
cd tally-sync-backend
npm install
cp .env.example .env
# Configure Supabase credentials
npm run dev

# 2. Windows App Setup
# Open TallySyncApp.sln in Visual Studio 2022
# Build solution
# Configure API endpoint in app.config

# 3. Mobile App Setup
cd tally-mobile-app
flutter pub get
flutter run
```

### Phase 2: Staging Deployment

```yaml
Backend:
  Platform: Railway/Render
  Environment: staging
  Database: Supabase (separate project)
  
Windows App:
  Distribution: Direct download (ZIP)
  Installer: Inno Setup
  
Mobile App:
  Distribution: Internal testing (Firebase App Distribution)
```

### Phase 3: Production Deployment

```yaml
Backend:
  Platform: Railway/DigitalOcean App Platform
  Custom Domain: api.livekeeping.com
  SSL: Auto (Let's Encrypt)
  Environment Variables: Secure vault
  
Database:
  Platform: Supabase Pro
  Backups: Daily automated
  Monitoring: Supabase Dashboard
  
Windows App:
  Installer: Inno Setup with code signing
  Auto-updater: Squirrel or custom HTTP check
  Distribution: Website download
  
Mobile App:
  Android: Google Play Store
  Internal: Firebase App Distribution
```

### Deployment Checklist

- [ ] Configure production environment variables
- [ ] Enable RLS policies in Supabase
- [ ] Set up database backups
- [ ] Configure rate limiting
- [ ] Set up error monitoring (Sentry optional)
- [ ] Create Windows installer
- [ ] Generate signed APK
- [ ] Write user documentation

---

## 📊 Monitoring & Health Checks

```javascript
// Health Endpoint
GET /health
Response: { status: "OK", timestamp: "2026-01-31T00:00:00Z" }

// Sync Status (Windows App Dashboard)
{
  "lastSync": "2026-01-31T00:00:00Z",
  "pendingItems": 5,
  "failedItems": 0,
  "tallyStatus": "connected",
  "apiStatus": "healthy"
}
```

---

## 🎯 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Sync Latency | < 30 seconds | Time from Tally to Cloud |
| API Response | < 200ms | Average response time |
| Uptime | 99.9% | Backend availability |
| Data Accuracy | 100% | No data loss or corruption |
| Error Rate | < 1% | Failed sync attempts |

---

## 📝 Notes

1. **Tally is Master**: All data originates from Tally. Cloud is read-only storage.
2. **Offline First**: Windows app works without internet, syncs when connected.
3. **Company Isolation**: Multi-tenant with strict data separation.
4. **Audit Trail**: All operations logged for compliance.

---

*Architecture Version: 1.0*
*Last Updated: January 31, 2026*
*Author: LiveKeeping Engineering Team*
