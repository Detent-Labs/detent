/**
 * `Bun.serve`-compatible wiring around `routes.ts`'s framework-agnostic
 * handlers. `createServer` returns a plain `fetch(req): Promise<Response>`,
 * so tests can call it directly with `new Request(...)` — no real port. Low
 * lock-in by design: a later framework swap (e.g. Hono) would only rewrite
 * this file, not `routes.ts`/`errors.ts`. See design.md "Framework choice".
 */
import { SQL } from "bun";
import { sql } from "../engine/store.js";
import { startEngine, createDefaultDataSourceRegistry } from "../engine/host.js";
import { createRegistry, type Registry, type DataSourceRegistry } from "../engine/registry.js";
import { devHeaderResolver, type ActorResolver } from "../auth/resolve.js";
import {
  handleCreateInstance,
  handleGetInstanceView,
  handleSubmit,
  handleClaim,
  handleRelease,
  handleListInstances,
  handleInstanceRecord,
  handleCancel,
  handlePublish,
  handleListProcesses,
  handleListVersions,
} from "./routes.js";
import type { HttpResult } from "./errors.js";

const CORS_ORIGIN_HEADER = { "Access-Control-Allow-Origin": "*" };

function toResponse({ status, body }: HttpResult): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS_ORIGIN_HEADER } });
}

function preflightResponse(methods: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_ORIGIN_HEADER,
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type, X-Actor-Id, X-Actor-Roles",
    },
  });
}

/**
 * `resolver` defaults to the non-production dev header resolver
 * (`devHeaderResolver`): documented as unsuitable for a deployment real user
 * data ever reaches, but it makes the trust boundary explicit and swappable
 * rather than an implicit "any actor accepted" default.
 *
 * `registry` backs the publish route (`POST /processes`): a body that
 * publishes here is a body this same server can execute, since it is
 * validated against the identical registry `startHttpServer` hands
 * `startEngine`. See design.md "Publish takes the server's registry, never
 * the client's".
 */
export function createServer(
  dataSourceRegistry: DataSourceRegistry,
  registry: Registry,
  db: SQL = sql,
  resolver: ActorResolver = devHeaderResolver,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // CORS preflight for every route below
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "processes" && parts[2] === "instances") {
      return preflightResponse("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 2 && parts[0] === "instances") {
      return preflightResponse("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 1 && parts[0] === "instances") {
      return preflightResponse("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "submit") {
      return preflightResponse("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "claim") {
      return preflightResponse("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "release") {
      return preflightResponse("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "record") {
      return preflightResponse("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "cancel") {
      return preflightResponse("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 1 && parts[0] === "processes") {
      return preflightResponse("GET, POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "processes" && parts[2] === "versions") {
      return preflightResponse("GET");
    }

    // POST /processes/:processId/instances
    if (req.method === "POST" && parts.length === 3 && parts[0] === "processes" && parts[2] === "instances") {
      return toResponse(await handleCreateInstance(parts[1]!, req, resolver, dataSourceRegistry, db));
    }
    // GET /instances (list)
    if (req.method === "GET" && parts.length === 1 && parts[0] === "instances") {
      return toResponse(await handleListInstances(req, db));
    }
    // GET /instances/:instanceId
    if (req.method === "GET" && parts.length === 2 && parts[0] === "instances") {
      return toResponse(await handleGetInstanceView(parts[1]!, req, resolver, dataSourceRegistry, db));
    }
    // POST /instances/:instanceId/submit
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "submit") {
      return toResponse(await handleSubmit(parts[1]!, req, resolver, dataSourceRegistry, db));
    }
    // POST /instances/:instanceId/claim
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "claim") {
      return toResponse(await handleClaim(parts[1]!, req, resolver, db));
    }
    // POST /instances/:instanceId/release
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "release") {
      return toResponse(await handleRelease(parts[1]!, req, resolver, db));
    }
    // GET /instances/:instanceId/record
    if (req.method === "GET" && parts.length === 3 && parts[0] === "instances" && parts[2] === "record") {
      return toResponse(await handleInstanceRecord(parts[1]!, req, db));
    }
    // POST /instances/:instanceId/cancel
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "cancel") {
      return toResponse(await handleCancel(parts[1]!, req, resolver, db));
    }
    // POST /processes (publish)
    if (req.method === "POST" && parts.length === 1 && parts[0] === "processes") {
      return toResponse(await handlePublish(req, resolver, registry, dataSourceRegistry, db));
    }
    // GET /processes (list)
    if (req.method === "GET" && parts.length === 1 && parts[0] === "processes") {
      return toResponse(await handleListProcesses(db));
    }
    // GET /processes/:processId/versions
    if (req.method === "GET" && parts.length === 3 && parts[0] === "processes" && parts[2] === "versions") {
      return toResponse(await handleListVersions(parts[1]!, db));
    }

    return toResponse({ status: 404, body: { error: { type: "not-found", message: `no route: ${req.method} ${url.pathname}` } } });
  };
}

export function startHttpServer(
  registry: Registry,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
  resolver: ActorResolver = devHeaderResolver,
): { stop: () => void } {
  const fetch = createServer(dataSourceRegistry, registry, db, resolver);
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
  startHttpServer(createRegistry(), createDefaultDataSourceRegistry());
}
