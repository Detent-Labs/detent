/**
 * Devcontainer-only target for the `http.request` action handler
 * (give-the-example-a-reachable-target). Answers every request with `200`
 * and echoes the JSON request body back as the response body, so an
 * `Action.output` expression reads a value the process definition itself
 * sent. `GET /healthz` is the compose healthcheck's own path, answered by
 * the same catch-all.
 *
 * Run inside the devcontainer:
 *   bun run scripts/dev-webhook-sink.ts
 */
const PORT = 8080;
const IDEMPOTENCY_HEADER = "Idempotency-Key";

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const idempotencyKey = req.headers.get(IDEMPOTENCY_HEADER);
    console.log(`${req.method} ${url.pathname}${idempotencyKey ? ` (${IDEMPOTENCY_HEADER}: ${idempotencyKey})` : ""}`);

    let body: unknown = {};
    const raw = await req.text();
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = {};
      }
    }
    return Response.json(body, { status: 200 });
  },
});

console.log(`webhook-sink listening on :${PORT}`);
