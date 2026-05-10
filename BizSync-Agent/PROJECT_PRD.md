# BizSync Agent PRD

## Vision
BizSync Agent is a multi-tenant AI business assistant for SMEs to upload catalogs, invoices, and price lists and query them in English, Hindi, or Hinglish via WhatsApp, Telegram, iMessage adapter, and a web dashboard.

## Goals
- Free-tier first architecture deployable on Railway/Render + Vercel + R2 + Upstash + Inforge Postgres.
- Under 2s upload acknowledgement, async OCR/embedding pipeline, under 5s semantic query responses.
- Strong tenant isolation with RBAC and PostgreSQL RLS.

## Core Features
- Multi-tenant auth + RBAC (owner/admin/manager/staff/viewer)
- File ingestion (PDF/XLS/XLSX/CSV/JPG/PNG, 20MB max)
- OCR and tabular extraction
- Embedding and pgvector semantic search
- AI RAG answers with analytics helpers (top items, latest rates, GST summary)
- Omnichannel webhook interfaces

## Architecture
- **Frontend:** Next.js 15 admin dashboard (Vercel)
- **Backend:** NestJS + Fastify API (Railway/Render/Fly)
- **DB:** Inforge Postgres + pgvector + RLS
- **Queue:** BullMQ + Upstash Redis
- **Storage:** Cloudflare R2 (Supabase fallback)
- **AI:** OpenAI GPT-4o-mini + text-embedding-3-small (Ollama fallback)

## User Flows
1. Owner signs up, creates company, invites users.
2. User uploads files -> API stores encrypted metadata + R2 object.
3. OCR worker parses document -> normalized text/tables.
4. Embedding worker chunks + stores vectors.
5. User asks query via chat/webhook -> retrieval + RAG response.

## API Domains
- `/auth/*`, `/companies/*`, `/files/*`, `/conversations/*`, `/analytics/*`, `/webhooks/*`, `/admin/*`

## Database
See `docs/db-schema.sql` for full schema with RLS and vector index.

## Deployment
See `README.md` and `infra/deploy/free-cloud.md`.

## Scalability
- Horizontal API/workers
- Queue-based async processing
- pgvector IVF index
- CDN-backed static dashboard

## Security
- JWT validation, route guards, RBAC decorators
- RLS + tenant scoped queries
- Signed URLs, MIME validation, checksum dedupe
- Rate limits + webhook signature verification
