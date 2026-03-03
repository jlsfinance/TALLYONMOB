# Tally Sync Backend API

Production-grade REST API backend for syncing Tally ERP data to cloud.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Run in development
npm run dev

# Run in production
npm start
```

## 📁 Project Structure

```
src/
├── config/
│   └── supabase.js      # Supabase client config
├── middleware/
│   ├── auth.js          # Authentication (API Key + JWT)
│   └── errorHandler.js  # Global error handler
├── routes/
│   ├── syncRoutes.js    # Sync endpoints (POST)
│   ├── companyRoutes.js # Company CRUD
│   ├── ledgerRoutes.js  # Ledger read endpoints
│   ├── voucherRoutes.js # Voucher read endpoints
│   └── reportRoutes.js  # Dashboard & reports
├── services/
│   └── syncService.js   # Sync business logic
├── utils/
│   └── logger.js        # Winston logger
└── index.js             # Entry point
```

## 🔐 Authentication

### For Windows Sync App (API Key)
```http
POST /api/v1/sync
X-API-Key: your_secret_sync_key_here
Content-Type: application/json
```

### For Mobile App (JWT or API Key)
```http
GET /api/v1/ledgers?companyId=xxx
Authorization: Bearer <jwt_token>
# OR
X-API-Key: your_secret_sync_key_here
```

## 📡 API Endpoints

### Health Check
```
GET /health
Response: { status: "OK", timestamp: "..." }
```

### Sync (Windows App)
```
POST /api/v1/sync
Body: {
  "companyId": "company-uuid",
  "dataType": "ledgers|vouchers|sales|purchases|stock",
  "data": [...]
}
```

### Companies
```
GET    /api/v1/companies           # List all
GET    /api/v1/companies/:id       # Get one
POST   /api/v1/companies           # Create/Update
DELETE /api/v1/companies/:id       # Delete
```

### Ledgers
```
GET /api/v1/ledgers?companyId=xxx              # List with filters
GET /api/v1/ledgers/:id                        # Get one
GET /api/v1/ledgers/groups/:companyId          # Get ledger groups
GET /api/v1/ledgers/summary/:companyId         # Get summary
```

### Vouchers
```
GET /api/v1/vouchers?companyId=xxx             # List with filters
GET /api/v1/vouchers/:id                       # Get one
GET /api/v1/vouchers/types/:companyId          # Get voucher types
GET /api/v1/vouchers/summary/:companyId        # Get summary
```

### Reports
```
GET /api/v1/reports/dashboard/:companyId       # Dashboard overview
GET /api/v1/reports/sales-summary/:companyId   # Sales by party
GET /api/v1/reports/purchase-summary/:companyId # Purchase by party
GET /api/v1/reports/stock-summary/:companyId   # Stock inventory
GET /api/v1/reports/sync-status/:companyId     # Sync health
```

## 🔧 Environment Variables

```env
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
SUPABASE_ANON_KEY=your_anon_key
APPWRITE_API_KEY=your_appwrite_api_key
PORT=5000
NODE_ENV=development
SYNC_API_KEY=your_secret_sync_key_here
ALLOWED_ORIGINS=http://localhost:3000
```

## 🗄️ Database Setup

Run the `supabase_schema.sql` file in your Supabase SQL Editor to create required tables.

## 🚀 Deployment

### Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 📊 Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Sync (POST)   | 100/15min |
| Read (GET)    | 200/min |

## 🔒 Security Features

- ✅ Helmet security headers
- ✅ CORS protection
- ✅ Rate limiting
- ✅ Input validation
- ✅ API Key authentication
- ✅ Request logging
- ✅ Error handling with sanitization

## 📝 License

MIT
