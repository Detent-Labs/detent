/**
 * `Bun.serve`-compatible wiring around `routes.ts`'s framework-agnostic
 * handlers. `createServer` returns a plain `fetch(req): Promise<Response>`,
 * so tests can call it directly with `new Request(...)` — no real port. Low
 * lock-in by design: a later framework swap (e.g. Hono) would only rewrite
 * this file, not `routes.ts`/`errors.ts`. See design.md "Framework choice".
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
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const origin = req.headers.get("Origin");
    const toRes = (result: HttpResult) => toResponse(result, allowedOrigins, origin);
    const preflight = (methods: string) => preflightResponse(methods, allowedOrigins, origin);

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
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "delegate") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "comments") {
      return preflight("GET, POST");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "instances" && parts[2] === "attachments") {
      return preflight("GET, POST");
    }
    if (req.method === "OPTIONS" && parts.length === 4 && parts[0] === "instances" && parts[2] === "attachments") {
      return preflight("GET");
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
    if (req.method === "OPTIONS" && parts.length === 4 && parts[0] === "admin" && parts[1] === "users" && parts[3] === "roles") {
      return preflight("PATCH");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "admin" && parts[1] === "migrations" && parts[2] === "run") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 4 && parts[0] === "admin" && parts[1] === "instances" && parts[3] === "redact") {
      return preflight("POST");
    }
    if (req.method === "OPTIONS" && parts.length === 2 && parts[0] === "admin" && parts[1] === "data-lists") {
      return preflight("GET, POST");
    }
    if (req.method === "OPTIONS" && parts.length === 4 && parts[0] === "admin" && parts[1] === "data-lists" && parts[3] === "values") {
      return preflight("PUT");
    }
    if (req.method === "OPTIONS" && parts.length === 3 && parts[0] === "admin" && parts[1] === "data-lists") {
      return preflight("GET, PUT, DELETE");
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
    if (req.method === "OPTIONS" && parts.length === 1 && parts[0] === "registry") {
      return preflight("GET");
    }

    // POST /auth/login
    if (loginSecret && req.method === "POST" && parts.length === 2 && parts[0] === "auth" && parts[1] === "login") {
      return toRes(await handleLogin(req, loginSecret, db));
    }
    // POST /processes/:processId/instances
    if (req.method === "POST" && parts.length === 3 && parts[0] === "processes" && parts[2] === "instances") {
      return toRes(await handleCreateInstance(parts[1]!, req, resolver, dataSourceRegistry, db, assignmentRegistry));
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
      return toRes(await handleSubmit(parts[1]!, req, resolver, dataSourceRegistry, db, assignmentRegistry));
    }
    // POST /instances/:instanceId/claim
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "claim") {
      return toRes(await handleClaim(parts[1]!, req, resolver, db));
    }
    // POST /instances/:instanceId/release
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "release") {
      return toRes(await handleRelease(parts[1]!, req, resolver, db));
    }
    // POST /instances/:instanceId/delegate
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "delegate") {
      return toRes(await handleDelegate(parts[1]!, req, resolver, db));
    }
    // POST /instances/:instanceId/comments
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "comments") {
      return toRes(await handlePostComment(parts[1]!, req, resolver, db));
    }
    // GET /instances/:instanceId/comments
    if (req.method === "GET" && parts.length === 3 && parts[0] === "instances" && parts[2] === "comments") {
      return toRes(await handleListComments(parts[1]!, req, resolver, db));
    }
    // POST /instances/:instanceId/attachments
    if (req.method === "POST" && parts.length === 3 && parts[0] === "instances" && parts[2] === "attachments") {
      return toRes(await handleUploadAttachment(parts[1]!, req, resolver, db));
    }
    // GET /instances/:instanceId/attachments
    if (req.method === "GET" && parts.length === 3 && parts[0] === "instances" && parts[2] === "attachments") {
      return toRes(await handleListAttachments(parts[1]!, req, resolver, db));
    }
    // GET /instances/:instanceId/attachments/:attachmentId — not through the
    // shared `toRes`: a successful download is `HttpBinaryResult`, not JSON.
    // See design.md's "server.ts's shared toRes cannot handle this one route
    // unchanged" (add-instance-attachments).
    if (req.method === "GET" && parts.length === 4 && parts[0] === "instances" && parts[2] === "attachments") {
      const result = await handleGetAttachment(parts[1]!, parts[3]!, req, resolver, db);
      if (isBinaryResult(result)) return toBinaryResponse(result, allowedOrigins, origin);
      return toRes(result);
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
      return toRes(await handlePublish(req, resolver, registry, dataSourceRegistry, db, assignmentRegistry));
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
    // PATCH /admin/users/:id/roles
    if (req.method === "PATCH" && parts.length === 4 && parts[0] === "admin" && parts[1] === "users" && parts[3] === "roles") {
      return toRes(await handleAdminSetUserRoles(parts[2]!, req, resolver, db));
    }
    // PATCH /admin/users/:id/manager
    if (req.method === "PATCH" && parts.length === 4 && parts[0] === "admin" && parts[1] === "users" && parts[3] === "manager") {
      return toRes(await handleAdminSetUserManager(parts[2]!, req, resolver, db));
    }
    // POST /admin/migrations/run
    if (req.method === "POST" && parts.length === 3 && parts[0] === "admin" && parts[1] === "migrations" && parts[2] === "run") {
      return toRes(await handleAdminRunMigration(req, resolver, db));
    }
    // POST /admin/instances/:id/redact
    if (req.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "instances" && parts[3] === "redact") {
      return toRes(await handleAdminRedactInstance(parts[2]!, req, resolver, db));
    }
    // GET /admin/data-lists
    if (req.method === "GET" && parts.length === 2 && parts[0] === "admin" && parts[1] === "data-lists") {
      return toRes(await handleAdminListDataLists(req, resolver, db));
    }
    // POST /admin/data-lists
    if (req.method === "POST" && parts.length === 2 && parts[0] === "admin" && parts[1] === "data-lists") {
      return toRes(await handleAdminCreateDataList(req, resolver, db));
    }
    // PUT /admin/data-lists/:listKey/values
    if (req.method === "PUT" && parts.length === 4 && parts[0] === "admin" && parts[1] === "data-lists" && parts[3] === "values") {
      return toRes(await handleAdminPutDataListValues(parts[2]!, req, resolver, db));
    }
    // GET /admin/data-lists/:listKey
    if (req.method === "GET" && parts.length === 3 && parts[0] === "admin" && parts[1] === "data-lists") {
      return toRes(await handleAdminGetDataList(parts[2]!, req, resolver, db));
    }
    // PUT /admin/data-lists/:listKey
    if (req.method === "PUT" && parts.length === 3 && parts[0] === "admin" && parts[1] === "data-lists") {
      return toRes(await handleAdminUpdateDataList(parts[2]!, req, resolver, db));
    }
    // DELETE /admin/data-lists/:listKey
    if (req.method === "DELETE" && parts.length === 3 && parts[0] === "admin" && parts[1] === "data-lists") {
      return toRes(await handleAdminDeleteDataList(parts[2]!, req, resolver, db));
    }
    // GET /reporting/processes
    if (req.method === "GET" && parts.length === 2 && parts[0] === "reporting" && parts[1] === "processes") {
      return toRes(await handleReportingListProcesses(req, resolver, db));
    }
    // GET /reporting/:processId/cycle-time
    if (req.method === "GET" && parts.length === 3 && parts[0] === "reporting" && parts[2] === "cycle-time") {
      return toRes(await handleReportingCycleTime(parts[1]!, req, resolver, db));
    }
    // GET /reporting/:processId/bottleneck
    if (req.method === "GET" && parts.length === 3 && parts[0] === "reporting" && parts[2] === "bottleneck") {
      return toRes(await handleReportingBottleneck(parts[1]!, req, resolver, db));
    }
    // GET /reporting/:processId/sla
    if (req.method === "GET" && parts.length === 3 && parts[0] === "reporting" && parts[2] === "sla") {
      return toRes(await handleReportingSla(parts[1]!, req, resolver, db));
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
      return toRes(await handlePublishDraft(parts[1]!, req, resolver, registry, dataSourceRegistry, db, assignmentRegistry));
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
    // GET /registry
    if (req.method === "GET" && parts.length === 1 && parts[0] === "registry") {
      return toRes(await handleGetRegistry(req, resolver, registry, dataSourceRegistry, assignmentRegistry));
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
): Promise<{ stop: () => void }> {
  await initSchema(db);
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const webRoot = resolveWebRoot(process.env.WEB_ROOT);
  const fetch = createServer(dataSourceRegistry, registry, db, resolver, allowedOrigins, process.env.AUTH_JWT_SECRET, webRoot, assignmentRegistry);
  const port = Number(process.env.PORT ?? 3000);
  const server = Bun.serve({ fetch, port, maxRequestBodySize: MAX_REQUEST_BODY_SIZE });
  const engine = startEngine(db, registry, assignmentRegistry);
  log.info("HTTP server listening", { port: server.port, webRoot: webRoot ?? null });
  return {
    stop: () => {
      server.stop();
      engine.stop();
    },
  };
}

if (import.meta.main) {
  startHttpServer(createRegistry(), createDefaultDataSourceRegistry(sql)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
