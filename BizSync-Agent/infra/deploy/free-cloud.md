# Free Cloud Deployment

## Backend (Railway)
- Create service from `apps/api`.
- Set env vars from `.env.example`.
- Start command: `npm run start`.

## Frontend (Vercel)
- Import repo, root `apps/web`.
- Build: `npm run build`, Output: `.next`.

## Storage / DB / Redis
- Cloudflare R2 bucket private + signed URLs.
- Inforge Postgres with pgvector enabled.
- Upstash Redis URL/token configured.
