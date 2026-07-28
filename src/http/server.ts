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
import { jwtResolver, type IssuerConfig } from "../auth/jwt.js";
import { handleLogin } from "../auth/login.js";
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
import {
  handleAdminListOutbox,
  handleAdminOutboxRetry,
  handleAdminOutboxDiscard,
  handleAdminListTimers,
  handleAdminListUsers,
  handleAdminDisableUser,
  handleAdminEnableUser,
} from "./admin-routes.js";
import {
  handleListDrafts,
  handleGetDraft,
  handleSaveDraft,
  handleDeleteDraft,
  handlePublishDraft,
  handleGetVersionBody,
  handleGetMigrationPlan,
  handlePutMigrationPlan,
  handleGetOrphanKeys,
} from "./studio-routes.js";
import type { HttpResult } from "./errors.js";

/**
 * `undefined` = no origins allowed (no CORS headers emitted); `"*"` = the
 * wildcard, spelled as a one-element array so the type stays one shape; an
 * array of exact origin strings = the allowlist. Parsed once from
 * `CORS_ALLOWED_ORIGINS` by `parseAllowedOrigins`.
 */
type AllowedOrigins = "*" | string[] | undefined;

/** Split `CORS_ALLOWED_ORIGINS` on commas, trim, drop empties. A lone `*` is the wildcard; nothing left is unset. */
function parseAllowedOrigins(raw: string | undefined): AllowedOrigins {
  const origins = (raw ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (origins.length === 0) return undefined;
  if (origins.length === 1 && origins[0] === "*") return "*";
  return origins;
}

/**
 * Resolve the CORS headers for one request. In allowlist mode the header
 * echoes back the *request's* `Origin` — never a caller-supplied string,
 * and only after confirming it is on the configured list — since "echo the
 * origin" is exactly what the unsafe, unchecked-reflection version of this
 * function would also read like. `Vary: Origin` is only meaningful when the
 * answer can differ by origin, i.e. allowlist mode.
 */
function corsHeaders(allowed: AllowedOrigins, requestOrigin: string | null): Record<string, string> {
  if (allowed === undefined) return {};
  if (allowed === "*") return { "Access-Control-Allow-Origin": "*" };
  if (requestOrigin && allowed.includes(requestOrigin)) {
    return { "Access-Control-Allow-Origin": requestOrigin, Vary: "Origin" };
  }
  return { Vary: "Origin" };
}

function toResponse({ status, body }: HttpResult, allowed: AllowedOrigins, requestOrigin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(allowed, requestOrigin) },
  });
}

function preflightResponse(methods: string, allowed: AllowedOrigins, requestOrigin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(allowed, requestOrigin),
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type, X-Actor-Id, X-Actor-Roles, Authorization",
    },
  });
}

/**
 * Parse `AUTH_ISSUERS`: a JSON array of `{iss, jwksUrl, audience, rolesClaim}`.
 * Unset or empty means no external issuers. A malformed value throws rather
 * than silently disabling issuers — the composition root lets this propagate
 * so startup fails loudly (design.md "Configuration selects the resolver").
 */
export function parseAuthIssuers(raw: string | undefined): IssuerConfig[] | undefined {
  if (!raw || !raw.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AUTH_ISSUERS is not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("AUTH_ISSUERS must be a JSON array");
  return parsed.map((entry, i) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Record<string, unknown>).iss !== "string" ||
      typeof (entry as Record<string, unknown>).jwksUrl !== "string" ||
      typeof (entry as Record<string, unknown>).audience !== "string" ||
      typeof (entry as Record<string, unknown>).rolesClaim !== "string"
    ) {
      throw new Error(`AUTH_ISSUERS[${i}] must be { iss, jwksUrl, audience, rolesClaim } (all strings)`);
    }
    return entry as IssuerConfig;
  });
}

/**
 * Select the server's `ActorResolver` from `AUTH_JWT_SECRET` /
 * `AUTH_ISSUERS`: the JWT resolver if either is set, `devHeaderResolver`
 * otherwise. The two are never active simultaneously.
 */
export function resolveAuthResolver(env: { AUTH_JWT_SECRET?: string; AUTH_ISSUERS?: string }): ActorResolver {
  const issuers = parseAuthIssuers(env.AUTH_ISSUERS);
  if (!env.AUTH_JWT_SECRET && !issuers) return devHeaderResolver;
  return jwtResolver({ localSecret: env.AUTH_JWT_SECRET, issuers });
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
/**
 * `allowedOrigins` defaults to `undefined` (no CORS headers at all) — the
 * secure default per design.md "Unset means no headers, not wildcard". A
 * caller that wants the prior always-`*` behavior passes `"*"` explicitly;
 * `startHttpServer` sources it from `CORS_ALLOWED_ORIGINS`.
 */
/**
 * `loginSecret` is `AUTH_JWT_SECRET`: `POST /auth/login` is registered only
 * when it is set, so there is no state in which the login route is reachable
 * without a signing key (jwt-authentication spec, "no login without a key").
 */
export function createServer(
  dataSourceRegistry: DataSourceRegistry,
  registry: Registry,
  db: SQL = sql,
  resolver: ActorResolver = devHeaderResolver,
  allowedOrigins: AllowedOrigins = undefined,
  loginSecret: string | undefined = undefined,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const origin = req.headers.get("Origin");
    const toRes = (result: HttpResult) => toResponse(result, allowedOrigins, origin);
    const preflight = (methods: string) => preflightResponse(methods, allowedOrigins, origin);

    // CORS preflight for every route below
    if (loginSecret && req.method === "OPTIONS" && parts.length === 2 && parts[0] === "auth" && parts[1] === "login") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "processes" && parts[2] === "instances") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 2 && parts[0] === "instances") {
      return preflight("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 1 && parts[0] === "instances") {
      return preflight("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "submit") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "claim") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "release") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "record") {
      return preflight("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "cancel") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 1 && parts[0] === "processes") {
      return preflight("GET, POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "processes" && parts[2] === "versions") {
      return preflight("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 2 && parts[0] === "admin" && parts[1] === "outbox") {
      return preflight("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 4 && parts[0] === "admin" && parts[1] === "outbox" && parts[3] === "retry") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 4 && parts[0] === "admin" && parts[1] === "outbox" && parts[3] === "discard") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 2 && parts[0] === "admin" && parts[1] === "timers") {
      return preflight("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 2 && parts[0] === "admin" && parts[1] === "users") {
      return preflight("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 4 && parts[0] === "admin" && parts[1] === "users" && parts[3] === "disable") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 4 && parts[0] === "admin" && parts[1] === "users" && parts[3] === "enable") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 1 && parts[0] === "drafts") {
      return preflight("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 2 && parts[0] === "drafts") {
      return preflight("GET, PUT, DELETE");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "drafts" && parts[2] === "publish") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 4 && parts[0] === "processes" && parts[2] === "versions") {
      return preflight("GET");
    }
    if (req.method === "OPTIONS" && parts.length === 4 && parts[0] === "migration-plans") {
      return preflight("GET, PUT");
    }
    if (req.method === "OPTIONS" && parts.length === 5 && parts[0] === "processes" && parts[2] === "versions" && parts[4] === "orphan-keys") {
      return preflight("GET");
    }

    // POST /auth/login
    if (loginSecret && req.method === "POST" && parts.length === 2 && parts[0] === "auth" && parts[1] === "login") {
      return toRes(await handleLogin(req, loginSecret, db));
    }
    // POST /processes/:processId/instances
    if (req.method === "POST" && parts.length === 3 && parts[0] === "processes" && parts[2] === "instances") {
      return toRes(await handleCreateInstance(parts[1]!, req, resolver, dataSourceRegistry, db));
    }
    // GET /instances (list)
    if (req.method === "GET" && parts.length === 1 && parts[0] === "instances") {
      return toRes(await handleListInstances(req, resolver, db));
    }
    // GET /instances/:instanceId
    if (req.method === "GET" && parts.length === 2 && parts[0] === "instances") {
      return toRes(await handleGetInstanceView(parts[1]!, req, resolver, dataSourceRegistry, db));
    }
    // POST /instances/:instanceId/submit
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "submit") {
      return toRes(await handleSubmit(parts[1]!, req, resolver, dataSourceRegistry, db));
    }
    // POST /instances/:instanceId/claim
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "claim") {
      return toRes(await handleClaim(parts[1]!, req, resolver, db));
    }
    // POST /instances/:instanceId/release
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "release") {
      return toRes(await handleRelease(parts[1]!, req, resolver, db));
    }
    // GET /instances/:instanceId/record
    if (req.method === "GET" && parts.length === 3 && parts[0] === "instances" && parts[2] === "record") {
      return toRes(await handleInstanceRecord(parts[1]!, req, resolver, db));
    }
    // POST /instances/:instanceId/cancel
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "cancel") {
      return toRes(await handleCancel(parts[1]!, req, resolver, db));
    }
    // POST /processes (publish)
    if (req.method === "POST" && parts.length === 1 && parts[0] === "processes") {
      return toRes(await handlePublish(req, resolver, registry, dataSourceRegistry, db));
    }
    // GET /processes (list)
    if (req.method === "GET" && parts.length === 1 && parts[0] === "processes") {
      return toRes(await handleListProcesses(req, resolver, db));
    }
    // GET /processes/:processId/versions
    if (req.method === "GET" && parts.length === 3 && parts[0] === "processes" && parts[2] === "versions") {
      return toRes(await handleListVersions(parts[1]!, req, resolver, db));
    }
    // GET /admin/outbox
    if (req.method === "GET" && parts.length === 2 && parts[0] === "admin" && parts[1] === "outbox") {
      return toRes(await handleAdminListOutbox(req, resolver, db));
    }
    // POST /admin/outbox/:idempotencyKey/retry
    if (req.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "outbox" && parts[3] === "retry") {
      return toRes(await handleAdminOutboxRetry(parts[2]!, req, resolver, db));
    }
    // POST /admin/outbox/:idempotencyKey/discard
    if (req.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "outbox" && parts[3] === "discard") {
      return toRes(await handleAdminOutboxDiscard(parts[2]!, req, resolver, db));
    }
    // GET /admin/timers
    if (req.method === "GET" && parts.length === 2 && parts[0] === "admin" && parts[1] === "timers") {
      return toRes(await handleAdminListTimers(req, resolver, db));
    }
    // GET /admin/users
    if (req.method === "GET" && parts.length === 2 && parts[0] === "admin" && parts[1] === "users") {
      return toRes(await handleAdminListUsers(req, resolver, db));
    }
    // POST /admin/users/:id/disable
    if (req.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "users" && parts[3] === "disable") {
      return toRes(await handleAdminDisableUser(parts[2]!, req, resolver, db));
    }
    // POST /admin/users/:id/enable
    if (req.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "users" && parts[3] === "enable") {
      return toRes(await handleAdminEnableUser(parts[2]!, req, resolver, db));
    }
    // GET /drafts (list)
    if (req.method === "GET" && parts.length === 1 && parts[0] === "drafts") {
      return toRes(await handleListDrafts(req, resolver, db));
    }
    // GET /drafts/:processId
    if (req.method === "GET" && parts.length === 2 && parts[0] === "drafts") {
      return toRes(await handleGetDraft(parts[1]!, req, resolver, db));
    }
    // PUT /drafts/:processId
    if (req.method === "PUT" && parts.length === 2 && parts[0] === "drafts") {
      return toRes(await handleSaveDraft(parts[1]!, req, resolver, db));
    }
    // DELETE /drafts/:processId
    if (req.method === "DELETE" && parts.length === 2 && parts[0] === "drafts") {
      return toRes(await handleDeleteDraft(parts[1]!, req, resolver, db));
    }
    // POST /drafts/:processId/publish
    if (req.method === "POST" && parts.length === 3 && parts[0] === "drafts" && parts[2] === "publish") {
      return toRes(await handlePublishDraft(parts[1]!, req, resolver, registry, dataSourceRegistry, db));
    }
    // GET /processes/:processId/versions/:version/orphan-keys
    if (req.method === "GET" && parts.length === 5 && parts[0] === "processes" && parts[2] === "versions" && parts[4] === "orphan-keys") {
      return toRes(await handleGetOrphanKeys(parts[1]!, parts[3]!, req, resolver, db));
    }
    // GET /processes/:processId/versions/:version (body)
    if (req.method === "GET" && parts.length === 4 && parts[0] === "processes" && parts[2] === "versions") {
      return toRes(await handleGetVersionBody(parts[1]!, parts[3]!, req, resolver, db));
    }
    // GET /migration-plans/:processId/:fromVersion/:toVersion
    if (req.method === "GET" && parts.length === 4 && parts[0] === "migration-plans") {
      return toRes(await handleGetMigrationPlan(parts[1]!, parts[2]!, parts[3]!, req, resolver, db));
    }
    // PUT /migration-plans/:processId/:fromVersion/:toVersion
    if (req.method === "PUT" && parts.length === 4 && parts[0] === "migration-plans") {
      return toRes(await handlePutMigrationPlan(parts[1]!, parts[2]!, parts[3]!, req, resolver, db));
    }

    return toRes({ status: 404, body: { error: { type: "not-found", message: `no route: ${req.method} ${url.pathname}` } } });
  };
}

export function startHttpServer(
  registry: Registry,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
  resolver: ActorResolver = resolveAuthResolver({ AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET, AUTH_ISSUERS: process.env.AUTH_ISSUERS }),
): { stop: () => void } {
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const fetch = createServer(dataSourceRegistry, registry, db, resolver, allowedOrigins, process.env.AUTH_JWT_SECRET);
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
