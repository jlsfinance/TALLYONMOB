# Automation Modules - Appwrite Schema

## New Collections

### `ledger_mappings`
- `userId` (string, required, index)
- `clientId` (string, required, index)
- `normalizedKeyword` (string, required, index)
- `ledgerName` (string, required)
- `createdAt` (datetime string, required, index)

Permissions:
- Read: `user:{userId}`
- Update: `user:{userId}`
- Delete: `user:{userId}`

### `invoices`
- `userId` (string, required, index)
- `clientId` (string, required, index)
- `gstin` (string, optional, index)
- `invoiceNumber` (string, required, index)
- `date` (datetime/string, required, index)
- `taxableValue` (number, required)
- `cgst` (number, required)
- `sgst` (number, required)
- `igst` (number, required)
- `hsn` (string, optional, index)
- `invoiceType` (enum/string: `B2B` or `B2C`, required, index)
- `createdAt` (datetime string, required, index)

Permissions:
- Read: `user:{userId}`
- Update: `user:{userId}`
- Delete: `user:{userId}`

## Free Plan Limits
- Max 5 clients per user
- Max 1000 transactions per upload
- No WhatsApp automation
- No direct GST filing
- No real-time Tally sync
- No advanced OCR

## Security Notes
- Gemini calls are server-side only via `/api/ai/*`
- Structured automation runs with deterministic temperature 0 when `expectJson=true`
- Ledger and invoice API routes validate user/client context
- Client-wise queries always filtered with `userId` + `clientId`
