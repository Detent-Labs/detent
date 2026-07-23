/**
 * `Bun.serve`-compatible wiring around `routes.ts`'s framework-agnostic
 * handlers. `createServer` returns a plain `fetch(req): Promise<Response>`,
 * so tests can call it directly with `new Request(...)` — no real port. Low
 * lock-in by design: a later framework swap (e.g. Hono) would only rewrite
 * this file, not `routes.ts`/`errors.ts`. See design.md "Framework choice".
 */
import { SQL } from "bun";
import { sql } from "../engine/store.js";
import { startEngine } from "../engine/host.js";
import { createRegistry, type Registry } from "../engine/registry.js";
import { handleCreateInstance, handleGetInstanceView, handleSubmit } from "./routes.js";
import type { HttpResult } from "./errors.js";

const CORS_ORIGIN_HEADER = { "Access-Control-Allow-Origin": "*" };

function toResponse({ status, body }: HttpResult): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS_ORIGIN_HEADER } });
}

function preflightResponse(method: string): Response {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_ORIGIN_HEADER, "Access-Control-Allow-Methods": method, "Access-Control-Allow-Headers": "Content-Type" },
  });
}

/**
 * `registry` is accepted (not just `db`) to match `startHttpServer`'s
 * signature and so a caller constructing a server directly supplies the same
 * two arguments either way — the routes themselves need only `db`.
 */
export function createServer(_registry: Registry, db: SQL = sql): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // CORS preflight for each of the three routes below
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "processes" && parts[2] === "instances") {
      return preflightResponse("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 2 && parts[0] === "instances") {
      return preflightResponse("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "submit") {
      return preflightResponse("POST");
    }

    // POST /processes/:processId/instances
    if (req.method === "POST" && parts.length === 3 && parts[0] === "processes" && parts[2] === "instances") {
      return toResponse(await handleCreateInstance(parts[1]!, req, db));
    }
    // GET /instances/:instanceId
    if (req.method === "GET" && parts.length === 2 && parts[0] === "instances") {
      return toResponse(await handleGetInstanceView(parts[1]!, req, db));
    }
    // POST /instances/:instanceId/submit
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "submit") {
      return toResponse(await handleSubmit(parts[1]!, req, db));
    }

    return toResponse({ status: 404, body: { error: { type: "not-found", message: `no route: ${req.method} ${url.pathname}` } } });
  };
}

export function startHttpServer(registry: Registry, db: SQL = sql): { stop: () => void } {
  const fetch = createServer(registry, db);
  const port = Number(process.env.PORT ?? 3000);
  const server = Bun.serve({ fetch, port });
  const engine = startEngine(db, registry);
  console.log(`HTTP server listening on :${server.port}`);
  return {
    stop: () => {
      server.stop();
      engine.stop();
    },
  };
}

if (import.meta.main) {
  startHttpServer(createRegistry());
}
