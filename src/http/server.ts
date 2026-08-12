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
import { SQL, type Server } from "bun";
import { timingSafeEqual } from "node:crypto";
import { sql, initSchema } from "../engine/store.js";
import { startEngine, createDefaultRegistry, createDefaultDataSourceRegistry } from "../engine/host.js";
import { type Registry, type DataSourceRegistry, type AssignmentRegistry } from "../engine/registry.js";
// The org-aware set (static + org.manager-of-starter), not the static-only leaf
// factory of the same name in registry.js. This is the composition root.
import { createDefaultAssignmentRegistry } from "../engine/assignment-strategies.js";
import { devHeaderResolver, type ActorResolver } from "../auth/resolve.js";
import { serveWebAsset, resolveWebRoot, isNavigationRequest } from "./static.js";
import { jwtResolver, type IssuerConfig } from "../auth/jwt.js";
import { handleLogin } from "../auth/login.js";
import { isActiveUser } from "../auth/users.js";
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
  handleAdminCreateUser,
  handleAdminSetUserPassword,
  handleAdminDisableUser,
  handleAdminEnableUser,
  handleAdminSetUserRoles,
  handleAdminSetUserManager,
  handleAdminSetUserName,
  handleAdminRunMigration,
  handleAdminRedactInstance,
  handleAdminListDataLists,
  handleAdminCreateDataList,
  handleAdminGetDataList,
  handleAdminUpdateDataList,
  handleAdminPutDataListValues,
  handleAdminDeleteDataList,
  handleAdminListUiStrings,
  handleAdminPutUiString,
} from "./admin-routes.js";
import { handleGetAccount, handlePatchAccount } from "./account-routes.js";
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
  handleListTemplates,
  handleGetTemplate,
  handleSaveTemplate,
  handleDeleteTemplate,
} from "./studio-routes.js";
import { handleGetUiStrings } from "./ui-strings-routes.js";
import { handleLivez, handleReadyz } from "./health.js";
import { handleMetrics } from "./metrics.js";
import type { HttpResult, HttpBinaryResult } from "./errors.js";
import { log } from "../log.js";

/**
 * Bun's `Server`, with its WebSocket payload type filled in. `Bun.serve` is
 * called here with a `fetch` handler and no `websocket`, so that payload is
 * `undefined`. Only `requestIP` is read off it.
 */
type BunServer = Server<undefined>;

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
    // Nearly every envelope this wrapper returns is actor-scoped, and an
    // instance view or a comment list holds data a participant supplied. No
    // intermediary may keep a copy. One header here covers every route, success
    // and error alike; a per-route opt-out list would drift, as the
    // hand-written preflight chain did before the route table replaced it.
    // `GET /ui-strings` is the one envelope that is not actor-scoped and would
    // not need this. It keeps the header anyway, for that same drift reason,
    // and it costs one uncached fetch per page load.
    headers: { "content-type": "application/json", "Cache-Control": "no-store", ...corsHeaders(allowed, requestOrigin) },
  });
}

/** True for `handleGetAttachment`'s success shape, `HttpBinaryResult` — the one route response that is not a JSON envelope. See errors.ts's `HttpBinaryResult` doc comment. */
function isBinaryResult(result: HttpBinaryResult | HttpResult): result is HttpBinaryResult {
  return "contentType" in result;
}

/**
 * `nosniff` goes on every binary response: it costs a scrape nothing and holds
 * for any later binary route. `Content-Disposition` goes only on a result
 * carrying a `filename`, which is the attachment download alone — a download
 * header on a metrics scrape would be wrong.
 *
 * The filename is percent-encoded. A stored filename holds up to 255
 * characters of any kind, a quote and a CR among them, and encoding settles
 * the header-injection question rather than answering it per character.
 */
function toBinaryResponse({ status, contentType, data, filename }: HttpBinaryResult, allowed: AllowedOrigins, requestOrigin: string | null): Response {
  const disposition = filename === undefined
    ? {}
    : { "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"` };
  return new Response(data, {
    status,
    headers: {
      "content-type": contentType,
      "X-Content-Type-Options": "nosniff",
      ...disposition,
      ...corsHeaders(allowed, requestOrigin),
    },
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
  /**
   * `clientAddress` is the third argument every entry receives and only the
   * login route reads. TypeScript lets a closure declare fewer parameters, so
   * no other entry mentions it. The alternative — a special case for the login
   * path inside the request loop — puts one route's business in the router.
   *
   * `db` is the fourth, and the dispatcher resolves it per request: in SaaS
   * mode from the caller's own tenant, otherwise the process handle. It follows
   * `clientAddress`'s pattern, so a route needing no database declares three
   * parameters.
   *
   * The enclosing parameter is named `processDb`, not `db`, on purpose. A
   * closure that forgot to declare this one would otherwise capture the
   * construction-time handle, compile, and read the wrong tenant in silence.
   * With the names split, forgetting is a compile error.
   */
  handler: (
    params: string[],
    req: Request,
    clientAddress: string | undefined,
    db: SQL,
  ) => Promise<HttpResult | HttpBinaryResult>;
};

/**
 * The declared list of routes that return stored bytes (`HttpBinaryResult`)
 * rather than a JSON envelope. `isBinaryResult` decides binary-ness per
 * response, at runtime, inside each handler — no static walk of `routes` can
 * read it back out. A person keeps this list in sync by hand instead, the
 * same discipline `admin-routing.test.ts`'s own route list needs. A route
 * added outside it needs that same person to add the entry here.
 *
 * `filename: true` sends `Content-Disposition: attachment`
 * (`toBinaryResponse`); `filename: false` is a scrape with no filename to
 * disclose. `test/http-disposition.test.ts` drives every entry.
 */
export const BINARY_ROUTES: { method: string; pattern: string; filename: boolean }[] = [
  { method: "GET", pattern: "/instances/:instanceId/attachments/:attachmentId", filename: true },
  { method: "GET", pattern: "/metrics", filename: false },
];

/**
 * The address the per-source login window counts against, or `undefined` when
 * the server can determine none. Then that window does not apply and the
 * per-email one still does (`local-user-accounts` spec).
 *
 * `X-Forwarded-For` is read only under `TRUST_PROXY=1`: any caller can send
 * that header, so trusting it by default would let one pick their own bucket
 * per request. Only the deployment knows whether a proxy in front of the
 * engine controls it.
 *
 * The header holds a comma-separated list, and the LAST entry is the one read.
 * A proxy that appends rather than overwrites leaves whatever the caller sent
 * in front of its own entry, so reading the first would hand the key back to
 * the attacker. A header the proxy overwrites holds one entry, where first and
 * last are the same value.
 */
export function clientAddressOf(req: Request, server: BunServer | undefined, trustProxy: boolean): string | undefined {
  if (trustProxy) {
    const last = req.headers.get("X-Forwarded-For")?.split(",").pop()?.trim();
    // No header under TRUST_PROXY means the caller reached this process without
    // passing the proxy. The peer is then the caller, not the proxy, so falling
    // back to it counts that request rather than exempting it from the window.
    if (last) return last;
  }
  return server?.requestIP(req)?.address ?? undefined;
}

/** Split a route pattern into segments. Runs once per route, when `createServer` builds the table. */
function seg(pattern: string): string[] {
  return pattern.split("/").filter(Boolean);
}

/**
 * True when `header` carries exactly `expected` as a bearer token.
 *
 * The compare is constant time, so a wrong token leaks no prefix. The length
 * check that precedes it is not an optimization: `timingSafeEqual` throws a
 * `RangeError` on buffers of different length, which is the ordinary
 * wrong-token case, and an unhandled raise would turn the 401 into a 500. A
 * length difference is observable either way, and the constant-time property
 * never covered length.
 */
function bearerTokenMatches(header: string | null, expected: string): boolean {
  if (header === null) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const presented = Buffer.from(header.slice(prefix.length));
  const secret = Buffer.from(expected);
  if (presented.length !== secret.length) return false;
  return timingSafeEqual(presented, secret);
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
 *
 * This is the only place the production resolver is built, so it is the place
 * that gives it the account lookup: without that, `jwtResolver`'s directory
 * check would be a capability nothing uses. `devHeaderResolver` gets none —
 * that path reads no token at all, and the flag guarding it already means no
 * authentication.
 */
export function resolveAuthResolver(
  env: {
    AUTH_JWT_SECRET?: string;
    AUTH_ISSUERS?: string;
    ALLOW_INSECURE_DEV_AUTH?: string;
  },
): ActorResolver {
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
  return jwtResolver({
    localSecret: env.AUTH_JWT_SECRET,
    issuers,
    // `db` arrives per call: an actor's liveness is a fact of that actor's own
    // tenant, and a handle bound here would check one directory for every tenant.
    isActiveAccount: (userId, db) => isActiveUser(userId, db),
  });
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
  processDb: SQL = sql,
  resolver: ActorResolver,
  allowedOrigins: AllowedOrigins = undefined,
  loginSecret: string | undefined = undefined,
  webRoot: string | undefined = undefined,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): (req: Request, server?: BunServer) => Promise<Response> {
  // `POST /auth/login` enters the table only when a signing key is
  // configured, so no state makes the login route reachable without one.
  // `secret` is a const so the narrowing survives into the closure. The
  // `loginSecret` parameter alone would not narrow there.
  const secret = loginSecret;
  // Read once, at construction, so one scrape cannot see a different value
  // from the next. An empty string counts as unset: a deployment that exports
  // METRICS_TOKEN= has configured no token.
  const rawMetricsToken = process.env.METRICS_TOKEN;
  const metricsToken = rawMetricsToken ? rawMetricsToken : undefined;
  // Read once, at construction, for the same reason `metricsToken` is: one
  // request cannot see a different value from the next.
  const trustProxy = process.env.TRUST_PROXY === "1";
  const routes: Route[] = [
    ...(secret === undefined
      ? []
      : [{ method: "POST", segments: seg("/auth/login"),
           handler: (_p: string[], req: Request, clientAddress: string | undefined, db: SQL) => handleLogin(req, secret, db, clientAddress) } satisfies Route]),
    // Resolves no actor and requires no role, the way `POST /auth/login` above
    // does: the login screen renders before a token exists, so its own wording
    // must be fetchable without one. It belongs in this table rather than
    // beside /livez and /readyz, which answer with no CORS headers on purpose.
    // This one is a browser fetch, and API_BASE reads VITE_API_URL, so a
    // deployment may serve the bundle from a second origin. The OPTIONS
    // preflight answer is derived from this table too, so a route outside it
    // gets none.
    { method: "GET", segments: seg("/ui-strings"),
      handler: (_p, _req, _c, db) => handleGetUiStrings(_req, db) },
    { method: "POST", segments: seg("/processes/:processId/instances"),
      handler: (p, req, _c, db) => handleCreateInstance(p[0]!, req, resolver, dataSourceRegistry, db, assignmentRegistry) },
    { method: "GET", segments: seg("/instances"),
      handler: (_p, req, _c, db) => handleListInstances(req, resolver, db) },
    { method: "GET", segments: seg("/instances/:instanceId"),
      handler: (p, req, _c, db) => handleGetInstanceView(p[0]!, req, resolver, dataSourceRegistry, db) },
    { method: "POST", segments: seg("/instances/:instanceId/submit"),
      handler: (p, req, _c, db) => handleSubmit(p[0]!, req, resolver, dataSourceRegistry, db, assignmentRegistry) },
    { method: "POST", segments: seg("/instances/:instanceId/claim"),
      handler: (p, req, _c, db) => handleClaim(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/instances/:instanceId/release"),
      handler: (p, req, _c, db) => handleRelease(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/instances/:instanceId/delegate"),
      handler: (p, req, _c, db) => handleDelegate(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/instances/:instanceId/comments"),
      handler: (p, req, _c, db) => handleListComments(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/instances/:instanceId/comments"),
      handler: (p, req, _c, db) => handlePostComment(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/instances/:instanceId/attachments"),
      handler: (p, req, _c, db) => handleListAttachments(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/instances/:instanceId/attachments"),
      handler: (p, req, _c, db) => handleUploadAttachment(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/instances/:instanceId/attachments/:attachmentId"),
      handler: (p, req, _c, db) => handleGetAttachment(p[0]!, p[1]!, req, resolver, db) },
    { method: "GET", segments: seg("/instances/:instanceId/record"),
      handler: (p, req, _c, db) => handleInstanceRecord(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/instances/:instanceId/cancel"),
      handler: (p, req, _c, db) => handleCancel(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/processes"),
      handler: (_p, req, _c, db) => handleListProcesses(req, resolver, db) },
    { method: "POST", segments: seg("/processes"),
      handler: (_p, req, _c, db) => handlePublish(req, resolver, registry, dataSourceRegistry, db, assignmentRegistry) },
    { method: "GET", segments: seg("/processes/:processId/versions"),
      handler: (p, req, _c, db) => handleListVersions(p[0]!, req, resolver, db) },
    // Self-scoped: resolves an actor, checks no role, and takes no id. The
    // shell page that calls these sits at /profile, a path this table holds no
    // entry for, so a browser navigation there reaches the bundle rather than
    // an API answer.
    { method: "GET", segments: seg("/account/me"),
      handler: (_p, req, _c, db) => handleGetAccount(req, resolver, db) },
    { method: "PATCH", segments: seg("/account/me"),
      handler: (_p, req, _c, db) => handlePatchAccount(req, resolver, db) },
    { method: "GET", segments: seg("/admin/outbox"),
      handler: (_p, req, _c, db) => handleAdminListOutbox(req, resolver, db) },
    { method: "POST", segments: seg("/admin/outbox/:idempotencyKey/retry"),
      handler: (p, req, _c, db) => handleAdminOutboxRetry(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/admin/outbox/:idempotencyKey/discard"),
      handler: (p, req, _c, db) => handleAdminOutboxDiscard(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/admin/timers"),
      handler: (_p, req, _c, db) => handleAdminListTimers(req, resolver, db) },
    { method: "GET", segments: seg("/admin/users"),
      handler: (_p, req, _c, db) => handleAdminListUsers(req, resolver, db) },
    { method: "POST", segments: seg("/admin/users"),
      handler: (_p, req, _c, db) => handleAdminCreateUser(req, resolver, db) },
    { method: "POST", segments: seg("/admin/users/:userId/password"),
      handler: (p, req, _c, db) => handleAdminSetUserPassword(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/admin/users/:userId/disable"),
      handler: (p, req, _c, db) => handleAdminDisableUser(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/admin/users/:userId/enable"),
      handler: (p, req, _c, db) => handleAdminEnableUser(p[0]!, req, resolver, db) },
    { method: "PATCH", segments: seg("/admin/users/:userId/roles"),
      handler: (p, req, _c, db) => handleAdminSetUserRoles(p[0]!, req, resolver, db) },
    { method: "PATCH", segments: seg("/admin/users/:userId/manager"),
      handler: (p, req, _c, db) => handleAdminSetUserManager(p[0]!, req, resolver, db) },
    { method: "PATCH", segments: seg("/admin/users/:userId/name"),
      handler: (p, req, _c, db) => handleAdminSetUserName(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/admin/migrations/run"),
      handler: (_p, req, _c, db) => handleAdminRunMigration(req, resolver, db) },
    { method: "POST", segments: seg("/admin/instances/:instanceId/redact"),
      handler: (p, req, _c, db) => handleAdminRedactInstance(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/admin/data-lists"),
      handler: (_p, req, _c, db) => handleAdminListDataLists(req, resolver, db) },
    { method: "POST", segments: seg("/admin/data-lists"),
      handler: (_p, req, _c, db) => handleAdminCreateDataList(req, resolver, db) },
    { method: "PUT", segments: seg("/admin/data-lists/:listKey/values"),
      handler: (p, req, _c, db) => handleAdminPutDataListValues(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/admin/data-lists/:listKey"),
      handler: (p, req, _c, db) => handleAdminGetDataList(p[0]!, req, resolver, db) },
    { method: "PUT", segments: seg("/admin/data-lists/:listKey"),
      handler: (p, req, _c, db) => handleAdminUpdateDataList(p[0]!, req, resolver, db) },
    { method: "DELETE", segments: seg("/admin/data-lists/:listKey"),
      handler: (p, req, _c, db) => handleAdminDeleteDataList(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/admin/ui-strings"),
      handler: (_p, req, _c, db) => handleAdminListUiStrings(req, resolver, db) },
    { method: "PUT", segments: seg("/admin/ui-strings"),
      handler: (_p, req, _c, db) => handleAdminPutUiString(req, resolver, db) },
    { method: "GET", segments: seg("/reporting/processes"),
      handler: (_p, req, _c, db) => handleReportingListProcesses(req, resolver, db) },
    { method: "GET", segments: seg("/reporting/:processId/cycle-time"),
      handler: (p, req, _c, db) => handleReportingCycleTime(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/reporting/:processId/bottleneck"),
      handler: (p, req, _c, db) => handleReportingBottleneck(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/reporting/:processId/sla"),
      handler: (p, req, _c, db) => handleReportingSla(p[0]!, req, resolver, db) },
    { method: "GET", segments: seg("/drafts"),
      handler: (_p, req, _c, db) => handleListDrafts(req, resolver, db) },
    { method: "GET", segments: seg("/drafts/:processId"),
      handler: (p, req, _c, db) => handleGetDraft(p[0]!, req, resolver, db) },
    { method: "PUT", segments: seg("/drafts/:processId"),
      handler: (p, req, _c, db) => handleSaveDraft(p[0]!, req, resolver, db) },
    { method: "DELETE", segments: seg("/drafts/:processId"),
      handler: (p, req, _c, db) => handleDeleteDraft(p[0]!, req, resolver, db) },
    { method: "POST", segments: seg("/drafts/:processId/publish"),
      handler: (p, req, _c, db) => handlePublishDraft(p[0]!, req, resolver, registry, dataSourceRegistry, db, assignmentRegistry) },
    { method: "GET", segments: seg("/processes/:processId/versions/:version/orphan-keys"),
      handler: (p, req, _c, db) => handleGetOrphanKeys(p[0]!, p[1]!, req, resolver, db) },
    { method: "GET", segments: seg("/processes/:processId/versions/:version"),
      handler: (p, req, _c, db) => handleGetVersionBody(p[0]!, p[1]!, req, resolver, db) },
    { method: "GET", segments: seg("/migration-plans/:processId/:fromVersion/:toVersion"),
      handler: (p, req, _c, db) => handleGetMigrationPlan(p[0]!, p[1]!, p[2]!, req, resolver, db) },
    { method: "PUT", segments: seg("/migration-plans/:processId/:fromVersion/:toVersion"),
      handler: (p, req, _c, db) => handlePutMigrationPlan(p[0]!, p[1]!, p[2]!, req, resolver, db) },
    { method: "GET", segments: seg("/registry"),
      handler: (_p, req, _c, db) => handleGetRegistry(req, resolver, registry, dataSourceRegistry, db, assignmentRegistry) },
    { method: "GET", segments: seg("/templates"),
      handler: (_p, req, _c, db) => handleListTemplates(req, resolver, db) },
    { method: "GET", segments: seg("/templates/:templateKey"),
      handler: (p, req, _c, db) => handleGetTemplate(p[0]!, req, resolver, db) },
    { method: "PUT", segments: seg("/templates/:templateKey"),
      handler: (p, req, _c, db) => handleSaveTemplate(p[0]!, req, resolver, db) },
    { method: "DELETE", segments: seg("/templates/:templateKey"),
      handler: (p, req, _c, db) => handleDeleteTemplate(p[0]!, req, resolver, db) },
  ];

  // `server` is Bun's second fetch-handler argument, and it is optional because
  // every existing test invokes this handler with a `Request` alone. Absent, no
  // peer address is available and the per-source login window does not apply.
  return async (req: Request, server?: BunServer): Promise<Response> => {
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
      return toResponse(await handleReadyz(processDb), undefined, null);
    }
    // GET /metrics: registered only when METRICS_TOKEN holds a value, so a
    // default deployment exposes nothing. Unset follows CORS_ALLOWED_ORIGINS,
    // where unset permits nothing, and the login route, which the table
    // registers conditionally. A scrape carries no actor identity, so this is
    // a shared bearer token rather than a role: resolving ADMIN_ROLE through
    // the ordinary resolver would put a full-permission credential in a scrape
    // config. The two probes stay open — a probe answers from process state or
    // one cheap query, while a scrape runs three aggregates over live tables.
    if (metricsToken !== undefined && req.method === "GET" && parts.length === 1 && parts[0] === "metrics") {
      if (!bearerTokenMatches(req.headers.get("Authorization"), metricsToken)) {
        return toResponse({ status: 401, body: { error: { type: "actor-resolution", message: "GET /metrics requires a bearer token equal to METRICS_TOKEN" } } }, undefined, null);
      }
      return toBinaryResponse(await handleMetrics(processDb), undefined, null);
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
      const result = await route.handler(params, req, clientAddressOf(req, server, trustProxy), processDb);
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
  // The resolver binds no database of its own: its account lookup takes the
  // handle of the request being resolved, so it reads that actor's own tenant.
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
  startHttpServer(createDefaultRegistry(), createDefaultDataSourceRegistry())
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
