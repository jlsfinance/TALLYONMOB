// Appwrite-compatible serverless placeholder.
// Move bot handlers to backend src/services/telegramService.js for primary runtime.

export default async function handler(_req: Request): Promise<Response> {
  return new Response(JSON.stringify({
    ok: false,
    message: 'This legacy function is disabled. Use Appwrite-backed backend routes.'
  }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' }
  });
}
