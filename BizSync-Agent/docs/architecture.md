# Architecture Docs

## Services
- API gateway (NestJS Fastify)
- OCR/Embedding workers (BullMQ)
- RAG pipeline (retrieval + prompt orchestration)
- Web dashboard (Next.js)

## Key APIs
- `POST /files/upload`
- `POST /rag/query`
- `POST /analytics/summary`
- `POST /webhooks/{telegram|whatsapp|imessage}`

- `POST /rag/compare-item-rate` (payload: itemName + fileNames[]) for cross-file rate comparison like Bairathi vs Topseries.
