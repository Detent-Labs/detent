/**
 * Framework-agnostic route handlers: `(parsed request) -> Runtime API call ->
 * {status, body}`. No `Request`/`Response` construction — `server.ts` does
 * path/method matching and translates the returned `{status, body}` into a
 * real `Response`. Each handler never throws: every Runtime API Layer error
 * is caught and mapped via `errors.ts`.
 */
import type { SQL } from "bun";
import {
  AutomaticCascadeLoop,
  createProcessInstance,
  getInstanceView,
  submitAndTransition,
  saveInstanceDraft,
  claimStep,
  releaseClaim,
  delegateClaim,
  listInstances,
  getInstanceRecord,
  cancelInstance,
  postComment,
  listComments,
  uploadAttachment,
  listAttachments,
  getAttachment,
  MAX_LIST_LIMIT,
  MAX_RECORD_LIMIT,
  type InstanceListFilter,
} from "../runtime/api.js";
import { publishBody, listProcesses, listVersions } from "../engine/definitions.js";
import { instanceStatus } from "../schema/definition.js";
import type { Actor } from "../cel/eval.js";
import type { ActorResolver } from "../auth/resolve.js";
import { requireRole, requirePermission, ADMIN_ROLE } from "../auth/authorize.js";
import {
  type Registry,
  type DataSourceRegistry,
  type AssignmentRegistry,
} from "../engine/registry.js";
// The org-aware set (static + org.manager-of-starter), not the static-only leaf
// factory of the same name in registry.js. This is the composition root.
import { createDefaultAssignmentRegistry } from "../engine/assignment-strategies.js";
import type { Instance, PathId, ProcessId, InstanceId, StepId, ProcessBody } from "../schema/definition.js";
import { mapError, RequestShapeError, type HttpResult, type HttpBinaryResult, type ErrorContext } from "./errors.js";
import { z } from "zod";

/**
 * Shallow envelope schemas for the two routes that used to cast an unchecked
 * `req.json()` result (`api.ts:59`/`:89` before this change). Deliberately
 * loose on `data`: field-level validation is `validateSubmissionData`'s job,
 * so duplicating it here would create two places to change a rule — see
 * design.md "Zod for the two request bodies, not hand-written checks".
 */
const createInstanceBodySchema = z.object({
  version: z.number().int().positive().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
const delegateBodySchema = z.object({
  toActorId: z.string().min(1),
});
// 10,000 characters is a round, generous bound for a free-text note — see
// design.md "Text validation lives at the HTTP boundary only" for why it has
// no narrower precedent to match (the MAX_*_LENGTH constants in
// schema/compile.ts bound authored process-definition strings, a different
// concern from runtime user text).
const MAX_COMMENT_LENGTH = 10_000;
const commentBodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
});
// 5 MB, not the source design's original 10 MB: base64-encoded that stays
// near 6.7 MB, comfortably under server.ts's MAX_REQUEST_BODY_SIZE (8 MiB).
// Raising this past roughly three-quarters of MAX_REQUEST_BODY_SIZE makes
// uploads fail at the Bun.serve layer instead of with this route's own
// RequestShapeError — see design.md's "MAX_ATTACHMENT_BYTES must stay under
// MAX_REQUEST_BODY_SIZE" (add-instance-attachments).
const DEFAULT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/**
 * `MAX_ATTACHMENT_BYTES`, read once at module load. A set-but-invalid value
 * throws instead of resolving to `NaN`: every comparison against `NaN` is
 * false, so `"5MB"` used to remove the limit it was meant to tighten. Follows
 * `parseRetentionDays` in `engine/host.ts`.
 *
 * Exported for the test that asserts the throw. Nothing else calls it.
 */
export function parseMaxAttachmentBytes(raw: string | undefined = process.env.MAX_ATTACHMENT_BYTES): number {
  if (raw === undefined) return DEFAULT_MAX_ATTACHMENT_BYTES;
  const bytes = Number(raw);
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error(`MAX_ATTACHMENT_BYTES must be a positive integer, got '${raw}'`);
  }
  return bytes;
}
const MAX_ATTACHMENT_BYTES = parseMaxAttachmentBytes();
const MAX_ATTACHMENT_NAME_LENGTH = 255;
/**
 * One MIME type and subtype joined by `/`, each half a RFC 2045 token subset.
 * Parameters do not pass: `text/html; charset=utf-8` fails, and so does any
 * value holding a CR or an LF. The download route echoes this value into a
 * response header, where a CR would make `new Response()` throw and turn a
 * download into a 500.
 */
const MIME_TOKEN_PAIR = /^[A-Za-z0-9][A-Za-z0-9.+_-]*\/[A-Za-z0-9][A-Za-z0-9.+_-]*$/;
const attachmentBodySchema = z.object({
  filename: z.string().min(1).max(MAX_ATTACHMENT_NAME_LENGTH),
  contentType: z.string().min(1).max(MAX_ATTACHMENT_NAME_LENGTH).regex(MIME_TOKEN_PAIR),
  dataBase64: z.string().min(1),
});
const submitBodySchema = z.object({
  pathId: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
});
const instanceDraftBodySchema = z.object({
  data: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Decodes `req`'s JSON body, raising `RequestShapeError` (400) when it is not
 * valid JSON. Does not check the decoded value's shape — a caller that needs
 * that guarantee keeps its own runtime check or parses the result against a
 * schema. The same rule already governs `guarded`, `errorContext`,
 * `resolveActor` and `parseLimit`.
 *
 * Exported: `admin-routes.ts`, `studio-routes.ts` and `account-routes.ts`
 * import it. Each wrote this block by hand until `http-route-handling-consolidation`.
 */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new RequestShapeError("request body is not valid JSON");
  }
}

/** Parses `req`'s JSON body against `schema`, raising `RequestShapeError` (400) for invalid JSON or a shape mismatch alike — never a bare `ZodError`, which `mapError` maps to 422, the field-validation status, not the request-shape one. */
async function parseJsonBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await readJson(req);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new RequestShapeError(`request body does not match the expected shape: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * Shared rejection rule for a version number, whether it arrives as a path
 * segment (a `string`) or a request-body field (`unknown`). `unknown` admits
 * both callers: `Number(raw)` is total either way.
 *
 * Exported: `admin-routes.ts` and `studio-routes.ts` import it. Each wrote
 * its own copy — `parseVersionField`, `parseVersion` — until
 * `http-route-handling-consolidation`.
 */
export function parseVersion(raw: unknown, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new RequestShapeError(`${label} must be an integer`);
  return n;
}

/**
 * The credential handed to an `ActorResolver` is the request's `Headers`
 * unchanged — each resolver reads whatever it needs (`Authorization` for
 * JWT, `X-Actor-Id`/`X-Actor-Roles` for the dev resolver). No
 * resolver-specific field is pre-extracted here.
 *
 * Exported: the three sibling route modules import it. Each carried its own
 * copy until `dedup-server-helpers`.
 */
export async function resolveActor(req: Request, resolver: ActorResolver, db: SQL): Promise<Actor> {
  return resolver(req.headers, db);
}

/**
 * `req`'s method and path, for `mapError`'s fallback log — an actionable trace
 * needs the request, not just the stack.
 *
 * Exported: `admin-routes.ts`, `studio-routes.ts` and `reporting-routes.ts`
 * import it. Each carried its own copy until `dedup-server-helpers`.
 */
export function errorContext(req: Request): ErrorContext {
  return { method: req.method, path: new URL(req.url).pathname };
}

/**
 * Runs `fn`, mapping any thrown error via `mapError` with `req`'s
 * method/path attached. Every handler but `handleSubmit` uses this — it
 * alone needs a non-error branch on `AutomaticCascadeLoop`.
 *
 * Generic over its success type `T`: every existing caller still infers
 * `T = HttpResult`, so their behavior is unchanged. `handleGetAttachment`
 * alone instantiates it with `T = HttpBinaryResult`, since a file download
 * cannot return a JSON-only `HttpResult` on success — see design.md's
 * "guarded becomes generic to return either shape" (add-instance-attachments).
 * A thrown error always still maps to a plain `HttpResult`.
 *
 * Exported: the three sibling route modules import it. Each carried its own
 * non-generic copy until `dedup-server-helpers`. They all instantiate
 * `T = HttpResult`, which is what those copies named outright.
 */
export async function guarded<T>(req: Request, fn: () => Promise<T>): Promise<T | HttpResult> {
  try {
    return await fn();
  } catch (err) {
    return mapError(err, errorContext(req));
  }
}

/**
 * Resolves the actor, runs `gate(actor)`, then runs `fn(actor)` — the
 * repeated "resolve actor, then require a role" preamble, folded into one
 * call. The whole body is one `guarded(req, ...)` call, so a throw from
 * `resolveActor` or `gate` reaches `mapError` the same way a throw from `fn`
 * already does.
 *
 * A handler whose gate needs the request body (`handlePublish`) keeps its
 * own inline `resolveActor` call instead — `gate` never sees the body.
 */
export async function route<T>(
  req: Request,
  resolver: ActorResolver,
  db: SQL,
  gate: (actor: Actor) => void | Promise<void>,
  fn: (actor: Actor) => Promise<T>,
): Promise<T | HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    await gate(actor);
    return fn(actor);
  });
}

export async function handleCreateInstance(
  processId: string,
  req: Request,
  resolver: ActorResolver,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const body = await parseJsonBody(req, createInstanceBodySchema);
    const created = await createProcessInstance(processId as ProcessId, actor, dataSourceRegistry, { version: body.version, data: body.data as Instance["data"] | undefined }, db, assignmentRegistry);
    return { status: 201, body: created };
  });
}

export async function handleGetInstanceView(
  instanceId: string,
  req: Request,
  resolver: ActorResolver,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL,
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const view = await getInstanceView(instanceId as InstanceId, actor, dataSourceRegistry, db);
    return { status: 200, body: view };
  });
}

export async function handleSubmit(
  instanceId: string,
  req: Request,
  resolver: ActorResolver,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<HttpResult> {
  let actor: Actor | undefined;
  try {
    actor = await resolveActor(req, resolver, db);
    const body = await parseJsonBody(req, submitBodySchema);
    const updated = await submitAndTransition(instanceId as InstanceId, body.pathId as PathId, body.data as Instance["data"], actor, dataSourceRegistry, db, assignmentRegistry);
    return { status: 200, body: updated };
  } catch (err) {
    // The write already committed before this raised; report the resulting
    // (now-faulted) view instead of an error response — see design.md.
    if (err instanceof AutomaticCascadeLoop && actor) {
      const view = await getInstanceView(instanceId as InstanceId, actor, dataSourceRegistry, db);
      return { status: 200, body: view };
    }
    return mapError(err, errorContext(req));
  }
}

export async function handleSaveInstanceDraft(instanceId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const body = await parseJsonBody(req, instanceDraftBodySchema);
    const saved = await saveInstanceDraft(instanceId as InstanceId, body.data, actor, db);
    return { status: 200, body: { updatedBy: saved.updatedBy, updatedAt: saved.updatedAt } };
  });
}

export async function handleClaim(instanceId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const updated = await claimStep(instanceId as InstanceId, actor, db);
    return { status: 200, body: updated };
  });
}

export async function handleRelease(instanceId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const updated = await releaseClaim(instanceId as InstanceId, actor, db);
    return { status: 200, body: updated };
  });
}

export async function handleDelegate(instanceId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const body = await parseJsonBody(req, delegateBodySchema);
    const updated = await delegateClaim(instanceId as InstanceId, actor, body.toActorId, db);
    return { status: 200, body: updated };
  });
}

export async function handlePostComment(instanceId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const body = await parseJsonBody(req, commentBodySchema);
    const created = await postComment(instanceId as InstanceId, actor, body.text, db);
    return { status: 201, body: created };
  });
}

export async function handleListComments(instanceId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const url = new URL(req.url);
    const limit = parseLimit(url, MAX_LIST_LIMIT);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await listComments(instanceId as InstanceId, actor, { limit, cursor }, db);
    return { status: 200, body: page };
  });
}

export async function handleUploadAttachment(instanceId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const body = await parseJsonBody(req, attachmentBodySchema);
    const data = Buffer.from(body.dataBase64, "base64");
    if (data.length > MAX_ATTACHMENT_BYTES) {
      throw new RequestShapeError(`attachment exceeds the ${MAX_ATTACHMENT_BYTES}-byte limit once decoded`);
    }
    const created = await uploadAttachment(
      instanceId as InstanceId,
      actor,
      { filename: body.filename, contentType: body.contentType, data, sizeBytes: data.length },
      db,
    );
    return { status: 201, body: created };
  });
}

export async function handleListAttachments(instanceId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const url = new URL(req.url);
    const limit = parseLimit(url, MAX_LIST_LIMIT);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await listAttachments(instanceId as InstanceId, actor, { limit, cursor }, db);
    return { status: 200, body: page };
  });
}

/** Returns `HttpBinaryResult` on success — never a JSON envelope — or a plain `HttpResult` on error, via `guarded`'s `catch` branch. See errors.ts's `HttpBinaryResult` doc comment. */
export async function handleGetAttachment(
  instanceId: string,
  attachmentId: string,
  req: Request,
  resolver: ActorResolver,
  db: SQL,
): Promise<HttpBinaryResult | HttpResult> {
  return guarded(req, async (): Promise<HttpBinaryResult> => {
    const actor = await resolveActor(req, resolver, db);
    const attachment = await getAttachment(instanceId as InstanceId, attachmentId, actor, db);
    return { status: 200, contentType: attachment.contentType, data: attachment.data, filename: attachment.filename };
  });
}

/**
 * `limit=abc` or a `limit` that is not a positive integer is a request error,
 * not a silent default.
 *
 * `max` is the bound the calling route's own query layer applies, and a value
 * above it clamps rather than raising: a caller asking for more than the
 * maximum gets the maximum, which is what it already got one layer down. The
 * clamp is here as well as there so a later list route inherits a bound from
 * the layer that parsed the value, instead of depending on its own `Math.min`.
 *
 * Exported: `admin-routes.ts` imports it. It carried a character-identical
 * copy until `dedup-server-helpers`.
 */
export function parseLimit(url: URL, max: number): number | undefined {
  const raw = url.searchParams.get("limit");
  if (raw === null) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new RequestShapeError(`limit must be a positive integer, got '${raw}'`);
  return Math.min(n, max);
}

/** Every repeated `status` value must be a known InstanceStatus; an unknown one is a request error. */
function parseStatuses(url: URL): Instance["status"][] | undefined {
  const raw = url.searchParams.getAll("status");
  if (raw.length === 0) return undefined;
  return raw.map((s) => {
    const parsed = instanceStatus.safeParse(s);
    if (!parsed.success) throw new RequestShapeError(`unknown status '${s}'`);
    return parsed.data;
  });
}

/**
 * `createdAfter`/`createdBefore` must parse as an ISO-8601 instant. Validated
 * here, before the value ever reaches a SQL `::timestamptz` cast — an invalid
 * string handed straight to Postgres would raise an untyped error `mapError`
 * falls back to 500 on, not the 400 the spec requires. Mirrors
 * `reporting-routes.ts`'s `parseRange`.
 */
function parseInstant(raw: string, label: string): string {
  if (Number.isNaN(Date.parse(raw))) throw new RequestShapeError(`${label} must be an ISO-8601 instant, got '${raw}'`);
  return raw;
}

/** An omitted scope resolves to "all" — that is what it has always meant. Any other value is a request error. */
function parseScope(url: URL): "mine" | "started" | "all" {
  const raw = url.searchParams.get("scope");
  if (raw === null) return "all";
  if (raw !== "mine" && raw !== "started" && raw !== "all") throw new RequestShapeError(`unknown scope '${raw}'`);
  return raw;
}

export async function handleListInstances(req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  const url = new URL(req.url);
  // `parseScope` runs inside the `gate` closure rather than at this top
  // level, so an unknown `scope` value still throws inside `guarded`'s
  // protection (`route`'s whole body is one `guarded(req, ...)` call) and
  // still maps to 400 instead of escaping as an unhandled rejection ahead of
  // `route`. `scope` is a `let` in this outer scope so `fn` can read it —
  // `route` always runs `gate` before `fn`, inside that same `guarded` call.
  let scope: "mine" | "started" | "all";
  return route(
    req,
    resolver,
    db,
    async (actor) => {
      scope = parseScope(url);
      if (scope === "all") {
        // A named process routes through the process-scoped "read" gate; an
        // omitted one cannot, since a grant names one process and this route
        // adds no result-set predicate over the processes an actor holds a
        // grant over — so it keeps the flat ADMIN_ROLE test.
        const processId = url.searchParams.get("processId");
        if (processId !== null) {
          await requirePermission(actor, "read", processId as ProcessId, db);
        } else {
          requireRole(actor, ADMIN_ROLE);
        }
      }
    },
    async (actor) => {
      const assignedTo = url.searchParams.get("assignedTo") ?? undefined;
      const startedBy = url.searchParams.get("startedBy") ?? undefined;
      // scope=mine derives "mine" from the resolved actor — a caller cannot
      // pair it with its own assignedTo value to see another actor's instances.
      if (scope === "mine" && assignedTo !== undefined) {
        throw new RequestShapeError("scope=mine cannot be combined with an explicit assignedTo");
      }
      // Same rule one filter over: scope=started derives the starter from the
      // credential, so an explicit startedBy beside it would be the one way to
      // read another actor's cases without a role.
      if (scope === "started" && startedBy !== undefined) {
        throw new RequestShapeError("scope=started cannot be combined with an explicit startedBy");
      }
      const versionRaw = url.searchParams.get("version");
      const createdAfterRaw = url.searchParams.get("createdAfter");
      const createdBeforeRaw = url.searchParams.get("createdBefore");
      const filter: InstanceListFilter = {
        processId: (url.searchParams.get("processId") as ProcessId) ?? undefined,
        version: versionRaw !== null ? parseVersion(versionRaw, "version") : undefined,
        status: parseStatuses(url),
        currentStepId: (url.searchParams.get("currentStepId") as StepId) ?? undefined,
        // scope=started applies no assignment predicate of its own. An explicit
        // assignedTo still narrows conjunctively, and reaches nothing outside
        // what this caller started.
        startedBy: scope === "started" ? actor.id : startedBy,
        claimedBy: url.searchParams.get("claimedBy") ?? undefined,
        assignedTo: scope === "mine" ? actor.id : assignedTo,
        assignedToRoles: scope === "mine" ? actor.roles : undefined,
        excludeInstanceId: (url.searchParams.get("excludeInstanceId") as InstanceId) ?? undefined,
        createdAfter: createdAfterRaw !== null ? parseInstant(createdAfterRaw, "createdAfter") : undefined,
        createdBefore: createdBeforeRaw !== null ? parseInstant(createdBeforeRaw, "createdBefore") : undefined,
        // No `dataWhere`: the instance-data-query capability's comparisons
        // reach the Runtime API Layer reads in-process. The route that
        // carries them over HTTP arrives with the consumer that reads them.
        //
        // scope=all already required ADMIN_ROLE above — reusing that check
        // instead of adding a second one. See design.md "Gate visibility with
        // an includeDegraded filter field". Neither scope=mine nor
        // scope=started sets it; each lists one actor's own instances, and the
        // screens behind them render a resolved summary alone.
        includeDegraded: scope === "all",
      };
      const limit = parseLimit(url, MAX_LIST_LIMIT);
      const cursor = url.searchParams.get("cursor") ?? undefined;
      const page = await listInstances(filter, { limit, cursor }, db);
      return { status: 200, body: page };
    },
  );
}

export async function handleInstanceRecord(instanceId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const url = new URL(req.url);
    const limit = parseLimit(url, MAX_RECORD_LIMIT);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await getInstanceRecord(instanceId as InstanceId, actor, { limit, cursor }, db);
    return { status: 200, body: page };
  });
}

export async function handleCancel(instanceId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const updated = await cancelInstance(instanceId as InstanceId, actor, db);
    return { status: 200, body: updated };
  });
}

/**
 * Publish an authored body. `processId` is not part of the hashed
 * `ProcessBody` (see CLAUDE.md's hashing/versioning section), so the request
 * carries it as a sibling field: the caller decides identity — the same
 * `processId` across two calls is a new version of one process, a fresh one
 * mints a new process. Validates against the server's own `registry`, never
 * one the client could supply.
 *
 * Resolves the actor through the same `ActorResolver` seam every other route
 * uses, and additionally requires the `"publish"` permission on the resolved
 * actor (`src/auth/authorize.ts`), which maps to `PUBLISH_ROLE` today —
 * publish carries no other use for the actor value.
 *
 * That gate sits AFTER the body parse and the shape check, not before them,
 * because it names the target process and the body is what carries it. The
 * property the earlier placement protected still holds: an actor without the
 * permission never reaches `publishBody`, so no definition store, registry or
 * CEL check runs and no version is consumed. The one visible consequence is
 * that a caller lacking the permission who also sends a malformed body reads
 * 400 rather than 403 — an answer about that caller's own body, disclosing
 * nothing about this installation.
 */
export async function handlePublish(
  req: Request,
  resolver: ActorResolver,
  registry: Registry,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const parsed = (await readJson(req)) as { processId?: unknown; body?: unknown };
    if (typeof parsed.processId !== "string" || !parsed.body) {
      throw new RequestShapeError("request body must be { processId: string, body: ProcessBody }");
    }
    // The shape check proves only that this is a string; the `proc_` prefix is
    // publishBody's to enforce. `can` ignores the value today, and a scoped
    // grant later must not read it as an id the store already holds.
    await requirePermission(actor, "publish", parsed.processId as ProcessId, db);
    const published = await publishBody(parsed.processId as ProcessId, parsed.body as ProcessBody, registry, dataSourceRegistry, db, assignmentRegistry);
    return {
      status: 200,
      body: { processId: published.processId, version: published.version, definitionHash: published.definitionHash, status: published.status },
    };
  });
}

export async function handleListProcesses(req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    await resolveActor(req, resolver, db);
    return { status: 200, body: await listProcesses(db) };
  });
}

export async function handleListVersions(processId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    await resolveActor(req, resolver, db);
    return { status: 200, body: await listVersions(processId as ProcessId, db) };
  });
}
