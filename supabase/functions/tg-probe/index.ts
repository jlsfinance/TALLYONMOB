// TEMP probe (diagnostic only, delete after test)
const CORS = { "Access-Control-Allow-Origin": "*" };
Deno.serve((req) => {
  if (req.method !== "GET") return new Response("no", { status: 404 });
  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response("<h1>probe-html-ok</h1>", { headers });
});
