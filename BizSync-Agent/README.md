# BizSync Agent

## Quick start
1. `pnpm i`
2. `cp .env.example .env`
3. `docker compose up --build`

## Architecture
- NestJS API + Next.js admin + BullMQ workers
- Inforge Postgres + pgvector + RLS
- Cloudflare R2 storage, Upstash Redis queues

## Free deployment
See `infra/deploy/free-cloud.md`.
