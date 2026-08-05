/**
 * `Bun.serve`-compatible wiring around `routes.ts`'s framework-agnostic
 * handlers. `createServer` returns a plain `fetch(req): Promise<Response>`,
 * so tests can call it directly with `new Request(...)` — no real port. Low
 * lock-in by design: a later framework swap (e.g. Hono) would only rewrite
 * this file, not `routes.ts`/`errors.ts`. See design.md "Framework choice".
 *
 * `createServer`'s `routes` table is the ONE place a route's method and path
 * shape appear. The CORS preflight answer is derived from it, so adding a
 * route is one entry and nothing else. Before `http-route-table` a parallel
 * OPTIONS if-chain restated every route beside the handler chain; the two
 * drifted, and the four /reporting/* routes never got a preflight branch.
 */
import { SQL } from "bun";
import { sql, initSchema } from "../engine/store.js";
import { startEngine, createDefaultDataSourceRegistry } from "../engine/host.js";
import {
  createRegistry,
  type Registry,
  type DataSourceRegistry,
  type AssignmentRegistry,
} from "../engine/registry.js";
// The org-aware set (static + org.manager-of-starter), not the static-only leaf
// factory of the same name in registry.js. This is the composition root.
import { createDefaultAssignmentRegistry } from "../engine/assignment-strategies.js";
import { devHeaderResolver, type ActorResolver } from "../auth/resolve.js";
import { serveWebAsset, resolveWebRoot, isNavigationRequest } from "./static.js";
import { jwtResolver, type IssuerConfig } from "../auth/jwt.js";
import { handleLogin } from "../auth/login.js";
import {
  handleCreateInstance,
  handleGetInstanceView,
  handleSubmit,
  handleClaim,
  handleRelease,
  handleDelegate,
  handlePostComment,
  handleListComments,
  handleUploadAttachment,
  handleListAttachments,
  handleGetAttachment,
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
  handleAdminSetUserRoles,
  handleAdminSetUserManager,
  handleAdminRunMigration,
  handleAdminRedactInstance,
  handleAdminListDataLists,
  handleAdminCreateDataList,
  handleAdminGetDataList,
  handleAdminUpdateDataList,
  handleAdminPutDataListValues,
  handleAdminDeleteDataList,
} from "./admin-routes.js";
import {
  handleReportingListProcesses,
  handleReportingCycleTime,
  handleReportingBottleneck,
  handleReportingSla,
} from "./reporting-routes.js";
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
  handleGetRegistry,
} from "./studio-routes.js";
import { handleLivez, handleReadyz } from "./health.js";
import { handleMetrics } from "./metrics.js";
import type { HttpResult, HttpBinaryResult } from "./errors.js";
import { log } from "../log.js";

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

/** True for `handleGetAttachment`'s success shape, `HttpBinaryResult` — the one route response that is not a JSON envelope. See errors.ts's `HttpBinaryResult` doc comment. */
function isBinaryResult(result: HttpBinaryResult | HttpResult): result is HttpBinaryResult {
  return "contentType" in result;
}

function toBinaryResponse({ status, contentType, data }: HttpBinaryResult, allowed: AllowedOrigins, requestOrigin: string | null): Response {
  return new Response(data, {
    status,
    headers: { "content-type": contentType, ...corsHeaders(allowed, requestOrigin) },
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
 * One route: its method, its path pattern already split into segments, and a
 * closure over the dependencies that route's handler reads. The handlers share
 * no signature — `handleListInstances(req, resolver, db)` beside
 * `handleGetMigrationPlan(processId, fromVersion, toVersion, req, resolver, db)`
 * — so the table stores a closure, never a bare handler reference.
 */
type Route = {
  method: string;
  segments: string[];
  handler: (params: string[], req: Request) => Promise<HttpResult | HttpBinaryResult>;
};

/** Split a route pattern into segments. Runs once per route, when `createServer` builds the table. */
function seg(pattern: string): string[] {
  return pattern.split("/").filter(Boolean);
}

/**
 * Match a request's path segments against one route pattern's. Returns the
 * captured `:name` values in pattern order, or `null` for no match. A pattern
 * segment starting with `:` captures; every other segment must be equal.
 *
 * No two patterns in the table overlap: any two differ in segment count or in
 * a literal segment. Order therefore decides no match, and the OPTIONS branch
 * can collect every matching entry without risking two different routes.
 */
function match(segments: string[], parts: string[]): string[] | null {
  if (segments.length !== parts.length) return null;
  const params: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    if (s.startsWith(":")) params.push(parts[i]!);
    else if (s !== parts[i]) return null;
  }
  return params;
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

/** Minimum `AUTH_JWT_SECRET` length in encoded bytes: the HS256 (HMAC-SHA-256) output size, per RFC 7518 §3.2. */
const MIN_JWT_SECRET_BYTES = 32;

/**
 * Select the server's `ActorResolver` from `AUTH_JWT_SECRET` /
 * `AUTH_ISSUERS`: the JWT resolver if either is set, `devHeaderResolver`
 * otherwise. The two are never active simultaneously.
 *
 * Selecting `devHeaderResolver` when neither is set requires
 * `ALLOW_INSECURE_DEV_AUTH=1` — without it, startup fails loudly rather than
 * silently trusting unsigned `X-Actor-*` headers (design.md "Warn loudly and
 * return, rather than warn-only or throw-only").
 */
export function resolveAuthResolver(env: {
  AUTH_JWT_SECRET?: string;
  AUTH_ISSUERS?: string;
  ALLOW_INSECURE_DEV_AUTH?: string;
}): ActorResolver {
  const issuers = parseAuthIssuers(env.AUTH_ISSUERS);
  if (!env.AUTH_JWT_SECRET && !issuers) {
    if (env.ALLOW_INSECURE_DEV_AUTH === "1") {
      log.warn(
        "AUTH DISABLED: no AUTH_JWT_SECRET or AUTH_ISSUERS configured. Trusting X-Actor-Id / X-Actor-Roles headers verbatim because ALLOW_INSECURE_DEV_AUTH=1 is set. Do not run this way against real data.",
      );
      return devHeaderResolver;
    }
    throw new Error(
      "No authentication configured: set AUTH_JWT_SECRET or AUTH_ISSUERS, or set ALLOW_INSECURE_DEV_AUTH=1 to explicitly start without authentication",
    );
  }
  if (env.AUTH_JWT_SECRET && new TextEncoder().encode(env.AUTH_JWT_SECRET).length < MIN_JWT_SECRET_BYTES) {
    throw new Error(
      `AUTH_JWT_SECRET must encode to at least ${MIN_JWT_SECRET_BYTES} bytes (HS256 requires a key at least as long as its hash output) — generate one with \`openssl rand -base64 32\``,
    );
  }
  return jwtResolver({ localSecret: env.AUTH_JWT_SECRET, issuers });
}

/**
 * `resolver` has no default: every caller must pass one explicitly, so no
 * call site can reach `devHeaderResolver` — the non-production dev header
 * resolver — by omission. `startHttpServer`'s own parameter default calls
 * `resolveAuthResolver`, which selects it only under an explicit opt-in flag.
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
/**
 * `webRoot` is the directory a built frontend is served from, `undefined` for
 * none — then there is no static branch and every unmatched request keeps the
 * JSON 404. `startHttpServer` sources it from `WEB_ROOT` via `resolveWebRoot`.
 */
export function createServer(
  dataSourceRegistry: DataSourceRegistry,
  registry: Registry,
  db: SQL = sql,
  resolver: ActorResolver,
  allowedOrigins: AllowedOrigins = undefined,
  loginSecret: string | undefined = undefined,
  webRoot: string | undefined = undefined,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): (req: Request) => Promise<Response> {
  // `POST /auth/login` enters the table only when a signing key is
  // configured, so no state makes the login route reachable without one.
  // `secret` is a const so the narrowing survives into the closure. The
  // `loginSecret` parameter alone would not narrow there.
  const secret = loginSecret;
  const routes: Route[] = [
    ...(secret === undefined
      ? []
      : [{ method: "POST", segments: seg("/auth/login"),
           handler: (_p: string[], req: Request) => handleLogin(req, secret, db) } satisfies Route]),
    { method: "POST", segments: seg("/processes/:processId/instances"),
      handler: (p, req) => handleCreateInstance(p[0]!, req, resolver, dataSourceRegistry, db, assignmentRegistry) },
    { method: "GET", segments: seg("/instances"),
      handler: (_p, req) => handleListInstances(req, resolver, db) },
    { method: "GET", segments: seg("/instances/:instanceId"),
      handler: (p, req) => handleGetInstanceView(p[0]!, req, resolver, dataSourceRegistry, db) },
    { method: "POST", segments: seg("/instances/:instanceId/submit"),
      handler: (p, req) => handleSubmit(p[0]!, req, resolver, dataSourceRegistry, db, assignmentRegistry) },
    { method: "POST", segments: seg("/instances/:instanceId/claim"),
      handler: (p, req) => handleClaim(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/instances/:instanceId/release"),
      handler: (p, req) => handleRelease(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/instances/:instanceId/delegate"),
      handler: (p, req) => handleDelegate(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/instances/:instanceId/comments"),
      handler: (p, req) => handleListComments(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/instances/:instanceId/comments"),
      handler: (p, req) => handlePostComment(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/instances/:instanceId/attachments"),
      handler: (p, req) => handleListAttachments(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/instances/:instanceId/attachments"),
      handler: (p, req) => handleUploadAttachment(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/instances/:instanceId/attachments/:attachmentId"),
      handler: (p, req) => handleGetAttachment(p[0]!, p[1]!, req, resolver, db) },
    { method: "GET", segments: seg("/instances/:instanceId/record"),
      handler: (p, req) => handleInstanceRecord(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/instances/:instanceId/cancel"),
      handler: (p, req) => handleCancel(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/processes"),
      handler: (_p, req) => handleListProcesses(req, resolver, db) },
    { method: "POST", segments: seg("/processes"),
      handler: (_p, req) => handlePublish(req, resolver, registry, dataSourceRegistry, db, assignmentRegistry) },
    { method: "GET", segments: seg("/processes/:processId/versions"),
      handler: (p, req) => handleListVersions(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/admin/outbox"),
      handler: (_p, req) => handleAdminListOutbox(req, resolver, db) },
    { method: "POST", segments: seg("/admin/outbox/:idempotencyKey/retry"),
      handler: (p, req) => handleAdminOutboxRetry(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/admin/outbox/:idempotencyKey/discard"),
      handler: (p, req) => handleAdminOutboxDiscard(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/admin/timers"),
      handler: (_p, req) => handleAdminListTimers(req, resolver, db) },
    { method: "GET", segments: seg("/admin/users"),
      handler: (_p, req) => handleAdminListUsers(req, resolver, db) },
    { method: "POST", segments: seg("/admin/users/:userId/disable"),
      handler: (p, req) => handleAdminDisableUser(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/admin/users/:userId/enable"),
      handler: (p, req) => handleAdminEnableUser(p[0]!, req, resolver, db) },
    { method: "PATCH", segments: seg("/admin/users/:userId/roles"),
      handler: (p, req) => handleAdminSetUserRoles(p[0]!, req, resolver, db) },
    { method: "PATCH", segments: seg("/admin/users/:userId/manager"),
      handler: (p, req) => handleAdminSetUserManager(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/admin/migrations/run"),
      handler: (_p, req) => handleAdminRunMigration(req, resolver, db) },
    { method: "POST", segments: seg("/admin/instances/:instanceId/redact"),
      handler: (p, req) => handleAdminRedactInstance(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/admin/data-lists"),
      handler: (_p, req) => handleAdminListDataLists(req, resolver, db) },
    { method: "POST", segments: seg("/admin/data-lists"),
      handler: (_p, req) => handleAdminCreateDataList(req, resolver, db) },
    { method: "PUT", segments: seg("/admin/data-lists/:listKey/values"),
      handler: (p, req) => handleAdminPutDataListValues(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/admin/data-lists/:listKey"),
      handler: (p, req) => handleAdminGetDataList(p[0]!, req, resolver, db) },
    { method: "PUT", segments: seg("/admin/data-lists/:listKey"),
      handler: (p, req) => handleAdminUpdateDataList(p[0]!, req, resolver, db) },
    { method: "DELETE", segments: seg("/admin/data-lists/:listKey"),
      handler: (p, req) => handleAdminDeleteDataList(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/reporting/processes"),
      handler: (_p, req) => handleReportingListProcesses(req, resolver, db) },
    { method: "GET", segments: seg("/reporting/:processId/cycle-time"),
      handler: (p, req) => handleReportingCycleTime(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/reporting/:processId/bottleneck"),
      handler: (p, req) => handleReportingBottleneck(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/reporting/:processId/sla"),
      handler: (p, req) => handleReportingSla(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/drafts"),
      handler: (_p, req) => handleListDrafts(req, resolver, db) },
    { method: "GET", segments: seg("/drafts/:processId"),
      handler: (p, req) => handleGetDraft(p[0]!, req, resolver, db) },
    { method: "PUT", segments: seg("/drafts/:processId"),
      handler: (p, req) => handleSaveDraft(p[0]!, req, resolver, db) },
    { method: "DELETE", segments: seg("/drafts/:processId"),
      handler: (p, req) => handleDeleteDraft(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/drafts/:processId/publish"),
      handler: (p, req) => handlePublishDraft(p[0]!, req, resolver, registry, dataSourceRegistry, db, assignmentRegistry) },
    { method: "GET", segments: seg("/processes/:processId/versions/:version/orphan-keys"),
      handler: (p, req) => handleGetOrphanKeys(p[0]!, p[1]!, req, resolver, db) },
    { method: "GET", segments: seg("/processes/:processId/versions/:version"),
      handler: (p, req) => handleGetVersionBody(p[0]!, p[1]!, req, resolver, db) },
    { method: "GET", segments: seg("/migration-plans/:processId/:fromVersion/:toVersion"),
      handler: (p, req) => handleGetMigrationPlan(p[0]!, p[1]!, p[2]!, req, resolver, db) },
    { method: "PUT", segments: seg("/migration-plans/:processId/:fromVersion/:toVersion"),
      handler: (p, req) => handlePutMigrationPlan(p[0]!, p[1]!, p[2]!, req, resolver, db) },
    { method: "GET", segments: seg("/registry"),
      handler: (_p, req) => handleGetRegistry(req, resolver, registry, dataSourceRegistry, assignmentRegistry) },
  ];

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const origin = req.headers.get("Origin");
    const toRes = (result: HttpResult) => toResponse(result, allowedOrigins, origin);

    // A browser navigation is answered from the web root BEFORE route matching,
    // because an area's URL prefix can collide with an API prefix: the admin
    // area's /admin/outbox, /admin/timers and /admin/users screens have exactly
    // the paths of three GET admin routes. Only navigations take this path, so
    // an API caller's own fetch still reaches the route, unchanged. See
    // `static.ts::isNavigationRequest`.
    if (webRoot !== undefined && isNavigationRequest(req)) {
      const shell = serveWebAsset(req, url, webRoot);
      if (shell) return shell;
    }

    // GET /livez, GET /readyz: unauthenticated, no CORS handling — an
    // orchestrator's health probe is not a browser request. `toResponse`
    // is called with `undefined` origin config here, not `toRes`, so
    // neither route ever carries an Access-Control-* header, regardless of
    // the server's own CORS configuration (http-wrapper spec, "livez/readyz
    // ignore the CORS configuration").
    if (req.method === "GET" && parts.length === 1 && parts[0] === "livez") {
      return toResponse(await handleLivez(), undefined, null);
    }
    if (req.method === "GET" && parts.length === 1 && parts[0] === "readyz") {
      return toResponse(await handleReadyz(db), undefined, null);
    }
    if (req.method === "GET" && parts.length === 1 && parts[0] === "metrics") {
      return toBinaryResponse(await handleMetrics(db), undefined, null);
    }

    // The CORS preflight derives from the table: an OPTIONS request matches
    // by path alone, and the answer lists every method the table holds for
    // that pattern, in table order. There is no second per-route chain to
    // keep in sync. While one existed, the four /reporting/* routes went
    // unanswered because nobody added their branch to it.
    if (req.method === "OPTIONS") {
      const methods = routes.filter((r) => match(r.segments, parts) !== null).map((r) => r.method);
      if (methods.length > 0) return preflightResponse(methods.join(", "), allowedOrigins, origin);
    }

    for (const route of routes) {
      if (route.method !== req.method) continue;
      const params = match(route.segments, parts);
      if (params === null) continue;
      const result = await route.handler(params, req);
      // A successful attachment download is `HttpBinaryResult`, not a JSON
      // envelope. One check at this single exit covers that route and any
      // later one. See errors.ts, the `HttpBinaryResult` doc comment.
      if (isBinaryResult(result)) return toBinaryResponse(result, allowedOrigins, origin);
      return toRes(result);
    }

    // Static assets fall through here, behind every API route, so no URL prefix
    // is reserved and a later API route needs no special case. GET/HEAD only;
    // a decline keeps the JSON 404 below. See `static.ts`.
    if (webRoot !== undefined) {
      const asset = serveWebAsset(req, url, webRoot);
      if (asset) return asset;
    }

    return toRes({ status: 404, body: { error: { type: "not-found", message: `no route: ${req.method} ${url.pathname}` } } });
  };
}

// Sized to the largest plausible legitimate request — a definition or draft of
// a few megabytes — rather than Bun's 128 MiB default, which today is the
// only bound between an HTTP caller and persisted state: no route narrows it,
// saveDraft deliberately validates only its envelope, and a `file`- or
// plugin-typed field's submitted value passes the runtime type check with no
// size constraint an author could even declare. One declared value applies to
// every route — publish, draft save and submission alike.
export const MAX_REQUEST_BODY_SIZE = 8 * 1024 * 1024; // 8 MiB

/**
 * Async so the schema is created — `await initSchema(db)` — before
 * `Bun.serve` starts accepting requests; a fire-and-forget call here would
 * let requests race the DDL against a fresh database. Every statement in
 * `initSchema` is `CREATE ... IF NOT EXISTS`, so this is a no-op against a
 * database that already has the schema.
 */
export async function startHttpServer(
  registry: Registry,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
  resolver: ActorResolver = resolveAuthResolver({
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET,
    AUTH_ISSUERS: process.env.AUTH_ISSUERS,
    ALLOW_INSECURE_DEV_AUTH: process.env.ALLOW_INSECURE_DEV_AUTH,
  }),
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<{ stop: () => Promise<void> }> {
  await initSchema(db);
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const webRoot = resolveWebRoot(process.env.WEB_ROOT);
  const fetch = createServer(dataSourceRegistry, registry, db, resolver, allowedOrigins, process.env.AUTH_JWT_SECRET, webRoot, assignmentRegistry);
  const port = Number(process.env.PORT ?? 3000);
  const server = Bun.serve({ fetch, port, maxRequestBodySize: MAX_REQUEST_BODY_SIZE });
  const engine = startEngine(db, registry, assignmentRegistry);
  log.info("HTTP server listening", { port: server.port, webRoot: webRoot ?? null });
  return {
    // `server.stop()` with no argument is Bun's graceful form: it refuses new
    // connections at once and resolves once in-flight requests finish. The
    // pollers stop after that, so a request still being served can still
    // reach the workers it expects. `engine.stop()` is synchronous —
    // `pollForever` only clears a pending timeout.
    stop: async () => {
      await server.stop();
      engine.stop();
    },
  };
}

if (import.meta.main) {
  startHttpServer(createRegistry(), createDefaultDataSourceRegistry(sql))
    .then(({ stop }) => {
      // Registered here rather than in `startHttpServer`, which every test
      // calls: a listener per call would leak one per test file. This block
      // runs once, in the one long-lived process `bun run serve` starts.
      let shuttingDown = false;
      const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) return;
        shuttingDown = true;
        log.info("shutdown started", { signal });
        try {
          await stop();
          await sql.end();
        } catch (err) {
          // Exiting still beats hanging: an unclosed pool is what SIGKILL
          // would have left behind anyway, and a supervisor waiting out its
          // grace period is the failure this whole path exists to remove.
          log.error("shutdown did not complete cleanly", { error: err instanceof Error ? err.message : String(err) });
        }
        log.info("shutdown complete", { signal });
        process.exit(0);
      };
      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
