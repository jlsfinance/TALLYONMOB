# LiveKeeping - Tally Cloud Sync System

A complete system to sync Tally ERP data to the cloud and access it from anywhere.

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Tally ERP     │     │  Windows Sync   │     │   Supabase      │
│   (Local PC)    │────▶│      App        │────▶│   Database      │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                              ┌──────────────────────────┼──────────────────────────┐
                              │                          │                          │
                              ▼                          ▼                          ▼
                     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
                     │  Web Dashboard  │     │   Mobile App    │     │   Web Backend   │
                     │    (React)      │     │    (Flutter)    │     │   (Node.js)     │
                     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 📦 Components

### 1. Windows Sync App (`tally-windows-sync/`)
- C# WPF Desktop Application
- Connects to Tally ERP via XML API
- Syncs Ledgers, Vouchers, Sales, Purchases, Stock
- Offline queue with SQLite
- Real-time sync status display

### 2. Web Dashboard (`tally-web-dashboard/`)
- React + Vite + Tailwind CSS
- User Authentication (Supabase Auth)
- Multi-company support
- Features:
  - Dashboard with summary stats
  - Ledger management with period filtering
  - Sales/Purchase invoice viewing
  - Stock inventory reports
  - Invoice sharing (Print, WhatsApp)

### 3. Cloud Backend (`tally-sync-backend/`)
- Node.js + Express
- REST API for sync operations
- Supabase PostgreSQL database
- API key authentication

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- .NET 8 SDK
- Tally ERP running on localhost:9000
- Supabase account

### 1. Setup Supabase

1. Create a new Supabase project
2. Run the SQL migrations:
   ```bash
   # Run in Supabase SQL Editor
   - supabase_schema_complete.sql
   - supabase_auth_migration.sql
   ```
3. Enable Email/Password authentication in Supabase Dashboard

### 2. Setup Backend

```bash
cd tally-sync-backend
cp .env.example .env
# Edit .env with your Supabase credentials
npm install
npm run dev
```

### 3. Setup Web Dashboard

```bash
cd tally-web-dashboard
cp .env.example .env
# Edit .env with your Supabase credentials
npm install
npm run dev
```

### 4. Setup Windows Sync App

1. Open `tally-windows-sync` in Visual Studio 2022
2. Update `appsettings.json` with your API settings
3. Build and run

## 🔐 Authentication Flow

1. **Web Dashboard**: User creates account via web signup
2. **Windows Sync**: User logs in with same email/password
3. **Data Access**: Both platforms access same data via Supabase RLS

## 📄 Features

### Ledgers
- View all parties, banks, accounts
- Search and filter by group
- Detailed ledger statement with period selection
- Share ledger details via WhatsApp

### Sales & Purchases
- Invoice listing with date filters
- Detailed invoice view with items
- Print invoice
- Share via WhatsApp

### Stock
- List/Grid view of stock items
- Group filtering
- Opening, Inward, Outward, Closing tracking
- Stock value calculation

### Reports
- Ledger statement
- Sales summary
- Purchase summary
- Stock summary

## 🔒 Security

- Supabase Row Level Security (RLS)
- User can only access their own companies
- API Key authentication for sync operations
- JWT-based web authentication

## 📱 Mobile App (Coming Soon)

Flutter app for iOS/Android with:
- Same features as web dashboard
- Push notifications for sync status
- Offline access to recent data

## 🛠️ Development

### Backend
```bash
npm run dev  # Development with hot reload
npm start    # Production
```

### Web Dashboard
```bash
npm run dev    # Development
npm run build  # Production build
```

### Windows App
```bash
dotnet build   # Build
dotnet run     # Run
```

## 📝 License

MIT License

## 🤝 Support

For issues and feature requests, please create a GitHub issue.
